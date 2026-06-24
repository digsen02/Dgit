import {
  ActionRowBuilder,
  ButtonInteraction,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Interaction,
  ModalBuilder,
  ModalSubmitInteraction,
  PermissionFlagsBits,
  TextChannel,
  TextInputBuilder,
  TextInputStyle
} from "discord.js";
import { DGitService } from "../../dgit/DGitService.js";
import type { ApplyPlan, DGitDiff, ManifestCommitEntry } from "../../dgit/types/dgitTypes.js";
import { formatSummary } from "../../utils/text.js";
import { shortHash } from "../../utils/hash.js";
import { ConfirmRouter } from "./confirmRouter.js";
import { t } from "../../i18n/i18n.js";
import { LocalizedError } from "../../i18n/localizedError.js";
import {
  buildApplyResultEmbed,
  buildBranchListEmbed,
  buildIgnoreListEmbed,
  buildLinesEmbed,
  buildMergeConflictsEmbed,
  buildPagedTextEmbed,
  buildSimpleResultEmbed,
  buildStatusEmbed,
  buildTagListEmbed
} from "../embeds/dgitEmbeds.js";
import { paginateLines } from "../../utils/pagination.js";

export function hasManageGuildPermission(permissions: { has(permission: bigint): boolean } | null | undefined): boolean {
  return Boolean(permissions?.has(PermissionFlagsBits.Administrator) || permissions?.has(PermissionFlagsBits.ManageGuild));
}

type PendingRestore = {
  guildId: string;
  userId: string;
  repositoryChannelId: string;
  plan: ApplyPlan;
  expiresAt: number;
  confirmationWord: string;
  backupReason: string;
};

type PageSession = {
  guildId: string;
  userId: string;
  title: string;
  pages: string[];
  status?: "info" | "success" | "warning" | "danger" | "neutral";
  staticRows?: ActionRowBuilder<ButtonBuilder>[];
  allowedMentions?: { users: string[] };
  expiresAt: number;
};

export class InteractionRouter {
  private readonly pendingRestores = new Map<string, PendingRestore>();
  private readonly pageSessions = new Map<string, PageSession>();

  constructor(private readonly service = new DGitService(), private readonly confirms = new ConfirmRouter()) {}

  async route(interaction: Interaction): Promise<void> {
    if (interaction.isButton()) return this.routeButton(interaction);
    if (interaction.isModalSubmit()) return this.routeModal(interaction);
    if (!interaction.isChatInputCommand()) return;
    if (!interaction.guild) {
      await interaction.reply({ ephemeral: true, content: t(interaction.locale, "guildOnly") });
      return;
    }
    try {
      if (interaction.commandName === "dgit") await this.routeDgit(interaction);
      if (interaction.commandName === "dgit-branch") await this.routeBranch(interaction);
      if (interaction.commandName === "dgit-ignore") await this.routeIgnore(interaction);
      if (interaction.commandName === "dgit-merge") await this.routeMerge(interaction);
      if (interaction.commandName === "dgit-tag") await this.routeTag(interaction);
      if (interaction.commandName === "dgit-repo") await this.routeRepo(interaction);
      if (interaction.commandName === "dgit-admin") await this.routeAdmin(interaction);
    } catch (error) {
      const content = error instanceof LocalizedError
        ? t(interaction.locale, error.key, error.vars)
        : t(interaction.locale, "error", { message: error instanceof Error ? error.message : String(error) });
      if (interaction.deferred || interaction.replied) await interaction.editReply({ content });
      else await interaction.reply({ ephemeral: true, content });
    }
  }

