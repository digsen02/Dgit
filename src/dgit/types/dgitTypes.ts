export type Snowflake = string;

export type DGitObjectType = "guild" | "role" | "channel" | "permissionOverwrite" | "message" | "memberRole";
export type DiffOp = "add" | "delete" | "update" | "move" | "permission_update";
export type Severity = "low" | "medium" | "high" | "dangerous";

export interface AttachmentMeta {
  channelId: Snowflake;
  messageId: Snowflake;
  filename: string;
  sizeBytes: number;
  sha256: string;
  contentType?: string | null;
  chunks?: AttachmentMeta[];
}

export interface DGitBranch {
  name: string;
  head: string | null;
  base?: string | null;
  createdAt: string;
  createdBy: Snowflake;
}

export interface ManifestCommitEntry {
  hash: string;
  message: string;
  authorId: Snowflake;
  branch: string;
  parent: string | null;
  secondParent: string | null;
  createdAt: string;
  commitFile: AttachmentMeta;
  snapshotFile: AttachmentMeta;
  diffFile: AttachmentMeta;
  stateHash: string;
  summary: DiffSummary;
}

export interface IgnoreRules {
  channels: string[];
  roles: string[];
  types: string[];
  patterns: string[];
}

export interface RepositorySettings {
  gzip: boolean;
  chunking: boolean;
  maxAttachmentBytes: number;
  autocommit: boolean;
  watch: boolean;
  maintenance?: {
    enabled: boolean;
    beforeCommit?: string;
  };
}

export interface DGitManifest {
  schemaVersion: 1;
  type: "manifest";
  repoVersion: 1;
  guildId: Snowflake;
  createdAt: string;
  updatedAt: string;
  manifestSequence: number;
  defaultBranch: string;
  currentBranch: string;
  head: string | null;
  branches: Record<string, DGitBranch>;
  tags: Record<string, string>;
  commits: Record<string, ManifestCommitEntry>;
  ignore: IgnoreRules;
  settings: RepositorySettings;
}

export interface DGitCommit {
  schemaVersion: 1;
  type: "commit";
  hash: string;
  guildId: Snowflake;
  branch: string;
  message: string;
  authorId: Snowflake;
  parent: string | null;
  secondParent: string | null;
  snapshotHash: string;
  diffHash: string;
  stateHash: string;
  createdAt: string;
}

export interface GuildSettingsSnapshot {
  id: Snowflake;
  name: string;
  description: string | null;
  verificationLevel: number;
  defaultMessageNotifications: number;
  explicitContentFilter: number;
  afkChannelInternalId: string | null;
  afkTimeout: number;
  systemChannelInternalId: string | null;
  rulesChannelInternalId: string | null;
  publicUpdatesChannelInternalId: string | null;
}

export interface RoleSnapshot {
  internalId: string;
  discordId: Snowflake;
  name: string;
  color: number;
  hoist: boolean;
  icon: string | null;
  unicodeEmoji: string | null;
  position: number;
  permissions: string[];
  managed: boolean;
  mentionable: boolean;
}

export interface PermissionOverwriteSnapshot {
  targetInternalId: string;
  targetDiscordId: Snowflake;
  targetType: "role" | "user";
  allow: string[];
  deny: string[];
}

export interface ChannelSnapshot {
  internalId: string;
  discordId: Snowflake;
  type: number;
  name: string;
  parentInternalId: string | null;
  position: number;
  topic: string | null;
  nsfw: boolean;
  rateLimitPerUser: number | null;
  bitrate: number | null;
  userLimit: number | null;
  permissionOverwrites: PermissionOverwriteSnapshot[];
  defaultAutoArchiveDuration: number | null;
  availableTags: unknown[];
  defaultReactionEmoji: unknown | null;
  defaultSortOrder: number | null;
  defaultForumLayout: number | null;
}

export interface DGitSnapshot {
  schemaVersion: 1;
  type: "snapshot";
  createdAt: string;
  guildId: Snowflake;
  stateHash: string;
  guild: GuildSettingsSnapshot;
  roles: RoleSnapshot[];
  channels: ChannelSnapshot[];
}

export interface DiffChange {
  op: DiffOp;
  objectType: DGitObjectType;
  internalId: string;
  path: string;
  before: unknown;
  after: unknown;
  severity: Severity;
  humanSummary: string;
}

export interface DiffSummary {
  added: number;
  deleted: number;
  updated: number;
  moved: number;
  permissionUpdates: number;
  dangerous: number;
}

export interface DGitDiff {
  schemaVersion: 1;
  type: "diff";
  createdAt: string;
  guildId: Snowflake;
  from: string | null;
  to: string | null;
  changes: DiffChange[];
  summary: DiffSummary;
}

export interface ApplyStep {
  id: string;
  action: string;
  objectType: DGitObjectType;
  internalId: string;
  dangerous: boolean;
  description: string;
  payload?: unknown;
}

export interface ApplyPlan {
  changes: DiffChange[];
  steps: ApplyStep[];
  dangerousCount: number;
  warnings: string[];
  targetSnapshot?: DGitSnapshot;
}

export interface ApplyResult {
  success: ApplyStep[];
  failed: Array<{ step: ApplyStep; error: string }>;
  skipped: Array<{ step: ApplyStep; reason: string }>;
  warnings: string[];
}

export interface MergeConflict {
  id: string;
  objectType: DGitObjectType;
  internalId: string;
  path: string;
  base: unknown;
  source: unknown;
  target: unknown;
  reason: string;
}

export interface MergeResult {
  snapshot?: DGitSnapshot;
  conflicts: MergeConflict[];
}
