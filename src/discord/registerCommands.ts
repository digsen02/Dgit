import { REST, Routes } from "discord.js";
import { env } from "../config/env.js";
import { commands } from "./commands/dgitCommand.js";
import { logger } from "../logger.js";

type RegisterMode = "guild" | "global" | "clear:guild" | "clear:global";

const mode = parseMode(process.argv[2] ?? env.COMMAND_SCOPE);
const rest = new REST({ version: "10" }).setToken(env.DISCORD_TOKEN);

const actions: Record<RegisterMode, () => Promise<void>> = {
  "clear:global": async () => {
    await rest.put(Routes.applicationCommands(env.DISCORD_CLIENT_ID), { body: [] });
    logger.info("Cleared global commands. Global propagation can take time.");
  },
  "clear:guild": async () => {
    const guildId = requireDevGuildId();
    await rest.put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, guildId), { body: [] });
    logger.info(`Cleared guild commands for ${guildId}.`);
  },
  global: async () => {
    await rest.put(Routes.applicationCommands(env.DISCORD_CLIENT_ID), { body: commands });
    logger.info(`Registered ${commands.length} global commands. Global command propagation can take time.`);
    if (env.COMMAND_REPLACE_SCOPE) await actions["clear:guild"]();
  },
  guild: async () => {
    const guildId = requireDevGuildId();
    await rest.put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, guildId), { body: commands });
    logger.info(`Registered ${commands.length} guild commands for ${guildId}. Guild commands usually update quickly.`);
    if (env.COMMAND_REPLACE_SCOPE) await actions["clear:global"]();
  }
};

await actions[mode]();

function parseMode(value: string): RegisterMode {
  if (value === "guild" || value === "global" || value === "clear:guild" || value === "clear:global") return value;
  throw new Error(`Invalid command registration mode "${value}". Use guild, global, clear:guild, or clear:global.`);
}

async function registerGlobal(): Promise<void> {
  await rest.put(Routes.applicationCommands(env.DISCORD_CLIENT_ID), { body: commands });
  console.log(`Registered ${commands.length} global commands. Global command propagation can take time.`);
}

async function registerGuild(): Promise<void> {
  const guildId = requireDevGuildId();
  await rest.put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, guildId), { body: commands });
  console.log(`Registered ${commands.length} guild commands for ${guildId}. Guild commands usually update quickly.`);
}

async function clearGlobal(): Promise<void> {
  await rest.put(Routes.applicationCommands(env.DISCORD_CLIENT_ID), { body: [] });
  console.log("Cleared global commands. Global propagation can take time.");
}

async function clearGuild(): Promise<void> {
  const guildId = requireDevGuildId();
  await rest.put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, guildId), { body: [] });
  console.log(`Cleared guild commands for ${guildId}.`);
}

function requireDevGuildId(): string {
  if (!env.DEV_GUILD_ID) throw new Error("DEV_GUILD_ID is required for guild command registration or clearing.");
  return env.DEV_GUILD_ID;
}