  private async routeButton(interaction: import("discord.js").ButtonInteraction): Promise<void> {
    if (interaction.customId.startsWith("dgit:page:")) {
      await this.routePageButton(interaction);
      return;
    }
    if (interaction.customId === "dgit:status-diff") {
      if (!interaction.guild) {
        await interaction.reply({ ephemeral: true, content: t(interaction.locale, "guildOnly") });
        return;
      }
      await interaction.deferReply({ ephemeral: true });
      const { diff } = await this.service.status(interaction.guild);
      await this.editReplyWithPages(interaction, {
        title: t(interaction.locale, "diffTitle"),
        lines: this.diffLines(diff, t(interaction.locale, "noChanges")),
        status: diff.summary.dangerous > 0 ? "danger" : diff.changes.length > 0 ? "warning" : "success",
        userId: interaction.user.id
      });
      return;
    }
    if (interaction.customId === "dgit:status-refresh") {
      if (!interaction.guild) {
        await interaction.reply({ ephemeral: true, content: t(interaction.locale, "guildOnly") });
        return;
      }
      await interaction.deferUpdate();
      const { manifest, diff, clean } = await this.service.status(interaction.guild);
      await interaction.editReply({ content: "", embeds: [this.statusEmbed(interaction.locale, manifest.currentBranch, manifest.head, clean, formatSummary(diff.summary))], components: [this.statusButtons(interaction.locale, diff.changes.length, clean)] });
      return;
    }
    if (interaction.customId === "dgit:status-commit") {
      if (!hasManageGuildPermission(interaction.memberPermissions)) {
        await interaction.reply({ ephemeral: true, content: t(interaction.locale, "manageGuildRequired") });
        return;
      }
      const modal = new ModalBuilder()
        .setCustomId("dgit:commit-modal")
        .setTitle(t(interaction.locale, "commitModalTitle"))
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("message")
              .setLabel(t(interaction.locale, "commitMessage"))
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(256)
          )
        );
      await interaction.showModal(modal);
      return;
    }
    if (interaction.customId.startsWith("dgit:restore-cancel:")) {
      this.pendingRestores.delete(interaction.customId.replace("dgit:restore-cancel:", ""));
      await interaction.reply({ ephemeral: true, content: t(interaction.locale, "restoreCancelled") });
      return;
    }
    if (interaction.customId.startsWith("dgit:restore-confirm:")) {
      const token = interaction.customId.replace("dgit:restore-confirm:", "");
      const pending = this.pendingRestores.get(token);
      if (!(await this.validatePendingRestore(interaction, token, pending))) return;
      if (pending!.plan.dangerousCount > 0) {
        const modal = new ModalBuilder()
          .setCustomId(`dgit:restore-typed:${token}`)
          .setTitle(t(interaction.locale, "dangerousConfirmationModalTitle", { word: pending!.confirmationWord }))
          .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId("confirmation")
                .setLabel(t(interaction.locale, "dangerousConfirmationModalLabel", { word: pending!.confirmationWord }))
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(16)
            )
          );
        await interaction.showModal(modal);
        return;
      }
      await this.executePendingRestore(interaction, token, pending!);
      return;
    }
    await this.confirms.route(interaction);
  }

  private async routeModal(interaction: ModalSubmitInteraction): Promise<void> {
    if (interaction.customId.startsWith("dgit:restore-typed:")) {
      const token = interaction.customId.replace("dgit:restore-typed:", "");
      const pending = this.pendingRestores.get(token);
      if (!(await this.validatePendingRestore(interaction, token, pending))) return;
      const value = interaction.fields.getTextInputValue("confirmation").trim();
      if (value.toUpperCase() !== pending!.confirmationWord.toUpperCase()) {
        await interaction.reply({ ephemeral: true, content: t(interaction.locale, "dangerousConfirmationMismatch", { word: pending!.confirmationWord }) });
        return;
      }
      await this.executePendingRestore(interaction, token, pending!);
      return;
    }
    if (interaction.customId !== "dgit:commit-modal") return;
    if (!interaction.guild) {
      await interaction.reply({ ephemeral: true, content: t(interaction.locale, "guildOnly") });
      return;
    }
    if (!hasManageGuildPermission(interaction.memberPermissions)) {
      await interaction.reply({ ephemeral: true, content: t(interaction.locale, "manageGuildRequired") });
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    try {
      const message = interaction.fields.getTextInputValue("message");
      const result = await this.service.commit(interaction.guild, interaction.user.id, message);
      await interaction.editReply({ embeds: [buildSimpleResultEmbed({ title: t(interaction.locale, "commit"), description: t(interaction.locale, "createdCommit", { hash: shortHash(result.commit.hash), branch: result.commit.branch, summary: formatSummary(result.diff.summary) }) })] });
    } catch (error) {
      const content = error instanceof LocalizedError
        ? t(interaction.locale, error.key, error.vars)
        : t(interaction.locale, "error", { message: error instanceof Error ? error.message : String(error) });
      await interaction.editReply(content);
    }
  }

  private async validatePendingRestore(
    interaction: ButtonInteraction | ModalSubmitInteraction,
    token: string,
    pending: PendingRestore | undefined
  ): Promise<boolean> {
    if (!pending || pending.expiresAt < Date.now()) {
      this.pendingRestores.delete(token);
      await interaction.reply({ ephemeral: true, content: t(interaction.locale, "restoreExpired") });
      return false;
    }
    if (!interaction.guild || interaction.guild.id !== pending.guildId) {
      await interaction.reply({ ephemeral: true, content: t(interaction.locale, "restoreWrongGuild") });
      return false;
    }
    const isSameUser = interaction.user.id === pending.userId;
    const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
    if (!isSameUser && !isAdmin) {
      await interaction.reply({ ephemeral: true, content: t(interaction.locale, "restoreForbidden") });
      return false;
    }
    return true;
  }

  private async executePendingRestore(
    interaction: ButtonInteraction | ModalSubmitInteraction,
    token: string,
    pending: PendingRestore
  ): Promise<void> {
    if (!interaction.guild) {
      await interaction.reply({ ephemeral: true, content: t(interaction.locale, "guildOnly") });
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    try {
      const result = await this.service.applyRestorePlan(interaction.guild, pending.plan, pending.repositoryChannelId, interaction.user.id, pending.backupReason);
      this.pendingRestores.delete(token);
      await interaction.editReply({ embeds: [buildApplyResultEmbed({
        title: t(interaction.locale, "restoreFinished", { success: String(result.success.length), skipped: String(result.skipped.length), failed: String(result.failed.length), details: "" }),
        result,
        failedDetails: result.failed.slice(0, 5).map((f) => `${f.step.id}: ${f.error}`),
        skippedDetails: result.skipped.slice(0, 5).map((s) => `${s.step.id}: ${s.reason}`)
      })] });
    } catch (error) {
      const content = error instanceof LocalizedError
        ? t(interaction.locale, error.key, error.vars)
        : t(interaction.locale, "error", { message: error instanceof Error ? error.message : String(error) });
      await interaction.editReply(content);
    }
  }

  private async routeDgit(interaction: ChatInputCommandInteraction): Promise<void> {
    const sub = interaction.options.getSubcommand();
    if (sub === "init") {
      await interaction.deferReply({ ephemeral: true });
      this.requireAdmin(interaction);
      const channel = interaction.options.getChannel("channel", true);
      if (!(channel instanceof TextChannel)) throw new Error(t(interaction.locale, "repositoryMustBeText"));
      const result = await this.service.init(interaction.guild!, channel, interaction.user.id, interaction.locale);
      await interaction.editReply({ embeds: [buildSimpleResultEmbed({ title: "DGit Init", description: t(interaction.locale, "initialized", {
        channel: String(channel),
        hash: shortHash(result.commitHash),
        warnings: result.warnings.length ? t(interaction.locale, "warnings", { warnings: result.warnings.join("\n") }) : ""
      }) })] });
      return;
    }
    if (sub === "status") {
      await interaction.deferReply({ ephemeral: true });
      const { manifest, diff, clean } = await this.service.status(interaction.guild!);
      await interaction.editReply({ embeds: [this.statusEmbed(interaction.locale, manifest.currentBranch, manifest.head, clean, formatSummary(diff.summary))], components: [this.statusButtons(interaction.locale, diff.changes.length, clean)] });
      return;
    }
    if (sub === "commit") {
      await interaction.deferReply({ ephemeral: true });
      this.requireManageGuild(interaction);
      const message = interaction.options.getString("message", true);
      const result = await this.service.commit(interaction.guild!, interaction.user.id, message);
      await interaction.editReply({ embeds: [buildSimpleResultEmbed({ title: t(interaction.locale, "commit"), description: t(interaction.locale, "createdCommit", { hash: shortHash(result.commit.hash), branch: result.commit.branch, summary: formatSummary(result.diff.summary) }) })] });
      return;
    }
    if (sub === "log") {
      await interaction.deferReply({ ephemeral: true });
      const branch = interaction.options.getString("branch") ?? undefined;
      const limit = interaction.options.getInteger("limit") ?? 10;
      const entries = await this.service.log(interaction.guild!, branch, limit);
      await this.editReplyWithPages(interaction, {
        title: "DGit Commit Log",
        lines: this.logLines(entries, branch, t(interaction.locale, "noCommits")),
        userId: interaction.user.id,
        allowedMentions: { users: [] }
      });
      return;
    }
    if (sub === "diff") {
      await interaction.deferReply({ ephemeral: true });
      const diff = await this.service.diff(interaction.guild!, interaction.options.getString("from") ?? undefined, interaction.options.getString("to") ?? undefined);
      await this.editReplyWithPages(interaction, {
        title: t(interaction.locale, "diffTitle"),
        lines: this.diffLines(diff, t(interaction.locale, "noChanges")),
        status: diff.summary.dangerous > 0 ? "danger" : diff.changes.length > 0 ? "warning" : "success",
        userId: interaction.user.id
      });
      return;
    }
    if (sub === "restore") {
      await interaction.deferReply({ ephemeral: true });
      this.requireAdmin(interaction);
      const commit = interaction.options.getString("commit", true);
      const { plan, repository } = await this.service.restorePlan(interaction.guild!, commit);
      const token = `${interaction.id}-${Date.now().toString(36)}`;
      this.pendingRestores.set(token, {
        guildId: interaction.guild!.id,
        userId: interaction.user.id,
        repositoryChannelId: repository.id,
        plan,
        expiresAt: Date.now() + 5 * 60_000,
        confirmationWord: t(interaction.locale, "dangerousConfirmationRestoreWord"),
        backupReason: this.backupReason("restore", plan)
      });
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`dgit:restore-confirm:${token}`).setLabel(t(interaction.locale, "confirmRestore")).setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`dgit:restore-cancel:${token}`).setLabel(t(interaction.locale, "cancel")).setStyle(ButtonStyle.Secondary)
      );
      await this.editReplyWithPages(interaction, {
        title: t(interaction.locale, "restoreDryRunTitle"),
        lines: this.planLines(plan, undefined, {
          dangerousLabel: t(interaction.locale, "dangerousChanges"),
          stepsLabel: t(interaction.locale, "steps"),
          warningsLabel: t(interaction.locale, "warnings", { warnings: "" }).trim() || "Warnings",
          noneText: t(interaction.locale, "none"),
          noChangesText: t(interaction.locale, "noChanges")
        }),
        status: plan.dangerousCount > 0 ? "danger" : "warning",
        userId: interaction.user.id,
        staticRows: [row]
      });
      return;
    }
    if (sub === "verify") {
      await interaction.deferReply({ ephemeral: true });
      await this.editReplyWithPages(interaction, { title: "DGit Verify", lines: await this.service.verify(interaction.guild!, interaction.locale), emptyText: t(interaction.locale, "none"), userId: interaction.user.id });
      return;
    }
    if (sub === "check-permission") {
      await interaction.deferReply({ ephemeral: true });
      await interaction.editReply({ embeds: [buildLinesEmbed({ title: "DGit Permission Report", lines: await this.service.permissionReport(interaction.guild!, interaction.locale), emptyText: t(interaction.locale, "none"), fieldName: "Permissions" })] });
    }
  }

  private async routeBranch(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });
    const sub = interaction.options.getSubcommand();
    if (sub === "create") {
      this.requireManageGuild(interaction);
      const manifest = await this.service.branchCreate(interaction.guild!, interaction.options.getString("name", true), interaction.user.id, interaction.options.getString("from") ?? undefined);
      const name = interaction.options.getString("name", true);
      await interaction.editReply({ embeds: [buildSimpleResultEmbed({ title: "Branch Created", description: t(interaction.locale, "createdBranch", { name, hash: manifest.branches[name]?.head ? shortHash(manifest.branches[name]!.head!) : t(interaction.locale, "none") }) })] });
      return;
    }
    if (sub === "list") {
      const { manifest } = await this.service.loadRepo(interaction.guild!);
      await interaction.editReply({ embeds: [buildBranchListEmbed(Object.values(manifest.branches), manifest.currentBranch, t(interaction.locale, "none"))] });
      return;
    }
    if (sub === "checkout") {
      this.requireAdmin(interaction);
      const branch = interaction.options.getString("branch", true);
      const { result, manifest, plan } = await this.service.checkoutAndApply(interaction.guild!, branch);
      const failed = result.failed.slice(0, 8).map((item) => `${item.step.id}: ${item.error}`);
      const skipped = result.skipped.slice(0, 8).map((item) => `${item.step.id}: ${item.reason}`);
      if (result.failed.length > 0 || result.skipped.length > 0) {
        await interaction.editReply({ embeds: [buildApplyResultEmbed({
          title: "Checkout Partial",
          description: t(interaction.locale, "checkoutPartial", {
          branch,
          steps: String(plan.steps.length),
          success: String(result.success.length),
          skipped: String(result.skipped.length),
          failed: String(result.failed.length),
          currentBranch: manifest.currentBranch
          }),
          result,
          skippedDetails: skipped,
          failedDetails: failed
        })] });
        return;
      }
      await interaction.editReply({ embeds: [buildSimpleResultEmbed({ title: "Checkout Complete", description: t(interaction.locale, "checkoutSuccess", {
        branch,
        steps: String(plan.steps.length),
        currentBranch: manifest.currentBranch,
        success: String(result.success.length)
      }) })] });
      return;
    }
    if (sub === "apply") {
      this.requireAdmin(interaction);
      const branch = interaction.options.getString("branch", true);
      const { plan, repository } = await this.service.branchApplyPlan(interaction.guild!, branch);
      const token = `${interaction.id}-${Date.now().toString(36)}`;
      this.pendingRestores.set(token, {
        guildId: interaction.guild!.id,
        userId: interaction.user.id,
        repositoryChannelId: repository.id,
        plan,
        expiresAt: Date.now() + 5 * 60_000,
        confirmationWord: t(interaction.locale, "dangerousConfirmationApplyWord"),
        backupReason: this.backupReason(`branch apply ${branch}`, plan)
      });
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`dgit:restore-confirm:${token}`).setLabel(t(interaction.locale, "confirmRestore")).setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`dgit:restore-cancel:${token}`).setLabel(t(interaction.locale, "cancel")).setStyle(ButtonStyle.Secondary)
      );
      const previewLabels = {
        dangerousLabel: t(interaction.locale, "dangerousChanges"),
        stepsLabel: t(interaction.locale, "steps"),
        warningsLabel: t(interaction.locale, "warnings", { warnings: "" }).trim() || "Warnings",
        noneText: t(interaction.locale, "none"),
        noChangesText: t(interaction.locale, "noChanges")
      };
      await this.editReplyWithPages(interaction, {
        title: "Branch Apply Preview",
        lines: this.planLines(plan, branch, previewLabels),
        status: plan.dangerousCount > 0 ? "danger" : "warning",
        userId: interaction.user.id,
        staticRows: [row]
      });
      return;
    }
    if (sub === "delete") {
      this.requireAdmin(interaction);
      const branch = interaction.options.getString("branch", true);
      await this.service.branchDelete(interaction.guild!, branch);
      await interaction.editReply({ embeds: [buildSimpleResultEmbed({ title: "Branch Deleted", description: t(interaction.locale, "deletedBranch", { name: branch }) })] });
    }
  }

  private async routeMerge(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });
    this.requireAdmin(interaction);
    const source = interaction.options.getString("from", true);
    const target = interaction.options.getString("to", true);
    const result = await this.service.merge(interaction.guild!, source, target, interaction.user.id);
    if (result.conflicts.length > 0) {
      await interaction.editReply({ embeds: [buildMergeConflictsEmbed("Merge Conflicts", result.conflicts, String(result.mergeId))] });
      return;
    }
    await interaction.editReply({ embeds: [buildSimpleResultEmbed({ title: "Merge Complete", description: t(interaction.locale, "mergeSucceeded", {
      source,
      target,
      hash: result.commit ? shortHash(result.commit.hash) : "unknown",
      summary: result.diff ? formatSummary(result.diff.summary) : ""
    }) })] });
  }

  private async routeTag(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });
    const sub = interaction.options.getSubcommand();
    if (sub === "create") {
      this.requireManageGuild(interaction);
      const name = interaction.options.getString("name", true);
      const manifest = await this.service.tagCreate(interaction.guild!, name, interaction.options.getString("commit") ?? undefined);
      await interaction.editReply({ embeds: [buildSimpleResultEmbed({ title: "Tag Created", description: t(interaction.locale, "createdTag", { name, hash: shortHash(manifest.tags[name]!) }) })] });
      return;
    }
    if (sub === "list") {
      const { manifest } = await this.service.loadRepo(interaction.guild!);
      await interaction.editReply({ embeds: [buildTagListEmbed(manifest.tags, t(interaction.locale, "none"))] });
      return;
    }
    if (sub === "delete") {
      this.requireManageGuild(interaction);
      const name = interaction.options.getString("name", true);
      await this.service.tagDelete(interaction.guild!, name);
      await interaction.editReply({ embeds: [buildSimpleResultEmbed({ title: "Tag Deleted", description: t(interaction.locale, "deletedTag", { name }) })] });
    }
  }

  private async routeRepo(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });
    const sub = interaction.options.getSubcommand();
    if (sub === "repair") {
      this.requireAdmin(interaction);
      const result = await this.service.repoRepair(interaction.guild!, interaction.user.id);
      await interaction.editReply({ embeds: [buildSimpleResultEmbed({ title: "Repository Repair", description: t(interaction.locale, "repairComplete", {
        scanned: String(result.scanned),
        commits: String(result.commits),
        sequence: String(result.manifest.manifestSequence)
      }) })] });
      return;
    }
    if (sub === "export") {
      const result = await this.service.exportSnapshot(interaction.guild!, interaction.options.getString("commit") ?? undefined);
      await interaction.editReply({ embeds: [buildSimpleResultEmbed({ title: "Repository Export", description: t(interaction.locale, "exportedFile", { filename: result.filename }), fields: [{ name: "Filename", value: result.filename }] })], files: [result.attachment] });
      return;
    }
    if (sub === "history") {
      const lines = await this.service.history(interaction.guild!, interaction.options.getString("target", true) as "channel" | "role" | "guild", interaction.options.getString("id") ?? undefined);
      await this.editReplyWithPages(interaction, { title: "DGit History", lines, emptyText: t(interaction.locale, "none"), userId: interaction.user.id });
      return;
    }
    if (sub === "blame") {
      const lines = await this.service.blame(interaction.guild!, interaction.options.getString("target", true) as "channel" | "role" | "guild", interaction.options.getString("id") ?? undefined);
      await this.editReplyWithPages(interaction, { title: "DGit Blame", lines, emptyText: t(interaction.locale, "none"), userId: interaction.user.id });
    }
  }

  private async routeAdmin(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });
    this.requireAdmin(interaction);
    const group = interaction.options.getSubcommandGroup(true);
    const sub = interaction.options.getSubcommand();
    if (group === "watch") {
      await this.service.setWatch(interaction.guild!, sub === "enable");
      await interaction.editReply({ embeds: [buildSimpleResultEmbed({ title: "Watch", description: sub === "enable" ? t(interaction.locale, "watchEnabled") : t(interaction.locale, "watchDisabled") })] });
      return;
    }
    if (group === "autocommit") {
      await this.service.setAutocommit(interaction.guild!, sub === "enable");
      await interaction.editReply({ embeds: [buildSimpleResultEmbed({ title: "Autocommit", description: sub === "enable" ? t(interaction.locale, "autocommitEnabled") : t(interaction.locale, "autocommitDisabled") })] });
      return;
    }
    if (group === "maintenance" && sub === "on") {
      const { plan, repository } = await this.service.maintenancePlan(interaction.guild!);
      const token = `${interaction.id}-${Date.now().toString(36)}`;
      this.pendingRestores.set(token, {
        guildId: interaction.guild!.id,
        userId: interaction.user.id,
        repositoryChannelId: repository.id,
        plan,
        expiresAt: Date.now() + 5 * 60_000,
        confirmationWord: t(interaction.locale, "dangerousConfirmationApplyWord"),
        backupReason: this.backupReason("maintenance on", plan)
      });
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`dgit:restore-confirm:${token}`).setLabel(t(interaction.locale, "confirmRestore")).setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`dgit:restore-cancel:${token}`).setLabel(t(interaction.locale, "cancel")).setStyle(ButtonStyle.Secondary)
      );
      const previewLabels = {
        dangerousLabel: t(interaction.locale, "dangerousChanges"),
        stepsLabel: t(interaction.locale, "steps"),
        warningsLabel: t(interaction.locale, "warnings", { warnings: "" }).trim() || "Warnings",
        noneText: t(interaction.locale, "none"),
        noChangesText: t(interaction.locale, "noChanges")
      };
      await this.editReplyWithPages(interaction, {
        title: "Maintenance Preview",
        lines: this.planLines(plan, undefined, previewLabels),
        status: plan.dangerousCount > 0 ? "danger" : "warning",
        userId: interaction.user.id,
        staticRows: [row]
      });
      return;
    }
    if (group === "maintenance" && sub === "off") {
      const { plan, repository, manifest } = await this.service.maintenanceOffPlan(interaction.guild!);
      const token = `${interaction.id}-${Date.now().toString(36)}`;
      this.pendingRestores.set(token, {
        guildId: interaction.guild!.id,
        userId: interaction.user.id,
        repositoryChannelId: repository.id,
        plan,
        expiresAt: Date.now() + 5 * 60_000,
        confirmationWord: t(interaction.locale, "dangerousConfirmationApplyWord"),
        backupReason: this.backupReason("maintenance off", plan)
      });
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`dgit:restore-confirm:${token}`).setLabel(t(interaction.locale, "confirmRestore")).setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`dgit:restore-cancel:${token}`).setLabel(t(interaction.locale, "cancel")).setStyle(ButtonStyle.Secondary)
      );
      const previewLabels = {
        dangerousLabel: t(interaction.locale, "dangerousChanges"),
        stepsLabel: t(interaction.locale, "steps"),
        warningsLabel: t(interaction.locale, "warnings", { warnings: "" }).trim() || "Warnings",
        noneText: t(interaction.locale, "none"),
        noChangesText: t(interaction.locale, "noChanges")
      };
      await this.editReplyWithPages(interaction, {
        title: "Maintenance Off Preview",
        lines: this.planLines(plan, manifest.currentBranch, previewLabels),
        status: plan.dangerousCount > 0 ? "danger" : "warning",
        userId: interaction.user.id,
        staticRows: [row]
      });
    }
  }

  private async routeIgnore(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });
    const sub = interaction.options.getSubcommand();
    if (sub === "list") {
      const { manifest } = await this.service.loadRepo(interaction.guild!);
      await interaction.editReply({ embeds: [buildIgnoreListEmbed(manifest.ignore, {
        channels: t(interaction.locale, "channels"),
        roles: t(interaction.locale, "roles"),
        types: t(interaction.locale, "types"),
        patterns: t(interaction.locale, "patterns"),
        none: t(interaction.locale, "none")
      })] });
      return;
    }
    const type = interaction.options.getString("type", true) as "channel" | "role" | "objectType" | "pattern";
    const value = interaction.options.getString("value", true);
    this.requireManageGuild(interaction);
    if (sub === "add") await this.service.addIgnore(interaction.guild!, type, value);
    if (sub === "remove") await this.service.removeIgnore(interaction.guild!, type, value);
    await interaction.editReply({ embeds: [buildSimpleResultEmbed({ title: "Ignore Rule", description: `${t(interaction.locale, sub === "add" ? "added" : "removed")} ${t(interaction.locale, "ignoreRule", { type, value })}` })] });
  }

  private async routePageButton(interaction: ButtonInteraction): Promise<void> {
    const [, , token, pageText] = interaction.customId.split(":");
    const pageIndex = Number(pageText);
    const session = token ? this.pageSessions.get(token) : undefined;
    if (!session || session.expiresAt < Date.now()) {
      if (token) this.pageSessions.delete(token);
      await interaction.reply({ ephemeral: true, content: "This paged response has expired. Run the command again." });
      return;
    }
    if (!interaction.guild || interaction.guild.id !== session.guildId) {
      await interaction.reply({ ephemeral: true, content: t(interaction.locale, "guildOnly") });
      return;
    }
    if (interaction.user.id !== session.userId) {
      await interaction.reply({ ephemeral: true, content: "Only the original requester can use these page buttons." });
      return;
    }
    if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= session.pages.length) {
      await interaction.reply({ ephemeral: true, content: "Invalid page." });
      return;
    }
    await interaction.deferUpdate();
    await interaction.editReply({
      embeds: [this.pageEmbed(session, pageIndex)],
      components: this.pageComponents(token!, session, pageIndex),
      ...(session.allowedMentions ? { allowedMentions: session.allowedMentions } : {})
    });
  }

  private async editReplyWithPages(
    interaction: ChatInputCommandInteraction | ButtonInteraction,
    options: {
      title: string;
      lines: string[];
      emptyText?: string;
      status?: "info" | "success" | "warning" | "danger" | "neutral";
      userId: string;
      staticRows?: ActionRowBuilder<ButtonBuilder>[];
      allowedMentions?: { users: string[] };
    }
  ): Promise<void> {
    if (!interaction.guild) throw new Error(t(interaction.locale, "guildOnly"));
    const lines = options.lines.length > 0 ? options.lines : [options.emptyText ?? "No entries."];
    const pages = paginateLines(lines);
    const session: PageSession = {
      guildId: interaction.guild.id,
      userId: options.userId,
      title: options.title,
      pages,
      ...(options.status ? { status: options.status } : {}),
      ...(options.staticRows ? { staticRows: options.staticRows } : {}),
      ...(options.allowedMentions ? { allowedMentions: options.allowedMentions } : {}),
      expiresAt: Date.now() + 15 * 60_000
    };
    const token = `${interaction.id}-${Date.now().toString(36)}`;
    if (pages.length > 1) this.pageSessions.set(token, session);
    await interaction.editReply({
      embeds: [this.pageEmbed(session, 0)],
      components: pages.length > 1 ? this.pageComponents(token, session, 0) : options.staticRows ?? [],
      ...(options.allowedMentions ? { allowedMentions: options.allowedMentions } : {})
    });
  }

  private pageEmbed(session: PageSession, pageIndex: number): EmbedBuilder {
    return buildPagedTextEmbed({
      title: session.title,
      page: session.pages[pageIndex] ?? session.pages[0] ?? "No entries.",
      pageNumber: pageIndex + 1,
      pageCount: session.pages.length,
      ...(session.status ? { status: session.status } : {})
    });
  }

  private pageComponents(token: string, session: PageSession, pageIndex: number): ActionRowBuilder<ButtonBuilder>[] {
    const rows = [...(session.staticRows ?? [])];
    if (session.pages.length <= 1) return rows;
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`dgit:page:${token}:${pageIndex - 1}`)
        .setLabel("Previous")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(pageIndex <= 0),
      new ButtonBuilder()
        .setCustomId(`dgit:page:${token}:${pageIndex + 1}`)
        .setLabel("Next")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(pageIndex >= session.pages.length - 1)
    ));
    return rows;
  }

  private diffLines(diff: DGitDiff, noChangesText: string): string[] {
    return [
      `Summary: ${formatSummary(diff.summary)}`,
      "",
      ...(diff.changes.length > 0
        ? diff.changes.map((change) => `${change.severity === "dangerous" ? "!" : change.op} ${change.humanSummary}`)
        : [noChangesText])
    ];
  }

  private logLines(entries: ManifestCommitEntry[], branch: string | undefined, noCommitsText: string): string[] {
    if (entries.length === 0) return [`Branch: ${branch ?? "current"}`, noCommitsText];
    return [
      `Branch: ${branch ?? "current"}`,
      `Commits: ${entries.length}`,
      "",
      ...entries.flatMap((entry) => [
        `${shortHash(entry.hash)} - ${entry.message}`,
        `Author: <@${entry.authorId}>`,
        `Branch: ${entry.branch}`,
        `Time: ${entry.createdAt}`,
        `Summary: ${formatSummary(entry.summary)}`,
        ""
      ])
    ];
  }

  private planLines(
    plan: ApplyPlan,
    branch: string | undefined,
    labels: {
      dangerousLabel: string;
      stepsLabel: string;
      warningsLabel: string;
      noneText: string;
      noChangesText: string;
    }
  ): string[] {
    return [
      ...(branch ? [`Branch: ${branch}`] : []),
      `${labels.dangerousLabel}: ${plan.dangerousCount}`,
      `${labels.stepsLabel}: ${plan.steps.length}`,
      `${labels.warningsLabel}:`,
      ...(plan.warnings.length > 0 ? plan.warnings : [labels.noneText]),
      "",
      "Planned steps:",
      ...(plan.steps.length > 0 ? plan.steps.map((step) => `${step.dangerous ? "!" : "-"} ${step.description}`) : [labels.noChangesText])
    ];
  }

  private requireAdmin(interaction: ChatInputCommandInteraction): void {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) throw new Error(t(interaction.locale, "adminRequired"));
  }

  private requireManageGuild(interaction: ChatInputCommandInteraction): void {
    if (!hasManageGuildPermission(interaction.memberPermissions)) throw new Error(t(interaction.locale, "manageGuildRequired"));
  }

  private statusEmbed(locale: string, branch: string, head: string | null, clean: boolean, summary: string) {
    return buildStatusEmbed({
      title: t(locale, "statusTitle"),
      branchLabel: t(locale, "branch"),
      headLabel: t(locale, "head"),
      workingTreeLabel: t(locale, "workingTree"),
      changesLabel: t(locale, "changes"),
      branch,
      head,
      clean,
      cleanText: t(locale, "clean"),
      dirtyText: t(locale, "dirty"),
      noneText: t(locale, "none"),
      summary
    });
  }

  private backupReason(label: string, plan: ApplyPlan): string {
    const targetHash = plan.targetSnapshot?.stateHash ? ` ${shortHash(plan.targetSnapshot.stateHash)}` : "";
    return `${label}${targetHash}`;
  }

  private statusButtons(locale: string, changeCount: number, clean: boolean): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("dgit:status-diff").setLabel(t(locale, "viewDiff")).setStyle(ButtonStyle.Secondary).setDisabled(changeCount === 0),
      new ButtonBuilder().setCustomId("dgit:status-commit").setLabel(t(locale, "commit")).setStyle(ButtonStyle.Primary).setDisabled(clean),
      new ButtonBuilder().setCustomId("dgit:status-refresh").setLabel(t(locale, "refresh")).setStyle(ButtonStyle.Secondary)
    );
  }
}
