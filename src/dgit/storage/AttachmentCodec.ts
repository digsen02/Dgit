import { gunzipJson, gzipJson } from "../../utils/gzip.js";
import { sha256Buffer, stableStringify } from "../../utils/hash.js";

export interface EncodedAttachment {
  filename: string;
  data: Buffer;
  sha256: string;
  sizeBytes: number;
}

export class AttachmentCodec {
  async encodeJson(value: unknown, filename: string): Promise<EncodedAttachment> {
    const json = Buffer.from(stableStringify(value), "utf8");
    const data = await gzipJson(json);
    return {
      filename,
      data,
      sha256: sha256Buffer(data),
      sizeBytes: data.byteLength
    };
  }

  async decodeJson<T>(data: Buffer, expectedSha256?: string): Promise<T> {
    const actual = sha256Buffer(data);
    if (expectedSha256 && actual !== expectedSha256) {
      throw new Error(`Attachment hash mismatch: expected ${expectedSha256}, got ${actual}`);
    }
    const json = await gunzipJson(data);
    return JSON.parse(json.toString("utf8")) as T;
  }

  split(encoded: EncodedAttachment, maxBytes: number): EncodedAttachment[] {
    if (encoded.data.byteLength <= maxBytes) return [encoded];
    const chunks: EncodedAttachment[] = [];
    let offset = 0;
    let part = 1;
    while (offset < encoded.data.byteLength) {
      const data = encoded.data.subarray(offset, offset + maxBytes);
      chunks.push({
        filename: encoded.filename.replace(".json.gz", `.part${part}.json.gz`),
        data,
        sha256: sha256Buffer(data),
        sizeBytes: data.byteLength
      });
      offset += maxBytes;
      part += 1;
    }
    return chunks;
  }

  join(chunks: Buffer[]): Buffer {
    return Buffer.concat(chunks);
  }
}
