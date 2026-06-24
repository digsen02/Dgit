import { createHash } from "node:crypto";

export function slugify(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "unnamed";
}

export function internalId(prefix: string, name: string, discordId: string): string {
  const hash = createHash("sha256").update(`${prefix}:${name}:${discordId}`).digest("hex").slice(0, 8);
  return `${prefix}_${slugify(name)}_${hash}`;
}

export function uniqueId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
