import {
  ChannelType,
  Guild,
  GuildBasedChannel,
  GuildChannel,
  GuildChannelCreateOptions,
  OverwriteResolvable,
  PermissionFlagsBits,
  PermissionOverwriteOptions,
  Role
} from "discord.js";
import type { ApplyPlan, ApplyResult, ApplyStep, ChannelSnapshot, DGitObjectType, DGitSnapshot, DiffChange, PermissionOverwriteSnapshot, RoleSnapshot } from "./types/dgitTypes.js";
import { DiffEngine } from "./DiffEngine.js";

export class GuildStateApplier {
  constructor(private readonly diffEngine = new DiffEngine()) {}

  planApply(currentSnapshot: DGitSnapshot, targetSnapshot: DGitSnapshot): ApplyPlan {
    const diff = this.diffEngine.compute(currentSnapshot, targetSnapshot, currentSnapshot.stateHash, targetSnapshot.stateHash);
    const steps = diff.changes.map((change, index) => this.stepFromChange(change, index));
    for (const step of steps) {
      const payload = step.payload as ApplyPayload | undefined;
      if (payload) payload.targetSnapshot = targetSnapshot;
    }
    return {
      changes: diff.changes,
      steps: this.orderSteps(steps),
      dangerousCount: diff.summary.dangerous,
      warnings: ["This plan will create, update, move, overwrite permissions, and delete Discord roles/channels after confirmation."],
      targetSnapshot
    };
  }

