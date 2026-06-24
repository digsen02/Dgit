import { describe, expect, it } from "vitest";
import { MaintenanceService } from "../dgit/MaintenanceService.js";
import { snapshot } from "./fixtures.js";

describe("MaintenanceService", () => {
  it("denies @everyone SendMessages on text channels", () => {
    const service = new MaintenanceService();
    const planned = service.snapshotOn(snapshot());
    const general = planned.channels.find((channel) => channel.internalId === "channel_general");

    expect(general?.permissionOverwrites).toContainEqual({
      targetInternalId: "role_everyone",
      targetDiscordId: "guild1",
      targetType: "role",
      allow: [],
      deny: ["SendMessages"]
    });
  });

  it("preserves non-text channels", () => {
    const service = new MaintenanceService();
    const planned = service.snapshotOn(snapshot({
      channels: [
        {
          internalId: "voice_lobby",
          discordId: "v1",
          type: 2,
          name: "Lobby",
          parentInternalId: null,
          position: 0,
          topic: null,
          nsfw: false,
          rateLimitPerUser: null,
          bitrate: 64000,
          userLimit: 0,
          permissionOverwrites: [],
          defaultAutoArchiveDuration: null,
          availableTags: [],
          defaultReactionEmoji: null,
          defaultSortOrder: null,
          defaultForumLayout: null
        }
      ]
    }));

    expect(planned.channels[0]?.permissionOverwrites).toEqual([]);
  });
});
