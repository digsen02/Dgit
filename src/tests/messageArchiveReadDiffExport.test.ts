import { describe, expect, it, vi } from "vitest";
import { DGitService } from "../dgit/DGitService.js";
import { diffMessageArchives } from "../dgit/MessageArchiveDiffer.js";
import type { AttachmentMeta, DGitCommit, DGitManifest, DGitMessageArchive, MessageSnapshot } from "../dgit/types/dgitTypes.js";
import { ManifestService } from "../dgit/storage/ManifestService.js";
import { sha256Json } from "../utils/hash.js";

vi.mock("../utils/time.js", () => ({
  nowIso: () => "2026-01-01T00:00:00.000Z"
}));

describe("message archive read, diff, and export", () => {
  it("returns null when a commit has no message archive", async () => {
    const { service } = serviceWithArchive(null);

    await expect(service.loadMessageArchive({ id: "guild1" } as never, "sha256:commit")).resolves.toBeNull();
  });

  it("rejects an archive whose summary total is invalid", async () => {
    const archive = archiveFor("sha256:commit", [message("m1")]);
    archive.summary.total = 2;
    const { service } = serviceWithArchive(archive);

    await expect(service.loadMessageArchive({ id: "guild1" } as never, "sha256:commit")).rejects.toThrow(/summary total/);
  });

  it("rejects an archive whose type is invalid", async () => {
    const archive = {
      ...archiveFor("sha256:commit", [message("m1")]),
      type: "snapshot"
    };
    const { service } = serviceWithArchive(archive as never);

    await expect(service.loadMessageArchive({ id: "guild1" } as never, "sha256:commit")).rejects.toThrow();
  });

  it("detects message add, delete, and update without exposing full content", () => {
    const before = archiveFor("sha256:before", [
      message("stable", { content: "old", pinned: false }),
      message("deleted", { content: "remove me" })
    ]);
    const after = archiveFor("sha256:after", [
      message("stable", { content: "new", pinned: true }),
      message("added", { content: "new message" })
    ]);

    const result = diffMessageArchives(before, after);

    expect(result.summary.added).toBe(1);
    expect(result.summary.deleted).toBe(1);
    expect(result.summary.updated).toBe(1);
    expect(result.summary.channelsAffected).toBe(1);
    const update = result.changes.find((change) => change.op === "update");
    expect(update?.objectType).toBe("message");
    expect(JSON.stringify(update)).not.toContain("old");
    expect(JSON.stringify(update)).not.toContain("new");
    expect(update?.before).toMatchObject({ contentAvailable: true, pinned: false });
    expect(update?.after).toMatchObject({ contentAvailable: true, pinned: true });
  });

  it("uses stable internalId instead of treating discordId changes as message updates", () => {
    const before = archiveFor("sha256:before", [
      message("original", { internalId: "message_stable", content: "same" })
    ]);
    const after = archiveFor("sha256:after", [
      message("replacement", { internalId: "message_stable", content: "same" })
    ]);

    const result = diffMessageArchives(before, after);

    expect(result.changes).toHaveLength(0);
    expect(result.summary.updated).toBe(0);
  });

  it("prepares an export attachment without mutating repository state", async () => {
    const archive = archiveFor("sha256:commit", [message("m1", { content: "exported" })]);
    const { service, manifestUploads } = serviceWithArchive(archive, { head: "sha256:commit" });

    const exported = await service.exportMessageArchive({ id: "guild1" } as never);

    expect(exported?.filename).toBe("dgit-message-archive-commit.json.gz");
    expect(exported?.archive.summary.total).toBe(1);
    expect(manifestUploads).toHaveLength(0);
  });
});

function serviceWithArchive(archive: DGitMessageArchive | null, options: { head?: string } = {}) {
  const manifest = manifestFor(Boolean(archive), options.head);
  const commit = commitFor("sha256:commit", archive ? sha256Json(archive) : undefined);
  const manifestUploads: DGitManifest[] = [];
  const storage = {
    loadManifest: async () => structuredClone(manifest),
    loadCommit: async () => commit,
    loadMessageArchive: async () => archive,
    uploadManifest: async (_repository: unknown, next: DGitManifest) => {
      manifestUploads.push(next);
      return attachment("manifest.json.gz");
    }
  };
  return {
    service: new DGitService(
      { locate: async () => ({ id: "repo1" }) } as never,
      storage as never
    ),
    manifestUploads
  };
}

function manifestFor(hasArchive: boolean, head?: string): DGitManifest {
  const manifest = new ManifestService().createInitial("guild1", "u1");
  const entry = {
    hash: "sha256:commit",
    message: "commit",
    authorId: "u1",
    branch: "main",
    parent: null,
    secondParent: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    commitFile: attachment("commit.json.gz"),
    snapshotFile: attachment("snapshot.json.gz"),
    diffFile: attachment("diff.json.gz"),
    stateHash: "sha256:state",
    summary: { added: 0, deleted: 0, updated: 0, moved: 0, permissionUpdates: 0, dangerous: 0 },
    ...(hasArchive ? { messageArchiveFile: attachment("message-archive.json.gz") } : {})
  };
  manifest.commits[entry.hash] = entry;
  if (head) {
    manifest.head = head;
    manifest.branches.main!.head = head;
  }
  return manifest;
}

function commitFor(hash: string, messageArchiveHash?: string): DGitCommit {
  return {
    schemaVersion: 1,
    type: "commit",
    hash,
    guildId: "guild1",
    branch: "main",
    message: "commit",
    authorId: "u1",
    parent: null,
    secondParent: null,
    snapshotHash: "sha256:snapshot",
    diffHash: "sha256:diff",
    ...(messageArchiveHash ? { messageArchiveHash } : {}),
    stateHash: "sha256:state",
    createdAt: "2026-01-01T00:00:00.000Z"
  };
}

function archiveFor(commitHash: string, messages: MessageSnapshot[]): DGitMessageArchive {
  const byChannel: Record<string, number> = {};
  for (const item of messages) byChannel[item.channelInternalId] = (byChannel[item.channelInternalId] ?? 0) + 1;
  return {
    schemaVersion: 1,
    type: "messageArchive",
    createdAt: "2026-01-01T00:00:00.000Z",
    guildId: "guild1",
    commitHash,
    snapshotHash: "sha256:snapshot",
    stateHash: "sha256:state",
    messages,
    summary: {
      total: messages.length,
      byChannel,
      withAttachments: messages.filter((item) => item.attachments.length > 0).length,
      withEmbeds: messages.filter((item) => (item.embeds?.length ?? 0) > 0).length,
      unavailableContent: messages.filter((item) => item.content === null || item.content === undefined).length
    }
  };
}

function message(id: string, overrides: Partial<MessageSnapshot> = {}): MessageSnapshot {
  return {
    internalId: `message_${id}`,
    discordId: id,
    channelInternalId: "channel_general",
    attachments: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    content: null,
    embeds: [],
    pinned: false,
    editedAt: null,
    ...overrides
  };
}

function attachment(filename: string): AttachmentMeta {
  return {
    channelId: "repo1",
    messageId: "m1",
    filename,
    sizeBytes: 1,
    sha256: "sha256:file",
    contentType: "application/gzip"
  };
}