  async applyPlan(guild: Guild, plan: ApplyPlan, options: { repositoryChannelId: string }): Promise<ApplyResult> {
    const result: ApplyResult = { success: [], failed: [], skipped: [], warnings: [...plan.warnings] };
    await guild.roles.fetch();
    await guild.channels.fetch();
    const roleMap = new Map<string, string>();
    const channelMap = new Map<string, string>();
    for (const step of plan.steps) {
      const payload = step.payload as ApplyPayload | undefined;
      const before = payload?.before as { discordId?: string } | null | undefined;
      const after = payload?.after as { discordId?: string } | null | undefined;
      if (step.objectType === "channel" && [step.internalId, before?.discordId, after?.discordId].includes(options.repositoryChannelId) && step.action.startsWith("delete")) {
        result.skipped.push({ step, reason: "Repository channel is protected." });
        continue;
      }
      try {
        await this.applyStep(guild, step, roleMap, channelMap, options);
        result.success.push(step);
      } catch (error) {
        result.failed.push({ step, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return result;
  }

  private async applyStep(guild: Guild, step: ApplyStep, roleMap: Map<string, string>, channelMap: Map<string, string>, options: { repositoryChannelId: string }): Promise<void> {
    const payload = step.payload as ApplyPayload | undefined;
    if (step.objectType === "role") {
      await this.applyRoleStep(guild, step, payload, roleMap);
      return;
    }
    if (step.objectType === "channel") {
      await this.applyChannelStep(guild, step, payload, roleMap, channelMap, options);
      return;
    }
    if (step.objectType === "guild") {
      await this.applyGuildStep(guild, step, payload, channelMap);
      return;
    }
    throw new Error(`Unsupported apply object type ${step.objectType}`);
  }

  private async applyRoleStep(guild: Guild, step: ApplyStep, payload: ApplyPayload | undefined, roleMap: Map<string, string>): Promise<void> {
    const before = payload?.before as RoleSnapshot | null | undefined;
    const after = payload?.after as RoleSnapshot | null | undefined;
    if (step.action === "delete-role") {
      if (!before) throw new Error("Missing role delete payload.");
      if (before.discordId === guild.id || before.internalId === "role_everyone") throw new Error("Refusing to delete @everyone.");
      const role = this.findRole(guild, before, roleMap);
      if (!role) return;
      if (role.id === guild.members.me?.roles.highest.id) throw new Error("Refusing to delete the bot's highest role.");
      await role.delete("DGit checkout/delete role");
      return;
    }
    if (!after) throw new Error("Missing role target payload.");
    if (after.internalId === "role_everyone" || after.discordId === guild.id) {
      const everyone = guild.roles.everyone;
      await everyone.setPermissions(this.permissionBits(after.permissions), "DGit checkout @everyone permissions");
      return;
    }
    let role = this.findRole(guild, after, roleMap);
    if (!role) {
      role = await guild.roles.create({
        name: after.name,
        color: after.color,
        hoist: after.hoist,
        mentionable: after.mentionable,
        permissions: this.permissionBits(after.permissions),
        reason: "DGit checkout/create role"
      });
      roleMap.set(after.internalId, role.id);
    }
    if (role.managed) throw new Error(`Cannot edit managed role ${role.name}.`);
    await role.edit({
      name: after.name,
      color: after.color,
      hoist: after.hoist,
      mentionable: after.mentionable,
      permissions: this.permissionBits(after.permissions),
      position: after.position,
      reason: "DGit checkout/update role"
    });
  }

  private async applyChannelStep(guild: Guild, step: ApplyStep, payload: ApplyPayload | undefined, roleMap: Map<string, string>, channelMap: Map<string, string>, options: { repositoryChannelId: string }): Promise<void> {
    const before = payload?.before as ChannelSnapshot | null | undefined;
    const after = payload?.after as ChannelSnapshot | null | undefined;
    if (step.action === "delete-channel") {
      if (!before) throw new Error("Missing channel delete payload.");
      if (before.discordId === options.repositoryChannelId) throw new Error("Refusing to delete repository channel.");
      const channel = this.findChannel(guild, before, channelMap);
      if (!channel) return;
      await channel.delete("DGit checkout/delete channel");
      return;
    }
    if (!after) throw new Error("Missing channel target payload.");
    let channel = this.findChannel(guild, after, channelMap);
    if (!channel) {
      channel = await this.createChannel(guild, after, roleMap, channelMap, payload?.targetSnapshot);
      channelMap.set(after.internalId, channel.id);
    }
    await this.updateChannel(channel, after, roleMap, channelMap, payload?.targetSnapshot);
  }

  private async applyGuildStep(guild: Guild, step: ApplyStep, payload: ApplyPayload | undefined, channelMap: Map<string, string>): Promise<void> {
    const path = step.action.replace("update-", "");
    const after = payload?.after;
    const edit: Record<string, unknown> = {};
    if (path === "name" && typeof after === "string") edit.name = after;
    if (path === "description" && (typeof after === "string" || after === null)) edit.description = after;
    if (path === "afkTimeout" && typeof after === "number") edit.afkTimeout = after;
    if (path === "verificationLevel" && typeof after === "number") edit.verificationLevel = after;
    if (path === "defaultMessageNotifications" && typeof after === "number") edit.defaultMessageNotifications = after;
    if (path === "explicitContentFilter" && typeof after === "number") edit.explicitContentFilter = after;
    if (path.endsWith("InternalId")) {
      const key = path.replace("InternalId", "Id");
      edit[key] = typeof after === "string" ? channelMap.get(after) ?? null : null;
    }
    if (Object.keys(edit).length === 0) throw new Error(`Guild field ${path} is not applyable.`);
    await guild.edit({ ...edit, reason: "DGit checkout/update guild" });
  }

  private async createChannel(guild: Guild, snapshot: ChannelSnapshot, roleMap: Map<string, string>, channelMap: Map<string, string>, targetSnapshot?: DGitSnapshot): Promise<GuildBasedChannel> {
    const parentId = this.resolveParentCategoryId(guild, snapshot, channelMap, targetSnapshot);
    const options: GuildChannelCreateOptions = {
      name: snapshot.name,
      type: this.channelType(snapshot.type),
      parent: parentId,
      position: snapshot.position,
      permissionOverwrites: this.overwrites(snapshot.permissionOverwrites, roleMap),
      reason: "DGit checkout/create channel"
    };
    this.assignChannelOptions(options as unknown as Record<string, unknown>, snapshot);
    return guild.channels.create(options) as Promise<GuildBasedChannel>;
  }

  private async updateChannel(channel: GuildBasedChannel, snapshot: ChannelSnapshot, roleMap: Map<string, string>, channelMap: Map<string, string>, targetSnapshot?: DGitSnapshot): Promise<void> {
    if (!("edit" in channel) || typeof channel.edit !== "function") throw new Error(`Channel ${channel.id} cannot be edited.`);
    const editable = channel as GuildChannel & {
      setParent(parent: string | null, options?: { lockPermissions?: boolean; reason?: string }): Promise<GuildChannel>;
      setPosition(position: number, options?: { reason?: string }): Promise<GuildChannel>;
      permissionOverwrites: { set(overwrites: OverwriteResolvable[], reason?: string): Promise<unknown> };
    };
    const edit: Record<string, unknown> = { name: snapshot.name, reason: "DGit checkout/update channel" };
    this.assignChannelOptions(edit, snapshot);
    await editable.edit(edit);
    const parentId = this.resolveParentCategoryId(channel.guild, snapshot, channelMap, targetSnapshot);
    if ("setParent" in editable) await editable.setParent(parentId, { lockPermissions: false, reason: "DGit checkout/move channel parent" });
    if ("setPosition" in editable) await editable.setPosition(snapshot.position, { reason: "DGit checkout/move channel position" });
    if (editable.permissionOverwrites?.set) await editable.permissionOverwrites.set(this.overwrites(snapshot.permissionOverwrites, roleMap), "DGit checkout/update overwrites");
  }

  private assignChannelOptions(target: Record<string, unknown>, snapshot: ChannelSnapshot): void {
    target.nsfw = snapshot.nsfw;
    if (snapshot.topic !== null) target.topic = snapshot.topic;
    if (snapshot.rateLimitPerUser !== null) target.rateLimitPerUser = snapshot.rateLimitPerUser;
    if (snapshot.bitrate !== null) target.bitrate = snapshot.bitrate;
    if (snapshot.userLimit !== null) target.userLimit = snapshot.userLimit;
    if (snapshot.defaultAutoArchiveDuration !== null) target.defaultAutoArchiveDuration = snapshot.defaultAutoArchiveDuration;
    if (snapshot.defaultSortOrder !== null) target.defaultSortOrder = snapshot.defaultSortOrder;
    if (snapshot.defaultForumLayout !== null) target.defaultForumLayout = snapshot.defaultForumLayout;
  }

  private stepFromChange(change: DiffChange, index: number): ApplyStep {
    const action = change.op === "delete" ? `delete-${change.objectType}` : change.op === "add" ? "create" : `update-${change.path}`;
    return {
      id: `step-${index + 1}`,
      action,
      objectType: change.objectType,
      internalId: change.internalId,
      dangerous: change.severity === "dangerous",
      description: change.humanSummary,
      payload: { before: change.before, after: change.after, path: change.path }
    };
  }

  private orderSteps(steps: ApplyStep[]): ApplyStep[] {
    const weight = (step: ApplyStep): number => {
      if (step.objectType === "role" && step.action === "create") return 10;
      if (step.objectType === "role" && step.action.startsWith("update")) return 15;
      if (step.objectType === "channel" && step.action === "create" && (step.payload as ApplyPayload | undefined)?.after && ((step.payload as ApplyPayload).after as ChannelSnapshot).type === ChannelType.GuildCategory) return 20;
      if (step.objectType === "channel" && step.action === "create") return 25;
      if (step.objectType === "channel" && step.action.startsWith("update-parentInternalId")) return 35;
      if (step.objectType === "channel" && step.action.startsWith("update-position")) return 40;
      if (step.objectType === "channel" && step.action.startsWith("update-permissionOverwrites")) return 45;
      if (step.action.startsWith("update")) return 50;
      if (step.objectType === "guild") return 70;
      if (step.action.startsWith("delete-channel") && (step.payload as ApplyPayload | undefined)?.before && ((step.payload as ApplyPayload).before as ChannelSnapshot).type === ChannelType.GuildCategory) return 95;
      if (step.action.startsWith("delete-channel")) return 90;
      if (step.action.startsWith("delete-role")) return 100;
      return 50;
    };
    return [...steps].sort((a, b) => weight(a) - weight(b));
  }

  private findRole(guild: Guild, snapshot: RoleSnapshot, roleMap: Map<string, string>): Role | null {
    const mapped = roleMap.get(snapshot.internalId);
    const byMap = mapped ? guild.roles.cache.get(mapped) : null;
    if (byMap) return byMap;
    const byDiscordId = guild.roles.cache.get(snapshot.discordId);
    if (byDiscordId) {
      roleMap.set(snapshot.internalId, byDiscordId.id);
      return byDiscordId;
    }
    const byName = guild.roles.cache.find((role) => role.name === snapshot.name && role.managed === snapshot.managed);
    if (byName) roleMap.set(snapshot.internalId, byName.id);
    return byName ?? null;
  }

  private findChannel(guild: Guild, snapshot: ChannelSnapshot, channelMap: Map<string, string>): GuildBasedChannel | null {
    const mapped = channelMap.get(snapshot.internalId);
    const byMap = mapped ? guild.channels.cache.get(mapped) : null;
    if (byMap) return byMap;
    const byDiscordId = guild.channels.cache.get(snapshot.discordId);
    if (byDiscordId) {
      channelMap.set(snapshot.internalId, byDiscordId.id);
      return byDiscordId;
    }
    const byName = guild.channels.cache.find((channel) => channel.name === snapshot.name && channel.type === snapshot.type);
    if (byName) channelMap.set(snapshot.internalId, byName.id);
    return byName ?? null;
  }

  private resolveParentCategoryId(guild: Guild, snapshot: ChannelSnapshot, channelMap: Map<string, string>, targetSnapshot?: DGitSnapshot): string | null {
    if (!snapshot.parentInternalId) return null;
    const mapped = channelMap.get(snapshot.parentInternalId);
    if (mapped && guild.channels.cache.get(mapped)?.type === ChannelType.GuildCategory) return mapped;

    const parentSnapshot = targetSnapshot?.channels.find((channel) => channel.internalId === snapshot.parentInternalId);
    if (!parentSnapshot) {
      throw new Error(`Parent category ${snapshot.parentInternalId} for channel ${snapshot.name} is missing from target snapshot.`);
    }

    const byDiscordId = guild.channels.cache.get(parentSnapshot.discordId);
    if (byDiscordId?.type === ChannelType.GuildCategory) {
      channelMap.set(parentSnapshot.internalId, byDiscordId.id);
      return byDiscordId.id;
    }

    const byName = guild.channels.cache.find((channel) => channel.type === ChannelType.GuildCategory && channel.name === parentSnapshot.name);
    if (byName) {
      channelMap.set(parentSnapshot.internalId, byName.id);
      return byName.id;
    }

    throw new Error(`Parent category ${parentSnapshot.name} (${parentSnapshot.internalId}) for channel ${snapshot.name} was not found by id or name.`);
  }

  private overwrites(overwrites: PermissionOverwriteSnapshot[], roleMap: Map<string, string>): OverwriteResolvable[] {
    return overwrites.map((overwrite) => ({
      id: overwrite.targetType === "role" ? roleMap.get(overwrite.targetInternalId) ?? overwrite.targetDiscordId : overwrite.targetDiscordId,
      type: overwrite.targetType === "role" ? 0 : 1,
      allow: this.permissionBits(overwrite.allow),
      deny: this.permissionBits(overwrite.deny)
    }));
  }

  private permissionOptions(permissions: string[]): PermissionOverwriteOptions {
    return permissions.reduce<PermissionOverwriteOptions>((acc, permission) => {
      const bit = PermissionFlagsBits[permission as keyof typeof PermissionFlagsBits];
      if (bit) acc[permission as keyof PermissionOverwriteOptions] = true;
      return acc;
    }, {});
  }

  private permissionBits(permissions: string[]): bigint[] {
    return permissions.map((permission) => PermissionFlagsBits[permission as keyof typeof PermissionFlagsBits]).filter((bit): bit is bigint => Boolean(bit));
  }

  private channelType(type: number): NonNullable<GuildChannelCreateOptions["type"]> {
    switch (type) {
      case ChannelType.GuildVoice:
        return ChannelType.GuildVoice;
      case ChannelType.GuildCategory:
        return ChannelType.GuildCategory;
      case ChannelType.GuildAnnouncement:
        return ChannelType.GuildAnnouncement;
      case ChannelType.GuildStageVoice:
        return ChannelType.GuildStageVoice;
      case ChannelType.GuildForum:
        return ChannelType.GuildForum;
      case ChannelType.GuildMedia:
        return ChannelType.GuildMedia;
      case ChannelType.GuildText:
      default:
        return ChannelType.GuildText;
    }
  }
}

interface ApplyPayload {
  before: unknown;
  after: unknown;
  path: string;
  targetSnapshot?: DGitSnapshot;
}
