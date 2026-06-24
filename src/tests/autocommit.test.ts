import { EventEmitter } from "node:events";
import type { Client, Guild } from "discord.js";
import { describe, expect, it } from "vitest";
import { AutoCommitWatcher } from "../dgit/AutoCommitWatcher.js";
import { LocalizedError } from "../i18n/localizedError.js";

function clientFor(guild: Guild): Client {
  const emitter = new EventEmitter() as EventEmitter & {
    guilds: { cache: Map<string, Guild>; fetch: (id: string) => Promise<Guild> };
    user: { id: string };
  };
  emitter.guilds = {
    cache: new Map([[guild.id, guild]]),
    fetch: async () => guild
  };
  emitter.user = { id: "bot1" };
  return emitter as unknown as Client;
}

describe("AutoCommitWatcher", () => {
  it("commits observed guild changes when autocommit is enabled", async () => {
    const guild = { id: "guild1" } as Guild;
    const commits: Array<{ guild: Guild; authorId: string; message: string }> = [];
    const service = {
      loadRepo: async () => ({ manifest: { settings: { autocommit: true } } }),
      commit: async (targetGuild: Guild, authorId: string, message: string) => {
        commits.push({ guild: targetGuild, authorId, message });
        return { commit: { hash: "sha256:auto" } };
      }
    };
    const watcher = new AutoCommitWatcher(service as never, 1);
    watcher.register(clientFor(guild));

    watcher.mark(guild.id);
    await watcher.flush(guild.id);

    expect(commits).toHaveLength(1);
    expect(commits[0]).toMatchObject({ guild, authorId: "bot1" });
    expect(commits[0]?.message).toContain("Auto-commit server changes");
    expect(watcher.hasObserved(guild.id)).toBe(false);
  });

  it("keeps observed changes when autocommit is disabled", async () => {
    const guild = { id: "guild1" } as Guild;
    const service = {
      loadRepo: async () => ({ manifest: { settings: { autocommit: false, watch: false } } }),
      commit: async () => {
        throw new Error("commit should not be called");
      },
      status: async () => {
        throw new Error("status should not be called");
      }
    };
    const watcher = new AutoCommitWatcher(service as never, 1);
    watcher.register(clientFor(guild));

    watcher.mark(guild.id);
    await watcher.flush(guild.id);

    expect(watcher.hasObserved(guild.id)).toBe(true);
  });

  it("sends a watch notification when watch is enabled without autocommit", async () => {
    const guild = { id: "guild1" } as Guild;
    const sent: string[] = [];
    const service = {
      loadRepo: async () => ({ manifest: { settings: { autocommit: false, watch: true } } }),
      commit: async () => {
        throw new Error("commit should not be called");
      },
      status: async () => ({
        clean: false,
        manifest: { currentBranch: "main", head: "sha256:head" },
        diff: { summary: { added: 1, deleted: 0, updated: 2, moved: 0, permissionUpdates: 0, dangerous: 0 }, changes: [{ id: "change" }] },
        repository: { send: async (message: string) => sent.push(message) }
      })
    };
    const watcher = new AutoCommitWatcher(service as never, 1);
    watcher.register(clientFor(guild));

    watcher.mark(guild.id);
    await watcher.flush(guild.id);

    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain("[DGIT:WATCH]");
    expect(sent[0]).toContain("branch: main");
    expect(watcher.hasObserved(guild.id)).toBe(false);
  });

  it("clears observed changes when the tree is already clean", async () => {
    const guild = { id: "guild1" } as Guild;
    const service = {
      loadRepo: async () => ({ manifest: { settings: { autocommit: true, watch: false } } }),
      commit: async () => {
        throw new LocalizedError("workingTreeClean");
      },
      status: async () => {
        throw new Error("status should not be called");
      }
    };
    const watcher = new AutoCommitWatcher(service as never, 1);
    watcher.register(clientFor(guild));

    watcher.mark(guild.id);
    await watcher.flush(guild.id);

    expect(watcher.hasObserved(guild.id)).toBe(false);
  });
});
