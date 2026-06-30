import { describe, expect, it, vi } from "vitest";
import { DGitService } from "../dgit/DGitService.js";
import { ManifestService } from "../dgit/storage/ManifestService.js";
import type { AttachmentMeta, DGitCommit, DGitManifest, DGitMessageArchive, DGitSnapshot, MessageSnapshot } from "../dgit/types/dgitTypes.js";
import { sha256Json } from "../utils/hash.js";
import { snapshot } from "./fixtures.js";

vi.mock("../utils/time.js", () => ({
  nowIso: () => "2026-01-01T00:00:00.000Z"
}));

describe("message archive UX hardening service behavior", () => {
  it("persists message backup enable, channel filters, and restore mode", async () => {
    const manifest = manifestFor(null);
    const { service, uploads } = serviceContext(manifest, null);

    await service.setMessageBackup({ id: "guild1" } as never, {
      enabled: true,
      includeChannels: ["c1", "c1", "c2"],
      restoreMode: "archiveOnly"
    });

    expect(uploads.at(-1)?.settings.messageBackup).toEqual({
      enabled: true,
      includeChannels: ["c1", "c2"],
      restoreMode: "archiveOnly"
    });
  });

  it("can disable message backup and clear channel filters without losing compatibility", async () => {
    const manifest = manifestFor(null);
    manifest.settings.messageBackup = { enabled: true, includeChannels: ["c1"], excludeChannels: ["c2"], restoreMode: "renderAsAppMessages" };
    const { service, uploads } = serviceContext(manifest, null);

    await service.setMessageBackup({ id: "guild1" } as never, {
      enabled: false,
      clearChannels: true,
      restoreMode: null
    });

    expect(uploads.at(-1)?.settings.messageBackup).toEqual({ enabled: false });
  });

  it("uses configured default restoreMode when the command does not pass one", async () => {
    const archive = archiveFor("sha256:commit", [message("m1")]);
    const manifest = manifestFor(archive);
    manifest.settings.messageBackup = { enabled: true, restoreMode: "archiveOnly" };
    const { service } = serviceContext(manifest, archive);

    const { plan } = await service.restorePlan({ id: "guild1" } as never, "sha256:commit");

    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]?.action).toBe("export_message_archive");
  });

  it("reports old commits without message archives safely", async () => {
    const { service } = serviceContext(manifestFor(null), null);

    const info = await service.messageArchiveInfo({ id: "guild1" } as never, "sha256:commit");

    expect(info).toMatchObject({
      commitHash: "sha256:commit",
      hasArchive: false,
      archiveFile: null
    });
  });
});

function serviceContext(manifest: DGitManifest, archive: DGitMessageArchive | null) {
  const uploads: DGitManifest[] = [];
  const target = snapshot();
  const commit = commitFor("sha256:commit", archive ? sha256Json(archive) : undefined);
  const storage = {
    loadManifest: async () => structuredClone(uploads.at(-1) ?? manifest),
    loadSnapshot: async () => structuredClone(target) as DGitSnapshot,
    loadCommit: async () => commit,
    loadMessageArchive: async () => archive,
    uploadManifest: async (_repository: unknown, next: DGitManifest) => {
      uploads.push(next);
      return attachment("manifest.json.gz");
    }
  };
  return {
    service: new DGitService(
      { locate: async () => ({ id: "repo1" }) } as never,
      storage as never,
      new ManifestService(),
      { collect: async () => structuredClone(target) as DGitSnapshot } as never
    ),
    uploads
  };
}

function manifestFor(archive: DGitMessageArchive | null): DGitManifest {
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
    stateHash: "sha256:test",
    summary: { added: 0, deleted: 0, updated: 0, moved: 0, permissionUpdates: 0, dangerous: 0 },
    ...(archive ? { messageArchiveFile: attachment("message-archive.json.gz") } : {})
  };
  manifest.head = entry.hash;
  manifest.branches.main!.head = entry.hash;
  manifest.commits[entry.hash] = entry;
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
    snapshotHash: sha256Json(snapshot()),
    diffHash: "sha256:diff",
    ...(messageArchiveHash ? { messageArchiveHash } : {}),
    stateHash: "sha256:test",
    createdAt: "2026-01-01T00:00:00.000Z"
  };
}

function archiveFor(commitHash: string, messages: MessageSnapshot[]): DGitMessageArchive {
  return {
    schemaVersion: 1,
    type: "messageArchive",
    createdAt: "2026-01-01T00:00:00.000Z",
    guildId: "guild1",
    commitHash,
    snapshotHash: sha256Json(snapshot()),
    stateHash: "sha256:test",
    messages,
    summary: {
      total: messages.length,
      byChannel: { channel_general: messages.length },
      withAttachments: 0,
      unavailableContent: 0
    }
  };
}

function message(id: string): MessageSnapshot {
  return {
    internalId: `message_${id}`,
    discordId: id,
    channelInternalId: "channel_general",
    attachments: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    content: "archived",
    embeds: [],
    pinned: false,
    editedAt: null
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
