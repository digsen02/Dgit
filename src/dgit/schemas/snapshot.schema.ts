import { z } from "zod";

export const permissionOverwriteSchema = z.object({
  targetInternalId: z.string(),
  targetDiscordId: z.string(),
  targetType: z.enum(["role", "user"]),
  allow: z.array(z.string()),
  deny: z.array(z.string())
});

export const roleSnapshotSchema = z.object({
  internalId: z.string(),
  discordId: z.string(),
  name: z.string(),
  color: z.number(),
  hoist: z.boolean(),
  icon: z.string().nullable(),
  unicodeEmoji: z.string().nullable(),
  position: z.number(),
  permissions: z.array(z.string()),
  managed: z.boolean(),
  mentionable: z.boolean()
});

export const channelSnapshotSchema = z.object({
  internalId: z.string(),
  discordId: z.string(),
  type: z.number(),
  name: z.string(),
  parentInternalId: z.string().nullable(),
  position: z.number(),
  topic: z.string().nullable(),
  nsfw: z.boolean(),
  rateLimitPerUser: z.number().nullable(),
  bitrate: z.number().nullable(),
  userLimit: z.number().nullable(),
  permissionOverwrites: z.array(permissionOverwriteSchema),
  defaultAutoArchiveDuration: z.number().nullable(),
  availableTags: z.array(z.unknown()),
  defaultReactionEmoji: z.unknown().nullable(),
  defaultSortOrder: z.number().nullable(),
  defaultForumLayout: z.number().nullable()
});

export const snapshotSchema = z.object({
  schemaVersion: z.literal(1),
  type: z.literal("snapshot"),
  createdAt: z.string(),
  guildId: z.string(),
  stateHash: z.string().startsWith("sha256:"),
  guild: z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    verificationLevel: z.number(),
    defaultMessageNotifications: z.number(),
    explicitContentFilter: z.number(),
    afkChannelInternalId: z.string().nullable(),
    afkTimeout: z.number(),
    systemChannelInternalId: z.string().nullable(),
    rulesChannelInternalId: z.string().nullable(),
    publicUpdatesChannelInternalId: z.string().nullable()
  }),
  roles: z.array(roleSnapshotSchema),
  channels: z.array(channelSnapshotSchema)
});
