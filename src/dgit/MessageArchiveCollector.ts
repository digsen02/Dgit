import { ChannelType, Guild, Message, PermissionFlagsBits } from "discord.js";
import type {
  AttachmentMeta,
  DGitMessageArchive,
  DGitSnapshot,
  IgnoreRules,
  MessageArchiveSummary,
  MessageSnapshot,
  RepositorySettings
} from "./types/dgitTypes.js";
import { internalId } from "../utils/ids.js";
import { nowIso } from "../utils/time.js";
import { sha256Buffer } from "../utils/hash.js";
import { messageArchiveSchema } from "./schemas/messageArchive.schema.js";

export interface MessageArchiveCollectionOptions {
  guildId: string;
  commitHash: string;
  snapshotHash: string;
  stateHash: string;
  settings?: RepositorySettings;
  includeChannels?: string[];
  excludeChannels?: string[];
  ignore?: IgnoreRules;
  snapshot?: DGitSnapshot;
  maxMessagesPerChannel?: number;
  maxAttachmentBytes?: number;
}

export interface MessageArchiveCollectionResult {
  archive: DGitMessageArchive | null;
  warnings: string[];
}

const DEFAULT_MAX_MESSAGES_PER_CHANNEL = 100;

type MessageFetchableChannel = {
  id: string;
  name: string;
  type: ChannelType;
  messages: {
    fetch(input: { limit: number; before?: string }): Promise<{ size: number; values(): Iterable<Message> }>;
  };
  permissionsFor?(member: unknown): { has(permission: bigint): boolean } | null;
};

export function isMessageBackupEnabled(settings?: RepositorySettings): boolean {
  return settings?.messageBackup?.enabled === true;
}

export function shouldCollectChannelMessages(
  channel: { id: string; name: string; type: ChannelType; permissionsFor?: MessageFetchableChannel["permissionsFor"] },
  options: Pick<MessageArchiveCollectionOptions, "includeChannels" | "excludeChannels" | "ignore">,
  botMember?: unknown
): boolean {
  if (!isSupportedMessageChannelType(channel.type)) return false;
  const include = options.includeChannels;
  if (include && include.length > 0 && !include.includes(channel.id)) return false;
  if (options.excludeChannels?.includes(channel.id)) return false;
  if (options.ignore?.channels.includes(channel.id)) return false;
  if (options.ignore?.patterns.some((pattern) => matchesPattern(pattern, channel.name))) return false;
  if (options.ignore?.types.includes("messages") || options.ignore?.types.includes("message")) return false;
  if (!botMember || !channel.permissionsFor) return true;
  const permissions = channel.permissionsFor(botMember);
  return Boolean(
    permissions?.has(PermissionFlagsBits.ViewChannel) &&
    permissions.has(PermissionFlagsBits.ReadMessageHistory)
  );
}

export function toMessageSnapshot(message: Message, channelInternalId: string, attachmentMapper: (message: Message) => Promise<AttachmentMeta[]>): Promise<MessageSnapshot> {
  return attachmentMapper(message).then((attachments) => {
    const reference = message.reference?.messageId ? { replyToMessageInternalId: internalId("message", message.reference.messageId, message.reference.messageId) } : {};
    const thread = message.channel.isThread() ? { threadInternalId: channelInternalId } : {};
    return {
      internalId: internalId("message", message.id, message.id),
      discordId: message.id,
      channelInternalId,
      attachments,
      createdAt: message.createdAt.toISOString(),
      ...thread,
      authorDiscordId: message.author?.id ?? null,
      authorDisplayName: message.member?.displayName ?? message.author?.username ?? null,
      content: typeof message.content === "string" ? message.content : null,
      embeds: message.embeds?.map((embed) => embed.toJSON?.() ?? embed) ?? [],
      ...reference,
      pinned: message.pinned,
      editedAt: message.editedAt?.toISOString() ?? null
    };
  });
}

export function buildMessageArchiveSummary(messages: MessageSnapshot[]): MessageArchiveSummary {
  const byChannel: Record<string, number> = {};
  let withAttachments = 0;
  let withEmbeds = 0;
  let unavailableContent = 0;
  for (const message of messages) {
    byChannel[message.channelInternalId] = (byChannel[message.channelInternalId] ?? 0) + 1;
    if (message.attachments.length > 0) withAttachments += 1;
    if ((message.embeds?.length ?? 0) > 0) withEmbeds += 1;
    if (message.content === null || message.content === undefined) unavailableContent += 1;
  }
  return {
    total: messages.length,
    byChannel,
    withAttachments,
    withEmbeds,
    unavailableContent
  };
}

export function validateMessageArchive(archive: DGitMessageArchive, options: Pick<MessageArchiveCollectionOptions, "guildId" | "commitHash" | "snapshotHash" | "stateHash">): DGitMessageArchive {
  const parsed = messageArchiveSchema.parse(archive) as DGitMessageArchive;
  if (parsed.guildId !== options.guildId) throw new Error("Message archive guildId must match target guild.");
  if (parsed.commitHash !== options.commitHash) throw new Error("Message archive commitHash must match target commit.");
  if (parsed.snapshotHash !== options.snapshotHash) throw new Error("Message archive snapshotHash must match target snapshot.");
  if (parsed.stateHash !== options.stateHash) throw new Error("Message archive stateHash must match target state.");
  return parsed;
}

