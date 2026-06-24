import { AttachmentBuilder, Guild, Message, TextChannel } from "discord.js";
import type { ApplyPlan, ApplyResult, DGitCommit, DGitDiff, DGitManifest, DGitSnapshot, ManifestCommitEntry, MergeConflict } from "./types/dgitTypes.js";
import { CommitGraph } from "./CommitGraph.js";
import { DiffEngine } from "./DiffEngine.js";
import { GuildStateApplier } from "./GuildStateApplier.js";
import { GuildStateCollector } from "./GuildStateCollector.js";
import { IgnoreMatcher } from "./IgnoreMatcher.js";
import { MaintenanceService } from "./MaintenanceService.js";
import { MergeEngine } from "./MergeEngine.js";
import { PermissionChecker } from "./PermissionChecker.js";
import { ManifestService } from "./storage/ManifestService.js";
import { AttachmentCodec } from "./storage/AttachmentCodec.js";
import { DiscordRepositoryStorage } from "./storage/DiscordRepositoryStorage.js";
import { RepositoryLocator } from "./storage/RepositoryLocator.js";
import { sha256Buffer, sha256Json, shortHash, stableStringify } from "../utils/hash.js";
import { nowIso } from "../utils/time.js";
import { formatSummary } from "../utils/text.js";
import { gzipJson } from "../utils/gzip.js";
import { uniqueId } from "../utils/ids.js";
import { LocalizedError } from "../i18n/localizedError.js";
import { t } from "../i18n/i18n.js";

export class DGitService {
  constructor(
    private readonly locator = new RepositoryLocator(),
    private readonly storage = new DiscordRepositoryStorage(),
    private readonly manifests = new ManifestService(),
    private readonly collector = new GuildStateCollector(),
    private readonly diffEngine = new DiffEngine(),
    private readonly applier = new GuildStateApplier(),
    private readonly graph = new CommitGraph(),
    private readonly permissions = new PermissionChecker(),
    private readonly mergeEngine = new MergeEngine(),
    private readonly maintenance = new MaintenanceService(),
    private readonly codec = new AttachmentCodec()
  ) {}

  async init(guild: Guild, channel: TextChannel, authorId: string, locale: string): Promise<{ manifest: DGitManifest; warnings: string[]; commitHash: string }> {
    const prep = await this.locator.prepare(channel, guild.id, locale);
    await channel.send(`[DGIT:REPOSITORY]\nguild: ${guild.id}\nrepoVersion: 1`);
    const manifest = this.manifests.createInitial(guild.id, authorId);
    const snapshot = await this.collectIgnored(guild, manifest);
    const diff = this.diffEngine.compute(null, snapshot, null, snapshot.stateHash);
    const commit = this.buildCommit({
      guildId: guild.id,
      branch: "main",
      message: "Initial commit",
      authorId,
      parent: null,
      secondParent: null,
      snapshot,
      diff
    });
    const files = await this.storage.uploadCommitObjects(channel, commit, snapshot, diff, manifest.settings.maxAttachmentBytes);
    const updated = this.manifests.addCommit(manifest, this.entryFrom(commit, diff, files));
    await this.storage.uploadManifest(channel, updated);
    return { manifest: updated, warnings: prep.warnings, commitHash: commit.hash };
  }

  async status(guild: Guild): Promise<{ manifest: DGitManifest; diff: DGitDiff; clean: boolean; repository: TextChannel }> {
    const { repository, manifest } = await this.loadRepo(guild);
    const headSnapshot = await this.loadHeadSnapshot(repository, manifest);
    const live = await this.collectIgnored(guild, manifest);
    const diff = this.diffEngine.compute(headSnapshot, live, manifest.head, live.stateHash);
    return { manifest, diff, clean: diff.changes.length === 0, repository };
  }

