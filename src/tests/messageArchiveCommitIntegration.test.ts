import { describe, expect, it, vi } from "vitest";
import { DGitService } from "../dgit/DGitService.js";
import { ManifestService } from "../dgit/storage/ManifestService.js";
import { commitSchema } from "../dgit/schemas/commit.schema.js";
import type { AttachmentMeta, DGitCommit, DGitManifest, DGitMessageArchive, DGitSnapshot } from "../dgit/types/dgitTypes.js";
import { sha256Json } from "../utils/hash.js";
import { snapshot } from "./fixtures.js";

vi.mock("../utils/time.js", () => ({
  nowIso: () => "2026-01-01T00:00:00.000Z"
}));

describe("DGitService message archive commit integration", () => {
  it("keeps commit behavior unchanged when messageBackup is disabled", async () => {
    const manifest = new ManifestService().createInitial("guild1", "u1");
    manifest.settings.messageBackup = { enabled: false };
    const live = snapshot({ stateHash: "sha256:live" });
    let collectCalls = 0;
    const ctx = serviceContext(manifest, live, {
      collectArchive: async () => {
        collectCalls += 1;
        return { archive: null, warnings: ["disabled"] };
      }
    });

    const result = await ctx.service.commit({ id: "guild1" } as never, "u1", "change");

    expect(ctx.uploaded.archive).toBeNull();
    expect(ctx.uploaded.commit?.messageArchiveHash).toBeUndefined();
    expect(result.commit.messageArchiveHash).toBeUndefined();
    expect(result.manifest.commits[result.commit.hash]?.messageArchiveFile).toBeUndefined();
    expect(collectCalls).toBe(0);
  });

  it("creates and links a message archive when messageBackup is enabled", async () => {
    const manifest = new ManifestService().createInitial("guild1", "u1");
    manifest.settings.messageBackup = { enabled: true };
    const live = snapshot({ stateHash: "sha256:live" });
    const ctx = serviceContext(manifest, live, {
      collectArchive: async (options) => {
        const archive = archiveFor(options.guildId, options.commitHash, options.snapshotHash, options.stateHash);
        return { archive, warnings: [] };
      }
    });

    const result = await ctx.service.commit({ id: "guild1" } as never, "u1", "change");
    const archiveHash = sha256Json(ctx.uploaded.archive);

    expect(ctx.uploaded.archive).toMatchObject({ commitHash: result.commit.hash });
    expect(ctx.uploaded.commit?.messageArchiveHash).toBe(archiveHash);
    expect(result.commit.messageArchiveHash).toBe(archiveHash);
    expect(result.manifest.commits[result.commit.hash]?.messageArchiveFile).toMatchObject({
      filename: "message-archive.json.gz"
    });
  });

  it("keeps old commit data without messageArchiveHash loadable", () => {
    expect(commitSchema.parse({
      schemaVersion: 1,
      type: "commit",
      hash: "sha256:commit",
      guildId: "guild1",
      branch: "main",
      message: "old",
      authorId: "u1",
      parent: null,
      secondParent: null,
      snapshotHash: "sha256:snapshot",
      diffHash: "sha256:diff",
      stateHash: "sha256:state",
      createdAt: "2026-01-01T00:00:00.000Z"
    }).messageArchiveHash).toBeUndefined();
  });

  it("does not upload a manifest when archive object upload fails", async () => {
    const manifest = new ManifestService().createInitial("guild1", "u1");
    manifest.settings.messageBackup = { enabled: true };
    const live = snapshot({ stateHash: "sha256:live" });
    const ctx = serviceContext(manifest, live, {
      uploadError: new Error("archive upload failed"),
      collectArchive: async (options) => ({
        archive: archiveFor(options.guildId, options.commitHash, options.snapshotHash, options.stateHash),
        warnings: []
      })
    });

    await expect(ctx.service.commit({ id: "guild1" } as never, "u1", "change")).rejects.toThrow(/archive upload failed/);
    expect(ctx.manifestUploads).toHaveLength(0);
  });
});

function serviceContext(
  manifest: DGitManifest,
  live: DGitSnapshot,
  options: {
    uploadError?: Error;
    collectArchive: (input: { guildId: string; commitHash: string; snapshotHash: string; stateHash: string }) => Promise<{ archive: DGitMessageArchive | null; warnings: string[] }>;
  }
) {
  const uploaded: { commit: DGitCommit | null; archive: DGitMessageArchive | null } = { commit: null, archive: null };
  const manifestUploads: DGitManifest[] = [];
  const storage = {
    loadManifest: async () => structuredClone(manifest),
    uploadCommitObjects: async (
      _repository: unknown,
      commit: DGitCommit,
      _snapshot: DGitSnapshot,
      _diff: unknown,
      _maxBytes: number,
      archive?: DGitMessageArchive | null
    ) => {
      if (options.uploadError) throw options.uploadError;
      uploaded.commit = commit;
      uploaded.archive = archive ?? null;
      return {
        commitFile: attachment("commit.json.gz"),
        snapshotFile: attachment("snapshot.json.gz"),
        diffFile: attachment("diff.json.gz"),
        ...(archive ? { messageArchiveFile: attachment("message-archive.json.gz") } : {})
      };
    },
    uploadManifest: async (_repository: unknown, next: DGitManifest) => {
      manifestUploads.push(next);
      return attachment("manifest.json.gz");
    }
  };
  const service = new DGitService(
    { locate: async () => ({ id: "repo1" }) } as never,
    storage as never,
    new ManifestService(),
    { collect: async () => live } as never,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    { collect: async (_guild: unknown, input: { guildId: string; commitHash: string; snapshotHash: string; stateHash: string }) => options.collectArchive(input) } as never
  );
  return { service, uploaded, manifestUploads };
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

function archiveFor(guildId: string, commitHash: string, snapshotHash: string, stateHash: string): DGitMessageArchive {
  return {
    schemaVersion: 1,
    type: "messageArchive",
    createdAt: "2026-01-01T00:00:00.000Z",
    guildId,
    commitHash,
    snapshotHash,
    stateHash,
    messages: [
      {
        internalId: "message_1",
        discordId: "m1",
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
