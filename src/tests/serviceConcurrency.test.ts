import { describe, expect, it } from "vitest";
import { DGitService } from "../dgit/DGitService.js";
import { ManifestService } from "../dgit/storage/ManifestService.js";
import type { DGitManifest } from "../dgit/types/dgitTypes.js";
import { LocalizedError } from "../i18n/localizedError.js";
import { snapshot } from "./fixtures.js";

describe("DGitService manifest concurrency", () => {
  it("fails commit before uploading objects when manifest sequence changed", async () => {
    const manifest = new ManifestService().createInitial("guild1", "u1");
    const calls = { loadManifest: 0, uploadObjects: 0 };
    const service = new DGitService(
      { locate: async () => ({ id: "repo1" }) } as never,
      {
        loadManifest: async () => {
          calls.loadManifest += 1;
          return calls.loadManifest === 1 ? manifest : withSequence(manifest, 2);
        },
        uploadCommitObjects: async () => {
          calls.uploadObjects += 1;
          throw new Error("upload should not be called");
        },
        uploadManifest: async () => undefined
      } as never,
      new ManifestService(),
      { collect: async () => snapshot({ stateHash: "sha256:live" }) } as never
    );

    await expect(service.commit({ id: "guild1" } as never, "u1", "change")).rejects.toBeInstanceOf(LocalizedError);
    expect(calls.uploadObjects).toBe(0);
  });
});

function withSequence(manifest: DGitManifest, manifestSequence: number): DGitManifest {
  return { ...structuredClone(manifest), manifestSequence };
}