  async commit(guild: Guild, authorId: string, message: string): Promise<{ commit: DGitCommit; diff: DGitDiff; manifest: DGitManifest }> {
    if (!message.trim()) throw new LocalizedError("emptyCommitMessage");
    const { repository, manifest } = await this.loadRepo(guild);
    const headSnapshot = await this.loadHeadSnapshot(repository, manifest);
    const live = await this.collectIgnored(guild, manifest);
    const diff = this.diffEngine.compute(headSnapshot, live, manifest.head, live.stateHash);
    if (diff.changes.length === 0) throw new LocalizedError("workingTreeClean");
    const branch = manifest.currentBranch;
    const commit = this.buildCommit({
      guildId: guild.id,
      branch,
      message,
      authorId,
      parent: manifest.branches[branch]?.head ?? null,
      secondParent: null,
      snapshot: live,
      diff
    });
    if (manifest.commits[commit.hash]) throw new LocalizedError("commitHashCollision");
    const files = await this.storage.uploadCommitObjects(repository, commit, live, diff, manifest.settings.maxAttachmentBytes);
    const updated = this.manifests.addCommit(manifest, this.entryFrom(commit, diff, files));
    await this.storage.uploadManifest(repository, updated, manifest.manifestSequence);
    return { commit, diff, manifest: updated };
  }

  async log(guild: Guild, branch?: string, limit = 10): Promise<Array<ManifestCommitEntry>> {
    const { manifest } = await this.loadRepo(guild);
    const branchName = branch ?? manifest.currentBranch;
    const head = manifest.branches[branchName]?.head;
    if (head === undefined) throw new LocalizedError("unknownBranch", { branch: branchName });
    return this.graph.walk(manifest, head, limit).map((hash) => manifest.commits[hash]).filter((entry): entry is ManifestCommitEntry => Boolean(entry));
  }

  async diff(guild: Guild, from?: string, to?: string): Promise<DGitDiff> {
    const { repository, manifest } = await this.loadRepo(guild);
    const fromSnapshot = from ? await this.loadSnapshotByRef(repository, manifest, from) : await this.loadHeadSnapshot(repository, manifest);
    if (!to) {
      const live = await this.collectIgnored(guild, manifest);
      return this.diffEngine.compute(fromSnapshot, live, fromSnapshot?.stateHash ?? null, live.stateHash);
    }
    const toSnapshot = await this.loadSnapshotByRef(repository, manifest, to);
    return this.diffEngine.compute(fromSnapshot, toSnapshot, fromSnapshot?.stateHash ?? null, toSnapshot.stateHash);
  }

  async verify(guild: Guild, locale: string): Promise<string[]> {
    const repository = await this.locator.locate(guild);
    if (!repository) throw new LocalizedError("repositoryNotFound");
    const { manifest, integrity } = await this.storage.loadManifestWithIntegrity(repository);
    this.manifests.validate(manifest);
    const rows = [
      t(locale, "verifyRepositoryLocated"),
      t(locale, "verifyManifestLoaded"),
      integrity.hashVerified ? t(locale, "verifyManifestHashVerified") : t(locale, "verifyManifestLegacyUnverified")
    ];
    for (const [branch, data] of Object.entries(manifest.branches)) {
      rows.push(data.head && manifest.commits[data.head]
        ? t(locale, "verifyBranchHeadExists", { branch })
        : data.head
          ? t(locale, "verifyBranchMissingHead", { branch })
          : t(locale, "verifyBranchNoCommits", { branch }));
    }
    for (const [hash, entry] of Object.entries(manifest.commits)) {
      try {
        await this.storage.loadCommit(repository, entry.commitFile);
        await this.storage.loadSnapshot(repository, entry.snapshotFile);
        await this.storage.loadDiff(repository, entry.diffFile);
        rows.push(t(locale, "verifyCommitAttachmentsVerified", { hash: shortHash(hash) }));
      } catch (error) {
        rows.push(t(locale, "verifyCommitFailed", { hash: shortHash(hash), message: error instanceof Error ? error.message : String(error) }));
      }
      if (entry.parent && !manifest.commits[entry.parent]) rows.push(t(locale, "verifyCommitMissingParent", { hash: shortHash(hash), parent: shortHash(entry.parent) }));
    }
    return rows;
  }

  async restorePlan(guild: Guild, commitRef: string): Promise<{ manifest: DGitManifest; repository: TextChannel; plan: ApplyPlan; target: DGitSnapshot }> {
    const { repository, manifest } = await this.loadRepo(guild);
    const target = await this.loadSnapshotByRef(repository, manifest, commitRef);
    const current = await this.collectIgnored(guild, manifest);
    return { manifest, repository, target, plan: this.applier.planApply(current, target) };
  }

