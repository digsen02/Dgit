import { ChannelType, Guild, PermissionFlagsBits } from "discord.js";
import type { ChannelSnapshot, DGitSnapshot, PermissionOverwriteSnapshot, RoleSnapshot } from "./types/dgitTypes.js";
import { internalId } from "../utils/ids.js";
import { nowIso } from "../utils/time.js";
import { DiffEngine } from "./DiffEngine.js";

export class GuildStateCollector {
  constructor(private readonly diffEngine = new DiffEngine()) {}

  async collect(guild: Guild): Promise<DGitSnapshot> {
    await guild.roles.fetch();
    await guild.channels.fetch();
    const roleMap = new Map<string, string>();
    const roles: RoleSnapshot[] = guild.roles.cache
      .sort((a, b) => b.position - a.position)
      .map((role) => {
        const id = role.id === guild.id ? "role_everyone" : internalId("role", role.name, role.id);
        roleMap.set(role.id, id);
        return {
          internalId: id,
          discordId: role.id,
          name: role.name,
          color: role.color,
          hoist: role.hoist,
          icon: role.icon,
          unicodeEmoji: role.unicodeEmoji,
          position: role.position,
          permissions: role.permissions.toArray().sort(),
          managed: role.managed,
          mentionable: role.mentionable
        };
      });

    const channelIdMap = new Map<string, string>();
    for (const channel of guild.channels.cache.values()) {
      channelIdMap.set(channel.id, internalId(channel.type === ChannelType.GuildCategory ? "category" : "channel", channel.name, channel.id));
    }

    const channels: ChannelSnapshot[] = guild.channels.cache
      .sort((a, b) => ((a as { rawPosition?: number }).rawPosition ?? 0) - ((b as { rawPosition?: number }).rawPosition ?? 0))
      .map((channel) => this.channelSnapshot(channel, roleMap, channelIdMap));

    const raw: Omit<DGitSnapshot, "stateHash"> = {
      schemaVersion: 1,
      type: "snapshot",
      createdAt: nowIso(),
      guildId: guild.id,
      guild: {
        id: guild.id,
        name: guild.name,
        description: guild.description,
        verificationLevel: Number(guild.verificationLevel),
        defaultMessageNotifications: Number(guild.defaultMessageNotifications),
        explicitContentFilter: Number(guild.explicitContentFilter),
        afkChannelInternalId: guild.afkChannelId ? channelIdMap.get(guild.afkChannelId) ?? null : null,
        afkTimeout: guild.afkTimeout,
        systemChannelInternalId: guild.systemChannelId ? channelIdMap.get(guild.systemChannelId) ?? null : null,
        rulesChannelInternalId: guild.rulesChannelId ? channelIdMap.get(guild.rulesChannelId) ?? null : null,
        publicUpdatesChannelInternalId: guild.publicUpdatesChannelId ? channelIdMap.get(guild.publicUpdatesChannelId) ?? null : null
      },
      roles,
      channels
    };
    const snapshot: DGitSnapshot = { ...raw, stateHash: "sha256:pending" };
    snapshot.stateHash = this.diffEngine.hashSnapshot(snapshot);
    return snapshot;
  }

  private channelSnapshot(channel: NonNullable<Guild["channels"]["cache"] extends Map<string, infer C> ? C : never>, roleMap: Map<string, string>, channelIdMap: Map<string, string>): ChannelSnapshot {
    const channelWithParent = channel as typeof channel & { parentId?: string | null; rawPosition?: number; permissionOverwrites?: { cache: Map<string, unknown> } };
    const overwrites = "permissionOverwrites" in channel && channel.permissionOverwrites?.cache
      ? [...channel.permissionOverwrites.cache.values()].map((overwrite) => this.permissionOverwrite(overwrite, roleMap))
      : [];
    const textLike = channel as typeof channel & {
      topic?: string | null;
      nsfw?: boolean;
      rateLimitPerUser?: number;
      defaultAutoArchiveDuration?: number;
      availableTags?: unknown[];
      defaultReactionEmoji?: unknown;
      defaultSortOrder?: number | null;
      defaultForumLayout?: number | null;
      bitrate?: number;
      userLimit?: number;
    };
    return {
      internalId: channelIdMap.get(channel.id) ?? internalId("channel", channel.name, channel.id),
      discordId: channel.id,
      type: channel.type,
      name: channel.name,
      parentInternalId: channelWithParent.parentId ? channelIdMap.get(channelWithParent.parentId) ?? null : null,
      position: channelWithParent.rawPosition ?? 0,
      topic: textLike.topic ?? null,
      nsfw: textLike.nsfw ?? false,
      rateLimitPerUser: textLike.rateLimitPerUser ?? null,
      bitrate: textLike.bitrate ?? null,
      userLimit: textLike.userLimit ?? null,
      permissionOverwrites: overwrites.sort((a, b) => a.targetInternalId.localeCompare(b.targetInternalId)),
      defaultAutoArchiveDuration: textLike.defaultAutoArchiveDuration ?? null,
      availableTags: textLike.availableTags ?? [],
      defaultReactionEmoji: textLike.defaultReactionEmoji ?? null,
      defaultSortOrder: textLike.defaultSortOrder ?? null,
      defaultForumLayout: textLike.defaultForumLayout ?? null
    };
  }

  private permissionOverwrite(overwrite: unknown, roleMap: Map<string, string>): PermissionOverwriteSnapshot {
    const item = overwrite as { id: string; type: number; allow: { toArray(): string[] }; deny: { toArray(): string[] } };
    return {
      targetInternalId: roleMap.get(item.id) ?? `user_${item.id}`,
      targetDiscordId: item.id,
      targetType: item.type === 0 ? "role" : "user",
      allow: item.allow.toArray().filter((permission) => permission in PermissionFlagsBits).sort(),
      deny: item.deny.toArray().filter((permission) => permission in PermissionFlagsBits).sort()
    };
  }
}
