import { describe, expect, it, vi } from "vitest";
import { DGitService } from "../dgit/DGitService.js";
import type { DGitCommit, DGitDiff } from "../dgit/types/dgitTypes.js";
import { snapshot } from "./fixtures.js";

vi.mock("../utils/time.js", () => ({
  nowIso: () => "2026-01-01T00:00:00.000Z"
}));

describe("commit hash generation", () => {
  it("changes commit hash when snapshotHash changes", () => {
    const service = new DGitService() as unknown as DGitServicePrivate;
    const diff: DGitDiff = {
      schemaVersion: 1,
      type: "diff",
      createdAt: "2026-01-01T00:00:00.000Z",
      guildId: "guild1",
      from: "sha256:old",
      to: "sha256:same",
      changes: [],
      summary: { added: 0, updated: 0, deleted: 0, moved: 0, permissionUpdates: 0, dangerous: 0 }
    };
    const first = service.buildCommit(buildCommitInput({ snapshot: snapshot({ stateHash: "sha256:same", channels: [] }), diff }));
    const second = service.buildCommit(buildCommitInput({ snapshot: snapshot({ stateHash: "sha256:same" }), diff }));

    expect(first.snapshotHash).not.toBe(second.snapshotHash);
    expect(first.hash).not.toBe(second.hash);
  });
});

function buildCommitInput(overrides: Partial<BuildCommitInput> = {}): BuildCommitInput {
  return {
    guildId: "guild1",
    branch: "main",
    message: "test",
    authorId: "u1",
    parent: null,
    secondParent: null,
    snapshot: snapshot(),
    diff: overrides.diff ?? {
      schemaVersion: 1,
      type: "diff",
      createdAt: "2026-01-01T00:00:00.000Z",
      guildId: "guild1",
      from: null,
      to: "sha256:same",
      changes: [],
      summary: { added: 0, updated: 0, deleted: 0, moved: 0, permissionUpdates: 0, dangerous: 0 }
    },
    ...overrides
  };
}

type BuildCommitInput = {
    guildId: string;
    branch: string;
    message: string;
    authorId: string;
    parent: string | null;
    secondParent: string | null;
    snapshot: ReturnType<typeof snapshot>;
    diff: DGitDiff;
  };

interface DGitServicePrivate {
  buildCommit(input: BuildCommitInput): DGitCommit;
}