  async applyRestorePlan(guild: Guild, plan: ApplyPlan, repositoryChannelId: string): Promise<ReturnType<GuildStateApplier["applyPlan"]>> {
    return this.applier.applyPlan(guild, plan, { repositoryChannelId });
  }

  async permissionReport(guild: Guild, locale: string): Promise<string[]> {
    const repository = await this.locator.locate(guild).catch(() => null);
    return this.permissions.check(guild, repository, locale);
  }

  async branchCreate(guild: Guild, name: string, authorId: string, from?: string): Promise<DGitManifest> {
    const { repository, manifest } = await this.loadRepo(guild);
    if (!/^[a-zA-Z0-9._/-]{1,64}$/.test(name)) throw new LocalizedError("invalidBranchName");
    if (manifest.branches[name]) throw new LocalizedError("branchAlreadyExists", { name });
    const head = from ? this.resolveCommit(manifest, from) : manifest.head;
    const updated = this.updateManifest(manifest, (copy) => {
      copy.branches[name] = { name, head, base: head, createdAt: nowIso(), createdBy: authorId };
    });
    return this.saveManifest(repository, updated);
  }

  async branchDelete(guild: Guild, name: string): Promise<DGitManifest> {
    const { repository, manifest } = await this.loadRepo(guild);
    if (!manifest.branches[name]) throw new LocalizedError("unknownBranch", { branch: name });
    if (name === manifest.defaultBranch) throw new LocalizedError("cannotDeleteDefaultBranch", { name });
    if (name === manifest.currentBranch) throw new LocalizedError("cannotDeleteCurrentBranch", { name });
    const updated = this.updateManifest(manifest, (copy) => {
      delete copy.branches[name];
    });
    return this.saveManifest(repository, updated);
  }

  async branchApplyPlan(guild: Guild, name: string): Promise<{ manifest: DGitManifest; repository: TextChannel; plan: ApplyPlan; target: DGitSnapshot }> {
    const { repository, manifest } = await this.loadRepo(guild);
    const branch = manifest.branches[name];
    if (!branch?.head) throw new LocalizedError("branchHasNoHead", { name });
    const target = await this.loadSnapshotByRef(repository, manifest, branch.head);
    const current = await this.collectIgnored(guild, manifest);
    return { manifest, repository, target, plan: this.applier.planApply(current, target) };
  }

  async checkout(guild: Guild, branch: string): Promise<DGitManifest> {
    const { repository, manifest } = await this.loadRepo(guild);
    if (!manifest.branches[branch]) throw new LocalizedError("unknownBranch", { branch });
    const updated = this.updateManifest(manifest, (copy) => {
      copy.currentBranch = branch;
      copy.head = manifest.branches[branch]?.head ?? null;
    });
    return this.saveManifest(repository, updated);
  }

  async checkoutAndApply(guild: Guild, branch: string): Promise<{ result: ApplyResult; manifest: DGitManifest; plan: ApplyPlan }> {
    const { repository, manifest } = await this.loadRepo(guild);
    const targetBranch = manifest.branches[branch];
    if (!targetBranch) throw new LocalizedError("unknownBranch", { branch });
    if (!targetBranch.head) throw new LocalizedError("branchHasNoHead", { name: branch });
    const target = await this.loadSnapshotByRef(repository, manifest, targetBranch.head);
    const switched = this.updateManifest(manifest, (copy) => {
      copy.currentBranch = branch;
      copy.head = targetBranch.head;
    });
    const saved = await this.saveManifest(repository, switched);
    const current = await this.collectIgnored(guild, saved);
    const plan = this.applier.planApply(current, target);
    const result = await this.applier.applyPlan(guild, plan, { repositoryChannelId: repository.id });
    return { result, manifest: saved, plan };
  }

