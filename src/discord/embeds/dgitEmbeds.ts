import { EmbedBuilder } from "discord.js";
import type {
  ApplyPlan,
  ApplyResult,
  DGitBranch,
  DGitDiff,
  DiffSummary,
  IgnoreRules,
  ManifestCommitEntry,
  MergeConflict
} from "../../dgit/types/dgitTypes.js";
import { shortHash } from "../../utils/hash.js";
import { formatSummary } from "../../utils/text.js";

const COLORS = {
  info: 0x5865f2,
  success: 0x2ecc71,
  warning: 0xf1c40f,
  danger: 0xe74c3c,
  neutral: 0x95a5a6
} as const;

const FIELD_LIMIT = 1024;
const DESCRIPTION_LIMIT = 4096;
const TITLE_LIMIT = 256;
const FIELD_COUNT_LIMIT = 25;
const EMBED_TOTAL_LIMIT = 6000;
const EMBED_SAFE_LIMIT = 5600;

function titleValue(input: string): string {
  return fieldValue(input, TITLE_LIMIT);
}

export function fieldValue(input: string, max = FIELD_LIMIT): string {
  const value = input.trim() || "-";
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 14))}\n...truncated`;
}

export function descriptionValue(input: string, max = DESCRIPTION_LIMIT): string {
  const value = input.trim() || "-";
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 14))}\n...truncated`;
}

export function toDiscordRelativeTime(iso: string): string {
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) return iso;
  return `<t:${Math.floor(timestamp / 1000)}:R>`;
}

export function summaryLine(summary: DiffSummary): string {
  return formatSummary(summary);
}

type SimpleResultOptions = {
  title: string;
  description?: string;
  status?: "info" | "success" | "warning" | "danger" | "neutral";
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
};

export function buildSimpleResultEmbed(options: SimpleResultOptions): EmbedBuilder {
  const title = titleValue(options.title);
  const description = options.description ? descriptionValue(options.description) : undefined;
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(COLORS[options.status ?? "success"]);
  if (description) embed.setDescription(description);
  if (options.fields?.length) {
    const fields = [];
    let used = title.length + (description?.length ?? 0);
    for (const field of options.fields.slice(0, FIELD_COUNT_LIMIT)) {
      const embedField = {
        name: fieldValue(field.name, 256),
        value: fieldValue(field.value)
      };
      const fieldSize = embedField.name.length + embedField.value.length;
      if (used + fieldSize > EMBED_SAFE_LIMIT && fields.length > 0) break;
      used += fieldSize;
      fields.push(field.inline === undefined ? embedField : { ...embedField, inline: field.inline });
      if (used >= EMBED_TOTAL_LIMIT) break;
    }
    if (fields.length) embed.addFields(...fields);
  }
  return embed;
}

type LinesEmbedOptions = {
  title: string;
  lines: string[];
  emptyText: string;
  description?: string;
  status?: "info" | "success" | "warning" | "danger" | "neutral";
  fieldName?: string;
};

export function buildPagedTextEmbed(options: {
  title: string;
  page: string;
  pageNumber: number;
  pageCount: number;
  status?: "info" | "success" | "warning" | "danger" | "neutral";
}): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(titleValue(options.title))
    .setColor(COLORS[options.status ?? "info"])
    .setDescription(descriptionValue(`Page ${options.pageNumber}/${options.pageCount}\n\n${options.page}`));
}

export function buildLinesEmbed(options: LinesEmbedOptions): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(titleValue(options.title))
    .setColor(COLORS[options.status ?? "info"]);
  if (options.description) embed.setDescription(descriptionValue(options.description));
  const lines = options.lines.length ? options.lines : [options.emptyText];
  const chunks: string[] = [];
  let current = "";
  let used = options.title.length + (options.description?.length ?? 0);
  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length > FIELD_LIMIT && current) {
      chunks.push(current);
      used += current.length;
      if (used >= EMBED_SAFE_LIMIT || chunks.length >= FIELD_COUNT_LIMIT - 1) break;
      current = line;
    } else {
      current = next;
    }
  }
  if (current && chunks.length < FIELD_COUNT_LIMIT && used + current.length < EMBED_SAFE_LIMIT) chunks.push(current);
  embed.addFields(...chunks.map((chunk, index) => ({
    name: chunks.length === 1 ? options.fieldName ?? "Details" : `${options.fieldName ?? "Details"} ${index + 1}`,
    value: fieldValue(chunk)
  })));
  return embed;
}

export function buildLogEmbed(entries: ManifestCommitEntry[], branch: string | undefined, noCommitsText: string): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(titleValue("DGit Commit Log"))
    .setColor(COLORS.info)
    .setDescription(descriptionValue(`Branch: ${branch ?? "current"}\nCommits: ${entries.length}`));

  if (entries.length === 0) {
    embed.addFields({ name: "Commits", value: noCommitsText });
    return embed;
  }

  embed.addFields(...entries.slice(0, FIELD_COUNT_LIMIT).map((entry) => ({
    name: fieldValue(`${shortHash(entry.hash)} - ${entry.message}`, 256),
    value: fieldValue([
      `Author: <@${entry.authorId}>`,
      `Branch: ${entry.branch}`,
      `Time: ${toDiscordRelativeTime(entry.createdAt)}`,
      `Summary: ${summaryLine(entry.summary)}`
    ].join("\n"))
  })));

  return embed;
}

