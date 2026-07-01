import { GatewayIntentBits } from "discord.js";
import { describe, expect, it } from "vitest";
import { createDiscordClient } from "../discord/client.js";

describe("createDiscordClient", () => {
  it("does not request MessageContent intent by default", () => {
    const client = createDiscordClient();

    expect(client.options.intents.has(GatewayIntentBits.MessageContent)).toBe(false);
  });

  it("requests MessageContent intent when explicitly enabled", () => {
    const client = createDiscordClient({ messageContentIntent: true });

    expect(client.options.intents.has(GatewayIntentBits.MessageContent)).toBe(true);
  });
});