export class MessageArchiveCollector {
  async collect(guild: Guild, options: MessageArchiveCollectionOptions): Promise<MessageArchiveCollectionResult> {
    const settings = options.settings;
    if (settings && !isMessageBackupEnabled(settings)) {
      return { archive: null, warnings: ["Message backup is disabled."] };
    }

    const includeChannels = options.includeChannels ?? settings?.messageBackup?.includeChannels;
    const excludeChannels = options.excludeChannels ?? settings?.messageBackup?.excludeChannels;
    const maxMessagesPerChannel = options.maxMessagesPerChannel ?? DEFAULT_MAX_MESSAGES_PER_CHANNEL;
    const maxAttachmentBytes = options.maxAttachmentBytes ?? settings?.maxAttachmentBytes;
    const channelInternalIds = buildChannelInternalIdMap(options.snapshot);
    const warnings: string[] = [];
    const messages: MessageSnapshot[] = [];

    await guild.channels.fetch().catch(() => undefined);
    const botMember = guild.members.me;
    const channels = [...guild.channels.cache.values()];
    for (const channel of channels) {
      if (!isFetchableMessageChannel(channel)) continue;
      const channelOptions: Pick<MessageArchiveCollectionOptions, "includeChannels" | "excludeChannels" | "ignore"> = {};
      if (includeChannels) channelOptions.includeChannels = includeChannels;
      if (excludeChannels) channelOptions.excludeChannels = excludeChannels;
      if (options.ignore) channelOptions.ignore = options.ignore;
      if (!shouldCollectChannelMessages(channel, channelOptions, botMember)) continue;
      const channelInternalId = channelInternalIds.get(channel.id) ?? internalId("channel", channel.name, channel.id);
      try {
        const fetched = await this.fetchChannelMessages(channel, maxMessagesPerChannel);
        for (const message of fetched) {
          messages.push(await toMessageSnapshot(message, channelInternalId, (item) => this.attachmentsFor(item, maxAttachmentBytes, warnings)));
        }
      } catch (error) {
        warnings.push(`Skipped channel ${channel.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (messages.length === 0) warnings.push("No eligible messages were collected.");
    const archive = validateMessageArchive({
      schemaVersion: 1,
      type: "messageArchive",
      createdAt: nowIso(),
      guildId: options.guildId,
      commitHash: options.commitHash,
      snapshotHash: options.snapshotHash,
      stateHash: options.stateHash,
      messages,
      summary: buildMessageArchiveSummary(messages)
    }, options);
    return { archive, warnings };
  }

  private async fetchChannelMessages(channel: MessageFetchableChannel, maxMessages: number): Promise<Message[]> {
    const messages: Message[] = [];
    let before: string | undefined;
    while (messages.length < maxMessages) {
      const limit = Math.min(100, maxMessages - messages.length);
      const batch = await channel.messages.fetch(before ? { limit, before } : { limit });
      const values = [...batch.values()];
      messages.push(...values);
      before = values.at(-1)?.id;
      if (batch.size < limit || !before) break;
    }
    return messages;
  }

  private async attachmentsFor(message: Message, maxAttachmentBytes: number | undefined, warnings: string[]): Promise<AttachmentMeta[]> {
    const metas: AttachmentMeta[] = [];
    for (const attachment of message.attachments.values()) {
      const sizeBytes = attachment.size ?? 0;
      const filename = attachment.name ?? `attachment-${attachment.id}`;
      if (maxAttachmentBytes !== undefined && sizeBytes > maxAttachmentBytes) {
        warnings.push(`Skipped attachment ${attachment.id} on message ${message.id}: larger than maxAttachmentBytes.`);
        continue;
      }
      try {
        const buffer = Buffer.from(await (await fetch(attachment.url)).arrayBuffer());
        metas.push({
          channelId: message.channelId,
          messageId: message.id,
          filename,
          sizeBytes,
          sha256: sha256Buffer(buffer),
          ...(attachment.contentType === null || attachment.contentType === undefined ? {} : { contentType: attachment.contentType })
        });
      } catch (error) {
        warnings.push(`Skipped attachment ${attachment.id} on message ${message.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return metas;
  }
}

function isSupportedMessageChannelType(type: ChannelType): boolean {
  return [
    ChannelType.GuildText,
    ChannelType.GuildAnnouncement,
    ChannelType.PublicThread,
    ChannelType.PrivateThread,
    ChannelType.AnnouncementThread
  ].includes(type);
}

function isFetchableMessageChannel(channel: unknown): channel is MessageFetchableChannel {
  const candidate = channel as Partial<MessageFetchableChannel> | null;
  return Boolean(
    candidate &&
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    candidate.type !== undefined &&
    candidate.messages &&
    typeof candidate.messages.fetch === "function"
  );
}

function buildChannelInternalIdMap(snapshot?: DGitSnapshot): Map<string, string> {
  const map = new Map<string, string>();
  for (const channel of snapshot?.channels ?? []) {
    map.set(channel.discordId, channel.internalId);
  }
  return map;
}

function matchesPattern(pattern: string, name: string): boolean {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i").test(name);
}
