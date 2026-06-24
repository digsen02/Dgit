import type { MergeConflict } from "./types/dgitTypes.js";

export class ConflictEngine {
  choose(conflicts: MergeConflict[], use: "source" | "target"): MergeConflict[] {
    return conflicts.map((conflict) => ({ ...conflict, target: use === "source" ? conflict.source : conflict.target }));
  }
}
