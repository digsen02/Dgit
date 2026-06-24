import { describe, expect, it } from "vitest";
import { LocalizedError } from "../i18n/localizedError.js";
import { DiscordRepositoryStorage, parseManifestMessageSha256 } from "../dgit/storage/DiscordRepositoryStorage.js";
import { ManifestService } from "../dgit/storage/ManifestService.js";
import type { DGitManifest } from "../dgit/types/dgitTypes.js";

describe("DiscordRepositoryStorage manifest concurrency", () => {
  it("saves when the pinned manifest sequence matches", async () => {
    const manifest = new ManifestService().createInitial("g1", "u1");
    const { storage, channel } = fakeStorage(manifest);
    const next = { ...structuredClone(manifest), manifestSequence: 2 };

    await expect(storage.uploadManifest(channel, next, 1)).resolves.toMatchObject({ filename: "manifest.json.gz" });
  });

  it("rejects stale manifest saves", async () => {
    const manifest = new ManifestService().createInitial("g1", "u1");
    manifest.manifestSequence = 2;
    const { storage, channel } = fakeStorage(manifest);
    const next = { ...structuredClone(manifest), manifestSequence: 3 };

    await expect(storage.uploadManifest(channel, next, 1)).rejects.toBeInstanceOf(LocalizedError);
  });

  it("parses manifest message sha", () => {
    expect(parseManifestMessageSha256("[DGIT:MANIFEST:CURRENT]\nsequence: 2\nsha256: sha256:abc")).toBe("sha256:abc");
    expect(parseManifestMessageSha256("[DGIT:MANIFEST:CURRENT]\nsequence: 2\nsha256: abc")).toBe("sha256:abc");
    expect(parseManifestMessageSha256("[DGIT:MANIFEST:CURRENT]\nsequence: 2\nSHA256: abc")).toBe("sha256:abc");
    expect(parseManifestMessageSha256("[DGIT:MANIFEST:CURRENT]\nsequence: 2")).toBeNull();
  });

  it("verifies current manifest sha from the pinned message", async () => {
    const manifest = new ManifestService().createInitial("g1", "u1");
    const { storage, channel } = fakeStorage(manifest, "sha256:test", "sha256:test");

    await expect(storage.loadManifestWithIntegrity(channel)).resolves.toMatchObject({
      integrity: { hashVerified: true, expectedSha256: "sha256:test" }
    });
  });

  it("rejects current manifest when the pinned sha is wrong", async () => {
    const manifest = new ManifestService().createInitial("g1", "u1");
    const { storage, channel } = fakeStorage(manifest, "sha256:wrong", "sha256:test");

    await expect(storage.loadManifestWithIntegrity(channel)).rejects.toThrow(/Manifest hash verification failed/);
  });
});

function fakeStorage(currentManifest: DGitManifest, pinnedSha = "sha256:test", acceptedSha = pinnedSha) {
  let nextMessageId = 2;
  const pinnedMessage = {
    id: "1",
    channelId: "c1",
    content: `[DGIT:MANIFEST:CURRENT]\nsequence: 1\nsha256: ${pinnedSha}`,
    attachments: {
      find: (predicate: (attachment: { name: string; url: string; size: number; contentType: string }) => boolean) => {
        const attachment = { name: "manifest.json.gz", url: "https://example.test/manifest.json.gz", size: 1, contentType: "application/gzip" };
        return predicate(attachment) ? attachment : undefined;
      }
    },
    edit: async (content: string) => {
      pinnedMessage.content = content;
      return pinnedMessage;
    },
    unpin: async () => undefined,
    pin: async () => undefined
  };
  const sentMessages = new Map<string, typeof pinnedMessage>([["1", pinnedMessage]]);
  const channel = {
    id: "c1",
    messages: {
      fetchPins: async () => ({ items: [{ message: pinnedMessage }] }),
      fetch: async (id: string) => sentMessages.get(id) ?? pinnedMessage
    },
    send: async (payload: { content: string }) => {
      const message = { ...pinnedMessage, id: String(nextMessageId++), content: payload.content };
      sentMessages.set(message.id, message);
      return message;
    }
  };
  const store = {
    readJson: async (_message: unknown, meta: { sha256: string }) => {
      if (meta.sha256 !== acceptedSha) throw new Error("hash mismatch");
      return structuredClone(currentManifest);
    },
    uploadJson: async (_channel: unknown, label: string | ((encoded: { sha256: string }) => string)) => {
      const content = typeof label === "function" ? label({ sha256: "sha256:new" }) : label;
      const message = await channel.send({ content });
      return {
        channelId: "c1",
        messageId: message.id,
        filename: "manifest.json.gz",
        sizeBytes: 1,
        sha256: "sha256:new",
        contentType: "application/gzip"
      };
    }
  };
  return {
    storage: new DiscordRepositoryStorage(store as never),
    channel: channel as never
  };
}
