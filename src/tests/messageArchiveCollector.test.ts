import { ChannelType, PermissionFlagsBits } from "discord.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MessageArchiveCollector } from "../dgit/MessageArchiveCollector.js";
import type { RepositorySettings } from "../dgit/types/dgitTypes.js";
import { sha256Buffer } from "../utils/hash.js";
import { snapshot } from "./fixtures.js";

vi.mock("../utils/time.js", () => ({
  nowIso: () => "2026-01-01T00:00:00.000Z"
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MessageArchiveCollector", () => {
  it("skips collection when messageBackup is disabled", async () => {
    const channel = fakeChannel("c1", "general", [fakeMessage("m1", "c1")]);
    const result = await new MessageArchiveCollector().collect(fakeGuild([channel]), collectionOptions({
      settings: settings(false)
    }));

    expect(result.archive).toBeNull();
    expect(channel.fetchCalls).toBe(0);
  });

  it("collects only included channels", async () => {
    const first = fakeChannel("c1", "general", [fakeMessage("m1", "c1")]);
    const second = fakeChannel("c2", "logs", [fakeMessage("m2", "c2")]);
    const result = await new MessageArchiveCollector().collect(fakeGuild([first, second]), collectionOptions({
      settings: settings(true, { includeChannels: ["c2"] })
    }));

    expect(result.archive?.messages.map((message) => message.discordId)).toEqual(["m2"]);
    expect(first.fetchCalls).toBe(0);
    expect(second.fetchCalls).toBe(1);
  });

  it("skips excluded, ignored, and inaccessible channels", async () => {
    const excluded = fakeChannel("c1", "general", [fakeMessage("m1", "c1")]);
    const ignoredByPattern = fakeChannel("c2", "private-notes", [fakeMessage("m2", "c2")]);
    const inaccessible = fakeChannel("c3", "secret", [fakeMessage("m3", "c3")], []);
    const collected = fakeChannel("c4", "announcements", [fakeMessage("m4", "c4")]);

    const result = await new MessageArchiveCollector().collect(fakeGuild([excluded, ignoredByPattern, inaccessible, collected]), collectionOptions({
      settings: settings(true, { excludeChannels: ["c1"] }),
      ignore: { channels: [], roles: [], types: [], patterns: ["private-*"] }
    }));

    expect(result.archive?.messages.map((message) => message.discordId)).toEqual(["m4"]);
    expect(excluded.fetchCalls).toBe(0);
    expect(ignoredByPattern.fetchCalls).toBe(0);
    expect(inaccessible.fetchCalls).toBe(0);
  });

  it("allows unavailable message content and counts it in the summary", async () => {
    const channel = fakeChannel("c1", "general", [fakeMessage("m1", "c1", { content: undefined })]);

    const result = await new MessageArchiveCollector().collect(fakeGuild([channel]), collectionOptions());

    expect(result.archive?.messages[0]?.content).toBeNull();
    expect(result.archive?.summary.total).toBe(result.archive?.messages.length);
    expect(result.archive?.summary.unavailableContent).toBe(1);
  });

  it("maps message attachments into AttachmentMeta using the existing shape", async () => {
    const body = Buffer.from("attachment-body");
    vi.stubGlobal("fetch", async () => ({
      arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength)
    }));
    const channel = fakeChannel("c1", "general", [
      fakeMessage("m1", "c1", {
        attachments: [
          { id: "a1", name: "file.txt", size: body.byteLength, url: "https://example.test/file.txt", contentType: "text/plain" }
        ]
      })
    ]);

    const result = await new MessageArchiveCollector().collect(fakeGuild([channel]), collectionOptions());

    expect(result.archive?.messages[0]?.attachments).toEqual([{
      channelId: "c1",
      messageId: "m1",
      filename: "file.txt",
      sizeBytes: body.byteLength,
      sha256: sha256Buffer(body),
      contentType: "text/plain"
    }]);
    expect(result.archive?.summary.withAttachments).toBe(1);
  });
});

function collectionOptions(overrides: Partial<Parameters<MessageArchiveCollector["collect"]>[1]> = {}): Parameters<MessageArchiveCollector["collect"]>[1] {
  const snap = snapshot();
  return {
    guildId: "guild1",
    commitHash: "sha256:commit",
    snapshotHash: "sha256:snapshot",
    stateHash: snap.stateHash,
    settings: settings(true),
    snapshot: snap,
    ...overrides
  };
}

function settings(enabled: boolean, messageBackup: Partial<NonNullable<RepositorySettings["messageBackup"]>> = {}): RepositorySettings {
  return {
    gzip: true,
    chunking: true,
    maxAttachmentBytes: 9_000_000,
    autocommit: false,
    watch: false,
    messageBackup: { enabled, ...messageBackup }
  };
}

function fakeGuild(channels: Array<ReturnType<typeof fakeChannel>>) {
  return {
    id: "guild1",
    members: { me: { id: "bot1" } },
    channels: {
      fetch: async () => undefined,
      cache: new Map(channels.map((channel) => [channel.id, channel]))
    }
  } as never;
}

function fakeChannel(
  id: string,
  name: string,
  messages: Array<ReturnType<typeof fakeMessage>>,
  permissions = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory]
) {
  const channel = {
    id,
    name,
    type: ChannelType.GuildText,
    fetchCalls: 0,
    permissionsFor: () => ({
      has: (permission: bigint) => permissions.includes(permission)
    }),
    messages: {
      fetch: async ({ limit }: { limit: number }) => {
        channel.fetchCalls += 1;
        const batch = messages.slice(0, limit);
        return {
          size: batch.length,
          values: () => batch.values()
        };
      }
    }
  };
  return channel;
}

function fakeMessage(
  id: string,
  channelId: string,
  overrides: {
    content?: string | undefined;
    attachments?: Array<{ id: string; name: string; size: number; url: string; contentType: string | null }>;
  } = {}
) {
  return {
    id,
    channelId,
    channel: { isThread: () => false },
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    editedAt: null,
    author: { id: "u1", username: "user" },
    member: { displayName: "User" },
    content: Object.hasOwn(overrides, "content") ? overrides.content : "hello",
    embeds: [],
    pinned: false,
    reference: null,
    attachments: new Map((overrides.attachments ?? []).map((attachment) => [attachment.id, attachment]))
  } as never;
}
