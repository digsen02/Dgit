import { Message, TextChannel } from "discord.js";
import type { AttachmentMeta, DGitCommit, DGitDiff, DGitManifest, DGitMessageArchive, DGitSnapshot } from "../types/dgitTypes.js";
import { ChunkedAttachmentStore } from "./ChunkedAttachmentStore.js";
import { manifestSchema } from "../schemas/manifest.schema.js";
import { commitSchema } from "../schemas/commit.schema.js";
import { snapshotSchema } from "../schemas/snapshot.schema.js";
import { diffSchema } from "../schemas/diff.schema.js";
import { messageArchiveSchema } from "../schemas/messageArchive.schema.js";
import { LocalizedError } from "../../i18n/localizedError.js";
import { sha256Json, shortHash } from "../../utils/hash.js";

export interface ManifestIntegrity {
  found: boolean;
  hashVerified: boolean;
  legacyUnverified: boolean;
  expectedSha256: string | null;
}

export function parseManifestMessageSha256(content: string): string | null {
  const line = content.split(/\r?\n/).find((item) => item.toLowerCase().startsWith("sha256:"));
  if (!line) return null;
  const value = line.slice("sha256:".length).trim();
  return value.startsWith("sha256:") ? value : `sha256:${value}`;
}

export class DiscordRepositoryStorage {
  constructor(private readonly store = new ChunkedAttachmentStore()) {}

  async findManifestMessage(channel: TextChannel): Promise<Message | null> {
    const pinned = await channel.messages.fetchPins();
    return pinned.items.find((pin) => pin.message.content.startsWith("[DGIT:MANIFEST:CURRENT]"))?.message ?? null;
  }

  async loadManifest(channel: TextChannel): Promise<DGitManifest> {
    return (await this.loadManifestWithIntegrity(channel)).manifest;
  }

  async loadManifestWithIntegrity(channel: TextChannel): Promise<{ manifest: DGitManifest; integrity: ManifestIntegrity }> {
    const message = await this.findManifestMessage(channel);
    if (!message) throw new Error("No pinned current DGit manifest found.");
    const attachment = message.attachments.find((a) => a.name === "manifest.json.gz");
    if (!attachment) throw new Error("Pinned manifest message has no manifest.json.gz attachment.");
    const expectedSha256 = parseManifestMessageSha256(message.content);
    const value = await this.readAttachmentJson(message, attachment, expectedSha256);
    return {
      manifest: manifestSchema.parse(value) as DGitManifest,
      integrity: {
        found: true,
        hashVerified: Boolean(expectedSha256),
        legacyUnverified: !expectedSha256,
        expectedSha256
      }
    };
  }

  private async readAttachmentJson(
    message: Message,
    attachment: { url: string; name?: string | null; size: number; contentType?: string | null },
    expectedSha256?: string | null
  ): Promise<unknown> {
    const sha256 = expectedSha256 ?? "sha256:unknown";
    const meta = this.metaFromAttachment(message.channelId, message.id, attachment.name ?? "manifest.json.gz", attachment.size, sha256, attachment.contentType);
    try {
      return await this.store.readJson<unknown>(message, meta);
    } catch {
      if (expectedSha256) throw new Error("Manifest hash verification failed.");
      const buffer = Buffer.from(await (await fetch(attachment.url)).arrayBuffer());
      return new (await import("./AttachmentCodec.js")).AttachmentCodec().decodeJson<unknown>(buffer);
    }
  }

  async uploadManifest(channel: TextChannel, manifest: DGitManifest, expectedSequence?: number): Promise<AttachmentMeta> {
    const old = await this.findManifestMessage(channel).catch(() => null);
    if (expectedSequence !== undefined) {
      if (!old) throw new LocalizedError("repositoryChangedRetry");
      const current = await this.loadManifest(channel);
      if (current.manifestSequence !== expectedSequence) throw new LocalizedError("repositoryChangedRetry");
    }
    const meta = await this.store.uploadJson(
      channel,
      (encoded) => `[DGIT:MANIFEST:CURRENT]\nsequence: ${manifest.manifestSequence}\nsha256: ${encoded.sha256}`,
      "manifest.json.gz",
      manifest,
      manifest.settings.maxAttachmentBytes
    );
    const fresh = await channel.messages.fetch(meta.messageId);
    await fresh.pin("DGit current manifest").catch(() => undefined);
    if (old) {
      await old.edit(old.content.replace("[DGIT:MANIFEST:CURRENT]", "[DGIT:MANIFEST:OLD]")).catch(() => undefined);
      await old.unpin("Superseded DGit manifest").catch(() => undefined);
    }
    return meta;
  }

