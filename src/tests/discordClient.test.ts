import { GatewayIntentBits } from "discord.js";
import { describe, expect, it } from "vitest";
import { createDiscordClient } from "../discord/client.js";

describe("createDiscordClient", () => {
  it("requests MessageContent intent for message archive collection", () => {
    const client = createDiscordClient();

    expect(client.options.intents.has(GatewayIntentBits.MessageContent)).toBe(true);
  });
});