  async merge(guild: Guild, sourceBranch: string, targetBranch: string, authorId: string): Promise<{ manifest?: DGitManifest; commit?: DGitCommit; diff?: DGitDiff; conflicts: MergeConflict[]; mergeId?: string }> {
    const { repository, manifest } = await this.loadRepo(guild);
    const sourceHead = manifest.branches[sourceBranch]?.head;
    const targetHead = manifest.branches[targetBranch]?.head;
    if (!sourceHead) throw new LocalizedError("branchHasNoHead", { name: sourceBranch });
    if (!targetHead) throw new LocalizedError("branchHasNoHead", { name: targetBranch });
    const baseHash = this.graph.findMergeBase(manifest, sourceHead, targetHead);
    if (!baseHash) throw new LocalizedError("mergeBaseNotFound", { source: sourceBranch, target: targetBranch });
    const [base, source, target] = await Promise.all([
      this.loadSnapshotByRef(repository, manifest, baseHash),
      this.loadSnapshotByRef(repository, manifest, sourceHead),
      this.loadSnapshotByRef(repository, manifest, targetHead)
    ]);
    const result = this.mergeEngine.merge(base, source, target);
    if (result.conflicts.length > 0) {
      const mergeId = uniqueId("merge");
      await repository.send({
        content: `[DGIT:CONFLICT:${mergeId}]\nsource: ${sourceBranch}\ntarget: ${targetBranch}\nconflicts: ${result.conflicts.length}`,
        files: [new AttachmentBuilder(await gzipJson(Buffer.from(stableStringify({
          schemaVersion: 1,
          type: "conflict",
          createdAt: nowIso(),
          guildId: guild.id,
          mergeId,
          sourceBranch,
          targetBranch,
          conflicts: result.conflicts
        }), "utf8")), { name: `conflicts-${mergeId}.json.gz` })]
      });
      return { conflicts: result.conflicts, mergeId };
    }
    if (!result.snapshot) throw new LocalizedError("mergeProducedNothing");
    result.snapshot.createdAt = nowIso();
    result.snapshot.stateHash = this.diffEngine.hashSnapshot(result.snapshot);
    const diff = this.diffEngine.compute(target, result.snapshot, target.stateHash, result.snapshot.stateHash);
    const commit = this.buildCommit({
      guildId: guild.id,
      branch: targetBranch,
      message: `Merge ${sourceBranch} into ${targetBranch}`,
      authorId,
      parent: targetHead,
      secondParent: sourceHead,
      snapshot: result.snapshot,
      diff
    });
    const files = await this.storage.uploadCommitObjects(repository, commit, result.snapshot, diff, manifest.settings.maxAttachmentBytes);
    const updated = this.manifests.addCommit({ ...manifest, currentBranch: targetBranch }, this.entryFrom(commit, diff, files));
    const saved = await this.saveManifest(repository, updated);
    return { manifest: saved, commit, diff, conflicts: [] };
  }

  async tagCreate(guild: Guild, name: string, commitRef?: string): Promise<DGitManifest> {
    const { repository, manifest } = await this.loadRepo(guild);
    if (!/^[a-zA-Z0-9._/-]{1,64}$/.test(name)) throw new LocalizedError("invalidTagName");
    if (manifest.tags[name]) throw new LocalizedError("tagAlreadyExists", { name });
    const hash = commitRef ? this.resolveCommit(manifest, commitRef) : manifest.head;
    if (!hash) throw new LocalizedError("noCommitAvailableToTag");
    const updated = this.updateManifest(manifest, (copy) => {
      copy.tags[name] = hash;
    });
    return this.saveManifest(repository, updated);
  }

  async tagDelete(guild: Guild, name: string): Promise<DGitManifest> {
    const { repository, manifest } = await this.loadRepo(guild);
    if (!manifest.tags[name]) throw new LocalizedError("unknownTag", { name });
    const updated = this.updateManifest(manifest, (copy) => {
      delete copy.tags[name];
    });
    return this.saveManifest(repository, updated);
  }

  async exportSnapshot(guild: Guild, commitRef?: string): Promise<{ filename: string; attachment: AttachmentBuilder }> {
    const { repository, manifest } = await this.loadRepo(guild);
    const ref = commitRef ?? manifest.head;
    if (!ref) throw new LocalizedError("noCommitAvailableToTag");
    const hash = this.resolveCommit(manifest, ref);
    const snapshot = await this.loadSnapshotByRef(repository, manifest, hash);
    const filename = `dgit-export-${shortHash(hash)}.json.gz`;
    return { filename, attachment: new AttachmentBuilder(await gzipJson(Buffer.from(stableStringify(snapshot), "utf8")), { name: filename }) };
  }