  async uploadCommitObjects(
    channel: TextChannel,
    commit: DGitCommit,
    snapshot: DGitSnapshot,
    diff: DGitDiff,
    maxBytes: number,
    messageArchive?: DGitMessageArchive | null
  ): Promise<{ commitFile: AttachmentMeta; snapshotFile: AttachmentMeta; diffFile: AttachmentMeta; messageArchiveFile?: AttachmentMeta | null }> {
    this.assertSnapshotHasNoMessageArchive(snapshot);
    const short = commit.hash.replace(/^sha256:/, "").slice(0, 12);
    const label = `[DGIT:COMMIT:${short}]\nbranch: ${commit.branch}\nauthor: <@${commit.authorId}>\nmessage: ${commit.message}\nchanges: +${diff.summary.added} ~${diff.summary.updated} -${diff.summary.deleted}\ndangerous: ${diff.summary.dangerous}`;
    const messageArchiveHash = messageArchive ? this.validateMessageArchive(commit, snapshot, messageArchive) : null;
    const commitValue = messageArchiveHash ? { ...commit, messageArchiveHash } : commit;
    const values: Array<{ filename: string; value: unknown }> = [
      { filename: `commit-${short}.json.gz`, value: commitValue },
      { filename: `snapshot-${short}.json.gz`, value: snapshot },
      { filename: `diff-${short}.json.gz`, value: diff }
    ];
    if (messageArchive) {
      values.push({ filename: `message-archive-${shortHash(messageArchiveHash!)}.json.gz`, value: messageArchive });
    }
    const [commitFile, snapshotFile, diffFile, messageArchiveFile] = await this.store.uploadJsonMany(channel, label, values, maxBytes);
    if (!commitFile || !snapshotFile || !diffFile) throw new Error("Failed to build commit attachment metadata.");
    return messageArchiveFile
      ? { commitFile, snapshotFile, diffFile, messageArchiveFile }
      : { commitFile, snapshotFile, diffFile };
  }

  async loadSnapshot(channel: TextChannel, meta: AttachmentMeta): Promise<DGitSnapshot> {
    const message = await channel.messages.fetch(meta.messageId);
    return snapshotSchema.parse(await this.store.readJson<unknown>(message, meta)) as DGitSnapshot;
  }

  async loadCommit(channel: TextChannel, meta: AttachmentMeta): Promise<DGitCommit> {
    const message = await channel.messages.fetch(meta.messageId);
    return commitSchema.parse(await this.store.readJson<unknown>(message, meta)) as DGitCommit;
  }

  async loadDiff(channel: TextChannel, meta: AttachmentMeta): Promise<DGitDiff> {
    const message = await channel.messages.fetch(meta.messageId);
    return diffSchema.parse(await this.store.readJson<unknown>(message, meta)) as DGitDiff;
  }

  async loadMessageArchive(channel: TextChannel, meta: AttachmentMeta): Promise<DGitMessageArchive> {
    const message = await channel.messages.fetch(meta.messageId);
    return messageArchiveSchema.parse(await this.store.readJson<unknown>(message, meta)) as DGitMessageArchive;
  }

  private assertSnapshotHasNoMessageArchive(snapshot: DGitSnapshot): void {
    const raw = snapshot as unknown as Record<string, unknown>;
    if ("messages" in raw || "messageArchive" in raw || "messageArchives" in raw) {
      throw new Error("Message archive data must not be embedded directly inside DGitSnapshot.");
    }
  }

  private validateMessageArchive(commit: DGitCommit, snapshot: DGitSnapshot, archive: DGitMessageArchive): string {
    const parsed = messageArchiveSchema.parse(archive) as DGitMessageArchive;
    if (parsed.guildId !== commit.guildId || parsed.guildId !== snapshot.guildId) {
      throw new Error("Message archive guildId must match commit and snapshot guildId.");
    }
    if (parsed.commitHash !== commit.hash) throw new Error("Message archive commitHash must match commit hash.");
    if (parsed.snapshotHash !== commit.snapshotHash) throw new Error("Message archive snapshotHash must match commit snapshotHash.");
    if (parsed.stateHash !== commit.stateHash || parsed.stateHash !== snapshot.stateHash) {
      throw new Error("Message archive stateHash must match commit and snapshot stateHash.");
    }
    const archiveHash = sha256Json(parsed);
    if (commit.messageArchiveHash && commit.messageArchiveHash !== archiveHash) {
      throw new Error("Commit messageArchiveHash must match message archive content hash.");
    }
    return archiveHash;
  }

  private metaFromAttachment(channelId: string, messageId: string, filename: string, sizeBytes: number, sha256: string, contentType?: string | null): AttachmentMeta {
    return contentType === undefined ? { channelId, messageId, filename, sizeBytes, sha256 } : { channelId, messageId, filename, sizeBytes, sha256, contentType };
  }
}
