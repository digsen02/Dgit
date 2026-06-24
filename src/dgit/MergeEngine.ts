import type { DGitSnapshot, MergeConflict, MergeResult } from "./types/dgitTypes.js";
import { uniqueId } from "../utils/ids.js";

export class MergeEngine {
  merge(base: DGitSnapshot, source: DGitSnapshot, target: DGitSnapshot): MergeResult {
    const merged: DGitSnapshot = structuredClone(target);
    const conflicts: MergeConflict[] = [];
    this.mergeCollection("role", base.roles, source.roles, merged.roles, conflicts);
    this.mergeCollection("channel", base.channels, source.channels, merged.channels, conflicts);
    return conflicts.length > 0 ? { conflicts } : { snapshot: merged, conflicts };
  }

  private mergeCollection<T extends { internalId: string }>(
    objectType: "role" | "channel",
    baseItems: T[],
    sourceItems: T[],
    targetItems: T[],
    conflicts: MergeConflict[]
  ): void {
    const base = new Map(baseItems.map((item) => [item.internalId, item]));
    const source = new Map(sourceItems.map((item) => [item.internalId, item]));
    const target = new Map(targetItems.map((item) => [item.internalId, item]));
    for (const [id, sourceItem] of source) {
      const baseItem = base.get(id);
      const targetItem = target.get(id);
      if (!baseItem && !targetItem) {
        targetItems.push(structuredClone(sourceItem));
        continue;
      }
      if (baseItem && !targetItem && JSON.stringify(baseItem) !== JSON.stringify(sourceItem)) {
        conflicts.push(this.conflict(objectType, id, "", baseItem, sourceItem, null, "Deleted in target but modified in source"));
        continue;
      }
      if (!baseItem || !targetItem) continue;
      for (const key of Object.keys(sourceItem) as Array<keyof T>) {
        const b = baseItem[key];
        const s = sourceItem[key];
        const t = targetItem[key];
        const sourceChanged = JSON.stringify(b) !== JSON.stringify(s);
        const targetChanged = JSON.stringify(b) !== JSON.stringify(t);
        if (sourceChanged && !targetChanged) targetItem[key] = structuredClone(s) as T[keyof T];
        if (sourceChanged && targetChanged && JSON.stringify(s) !== JSON.stringify(t)) {
          conflicts.push(this.conflict(objectType, id, String(key), b, s, t, "Same field changed differently"));
        }
      }
    }
  }

  private conflict(objectType: "role" | "channel", internalId: string, path: string, base: unknown, source: unknown, target: unknown, reason: string): MergeConflict {
    return { id: uniqueId("conflict"), objectType, internalId, path, base, source, target, reason };
  }
}
