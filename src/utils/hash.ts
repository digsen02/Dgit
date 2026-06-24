import { createHash } from "node:crypto";

export function sortStable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortStable);
  if (value && typeof value === "object") {
    const input = value as Record<string, unknown>;
    return Object.keys(input).sort().reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = sortStable(input[key]);
      return acc;
    }, {});
  }
  return value;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortStable(value));
}

export function sha256Buffer(buffer: Buffer): string {
  return `sha256:${createHash("sha256").update(buffer).digest("hex")}`;
}

export function sha256Json(value: unknown): string {
  return sha256Buffer(Buffer.from(stableStringify(value), "utf8"));
}

export function shortHash(hash: string, length = 12): string {
  return hash.replace(/^sha256:/, "").slice(0, length);
}
