import { Message, TextChannel } from "discord.js";
import type { AttachmentMeta, DGitCommit, DGitDiff, DGitManifest, DGitSnapshot } from "../types/dgitTypes.js";
import { ChunkedAttachmentStore } from "./ChunkedAttachmentStore.js";
import { manifestSchema } from "../schemas/manifest.schema.js";
import { commitSchema } from "../schemas/commit.schema.js";
import { snapshotSchema } from "../schemas/snapshot.schema.js";
import { diffSchema } from "../schemas/diff.schema.js";

export class DiscordRepositoryStorage {
  constructor(private readonly store = new ChunkedAttachmentStore()) {}

  async findManifestMessage(channel: TextChannel): Promise<Message | null> {
    const pinned = await channel.messages.fetchPins();
    return pinned.items.find((pin) => pin.message.content.startsWith("[DGIT:MANIFEST:CURRENT]"))?.message ?? null;
  }

  async loadManifest(channel: TextChannel): Promise<DGitManifest> {
    const message = await this.findManifestMessage(channel);
    if (!message) throw new Error("No pinned current DGit manifest found.");
    const attachment = message.attachments.find((a) => a.name === "manifest.json.gz");
    if (!attachment) throw new Error("Pinned manifest message has no manifest.json.gz attachment.");
    const value = await this.readAttachmentJson(message, attachment);
    return manifestSchema.parse(value) as DGitManifest;
  }

  private async readAttachmentJson(
    message: Message,
    attachment: { url: string; name?: string | null; size: number; contentType?: string | null }
  ): Promise<unknown> {
    const meta = this.metaFromAttachment(message.channelId, message.id, attachment.name ?? "manifest.json.gz", attachment.size, "sha256:unknown", attachment.contentType);
    try {
      return await this.store.readJson<unknown>(message, { ...meta, sha256: "sha256:unknown" });
    } catch {
      const buffer = Buffer.from(await (await fetch(attachment.url)).arrayBuffer());
      return new (await import("./AttachmentCodec.js")).AttachmentCodec().decodeJson<unknown>(buffer);
    }
  }

  async uploadManifest(channel: TextChannel, manifest: DGitManifest): Promise<AttachmentMeta> {
    const old = await this.findManifestMessage(channel).catch(() => null);
    const meta = await this.store.uploadJson(channel, `[DGIT:MANIFEST:CURRENT]\nsequence: ${manifest.manifestSequence}`, "manifest.json.gz", manifest, manifest.settings.maxAttachmentBytes);
    const fresh = await channel.messages.fetch(meta.messageId);
    await fresh.pin("DGit current manifest").catch(() => undefined);
    if (old) {
      await old.edit(old.content.replace("[DGIT:MANIFEST:CURRENT]", "[DGIT:MANIFEST:OLD]")).catch(() => undefined);
      await old.unpin("Superseded DGit manifest").catch(() => undefined);
    }
    return meta;
  }

  async uploadCommitObjects(channel: TextChannel, commit: DGitCommit, snapshot: DGitSnapshot, diff: DGitDiff, maxBytes: number): Promise<{ commitFile: AttachmentMeta; snapshotFile: AttachmentMeta; diffFile: AttachmentMeta }> {
    const short = commit.hash.replace(/^sha256:/, "").slice(0, 12);
    const label = `[DGIT:COMMIT:${short}]\nbranch: ${commit.branch}\nauthor: <@${commit.authorId}>\nmessage: ${commit.message}\nchanges: +${diff.summary.added} ~${diff.summary.updated} -${diff.summary.deleted}\ndangerous: ${diff.summary.dangerous}`;
    const [commitFile, snapshotFile, diffFile] = await this.store.uploadJsonMany(channel, label, [
      { filename: `commit-${short}.json.gz`, value: commit },
      { filename: `snapshot-${short}.json.gz`, value: snapshot },
      { filename: `diff-${short}.json.gz`, value: diff }
    ], maxBytes);
    if (!commitFile || !snapshotFile || !diffFile) throw new Error("Failed to build commit attachment metadata.");
    return { commitFile, snapshotFile, diffFile };
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

  private metaFromAttachment(channelId: string, messageId: string, filename: string, sizeBytes: number, sha256: string, contentType?: string | null): AttachmentMeta {
    return contentType === undefined ? { channelId, messageId, filename, sizeBytes, sha256 } : { channelId, messageId, filename, sizeBytes, sha256, contentType };
  }
}
