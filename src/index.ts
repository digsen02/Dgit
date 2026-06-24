import { env } from "./config/env.js";
import { createDiscordClient } from "./discord/client.js";
import { InteractionRouter } from "./discord/interactions/interactionRouter.js";
import { AutoCommitWatcher } from "./dgit/AutoCommitWatcher.js";
import { logger } from "./logger.js";

const client = createDiscordClient();
const router = new InteractionRouter();
const watcher = new AutoCommitWatcher();
watcher.register(client);

client.once("clientReady", (readyClient) => {
  logger.info({ user: readyClient.user.tag }, "DGit ready");
});

client.on("interactionCreate", async (interaction) => {
  try {
    await router.route(interaction);
  } catch (error) {
    logger.error({ error }, "Unhandled interaction error");
  }
});

await client.login(env.DISCORD_TOKEN);
