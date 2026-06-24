import { z } from "zod";

export const conflictSchema = z.object({
  schemaVersion: z.literal(1),
  type: z.literal("conflict"),
  createdAt: z.string(),
  guildId: z.string(),
  mergeId: z.string(),
  sourceBranch: z.string(),
  targetBranch: z.string(),
  conflicts: z.array(z.object({
    id: z.string(),
    objectType: z.string(),
    internalId: z.string(),
    path: z.string(),
    base: z.unknown(),
    source: z.unknown(),
    target: z.unknown(),
    reason: z.string()
  }))
});
