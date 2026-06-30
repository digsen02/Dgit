import { describe, expect, it } from "vitest";
import { DiscordRepositoryStorage } from "../dgit/storage/DiscordRepositoryStorage.js";
import type { AttachmentMeta, DGitCommit, DGitDiff, DGitMessageArchive } from "../dgit/types/dgitTypes.js";
import { sha256Json, shortHash } from "../utils/hash.js";
import { snapshot } from "./fixtures.js";

describe("message archive commit storage", () => {
  it("keeps commit object upload unchanged without a message archive", async () => {
    const { storage, uploaded } = fakeStorage();
    const snap = snapshot();
    const diff = testDiff();
    const commit = testCommit(snap.stateHash, sha256Json(snap), sha256Json(diff));

    const files = await storage.uploadCommitObjects({ id: "repo1" } as never, commit, snap, diff, 9_000_000);

    expect(uploaded.values.map((item) => item.filename)).toEqual([
      `commit-${shortHash(commit.hash)}.json.gz`,
      `snapshot-${shortHash(commit.hash)}.json.gz`,
      `diff-${shortHash(commit.hash)}.json.gz`
    ]);
    expect(files.messageArchiveFile).toBeUndefined();
    expect(commit.messageArchiveHash).toBeUndefined();
  });

  it("stores and references a message archive when provided", async () => {
    const { storage, uploaded } = fakeStorage();
    const snap = snapshot();
    const diff = testDiff();
    const baseCommit = testCommit(snap.stateHash, sha256Json(snap), sha256Json(diff));
    const archive = testArchive(baseCommit, snap.stateHash);
    const archiveHash = sha256Json(archive);

    const files = await storage.uploadCommitObjects({ id: "repo1" } as never, baseCommit, snap, diff, 9_000_000, archive);

    expect(uploaded.values[0]?.value).toMatchObject({ messageArchiveHash: archiveHash });
    expect(uploaded.values.at(-1)).toMatchObject({
      filename: `message-archive-${shortHash(archiveHash)}.json.gz`,
      value: archive
    });
    expect(files.messageArchiveFile).toMatchObject({
      filename: `message-archive-${shortHash(archiveHash)}.json.gz`
    });
  });

  it("rejects a message archive whose summary total does not match messages length", async () => {
    const { storage } = fakeStorage();
    const snap = snapshot();
    const diff = testDiff();
    const baseCommit = testCommit(snap.stateHash, sha256Json(snap), sha256Json(diff));
    const archive = testArchive(baseCommit, snap.stateHash);
    archive.summary.total = 2;

    await expect(storage.uploadCommitObjects(
      { id: "repo1" } as never,
      { ...baseCommit, messageArchiveHash: sha256Json(archive) },
      snap,
      diff,
      9_000_000,
      archive
    )).rejects.toThrow(/summary total/);
  });

  it("rejects snapshots that embed message archive data", async () => {
    const { storage } = fakeStorage();
    const snap = { ...snapshot(), messages: [] } as never;
    const diff = testDiff();
    const commit = testCommit("sha256:test", "sha256:snapshot", sha256Json(diff));

    await expect(storage.uploadCommitObjects({ id: "repo1" } as never, commit, snap, diff, 9_000_000))
      .rejects.toThrow(/must not be embedded/);
  });
});

function fakeStorage() {
  const uploaded: { values: Array<{ filename: string; value: unknown }> } = { values: [] };
  const store = {
    uploadJsonMany: async (
      _channel: unknown,
      _label: string,
      values: Array<{ filename: string; value: unknown }>
    ): Promise<AttachmentMeta[]> => {
      uploaded.values = values;
      return values.map((item, index) => ({
        channelId: "repo1",
        messageId: "m1",
        filename: item.filename,
        sizeBytes: index + 1,
        sha256: `sha256:${index}`,
        contentType: "application/gzip"
      }));
    }
  };
  return { storage: new DiscordRepositoryStorage(store as never), uploaded };
}

function testCommit(stateHash: string, snapshotHash: string, diffHash: string): DGitCommit {
  return {
    schemaVersion: 1,
    type: "commit",
    hash: "sha256:commit",
    guildId: "guild1",
    branch: "main",
    message: "test",
    authorId: "u1",
    parent: null,
    secondParent: null,
    snapshotHash,
    diffHash,
    stateHash,
    createdAt: "2026-01-01T00:00:00.000Z"
  };
}

function testDiff(): DGitDiff {
  return {
    schemaVersion: 1,
    type: "diff",
    createdAt: "2026-01-01T00:00:00.000Z",
    guildId: "guild1",
    from: null,
    to: "sha256:test",
    changes: [],
    summary: { added: 0, updated: 0, deleted: 0, moved: 0, permissionUpdates: 0, dangerous: 0 }
  };
}

function testArchive(commit: DGitCommit, stateHash: string): DGitMessageArchive {
  return {
    schemaVersion: 1,
    type: "messageArchive",
    createdAt: "2026-01-01T00:00:00.000Z",
    guildId: commit.guildId,
    commitHash: commit.hash,
    snapshotHash: commit.snapshotHash,
    stateHash,
    messages: [
      {
        internalId: "message_1",
        discordId: "m-original",
        channelInternalId: "channel_general",
        attachments: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        content: null
      }
    ],
    summary: {
      total: 1,
      byChannel: { channel_general: 1 },
      withAttachments: 0,
      unavailableContent: 1
    }
  };
}
