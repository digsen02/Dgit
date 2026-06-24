import { z } from "zod";
import { diffSummarySchema } from "./manifest.schema.js";

export const diffChangeSchema = z.object({
  op: z.enum(["add", "delete", "update", "move", "permission_update"]),
  objectType: z.enum(["guild", "role", "channel", "permissionOverwrite", "message", "memberRole"]),
  internalId: z.string(),
  path: z.string(),
  before: z.unknown(),
  after: z.unknown(),
  severity: z.enum(["low", "medium", "high", "dangerous"]),
  humanSummary: z.string()
});

export const diffSchema = z.object({
  schemaVersion: z.literal(1),
  type: z.literal("diff"),
  createdAt: z.string(),
  guildId: z.string(),
  from: z.string().nullable(),
  to: z.string().nullable(),
  changes: z.array(diffChangeSchema),
  summary: diffSummarySchema
});
