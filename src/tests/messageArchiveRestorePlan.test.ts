import { describe, expect, it, vi } from "vitest";
import { DGitService } from "../dgit/DGitService.js";
import { GuildStateApplier } from "../dgit/GuildStateApplier.js";
import { ManifestService } from "../dgit/storage/ManifestService.js";
import type { ApplyPlan, ApplyStep, AttachmentMeta, DGitCommit, DGitManifest, DGitMessageArchive, DGitSnapshot, MessageSnapshot } from "../dgit/types/dgitTypes.js";
import { sha256Json } from "../utils/hash.js";
import { snapshot } from "./fixtures.js";

vi.mock("../utils/time.js", () => ({
  nowIso: () => "2026-01-01T00:00:00.000Z"
}));

describe("message archive restore plan integration", () => {
  it("keeps existing restore behavior unchanged when no message restore mode is selected", async () => {
    const { service } = serviceWithArchive(archiveFor("sha256:commit", [message("m1")]));

    const { plan } = await service.restorePlan({ id: "guild1" } as never, "sha256:commit");

    expect(plan.steps.some((step) => step.objectType === "message")).toBe(false);
    expect(plan.warnings.join("\n")).not.toContain("Original Discord message IDs");
    expect(plan.warnings.join("\n")).toContain("Message archive on target commit: present");
    expect(plan.warnings.join("\n")).toContain("no message restore mode was selected");
  });

  it("structureOnly creates no message execution steps", async () => {
    const { service } = serviceWithArchive(archiveFor("sha256:commit", [message("m1")]));

    const { plan } = await service.restorePlan({ id: "guild1" } as never, "sha256:commit", "structureOnly");

    expect(plan.steps.some((step) => step.objectType === "message")).toBe(false);
    expect(plan.warnings.join("\n")).toContain("structureOnly mode will not apply it");
  });

  it("archiveOnly creates archive export steps only", async () => {
    const archive = archiveFor("sha256:commit", [message("m1"), message("m2")]);
    const { service } = serviceWithArchive(archive);

    const { plan } = await service.restorePlan({ id: "guild1" } as never, "sha256:commit", "archiveOnly");

    expect(plan.dangerousCount).toBe(0);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]).toMatchObject({
      action: "export_message_archive",
      objectType: "message",
      dangerous: false,
      payload: {
        mode: "archiveOnly",
        totalMessages: 2,
        unavailableContent: 0
      }
    });
    expect(plan.steps.every((step) => step.objectType === "message")).toBe(true);
  });

  it("renderAsAppMessages creates message render plan steps", async () => {
    const archive = archiveFor("sha256:commit", [message("m1"), message("m2")]);
    const { service } = serviceWithArchive(archive);

    const { plan } = await service.restorePlan({ id: "guild1" } as never, "sha256:commit", "renderAsAppMessages");
    const messageSteps = plan.steps.filter((step) => step.objectType === "message");

    expect(messageSteps).toHaveLength(2);
    expect(messageSteps[0]).toMatchObject({
      action: "render_message_record",
      objectType: "message",
      dangerous: false,
      payload: {
        mode: "renderAsAppMessages",
        channelInternalId: "channel_general"
      }
    });
    expect(plan.warnings.join("\n")).toContain("new bot-authored archival messages");
  });

  it("orders render steps by original createdAt within each channel", async () => {
    const archive = archiveFor("sha256:commit", [
      message("late", { createdAt: "2026-01-01T00:00:02.000Z" }),
      message("early", { createdAt: "2026-01-01T00:00:01.000Z" })
    ]);
    const { service } = serviceWithArchive(archive);

    const { plan } = await service.restorePlan({ id: "guild1" } as never, "sha256:commit", "renderAsAppMessages");

    expect(plan.steps.filter((step) => step.objectType === "message").map((step) => step.internalId)).toEqual([
      "message_early",
      "message_late"
    ]);
  });

  it("adds a clear warning when the target commit has no message archive", async () => {
    const { service } = serviceWithArchive(null);

    const { plan } = await service.restorePlan({ id: "guild1" } as never, "sha256:commit", "archiveOnly");

    expect(plan.steps).toHaveLength(0);
    expect(plan.warnings.join("\n")).toContain("No message archive is available");
  });

  it("restore preview shows no archive warning when target commit has no archive", async () => {
    const { service } = serviceWithArchive(null);

    const { plan } = await service.restorePlan({ id: "guild1" } as never, "sha256:commit");

    expect(plan.warnings.join("\n")).toContain("Message archive on target commit: none");
    expect(plan.warnings.join("\n")).toContain("Selected message restore mode: none");
  });
});

function serviceWithArchive(archive: DGitMessageArchive | null) {
  const target = snapshot();
  const live = snapshot();
  const manifest = manifestFor(Boolean(archive));
  const commit = commitFor("sha256:commit", archive ? sha256Json(archive) : undefined);
  const storage = {
    loadManifest: async () => structuredClone(manifest),
    loadSnapshot: async () => structuredClone(target),
    loadCommit: async () => commit,
    loadMessageArchive: async () => archive
  };
  return {
    service: new DGitService(
      { locate: async () => ({ id: "repo1" }) } as never,
      storage as never,
      new ManifestService(),
      { collect: async () => structuredClone(live) as DGitSnapshot } as never
    )
  };
}

function manifestFor(hasArchive: boolean): DGitManifest {
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
    ...(hasArchive ? { messageArchiveFile: attachment("message-archive.json.gz") } : {})
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
    content: `content ${id}`,
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

function planWithSteps(steps: ApplyStep[]): ApplyPlan {
  return { changes: [], steps, dangerousCount: 0, warnings: [] };
}

function fakeGuild() {
  return {
    id: "guild1",
    members: { me: { roles: { highest: { id: "bot-role", position: 10, managed: false } } } },
    roles: {
      fetch: async () => undefined,
      cache: { get: () => undefined, find: () => undefined },
      everyone: { setPermissions: async () => undefined }
    },
    channels: {
      fetch: async () => undefined,
      cache: { get: () => undefined, find: () => undefined }
    }
  } as never;
}
