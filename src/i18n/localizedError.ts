import type { MessageKey } from "./messages.js";

export class LocalizedError extends Error {
  constructor(public readonly key: MessageKey, public readonly vars: Record<string, string | number> = {}) {
    super(key);
  }
}
