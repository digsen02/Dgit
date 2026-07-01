import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  DEV_GUILD_ID: z.string().optional(),
  NODE_ENV: z.string().default("development"),
  COMMAND_SCOPE: z.enum(["guild", "global"]).default("guild"),
  COMMAND_REPLACE_SCOPE: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  ENABLE_MESSAGE_CONTENT_INTENT: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  BOT_LOCALE: z.enum(["ko", "en", "zh"]).default("ko")
});

export const env = envSchema.parse(process.env);