  async history(guild: Guild, target: "channel" | "role" | "guild", id?: string): Promise<string[]> {
    const { repository, manifest } = await this.loadRepo(guild);
    const lines: string[] = [];
    for (const entry of Object.values(manifest.commits).sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
      const diff = await this.storage.loadDiff(repository, entry.diffFile).catch(() => null);
      if (!diff) continue;
      const touched = diff.changes.some((change) => {
        if (target === "guild") return change.objectType === "guild";
        if (change.objectType !== target) return false;
        if (!id) return true;
        return change.internalId === id || JSON.stringify(change.before).includes(id) || JSON.stringify(change.after).includes(id);
      });
      if (touched) lines.push(`${shortHash(entry.hash)} ${entry.message} by <@${entry.authorId}> ${entry.createdAt}`);
    }
    return lines;
  }

  async blame(guild: Guild, target: "channel" | "role" | "guild", id?: string): Promise<string[]> {
    const { repository, manifest } = await this.loadRepo(guild);
    const blamed = new Map<string, string>();
    const entries = Object.values(manifest.commits).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    for (const entry of entries) {
      const diff = await this.storage.loadDiff(repository, entry.diffFile).catch(() => null);
      if (!diff) continue;
      for (const change of diff.changes) {
        if (target !== "guild" && change.objectType !== target) continue;
        if (target === "guild" && change.objectType !== "guild") continue;
        if (id && change.internalId !== id && !JSON.stringify(change.before).includes(id) && !JSON.stringify(change.after).includes(id)) continue;
        if (!blamed.has(change.path || change.internalId)) blamed.set(change.path || change.internalId, `${change.path || change.internalId}: ${shortHash(entry.hash)} ${entry.message}`);
      }
    }
    return [...blamed.values()];
  }

  async setWatch(guild: Guild, enabled: boolean): Promise<DGitManifest> {
    const { repository, manifest } = await this.loadRepo(guild);
    const updated = this.updateManifest(manifest, (copy) => {
      copy.settings.watch = enabled;
    });
    return this.saveManifest(repository, updated);
  }

  async setAutocommit(guild: Guild, enabled: boolean): Promise<DGitManifest> {
    const { repository, manifest } = await this.loadRepo(guild);
    const updated = this.updateManifest(manifest, (copy) => {
      copy.settings.autocommit = enabled;
    });
    return this.saveManifest(repository, updated);
  }

  async maintenancePlan(guild: Guild): Promise<{ manifest: DGitManifest; repository: TextChannel; plan: ApplyPlan }> {
    const { repository, manifest } = await this.loadRepo(guild);
    const current = await this.collectIgnored(guild, manifest);
    const target = this.maintenance.snapshotOn(current);
    target.createdAt = nowIso();
    target.stateHash = this.diffEngine.hashSnapshot(target);
    const plan = this.applier.planApply(current, target);
    plan.warnings.push("Maintenance mode denies @everyone SendMessages on text channels after confirmation.");
    return { manifest, repository, plan };
  }

  async maintenanceOffPlan(guild: Guild): Promise<{ manifest: DGitManifest; repository: TextChannel; plan: ApplyPlan }> {
    const { repository, manifest } = await this.loadRepo(guild);
    const branch = manifest.branches[manifest.currentBranch];
    if (!branch?.head) throw new LocalizedError("branchHasNoHead", { name: manifest.currentBranch });
    const target = await this.loadSnapshotByRef(repository, manifest, branch.head);
    const current = await this.collectIgnored(guild, manifest);
    const plan = this.applier.planApply(current, target);
    plan.warnings.push("Maintenance off restores the current branch HEAD snapshot after confirmation.");
    return { manifest, repository, plan };
  }

