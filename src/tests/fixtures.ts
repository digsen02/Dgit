import type { DGitSnapshot } from "../dgit/types/dgitTypes.js";

export function snapshot(overrides: Partial<DGitSnapshot> = {}): DGitSnapshot {
  return {
    schemaVersion: 1,
    type: "snapshot",
    createdAt: "2026-01-01T00:00:00.000Z",
    guildId: "guild1",
    stateHash: "sha256:test",
    guild: {
      id: "guild1",
      name: "Guild",
      description: null,
      verificationLevel: 0,
      defaultMessageNotifications: 0,
      explicitContentFilter: 0,
      afkChannelInternalId: null,
      afkTimeout: 300,
      systemChannelInternalId: null,
      rulesChannelInternalId: null,
      publicUpdatesChannelInternalId: null
    },
    roles: [
      { internalId: "role_everyone", discordId: "guild1", name: "@everyone", color: 0, hoist: false, icon: null, unicodeEmoji: null, position: 0, permissions: ["ViewChannel"], managed: false, mentionable: false },
      { internalId: "role_mod", discordId: "r1", name: "mod", color: 0, hoist: false, icon: null, unicodeEmoji: null, position: 1, permissions: ["ViewChannel"], managed: false, mentionable: true }
    ],
    channels: [
      { internalId: "channel_general", discordId: "c1", type: 0, name: "general", parentInternalId: null, position: 0, topic: null, nsfw: false, rateLimitPerUser: 0, bitrate: null, userLimit: null, permissionOverwrites: [], defaultAutoArchiveDuration: null, availableTags: [], defaultReactionEmoji: null, defaultSortOrder: null, defaultForumLayout: null }
    ],
    ...overrides
  };
}
