import { describe, expect, it } from "vitest";
import { ManifestService } from "../dgit/storage/ManifestService.js";

describe("ManifestService", () => {
  it("validates manifest", () => {
    const service = new ManifestService();
    expect(service.validate(service.createInitial("g1", "u1")).guildId).toBe("g1");
  });

  it("rejects missing commit references", () => {
    const service = new ManifestService();
    const manifest = service.createInitial("g1", "u1");
    manifest.branches.main!.head = "missing";
    expect(() => service.validate(manifest)).toThrow(/missing commit/);
  });
});
