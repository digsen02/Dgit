import type { DGitSnapshot, PermissionOverwriteSnapshot } from "./types/dgitTypes.js";

export class MaintenanceService {
  snapshotOn(snapshot: DGitSnapshot): DGitSnapshot {
    const copy: DGitSnapshot = structuredClone(snapshot);
    copy.channels = copy.channels.map((channel) => {
      if (channel.type !== 0) return channel;
      const overwrites = [...channel.permissionOverwrites];
      const existingIndex = overwrites.findIndex((overwrite) => overwrite.targetInternalId === "role_everyone" && overwrite.targetType === "role");
      const existing = existingIndex >= 0 ? overwrites[existingIndex]! : this.everyoneOverwrite(snapshot.guildId);
      const next: PermissionOverwriteSnapshot = {
        ...existing,
        allow: existing.allow.filter((permission) => permission !== "SendMessages").sort(),
        deny: [...new Set([...existing.deny, "SendMessages"])].sort()
      };
      if (existingIndex >= 0) overwrites[existingIndex] = next;
      else overwrites.push(next);
      return { ...channel, permissionOverwrites: overwrites.sort((a, b) => a.targetInternalId.localeCompare(b.targetInternalId)) };
    });
    return copy;
  }

  private everyoneOverwrite(guildId: string): PermissionOverwriteSnapshot {
    return {
      targetInternalId: "role_everyone",
      targetDiscordId: guildId,
      targetType: "role",
      allow: [],
      deny: []
    };
  }
}
