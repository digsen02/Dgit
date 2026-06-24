import type { DGitManifest } from "./types/dgitTypes.js";

export class CommitGraph {
  walk(manifest: DGitManifest, start: string | null, limit = 20): string[] {
    const hashes: string[] = [];
    let cursor = start;
    while (cursor && hashes.length < limit) {
      hashes.push(cursor);
      cursor = manifest.commits[cursor]?.parent ?? null;
    }
    return hashes;
  }

  findMergeBase(manifest: DGitManifest, a: string, b: string): string | null {
    const ancestors = new Set(this.walk(manifest, a, Number.MAX_SAFE_INTEGER));
    let cursor: string | null = b;
    while (cursor) {
      if (ancestors.has(cursor)) return cursor;
      cursor = manifest.commits[cursor]?.parent ?? null;
    }
    return null;
  }
}
