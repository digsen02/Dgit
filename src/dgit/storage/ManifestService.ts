import { manifestSchema } from "../schemas/manifest.schema.js";
import type { DGitManifest, ManifestCommitEntry } from "../types/dgitTypes.js";
import { nowIso } from "../../utils/time.js";

export class ManifestService {
  createInitial(guildId: string, authorId: string): DGitManifest {
    const now = nowIso();
    return {
      schemaVersion: 1,
      type: "manifest",
      repoVersion: 1,
      guildId,
      createdAt: now,
      updatedAt: now,
      manifestSequence: 1,
      defaultBranch: "main",
      currentBranch: "main",
      head: null,
      branches: {
        main: { name: "main", head: null, createdAt: now, createdBy: authorId }
      },
      tags: {},
      commits: {},
      ignore: { channels: [], roles: [], types: ["messages"], patterns: [] },
      settings: { gzip: true, chunking: true, maxAttachmentBytes: 9_000_000, autocommit: false, watch: false }
    };
  }

  validate(input: unknown): DGitManifest {
    const parsed = manifestSchema.parse(input);
    for (const [branchName, branch] of Object.entries(parsed.branches)) {
      if (branch.head && !parsed.commits[branch.head]) throw new Error(`Branch ${branchName} points to missing commit ${branch.head}`);
    }
    for (const [tag, hash] of Object.entries(parsed.tags)) {
      if (!parsed.commits[hash]) throw new Error(`Tag ${tag} points to missing commit ${hash}`);
    }
    return parsed as DGitManifest;
  }

  addCommit(manifest: DGitManifest, entry: ManifestCommitEntry): DGitManifest {
    const branch = manifest.branches[entry.branch];
    if (!branch) throw new Error(`Unknown branch ${entry.branch}`);
    const updated: DGitManifest = structuredClone(manifest);
    updated.commits[entry.hash] = entry;
    updated.branches[entry.branch] = { ...branch, head: entry.hash };
    updated.currentBranch = entry.branch;
    updated.head = entry.hash;
    updated.updatedAt = nowIso();
    updated.manifestSequence += 1;
    return this.validate(updated);
  }

  updateBranchHead(manifest: DGitManifest, branchName: string, head: string | null): DGitManifest {
    if (head && !manifest.commits[head]) throw new Error(`Cannot point branch to missing commit ${head}`);
    const branch = manifest.branches[branchName];
    if (!branch) throw new Error(`Unknown branch ${branchName}`);
    const updated: DGitManifest = structuredClone(manifest);
    updated.branches[branchName] = { ...branch, head };
    if (updated.currentBranch === branchName) updated.head = head;
    updated.updatedAt = nowIso();
    updated.manifestSequence += 1;
    return this.validate(updated);
  }
}
