import { describe, expect, it } from "vitest";
import { IgnoreMatcher } from "../dgit/IgnoreMatcher.js";

describe("IgnoreMatcher", () => {
  it("matches exact channel ignore", () => {
    expect(new IgnoreMatcher({ channels: ["c1"], roles: [], types: [], patterns: [] }).isIgnoredChannel("c1", "general")).toBe(true);
  });

  it("matches exact role ignore", () => {
    expect(new IgnoreMatcher({ channels: [], roles: ["r1"], types: [], patterns: [] }).isIgnoredRole("r1", "mod")).toBe(true);
  });

  it("matches wildcard pattern", () => {
    expect(new IgnoreMatcher({ channels: [], roles: [], types: [], patterns: ["ticket-*"] }).isIgnoredChannel("c2", "ticket-123")).toBe(true);
  });
});
