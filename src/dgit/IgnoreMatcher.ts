import type { DGitSnapshot, IgnoreRules } from "./types/dgitTypes.js";

export class IgnoreMatcher {
  constructor(private readonly rules: IgnoreRules) {}

  apply(snapshot: DGitSnapshot): DGitSnapshot {
    const copy: DGitSnapshot = structuredClone(snapshot);
    copy.channels = copy.channels.filter((channel) => !this.isIgnoredChannel(channel.discordId, channel.name));
    copy.roles = copy.roles.filter((role) => !this.isIgnoredRole(role.discordId, role.name));
    return copy;
  }

  isIgnoredChannel(discordId: string, name: string): boolean {
    return this.rules.channels.includes(discordId) || this.matchesPattern(name);
  }

  isIgnoredRole(discordId: string, name: string): boolean {
    return this.rules.roles.includes(discordId) || this.matchesPattern(name);
  }

  ignoresType(type: string): boolean {
    return this.rules.types.includes(type);
  }

  private matchesPattern(name: string): boolean {
    return this.rules.patterns.some((pattern) => {
      const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
      return new RegExp(`^${escaped}$`, "i").test(name);
    });
  }
}