  async repoRepair(guild: Guild, authorId: string): Promise<{ manifest: DGitManifest; scanned: number; commits: number }> {
    const repository = await this.locator.locate(guild);
    if (!repository) throw new LocalizedError("repositoryNotFound");
    const loadedPrevious = await this.storage.loadManifest(repository).then((manifest) => ({ manifest, expectedSequence: manifest.manifestSequence })).catch(() => ({
      manifest: this.manifests.createInitial(guild.id, authorId),
      expectedSequence: undefined
    }));
    const previous = loadedPrevious.manifest;
    const messages = await this.fetchRepositoryMessages(repository);
    const commits: ManifestCommitEntry[] = [];
    for (const message of messages) {
      if (!message.content.startsWith("[DGIT:COMMIT:")) continue;
      const commitAttachment = message.attachments.find((a) => a.name?.startsWith("commit-"));
      const snapshotAttachment = message.attachments.find((a) => a.name?.startsWith("snapshot-"));
      const diffAttachment = message.attachments.find((a) => a.name?.startsWith("diff-"));
      if (!commitAttachment || !snapshotAttachment || !diffAttachment) continue;
      const short = commitAttachment.name?.replace("commit-", "").replace(".json.gz", "") ?? "unknown";
      try {
        const commitBuffer = await this.downloadAttachment(commitAttachment.url);
        const snapshotBuffer = await this.downloadAttachment(snapshotAttachment.url);
        const diffBuffer = await this.downloadAttachment(diffAttachment.url);
        const commit = await this.codec.decodeJson<DGitCommit>(commitBuffer);
        const diff = await this.codec.decodeJson<DGitDiff>(diffBuffer);
        const meta = (name: string, buffer: Buffer) => ({
          channelId: repository.id,
          messageId: message.id,
          filename: name,
          sizeBytes: buffer.byteLength,
          sha256: sha256Buffer(buffer),
          contentType: "application/gzip"
        });
        commits.push(this.entryFrom(commit, diff, {
          commitFile: meta(commitAttachment.name!, commitBuffer),
          snapshotFile: meta(snapshotAttachment.name!, snapshotBuffer),
          diffFile: meta(diffAttachment.name!, diffBuffer)
        }));
      } catch {
        await repository.send(`[DGIT:VERIFY:${Date.now()}]\nSkipped corrupt commit message ${message.id} (${short}) during repair.`);
      }
    }
    const repaired = this.updateManifest(previous, (copy) => {
      copy.commits = {};
      for (const entry of commits) copy.commits[entry.hash] = entry;
      for (const branch of Object.values(copy.branches)) {
        if (branch.head && !copy.commits[branch.head]) branch.head = null;
      }
      const newest = commits.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      if (newest && !copy.branches[copy.defaultBranch]?.head) copy.branches[copy.defaultBranch]!.head = newest.hash;
      copy.head = copy.branches[copy.currentBranch]?.head ?? null;
    });
    const saved = await this.saveManifest(repository, repaired, loadedPrevious.expectedSequence);
    return { manifest: saved, scanned: messages.length, commits: commits.length };
  }

  async addIgnore(guild: Guild, type: "channel" | "role" | "objectType" | "pattern", value: string): Promise<DGitManifest> {
    const { repository, manifest } = await this.loadRepo(guild);
    const updated = this.updateManifest(manifest, (copy) => {
      const list = type === "channel" ? copy.ignore.channels : type === "role" ? copy.ignore.roles : type === "objectType" ? copy.ignore.types : copy.ignore.patterns;
      if (!list.includes(value)) list.push(value);
    });
    return this.saveManifest(repository, updated);
  }

  async removeIgnore(guild: Guild, type: "channel" | "role" | "objectType" | "pattern", value: string): Promise<DGitManifest> {
    const { repository, manifest } = await this.loadRepo(guild);
    const updated = this.updateManifest(manifest, (copy) => {
      const list = type === "channel" ? copy.ignore.channels : type === "role" ? copy.ignore.roles : type === "objectType" ? copy.ignore.types : copy.ignore.patterns;
      const index = list.indexOf(value);
      if (index >= 0) list.splice(index, 1);
    });
    return this.saveManifest(repository, updated);
  }

  async loadRepo(guild: Guild): Promise<{ repository: TextChannel; manifest: DGitManifest }> {
    const repository = await this.locator.locate(guild);
    if (!repository) throw new LocalizedError("repositoryNotFound");
    const manifest = this.manifests.validate(await this.storage.loadManifest(repository));
    return { repository, manifest };
  }

  private updateManifest(manifest: DGitManifest, mutator: (copy: DGitManifest) => void): DGitManifest {
    const copy: DGitManifest = structuredClone(manifest);
    mutator(copy);
    copy.updatedAt = nowIso();
    copy.manifestSequence += 1;
    return copy;
  }

