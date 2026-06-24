import { describe, expect, it } from "vitest";
import { IgnoreMatcher } from "../dgit/IgnoreMatcher.js";
import { snapshot } from "./fixtures.js";

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

  it("applies channel ignore to snapshots", () => {
    const ignored = new IgnoreMatcher({ channels: ["c1"], roles: [], types: [], patterns: [] }).apply(snapshot());
    expect(ignored.channels).toHaveLength(0);
  });

  it("applies role ignore to snapshots", () => {
    const ignored = new IgnoreMatcher({ channels: [], roles: ["r1"], types: [], patterns: [] }).apply(snapshot());
    expect(ignored.roles.map((role) => role.discordId)).not.toContain("r1");
  });

  it("applies object type ignore to snapshots", () => {
    const ignored = new IgnoreMatcher({ channels: [], roles: [], types: ["channel"], patterns: [] }).apply(snapshot());
    expect(ignored.channels).toHaveLength(0);
  });

  it("applies pattern ignore to snapshots", () => {
    const ignored = new IgnoreMatcher({ channels: [], roles: [], types: [], patterns: ["gen*"] }).apply(snapshot());
    expect(ignored.channels).toHaveLength(0);
  });
});
