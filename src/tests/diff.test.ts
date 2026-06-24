import { describe, expect, it } from "vitest";
import { DiffEngine } from "../dgit/DiffEngine.js";
import { IgnoreMatcher } from "../dgit/IgnoreMatcher.js";
import { snapshot } from "./fixtures.js";

describe("DiffEngine", () => {
  it("detects added channel", () => {
    const before = snapshot();
    const after = snapshot({ channels: [...before.channels, { ...before.channels[0]!, internalId: "channel_news", discordId: "c2", name: "news" }] });
    const diff = new DiffEngine().compute(before, after);
    expect(diff.changes.some((c) => c.op === "add" && c.objectType === "channel")).toBe(true);
  });

  it("detects deleted role", () => {
    const before = snapshot();
    const after = snapshot({ roles: before.roles.filter((r) => r.internalId !== "role_mod") });
    const diff = new DiffEngine().compute(before, after);
    expect(diff.changes.find((c) => c.op === "delete" && c.objectType === "role")?.severity).toBe("dangerous");
  });

  it("detects permission changes", () => {
    const before = snapshot();
    const after = snapshot({ roles: before.roles.map((r) => r.internalId === "role_mod" ? { ...r, permissions: ["Administrator", "ViewChannel"] } : r) });
    const diff = new DiffEngine().compute(before, after);
    expect(diff.changes.some((c) => c.op === "permission_update")).toBe(true);
  });

  it("detects role position changes", () => {
    const before = snapshot();
    const after = snapshot({ roles: before.roles.map((r) => r.internalId === "role_mod" ? { ...r, position: 10 } : r) });
    expect(new DiffEngine().compute(before, after).changes.some((c) => c.op === "move")).toBe(true);
  });

  it("ignores ignored objects", () => {
    const base = snapshot();
    const ignored = new IgnoreMatcher({ channels: ["c1"], roles: [], types: [], patterns: [] }).apply(base);
    expect(ignored.channels).toHaveLength(0);
  });
});