  private async saveManifest(repository: TextChannel, manifest: DGitManifest, expectedSequence = manifest.manifestSequence - 1): Promise<DGitManifest> {
    const valid = this.manifests.validate(manifest);
    await this.storage.uploadManifest(repository, valid, expectedSequence);
    return valid;
  }

  private async collectIgnored(guild: Guild, manifest: DGitManifest): Promise<DGitSnapshot> {
    return new IgnoreMatcher(manifest.ignore).apply(await this.collector.collect(guild));
  }

  private async loadHeadSnapshot(repository: TextChannel, manifest: DGitManifest): Promise<DGitSnapshot | null> {
    if (!manifest.head) return null;
    return this.storage.loadSnapshot(repository, manifest.commits[manifest.head]!.snapshotFile);
  }

  private async loadSnapshotByRef(repository: TextChannel, manifest: DGitManifest, ref: string): Promise<DGitSnapshot> {
    const hash = this.resolveCommit(manifest, ref);
    const entry = manifest.commits[hash];
    if (!entry) throw new LocalizedError("unknownCommit", { ref });
    return this.storage.loadSnapshot(repository, entry.snapshotFile);
  }

  private resolveCommit(manifest: DGitManifest, ref: string): string {
    if (manifest.commits[ref]) return ref;
    const tag = manifest.tags[ref];
    if (tag) return tag;
    const branch = manifest.branches[ref]?.head;
    if (branch) return branch;
    const match = Object.keys(manifest.commits).find((hash) => hash.replace(/^sha256:/, "").startsWith(ref));
    if (!match) throw new LocalizedError("unknownCommitOrRef", { ref });
    return match;
  }

  private async downloadAttachment(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) throw new LocalizedError("failedDownloadAttachment", { status: response.status });
    return Buffer.from(await response.arrayBuffer());
  }

  private async fetchRepositoryMessages(repository: TextChannel): Promise<Message[]> {
    const messages: Message[] = [];
    let before: string | undefined;
    while (true) {
      const batch = await repository.messages.fetch(before ? { limit: 100, before } : { limit: 100 });
      const values = [...batch.values()];
      messages.push(...values);
      before = values.at(-1)?.id;
      if (batch.size < 100 || !before) break;
    }
    return messages;
  }

  private buildCommit(input: { guildId: string; branch: string; message: string; authorId: string; parent: string | null; secondParent: string | null; snapshot: DGitSnapshot; diff: DGitDiff }): DGitCommit {
    const createdAt = nowIso();
    const snapshotHash = sha256Json(input.snapshot);
    const diffHash = sha256Json(input.diff);
    const base = {
      parent: input.parent,
      secondParent: input.secondParent,
      branch: input.branch,
      message: input.message,
      authorId: input.authorId,
      createdAt,
      snapshotHash,
      stateHash: input.snapshot.stateHash,
      diffHash
    };
    const hash = sha256Json(base);
    return {
      schemaVersion: 1,
      type: "commit",
      hash,
      guildId: input.guildId,
      branch: input.branch,
      message: input.message,
      authorId: input.authorId,
      parent: input.parent,
      secondParent: input.secondParent,
      snapshotHash,
      diffHash,
      stateHash: input.snapshot.stateHash,
      createdAt
    };
  }

  private entryFrom(commit: DGitCommit, diff: DGitDiff, files: { commitFile: ManifestCommitEntry["commitFile"]; snapshotFile: ManifestCommitEntry["snapshotFile"]; diffFile: ManifestCommitEntry["diffFile"] }): ManifestCommitEntry {
    return {
      hash: commit.hash,
      message: commit.message,
      authorId: commit.authorId,
      branch: commit.branch,
      parent: commit.parent,
      secondParent: commit.secondParent,
      createdAt: commit.createdAt,
      commitFile: files.commitFile,
      snapshotFile: files.snapshotFile,
      diffFile: files.diffFile,
      stateHash: commit.stateHash,
      summary: diff.summary
    };
  }

  formatStatus(manifest: DGitManifest, diff: DGitDiff, clean: boolean): string {
    return `DGit Status\nBranch: ${manifest.currentBranch}\nHEAD: ${manifest.head ? shortHash(manifest.head) : "none"}\nWorking tree: ${clean ? "clean" : "dirty"}\nChanges: ${formatSummary(diff.summary)}`;
  }
}
