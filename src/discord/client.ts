import { Client, GatewayIntentBits, Partials } from "discord.js";
import { env } from "../config/env.js";

export function createDiscordClient(options: { messageContentIntent?: boolean } = {}): Client {
  const intents = [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildModeration
  ];
  if (options.messageContentIntent ?? env.ENABLE_MESSAGE_CONTENT_INTENT) {
    intents.push(GatewayIntentBits.MessageContent);
  }
  return new Client({
    intents,
    partials: [Partials.Channel, Partials.Message]
  });
}
