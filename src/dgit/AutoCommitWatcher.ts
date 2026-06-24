import { Client, Guild } from "discord.js";
import { LocalizedError } from "../i18n/localizedError.js";
import { logger } from "../logger.js";
import { DGitService } from "./DGitService.js";
import { formatSummary } from "../utils/text.js";

type AutoCommitService = Pick<DGitService, "commit" | "loadRepo" | "status">;

export class AutoCommitWatcher {
  private readonly dirtyGuilds = new Set<string>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly runningGuilds = new Set<string>();
  private client: Client | null = null;

  constructor(
    private readonly service: AutoCommitService = new DGitService(),
    private readonly debounceMs = 5_000
  ) {}

  register(client: Client): void {
    this.client = client;
    client.on("channelCreate", (channel) => this.mark("guildId" in channel ? channel.guildId : null));
    client.on("channelUpdate", (_oldChannel, newChannel) => this.mark("guildId" in newChannel ? newChannel.guildId : null));
    client.on("channelDelete", (channel) => this.mark("guildId" in channel ? channel.guildId : null));
    client.on("roleCreate", (role) => this.mark(role.guild.id));
    client.on("roleUpdate", (_oldRole, newRole) => this.mark(newRole.guild.id));
    client.on("roleDelete", (role) => this.mark(role.guild.id));
    client.on("guildUpdate", (_oldGuild, newGuild) => this.mark(newGuild.id));
  }

  mark(guildId: string | null): void {
    if (!guildId) return;
    this.dirtyGuilds.add(guildId);
    this.schedule(guildId);
  }

  consume(guildId: string): boolean {
    const dirty = this.dirtyGuilds.has(guildId);
    this.dirtyGuilds.delete(guildId);
    return dirty;
  }

  hasObserved(guildId: string): boolean {
    return this.dirtyGuilds.has(guildId);
  }

  async flush(guildId: string): Promise<void> {
    if (!this.client?.user || this.runningGuilds.has(guildId)) return;
    this.clearTimer(guildId);
    this.runningGuilds.add(guildId);
    try {
      const guild = await this.fetchGuild(guildId);
      const { manifest } = await this.service.loadRepo(guild);
      if (!manifest.settings.autocommit) {
        if (manifest.settings.watch) await this.notifyWatchedChange(guildId, guild);
        return;
      }
      const result = await this.service.commit(guild, this.client.user.id, `Auto-commit server changes ${new Date().toISOString()}`);
      this.dirtyGuilds.delete(guildId);
      logger.info({ guildId, hash: result.commit.hash }, "DGit autocommit created");
    } catch (error) {
      if (error instanceof LocalizedError && error.key === "workingTreeClean") {
        this.dirtyGuilds.delete(guildId);
        return;
      }
      logger.warn({ guildId, error }, "DGit autocommit skipped");
    } finally {
      this.runningGuilds.delete(guildId);
    }
  }

  private async notifyWatchedChange(guildId: string, guild: Guild): Promise<void> {
    const { repository, diff, clean, manifest } = await this.service.status(guild);
    if (clean) {
      this.dirtyGuilds.delete(guildId);
      return;
    }
    await repository.send(`[DGIT:WATCH]\nbranch: ${manifest.currentBranch}\nhead: ${manifest.head ?? "none"}\nchanges: ${formatSummary(diff.summary)}`);
    this.dirtyGuilds.delete(guildId);
    logger.info({ guildId, changes: diff.changes.length }, "DGit watch notification created");
  }

  private schedule(guildId: string): void {
    if (!this.client) return;
    this.clearTimer(guildId);
    this.timers.set(guildId, setTimeout(() => {
      void this.flush(guildId);
    }, this.debounceMs));
  }

  private clearTimer(guildId: string): void {
    const timer = this.timers.get(guildId);
    if (!timer) return;
    clearTimeout(timer);
    this.timers.delete(guildId);
  }

  private async fetchGuild(guildId: string): Promise<Guild> {
    const cached = this.client?.guilds.cache.get(guildId);
    if (cached) return cached;
    if (!this.client) throw new Error("Discord client is not registered.");
    return this.client.guilds.fetch(guildId);
  }
}
