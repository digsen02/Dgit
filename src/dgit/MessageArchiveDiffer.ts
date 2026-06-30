import type { DGitMessageArchive, DiffChange, DiffSummary, MessageSnapshot } from "./types/dgitTypes.js";
import { sha256Buffer, stableStringify } from "../utils/hash.js";
import { summarizeChanges } from "../utils/text.js";

export interface MessageArchiveDiffResult {
  changes: DiffChange[];
  summary: DiffSummary & {
    channelsAffected: number;
    attachmentsAffected: number;
  };
}

export function diffMessageArchives(before: DGitMessageArchive | null, after: DGitMessageArchive | null): MessageArchiveDiffResult {
  const beforeMessages = new Map((before?.messages ?? []).map((message) => [message.internalId, message]));
  const afterMessages = new Map((after?.messages ?? []).map((message) => [message.internalId, message]));
  const changes: DiffChange[] = [];

  for (const [id, afterMessage] of afterMessages) {
    const beforeMessage = beforeMessages.get(id);
    if (!beforeMessage) {
      changes.push(change("add", id, null, compactMessage(afterMessage), afterMessage.channelInternalId, "Message added to archive"));
    } else if (messageChanged(beforeMessage, afterMessage)) {
      changes.push(change("update", id, compactMessage(beforeMessage), compactMessage(afterMessage), afterMessage.channelInternalId, "Message updated in archive"));
    }
  }

  for (const [id, beforeMessage] of beforeMessages) {
    if (!afterMessages.has(id)) {
      changes.push(change("delete", id, compactMessage(beforeMessage), null, beforeMessage.channelInternalId, "Message deleted from archive"));
    }
  }

  const summary = summarizeChanges(changes);
  return {
    changes,
    summary: {
      ...summary,
      channelsAffected: new Set(changes.map((item) => channelFromChange(item)).filter((channel): channel is string => Boolean(channel))).size,
      attachmentsAffected: changes.reduce((total, item) => total + attachmentsFromChange(item), 0)
    }
  };
}

function messageChanged(before: MessageSnapshot, after: MessageSnapshot): boolean {
  return before.content !== after.content ||
    stableStringify(before.attachments) !== stableStringify(after.attachments) ||
    stableStringify(before.embeds ?? []) !== stableStringify(after.embeds ?? []) ||
    before.pinned !== after.pinned ||
    before.editedAt !== after.editedAt;
}

function change(op: DiffChange["op"], internalId: string, before: unknown, after: unknown, channelInternalId: string, humanSummary: string): DiffChange {
  return {
    op,
    objectType: "message",
    internalId,
    path: channelInternalId,
    before,
    after,
    severity: "low",
    humanSummary: `${humanSummary}: ${internalId}`
  };
}

function compactMessage(message: MessageSnapshot): Record<string, unknown> {
  return {
    internalId: message.internalId,
    discordId: message.discordId,
    channelInternalId: message.channelInternalId,
    createdAt: message.createdAt,
    contentAvailable: message.content !== null && message.content !== undefined,
    contentSha256: message.content === null || message.content === undefined ? null : sha256Buffer(Buffer.from(message.content, "utf8")),
    attachmentCount: message.attachments.length,
    attachmentSha256: message.attachments.map((attachment) => attachment.sha256).sort(),
    embedCount: message.embeds?.length ?? 0,
    pinned: message.pinned ?? false,
    editedAt: message.editedAt ?? null
  };
}

function channelFromChange(change: DiffChange): string | null {
  const candidate = (change.after ?? change.before) as { channelInternalId?: unknown } | null;
  return typeof candidate?.channelInternalId === "string" ? candidate.channelInternalId : null;
}

function attachmentsFromChange(change: DiffChange): number {
  const before = change.before as { attachmentCount?: unknown } | null;
  const after = change.after as { attachmentCount?: unknown } | null;
  const beforeCount = typeof before?.attachmentCount === "number" ? before.attachmentCount : 0;
  const afterCount = typeof after?.attachmentCount === "number" ? after.attachmentCount : 0;
  return Math.max(beforeCount, afterCount);
}
