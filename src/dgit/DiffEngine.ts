import type { ChannelSnapshot, DGitDiff, DGitSnapshot, DiffChange, RoleSnapshot, Severity } from "./types/dgitTypes.js";
import { sha256Json } from "../utils/hash.js";
import { summarizeChanges } from "../utils/text.js";
import { nowIso } from "../utils/time.js";

const ROLE_FIELDS: Array<keyof RoleSnapshot> = ["name", "color", "hoist", "icon", "unicodeEmoji", "position", "permissions", "managed", "mentionable"];
const CHANNEL_FIELDS: Array<keyof ChannelSnapshot> = [
  "type", "name", "parentInternalId", "position", "topic", "nsfw", "rateLimitPerUser", "bitrate", "userLimit",
  "permissionOverwrites", "defaultAutoArchiveDuration", "availableTags", "defaultReactionEmoji", "defaultSortOrder", "defaultForumLayout"
];

export class DiffEngine {
  compute(before: DGitSnapshot | null, after: DGitSnapshot, from: string | null = null, to: string | null = after.stateHash): DGitDiff {
    const changes = before ? this.diffSnapshots(before, after) : this.initialChanges(after);
    return {
      schemaVersion: 1,
      type: "diff",
      createdAt: nowIso(),
      guildId: after.guildId,
      from,
      to,
      changes,
      summary: summarizeChanges(changes)
    };
  }

  hashSnapshot(snapshot: Omit<DGitSnapshot, "stateHash"> | DGitSnapshot): string {
    const copy = structuredClone(snapshot) as DGitSnapshot;
    copy.stateHash = "sha256:pending";
    return sha256Json(copy);
  }

  private diffSnapshots(before: DGitSnapshot, after: DGitSnapshot): DiffChange[] {
    const changes: DiffChange[] = [];
    const beforeRoles = new Map(before.roles.map((r) => [r.internalId, r]));
    const afterRoles = new Map(after.roles.map((r) => [r.internalId, r]));
    const beforeChannels = new Map(before.channels.map((c) => [c.internalId, c]));
    const afterChannels = new Map(after.channels.map((c) => [c.internalId, c]));

    for (const [id, role] of afterRoles) {
      const previous = beforeRoles.get(id);
      if (!previous) changes.push(this.change("add", "role", id, "", null, role, "medium", `Role added: ${role.name}`));
      else this.diffObject(changes, "role", id, previous, role, ROLE_FIELDS, role.name);
    }
    for (const [id, role] of beforeRoles) {
      if (!afterRoles.has(id)) changes.push(this.change("delete", "role", id, "", role, null, "dangerous", `Role deleted: ${role.name}`));
    }

    for (const [id, channel] of afterChannels) {
      const previous = beforeChannels.get(id);
      if (!previous) changes.push(this.change("add", "channel", id, "", null, channel, "medium", `Channel added: ${channel.name}`));
      else this.diffObject(changes, "channel", id, previous, channel, CHANNEL_FIELDS, channel.name);
    }
    for (const [id, channel] of beforeChannels) {
      if (!afterChannels.has(id)) changes.push(this.change("delete", "channel", id, "", channel, null, "dangerous", `Channel deleted: ${channel.name}`));
    }

    for (const [key, afterValue] of Object.entries(after.guild)) {
      const beforeValue = before.guild[key as keyof typeof before.guild];
      if (!this.same(beforeValue, afterValue)) {
        changes.push(this.change("update", "guild", "guild", key, beforeValue, afterValue, "medium", `Guild ${key} changed`));
      }
    }
    return changes;
  }

  private initialChanges(snapshot: DGitSnapshot): DiffChange[] {
    return [
      ...snapshot.roles.map((role) => this.change("add", "role", role.internalId, "", null, role, "medium" as const, `Role added: ${role.name}`)),
      ...snapshot.channels.map((channel) => this.change("add", "channel", channel.internalId, "", null, channel, "medium" as const, `Channel added: ${channel.name}`))
    ];
  }

  private diffObject<T extends object>(changes: DiffChange[], objectType: "role" | "channel", id: string, before: T, after: T, fields: Array<keyof T>, label: string): void {
    for (const field of fields) {
      if (this.same(before[field], after[field])) continue;
      const path = String(field);
      const op = path === "position" ? "move" : path === "permissionOverwrites" || path === "permissions" ? "permission_update" : "update";
      changes.push(this.change(op, objectType, id, path, before[field], after[field], this.severity(objectType, id, path, before[field], after[field]), `${objectType} ${label} ${path} changed`));
    }
  }

  private severity(objectType: string, internalId: string, path: string, before: unknown, after: unknown): Severity {
    if (objectType === "role" && internalId === "role_everyone" && path === "permissions") return "dangerous";
    if (path === "permissions" && Array.isArray(before) && before.includes("Administrator") && Array.isArray(after) && !after.includes("Administrator")) return "dangerous";
    if (path === "permissionOverwrites" && (this.hasEveryoneOverwrite(before) || this.hasEveryoneOverwrite(after))) return "dangerous";
    if (path === "permissionOverwrites") return "high";
    if (path === "position" || path === "parentInternalId") return "medium";
    return "low";
  }

  private change(op: DiffChange["op"], objectType: DiffChange["objectType"], internalId: string, path: string, before: unknown, after: unknown, severity: Severity, humanSummary: string): DiffChange {
    return { op, objectType, internalId, path, before, after, severity, humanSummary };
  }

  private same(a: unknown, b: unknown): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  private hasEveryoneOverwrite(value: unknown): boolean {
    return Array.isArray(value) && value.some((overwrite) => {
      if (!overwrite || typeof overwrite !== "object") return false;
      const item = overwrite as { targetInternalId?: string };
      return item.targetInternalId === "role_everyone";
    });
  }
}
