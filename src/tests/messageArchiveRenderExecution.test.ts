import { ChannelType, PermissionFlagsBits } from "discord.js";
import { describe, expect, it } from "vitest";
import { GuildStateApplier } from "../dgit/GuildStateApplier.js";
import type { ApplyPlan, ApplyStep, ChannelSnapshot, MessageSnapshot } from "../dgit/types/dgitTypes.js";
import { buildApplyResultEmbed } from "../discord/embeds/dgitEmbeds.js";
import { snapshot } from "./fixtures.js";

describe("message archive render execution", () => {
  it("renders a message record to the resolved target channel", async () => {
    const sent: Array<{ content: string }> = [];
    const guild = fakeGuild([textChannel("c1", "general", sent)]);

    const result = await new GuildStateApplier().applyPlan(guild, plan([
      renderStep(message("m1", { content: "archived text" }))
    ]), { repositoryChannelId: "repo1" });

    expect(result.success).toHaveLength(1);
    expect(result.messageRendering).toEqual({ rendered: 1, skipped: 0, failed: 0 });
    expect(sent[0]?.content).toContain("DGit archived message render");
    expect(sent[0]?.content).toContain("not the original Discord message");
    expect(sent[0]?.content).toContain("Original message ID: m1");
    expect(sent[0]?.content).toContain("Original createdAt: 2026-01-01T00:00:00.000Z");
    expect(sent[0]?.content).toContain("Original author: Ada");
    expect(sent[0]?.content).toContain("archived text");
  });

  it("skips a render step when the target channel is missing", async () => {
    const result = await new GuildStateApplier().applyPlan(fakeGuild([]), plan([
      renderStep(message("m1"))
    ]), { repositoryChannelId: "repo1" });

    expect(result.success).toHaveLength(0);
    expect(result.skipped[0]?.reason).toMatch(/not found/);
    expect(result.messageRendering).toEqual({ rendered: 0, skipped: 1, failed: 0 });
  });

  it("skips a render step when the target channel is inaccessible", async () => {
    const sent: Array<{ content: string }> = [];
    const guild = fakeGuild([textChannel("c1", "general", sent, { canSend: false })]);

    const result = await new GuildStateApplier().applyPlan(guild, plan([
      renderStep(message("m1"))
    ]), { repositoryChannelId: "repo1" });

    expect(result.success).toHaveLength(0);
    expect(result.skipped[0]?.reason).toMatch(/inaccessible|SendMessages/);
    expect(sent).toHaveLength(0);
  });

  it("processes render steps sequentially in plan order", async () => {
    const sent: Array<{ content: string }> = [];
    const guild = fakeGuild([textChannel("c1", "general", sent)]);

    const result = await new GuildStateApplier().applyPlan(guild, plan([
      renderStep(message("later", { createdAt: "2026-01-01T00:00:02.000Z", content: "second" }), "step-2"),
      renderStep(message("earlier", { createdAt: "2026-01-01T00:00:01.000Z", content: "first" }), "step-1")
    ]), { repositoryChannelId: "repo1" });

    expect(result.success.map((step) => step.id)).toEqual(["step-2", "step-1"]);
    expect(sent.map((item) => item.content.match(/Content:\n(.+)$/)?.[1])).toEqual(["second", "first"]);
  });

  it("reports render failures without corrupting structure restore results", async () => {
    const sent: Array<{ content: string }> = [];
    const failing = textChannel("c1", "general", sent, { sendError: new Error("send failed") });
    const roleStep: ApplyStep = {
      id: "structure-1",
      action: "update-name",
      objectType: "role",
      internalId: "role_managed",
      dangerous: false,
      description: "managed role update",
      payload: {
        before: { discordId: "r1", internalId: "role_managed", name: "managed", managed: true },
        after: { discordId: "r1", internalId: "role_managed", name: "managed", managed: true },
        path: "name"
      }
    };

    const result = await new GuildStateApplier().applyPlan(fakeGuild([failing]), plan([
      renderStep(message("m1")),
      roleStep
    ]), { repositoryChannelId: "repo1" });

    expect(result.failed[0]?.error).toMatch(/send failed/);
    expect(result.skipped[0]?.reason).toMatch(/Managed role/);
    expect(result.messageRendering).toEqual({ rendered: 0, skipped: 0, failed: 1 });
  });

  it("includes attachment placeholders instead of failing on archived attachment metadata", async () => {
    const sent: Array<{ content: string }> = [];
    const guild = fakeGuild([textChannel("c1", "general", sent)]);

    await new GuildStateApplier().applyPlan(guild, plan([
      renderStep(message("m1", {
        attachments: [{
          channelId: "c1",
          messageId: "m1",
          filename: "file.txt",
          sizeBytes: 10,
          sha256: "sha256:attachment",
          contentType: "text/plain"
        }]
      }))
    ]), { repositoryChannelId: "repo1" });

    expect(sent[0]?.content).toContain("Attachments archived: 1");
    expect(sent[0]?.content).toContain("sha256:attachment");
  });

  it("shows message rendering counts in apply result embeds", () => {
    const embed = buildApplyResultEmbed({
      title: "Restore",
      result: {
        success: [],
        skipped: [],
        failed: [],
        warnings: [],
        messageRendering: { rendered: 2, skipped: 1, failed: 0 }
      }
    }).toJSON();

    expect(JSON.stringify(embed)).toContain("Message rendering");
    expect(JSON.stringify(embed)).toContain("Rendered: 2");
    expect(JSON.stringify(embed)).toContain("Skipped: 1");
  });
});

function plan(steps: ApplyStep[]): ApplyPlan {
  return {
    changes: [],
    steps,
    dangerousCount: 0,
    warnings: [],
    targetSnapshot: snapshot()
  };
}

function renderStep(messageSnapshot: MessageSnapshot, id = `render-${messageSnapshot.internalId}`): ApplyStep {
  return {
    id,
    action: "render_message_record",
    objectType: "message",
    internalId: messageSnapshot.internalId,
    dangerous: false,
    description: `render ${messageSnapshot.internalId}`,
    payload: {
      mode: "renderAsAppMessages",
      channelInternalId: messageSnapshot.channelInternalId,
      message: messageSnapshot,
      targetSnapshot: snapshot()
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
    authorDiscordId: "u1",
    authorDisplayName: "Ada",
    content: "archived text",
    embeds: [],
    pinned: false,
    editedAt: null,
    ...overrides
  };
}

function textChannel(
  id: string,
  name: string,
  sent: Array<{ content: string }>,
  options: { canSend?: boolean; sendError?: Error } = {}
) {
  return {
    id,
    name,
    type: ChannelType.GuildText,
    permissionsFor: () => ({
      has: (permission: bigint) => permission === PermissionFlagsBits.ViewChannel || (permission === PermissionFlagsBits.SendMessages && options.canSend !== false)
    }),
    send: async (input: { content: string }) => {
      if (options.sendError) throw options.sendError;
      sent.push(input);
    }
  };
}

function fakeGuild(channels: Array<ReturnType<typeof textChannel>>) {
  const byId = new Map(channels.map((channel) => [channel.id, channel]));
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
      cache: {
        get: (id: string) => byId.get(id),
        find: (predicate: (channel: ReturnType<typeof textChannel>) => boolean) => channels.find(predicate)
      }
    }
  } as never;
}
