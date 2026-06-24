import { describe, expect, it } from "vitest";
import { MergeEngine } from "../dgit/MergeEngine.js";
import { snapshot } from "./fixtures.js";

describe("MergeEngine", () => {
  it("merges non-conflicting changes", () => {
    const base = snapshot();
    const source = snapshot({ channels: [{ ...base.channels[0]!, topic: "source" }] });
    const target = snapshot({ roles: [{ ...base.roles[0]! }, { ...base.roles[1]!, color: 123 }] });
    const result = new MergeEngine().merge(base, source, target);
    expect(result.conflicts).toHaveLength(0);
    expect(result.snapshot?.channels[0]?.topic).toBe("source");
  });

  it("detects same field conflict", () => {
    const base = snapshot();
    const source = snapshot({ channels: [{ ...base.channels[0]!, topic: "source" }] });
    const target = snapshot({ channels: [{ ...base.channels[0]!, topic: "target" }] });
    expect(new MergeEngine().merge(base, source, target).conflicts).toHaveLength(1);
  });

  it("detects delete vs modify conflict", () => {
    const base = snapshot();
    const source = snapshot({ channels: [{ ...base.channels[0]!, topic: "source" }] });
    const target = snapshot({ channels: [] });
    expect(new MergeEngine().merge(base, source, target).conflicts[0]?.reason).toContain("Deleted");
  });
});