export function buildStatusEmbed(options: {
  title: string;
  branchLabel: string;
  headLabel: string;
  workingTreeLabel: string;
  changesLabel: string;
  branch: string;
  head: string | null;
  clean: boolean;
  cleanText: string;
  dirtyText: string;
  noneText: string;
  summary: string;
}): EmbedBuilder {
  return buildSimpleResultEmbed({
    title: options.title,
    status: options.clean ? "success" : "warning",
    fields: [
      { name: options.branchLabel, value: options.branch, inline: true },
      { name: options.headLabel, value: options.head ? shortHash(options.head) : options.noneText, inline: true },
      { name: options.workingTreeLabel, value: options.clean ? options.cleanText : options.dirtyText, inline: true },
      { name: options.changesLabel, value: options.summary, inline: false }
    ]
  });
}

export function buildDiffEmbed(options: {
  title: string;
  diff: DGitDiff;
  noChangesText: string;
}): EmbedBuilder {
  const lines = options.diff.changes.slice(0, 20).map((change) => `${change.severity === "dangerous" ? "!" : change.op} ${change.humanSummary}`);
  return buildSimpleResultEmbed({
    title: options.title,
    status: options.diff.summary.dangerous > 0 ? "danger" : options.diff.changes.length > 0 ? "warning" : "success",
    fields: [
      { name: "Summary", value: summaryLine(options.diff.summary), inline: false },
      { name: "Details", value: lines.join("\n") || options.noChangesText, inline: false }
    ]
  });
}

export function buildRestorePreviewEmbed(options: {
  title: string;
  plan: ApplyPlan;
  dangerousLabel: string;
  stepsLabel: string;
  warningsLabel: string;
  noneText: string;
  noChangesText: string;
  branch?: string;
}): EmbedBuilder {
  const lines = options.plan.steps.slice(0, 20).map((step) => `${step.dangerous ? "!" : "-"} ${step.description}`);
  const fields = [
    ...(options.branch ? [{ name: "Branch", value: options.branch, inline: true }] : []),
    { name: options.dangerousLabel, value: String(options.plan.dangerousCount), inline: true },
    { name: options.stepsLabel, value: String(options.plan.steps.length), inline: true },
    { name: options.warningsLabel, value: options.plan.warnings.join("\n") || options.noneText, inline: false },
    { name: "Planned steps", value: lines.join("\n") || options.noChangesText, inline: false }
  ];
  return buildSimpleResultEmbed({
    title: options.title,
    status: options.plan.dangerousCount > 0 ? "danger" : "warning",
    fields
  });
}

export function buildApplyResultEmbed(options: {
  title: string;
  description?: string;
  result: ApplyResult;
  failedDetails?: string[];
  skippedDetails?: string[];
}): EmbedBuilder {
  const details = [...(options.skippedDetails ?? []), ...(options.failedDetails ?? [])];
  return buildSimpleResultEmbed({
    title: options.title,
    ...(options.description ? { description: options.description } : {}),
    status: options.result.failed.length > 0 ? "danger" : options.result.skipped.length > 0 ? "warning" : "success",
    fields: [
      { name: "Success", value: String(options.result.success.length), inline: true },
      { name: "Skipped", value: String(options.result.skipped.length), inline: true },
      { name: "Failed", value: String(options.result.failed.length), inline: true },
      ...(details.length ? [{ name: "Details", value: details.join("\n"), inline: false }] : [])
    ]
  });
}

export function buildBranchListEmbed(branches: DGitBranch[], currentBranch: string, noneText: string): EmbedBuilder {
  const lines = branches.map((branch) => `${branch.name === currentBranch ? "*" : " "} ${branch.name} ${branch.head ? shortHash(branch.head) : noneText}`);
  return buildLinesEmbed({ title: "DGit Branches", lines, emptyText: noneText, fieldName: "Branches" });
}

export function buildTagListEmbed(tags: Record<string, string>, noneText: string): EmbedBuilder {
  const lines = Object.entries(tags).map(([name, hash]) => `${name} ${shortHash(hash)}`);
  return buildLinesEmbed({ title: "DGit Tags", lines, emptyText: noneText, fieldName: "Tags" });
}

export function buildIgnoreListEmbed(ignore: IgnoreRules, labels: { channels: string; roles: string; types: string; patterns: string; none: string }): EmbedBuilder {
  return buildSimpleResultEmbed({
    title: "DGit Ignore Rules",
    status: "info",
    fields: [
      { name: labels.channels, value: ignore.channels.join(", ") || labels.none },
      { name: labels.roles, value: ignore.roles.join(", ") || labels.none },
      { name: labels.types, value: ignore.types.join(", ") || labels.none },
      { name: labels.patterns, value: ignore.patterns.join(", ") || labels.none }
    ]
  });
}

export function buildMergeConflictsEmbed(title: string, conflicts: MergeConflict[], mergeId: string): EmbedBuilder {
  return buildSimpleResultEmbed({
    title,
    status: "danger",
    fields: [
      { name: "Merge ID", value: mergeId, inline: true },
      { name: "Conflicts", value: String(conflicts.length), inline: true },
      {
        name: "Details",
        value: conflicts.slice(0, 10).map((conflict) => `${conflict.objectType}:${conflict.internalId}:${conflict.path} ${conflict.reason}`).join("\n")
      }
    ]
  });
}
