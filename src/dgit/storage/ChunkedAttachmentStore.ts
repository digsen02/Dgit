import { AttachmentBuilder, Message, TextChannel } from "discord.js";
import type { AttachmentMeta } from "../types/dgitTypes.js";
import { AttachmentCodec, type EncodedAttachment } from "./AttachmentCodec.js";

export class ChunkedAttachmentStore {
  constructor(private readonly codec = new AttachmentCodec()) {}

  async uploadJson(channel: TextChannel, label: string | ((encoded: EncodedAttachment) => string), filename: string, value: unknown, maxBytes: number): Promise<AttachmentMeta> {
    const encoded = await this.codec.encodeJson(value, filename);
    const chunks = this.codec.split(encoded, maxBytes);
    const files = chunks.map((chunk) => new AttachmentBuilder(chunk.data, { name: chunk.filename }));
    const content = typeof label === "function" ? label(encoded) : label;
    const message = await channel.send({ content, files });
    if (chunks.length === 1) return this.metaFrom(message, chunks[0]!, encoded.sha256);
    const chunkMetas = chunks.map((chunk) => this.metaFrom(message, chunk, chunk.sha256));
    return {
      channelId: channel.id,
      messageId: message.id,
      filename,
      sizeBytes: encoded.sizeBytes,
      sha256: encoded.sha256,
      contentType: "application/gzip",
      chunks: chunkMetas
    };
  }

  async uploadJsonMany(channel: TextChannel, label: string, values: Array<{ filename: string; value: unknown }>, maxBytes: number): Promise<AttachmentMeta[]> {
    const metas: Array<{ original: EncodedAttachment; chunks: EncodedAttachment[] }> = [];
    for (const item of values) {
      const original = await this.codec.encodeJson(item.value, item.filename);
      metas.push({ original, chunks: this.codec.split(original, maxBytes) });
    }
    const files = metas.flatMap((meta) => meta.chunks.map((chunk) => new AttachmentBuilder(chunk.data, { name: chunk.filename })));
    const message = await channel.send({ content: label, files });
    return metas.map(({ original, chunks }) => {
      if (chunks.length === 1) return this.metaFrom(message, chunks[0]!, original.sha256);
      return {
        channelId: channel.id,
        messageId: message.id,
        filename: original.filename,
        sizeBytes: original.sizeBytes,
        sha256: original.sha256,
        contentType: "application/gzip",
        chunks: chunks.map((chunk) => this.metaFrom(message, chunk, chunk.sha256))
      };
    });
  }

  async readJson<T>(message: Message, meta: AttachmentMeta): Promise<T> {
    const buffers: Buffer[] = [];
    const metas = meta.chunks ?? [meta];
    for (const part of metas) {
      const attachment = message.attachments.find((a) => a.name === part.filename);
      if (!attachment) throw new Error(`Missing attachment ${part.filename} on message ${message.id}`);
      const response = await fetch(attachment.url);
      if (!response.ok) throw new Error(`Failed to download ${part.filename}: ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      buffers.push(buffer);
    }
    return this.codec.decodeJson<T>(this.codec.join(buffers), meta.sha256);
  }

  private metaFrom(message: Message, encoded: EncodedAttachment, sha256: string): AttachmentMeta {
    return {
      channelId: message.channelId,
      messageId: message.id,
      filename: encoded.filename,
      sizeBytes: encoded.sizeBytes,
      sha256,
      contentType: "application/gzip"
    };
  }
}
