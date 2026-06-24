import { describe, expect, it } from "vitest";
import { GuildStateApplier } from "../dgit/GuildStateApplier.js";
import type { ApplyPlan, ApplyStep } from "../dgit/types/dgitTypes.js";

describe("GuildStateApplier safety", () => {
  it("skips repository channel modifications", async () => {
    const step = stepFixture({
      objectType: "channel",
      internalId: "channel_repo",
      action: "update-name",
      payload: { before: { discordId: "repo1" }, after: { discordId: "repo1" }, path: "name" }
    });

    const result = await new GuildStateApplier().applyPlan(fakeGuild(), plan([step]), { repositoryChannelId: "repo1" });

    expect(result.skipped[0]?.reason).toMatch(/Repository channel/);
    expect(result.success).toHaveLength(0);
  });

  it("skips managed role modifications", async () => {
    const step = stepFixture({
      objectType: "role",
      internalId: "role_managed",
      action: "update-name",
      payload: { before: { discordId: "r1", internalId: "role_managed", name: "managed", managed: true }, after: { discordId: "r1", internalId: "role_managed", name: "managed", managed: true }, path: "name" }
    });

    const result = await new GuildStateApplier().applyPlan(fakeGuild(), plan([step]), { repositoryChannelId: "repo1" });

    expect(result.skipped[0]?.reason).toMatch(/Managed role/);
  });

  it("skips role modifications at or above the bot highest role", async () => {
    const step = stepFixture({
      objectType: "role",
      internalId: "role_high",
      action: "update-name",
      payload: { before: { discordId: "r-high", internalId: "role_high", name: "high", managed: false }, after: { discordId: "r-high", internalId: "role_high", name: "high", managed: false }, path: "name" }
    });

    const result = await new GuildStateApplier().applyPlan(fakeGuild(), plan([step]), { repositoryChannelId: "repo1" });

    expect(result.skipped[0]?.reason).toMatch(/above the bot/);
  });
});

function plan(steps: ApplyStep[]): ApplyPlan {
  return { changes: [], steps, dangerousCount: 0, warnings: [] };
}

function stepFixture(overrides: Partial<ApplyStep>): ApplyStep {
  return {
    id: "step-1",
    action: "update-name",
    objectType: "role",
    internalId: "role1",
    dangerous: false,
    description: "test",
    payload: {},
    ...overrides
  };
}

function fakeGuild() {
  const roles = new Map<string, { id: string; name: string; managed: boolean; position: number }>([
    ["r-high", { id: "r-high", name: "high", managed: false, position: 20 }]
  ]);
  return {
    id: "guild1",
    members: { me: { roles: { highest: { id: "bot-role", position: 10, managed: false } } } },
    roles: {
      fetch: async () => undefined,
      cache: {
        get: (id: string) => roles.get(id),
        find: (predicate: (role: { id: string; name: string; managed: boolean; position: number }) => boolean) => [...roles.values()].find(predicate),
      },
      everyone: { setPermissions: async () => undefined }
    },
    channels: {
      fetch: async () => undefined,
      cache: { get: () => undefined, find: () => undefined }
    }
  } as never;
}
