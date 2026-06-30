import { z } from "zod";

export const commitSchema = z.object({
  schemaVersion: z.literal(1),
  type: z.literal("commit"),
  hash: z.string(),
  guildId: z.string(),
  branch: z.string(),
  message: z.string().min(1),
  authorId: z.string(),
  parent: z.string().nullable(),
  secondParent: z.string().nullable(),
  snapshotHash: z.string().startsWith("sha256:"),
  diffHash: z.string().startsWith("sha256:"),
  messageArchiveHash: z.string().startsWith("sha256:").nullable().optional(),
  stateHash: z.string().startsWith("sha256:"),
  createdAt: z.string()
});
