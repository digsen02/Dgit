import type { DiffChange, DiffSummary } from "../dgit/types/dgitTypes.js";
import { shortHash } from "./hash.js";

export function summarizeChanges(changes: DiffChange[]): DiffSummary {
  return {
    added: changes.filter((c) => c.op === "add").length,
    deleted: changes.filter((c) => c.op === "delete").length,
    updated: changes.filter((c) => c.op === "update").length,
    moved: changes.filter((c) => c.op === "move").length,
    permissionUpdates: changes.filter((c) => c.op === "permission_update").length,
    dangerous: changes.filter((c) => c.severity === "dangerous").length
  };
}

export function formatSummary(summary: DiffSummary): string {
  return `+${summary.added} ~${summary.updated} -${summary.deleted} moves:${summary.moved} perms:${summary.permissionUpdates} dangerous:${summary.dangerous}`;
}

export function formatHash(hash: string | null): string {
  return hash ? shortHash(hash) : "none";
}

export function truncateDiscord(input: string, max = 3900): string {
  return input.length <= max ? input : `${input.slice(0, max - 20)}\n...truncated`;
}
