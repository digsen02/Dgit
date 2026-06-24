import pino from "pino";

export const logger = pino({
  name: "dgit",
  level: process.env.NODE_ENV === "production" ? "info" : "debug"
});
