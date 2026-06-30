import { z } from "zod";
import { attachmentMetaSchema } from "./manifest.schema.js";

export const messageRestoreModeSchema = z.enum(["structureOnly", "archiveOnly", "renderAsAppMessages"]);

export const messageSnapshotSchema = z.object({
  internalId: z.string(),
  discordId: z.string(),
  channelInternalId: z.string(),
  attachments: z.array(attachmentMetaSchema),
  createdAt: z.string(),
  threadInternalId: z.string().nullable().optional(),
  authorDiscordId: z.string().nullable().optional(),
  authorDisplayName: z.string().nullable().optional(),
  content: z.string().nullable().optional(),
  embeds: z.array(z.unknown()).optional(),
  replyToMessageInternalId: z.string().nullable().optional(),
  pinned: z.boolean().optional(),
  editedAt: z.string().nullable().optional()
});

export const messageArchiveSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  byChannel: z.record(z.number().int().nonnegative()),
  withAttachments: z.number().int().nonnegative(),
  withEmbeds: z.number().int().nonnegative().optional(),
  unavailableContent: z.number().int().nonnegative().optional()
});

export const messageArchiveSchema = z.object({
  schemaVersion: z.literal(1),
  type: z.literal("messageArchive"),
  createdAt: z.string(),
  guildId: z.string(),
  commitHash: z.string().startsWith("sha256:"),
  snapshotHash: z.string().startsWith("sha256:"),
  stateHash: z.string().startsWith("sha256:"),
  messages: z.array(messageSnapshotSchema),
  summary: messageArchiveSummarySchema
}).superRefine((archive, ctx) => {
  if (archive.summary.total !== archive.messages.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["summary", "total"],
      message: "Message archive summary total must match messages length."
    });
  }
});
