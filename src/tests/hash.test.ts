import { describe, expect, it } from "vitest";
import { AttachmentCodec } from "../dgit/storage/AttachmentCodec.js";
import { sha256Json, stableStringify } from "../utils/hash.js";

describe("hash and codec", () => {
  it("stable stringifies object keys", () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }));
  });

  it("hashes stable JSON", () => {
    expect(sha256Json({ b: 1, a: 2 })).toBe(sha256Json({ a: 2, b: 1 }));
  });

  it("gzip/gunzip roundtrips", async () => {
    const codec = new AttachmentCodec();
    const encoded = await codec.encodeJson({ ok: true }, "x.json.gz");
    await expect(codec.decodeJson(encoded.data, encoded.sha256)).resolves.toEqual({ ok: true });
  });

  it("splits and joins chunks", async () => {
    const codec = new AttachmentCodec();
    const encoded = await codec.encodeJson({ text: "x".repeat(1000) }, "x.json.gz");
    const chunks = codec.split(encoded, 10);
    expect(codec.join(chunks.map((chunk) => chunk.data)).equals(encoded.data)).toBe(true);
  });
});
