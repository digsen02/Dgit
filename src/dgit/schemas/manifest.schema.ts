import { z } from "zod";

export const attachmentMetaSchema: z.ZodType = z.lazy(() =>
  z.object({
    channelId: z.string(),
    messageId: z.string(),
    filename: z.string(),
    sizeBytes: z.number().int().nonnegative(),
    sha256: z.string().startsWith("sha256:"),
    contentType: z.string().nullable().optional(),
    chunks: z.array(attachmentMetaSchema).optional()
  })
);

export const diffSummarySchema = z.object({
  added: z.number().int().nonnegative(),
  deleted: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  moved: z.number().int().nonnegative(),
  permissionUpdates: z.number().int().nonnegative(),
  dangerous: z.number().int().nonnegative()
});

export const manifestSchema = z.object({
  schemaVersion: z.literal(1),
  type: z.literal("manifest"),
  repoVersion: z.literal(1),
  guildId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  manifestSequence: z.number().int().nonnegative(),
  defaultBranch: z.string().min(1),
  currentBranch: z.string().min(1),
  head: z.string().nullable(),
  branches: z.record(z.object({
    name: z.string().min(1),
    head: z.string().nullable(),
    base: z.string().nullable().optional(),
    createdAt: z.string(),
    createdBy: z.string()
  })),
  tags: z.record(z.string()),
  commits: z.record(z.object({
    hash: z.string(),
    message: z.string(),
    authorId: z.string(),
    branch: z.string(),
    parent: z.string().nullable(),
    secondParent: z.string().nullable(),
    createdAt: z.string(),
    commitFile: attachmentMetaSchema,
    snapshotFile: attachmentMetaSchema,
    diffFile: attachmentMetaSchema,
    stateHash: z.string().startsWith("sha256:"),
    summary: diffSummarySchema
  })),
  ignore: z.object({
    channels: z.array(z.string()),
    roles: z.array(z.string()),
    types: z.array(z.string()),
    patterns: z.array(z.string())
  }),
  settings: z.object({
    gzip: z.boolean(),
    chunking: z.boolean(),
    maxAttachmentBytes: z.number().int().positive(),
    autocommit: z.boolean(),
    watch: z.boolean(),
    maintenance: z.object({
      enabled: z.boolean(),
      beforeCommit: z.string().optional()
    }).optional()
  })
});

export type ManifestSchema = z.infer<typeof manifestSchema>;
