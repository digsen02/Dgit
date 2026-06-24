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
import type { ApplyPlan } from "../../dgit/types/dgitTypes.js";
import { paginateLines } from "../../utils/pagination.js";
import { formatSummary, truncateDiscord } from "../../utils/text.js";
import { shortHash } from "../../utils/hash.js";
import { ConfirmRouter } from "./confirmRouter.js";
import { t } from "../../i18n/i18n.js";
import { LocalizedError } from "../../i18n/localizedError.js";

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

export class InteractionRouter {
  private readonly pendingRestores = new Map<string, PendingRestore>();

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
    if (interaction.customId === "dgit:status-diff") {
      if (!interaction.guild) {
        await interaction.reply({ ephemeral: true, content: t(interaction.locale, "guildOnly") });
        return;
      }
      await interaction.deferReply({ ephemeral: true });
      const { diff } = await this.service.status(interaction.guild);
      const lines = diff.changes.map((change) => `${change.severity === "dangerous" ? "!" : change.op} ${change.humanSummary}`);
      await interaction.editReply(`${t(interaction.locale, "diffTitle")}\n${formatSummary(diff.summary)}\n\n${paginateLines(lines)[0] ?? t(interaction.locale, "noChanges")}`);
      return;
    }
    if (interaction.customId === "dgit:status-refresh") {
      if (!interaction.guild) {
        await interaction.reply({ ephemeral: true, content: t(interaction.locale, "guildOnly") });
        return;
      }
      await interaction.deferUpdate();
      const { manifest, diff, clean } = await this.service.status(interaction.guild);
      await interaction.editReply({ content: this.formatStatus(interaction.locale, manifest.currentBranch, manifest.head, clean, formatSummary(diff.summary)), components: [this.statusButtons(interaction.locale, diff.changes.length, clean)] });
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
      await interaction.editReply(t(interaction.locale, "createdCommit", { hash: shortHash(result.commit.hash), branch: result.commit.branch, summary: formatSummary(result.diff.summary) }));
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
      await interaction.editReply(t(interaction.locale, "restoreFinished", {
        success: result.success.length,
        skipped: result.skipped.length,
        failed: result.failed.length,
        details: result.failed.length ? `\n${result.failed.slice(0, 5).map((f) => `${f.step.id}: ${f.error}`).join("\n")}` : ""
      }));
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
      await interaction.editReply(t(interaction.locale, "initialized", {
        channel: String(channel),
        hash: shortHash(result.commitHash),
        warnings: result.warnings.length ? t(interaction.locale, "warnings", { warnings: result.warnings.join("\n") }) : ""
      }));
      return;
    }
    if (sub === "status") {
      await interaction.deferReply({ ephemeral: true });
      const { manifest, diff, clean } = await this.service.status(interaction.guild!);
      await interaction.editReply({ content: this.formatStatus(interaction.locale, manifest.currentBranch, manifest.head, clean, formatSummary(diff.summary)), components: [this.statusButtons(interaction.locale, diff.changes.length, clean)] });
      return;
    }
    if (sub === "commit") {
      await interaction.deferReply({ ephemeral: true });
      this.requireManageGuild(interaction);
      const message = interaction.options.getString("message", true);
      const result = await this.service.commit(interaction.guild!, interaction.user.id, message);
      await interaction.editReply(t(interaction.locale, "createdCommit", { hash: shortHash(result.commit.hash), branch: result.commit.branch, summary: formatSummary(result.diff.summary) }));
      return;
    }
    if (sub === "log") {
      await interaction.deferReply({ ephemeral: true });
      const branch = interaction.options.getString("branch") ?? undefined;
      const limit = interaction.options.getInteger("limit") ?? 10;
      const entries = await this.service.log(interaction.guild!, branch, limit);
      const lines = entries.map((entry) => `${shortHash(entry.hash)} ${entry.message} by <@${entry.authorId}> ${entry.createdAt} ${formatSummary(entry.summary)}`);
      await interaction.editReply(truncateDiscord(lines.join("\n") || t(interaction.locale, "noCommits")));
      return;
    }
    if (sub === "diff") {
      await interaction.deferReply({ ephemeral: true });
      const diff = await this.service.diff(interaction.guild!, interaction.options.getString("from") ?? undefined, interaction.options.getString("to") ?? undefined);
      const lines = diff.changes.map((change) => `${change.severity === "dangerous" ? "!" : change.op} ${change.humanSummary}`);
      await interaction.editReply(`${t(interaction.locale, "diffTitle")}\n${formatSummary(diff.summary)}\n\n${paginateLines(lines)[0]}`);
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
      const lines = plan.steps.slice(0, 20).map((step) => `${step.dangerous ? "!" : "-"} ${step.description}`);
      const embed = new EmbedBuilder()
        .setTitle(t(interaction.locale, "restoreDryRunTitle"))
        .setDescription(truncateDiscord(lines.join("\n") || t(interaction.locale, "noChanges")))
        .addFields(
          { name: t(interaction.locale, "dangerousChanges"), value: String(plan.dangerousCount), inline: true },
          { name: t(interaction.locale, "steps"), value: String(plan.steps.length), inline: true },
          { name: t(interaction.locale, "warnings", { warnings: "" }).trim() || "Warnings", value: truncateDiscord(plan.warnings.join("\n") || t(interaction.locale, "none")), inline: false }
        );
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`dgit:restore-confirm:${token}`).setLabel(t(interaction.locale, "confirmRestore")).setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`dgit:restore-cancel:${token}`).setLabel(t(interaction.locale, "cancel")).setStyle(ButtonStyle.Secondary)
      );
      await interaction.editReply({ embeds: [embed], components: [row] });
      return;
    }
    if (sub === "verify") {
      await interaction.deferReply({ ephemeral: true });
      await interaction.editReply(truncateDiscord((await this.service.verify(interaction.guild!, interaction.locale)).join("\n")));
      return;
    }
    if (sub === "check-permission") {
      await interaction.deferReply({ ephemeral: true });
      await interaction.editReply((await this.service.permissionReport(interaction.guild!, interaction.locale)).join("\n"));
    }
  }

  private async routeBranch(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });
    const sub = interaction.options.getSubcommand();
    if (sub === "create") {
      this.requireManageGuild(interaction);
      const manifest = await this.service.branchCreate(interaction.guild!, interaction.options.getString("name", true), interaction.user.id, interaction.options.getString("from") ?? undefined);
      const name = interaction.options.getString("name", true);
      await interaction.editReply(t(interaction.locale, "createdBranch", { name, hash: manifest.branches[name]?.head ? shortHash(manifest.branches[name]!.head!) : t(interaction.locale, "none") }));
      return;
    }
    if (sub === "list") {
      const { manifest } = await this.service.loadRepo(interaction.guild!);
      const lines = Object.values(manifest.branches).map((branch) => `${branch.name === manifest.currentBranch ? "*" : " "} ${branch.name} ${branch.head ? shortHash(branch.head) : "none"}`);
      await interaction.editReply(lines.join("\n"));
      return;
    }
    if (sub === "checkout") {
      this.requireAdmin(interaction);
      const branch = interaction.options.getString("branch", true);
      const { result, manifest, plan } = await this.service.checkoutAndApply(interaction.guild!, branch);
      const failed = result.failed.slice(0, 8).map((item) => `${item.step.id}: ${item.error}`);
      const skipped = result.skipped.slice(0, 8).map((item) => `${item.step.id}: ${item.reason}`);
      if (result.failed.length > 0 || result.skipped.length > 0) {
        await interaction.editReply(truncateDiscord(`${t(interaction.locale, "checkoutPartial", {
          branch,
          steps: String(plan.steps.length),
          success: String(result.success.length),
          skipped: String(result.skipped.length),
          failed: String(result.failed.length),
          currentBranch: manifest.currentBranch
        })}\n${[...skipped, ...failed].join("\n")}`));
        return;
      }
      await interaction.editReply(t(interaction.locale, "checkoutSuccess", {
        branch,
        steps: String(plan.steps.length),
        currentBranch: manifest.currentBranch,
        success: String(result.success.length)
      }));
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
      const lines = plan.steps.slice(0, 20).map((step) => `${step.dangerous ? "!" : "-"} ${step.description}`);
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`dgit:restore-confirm:${token}`).setLabel(t(interaction.locale, "confirmRestore")).setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`dgit:restore-cancel:${token}`).setLabel(t(interaction.locale, "cancel")).setStyle(ButtonStyle.Secondary)
      );
      await interaction.editReply({ content: t(interaction.locale, "branchApplyPreview", { branch, dangerous: String(plan.dangerousCount), lines: truncateDiscord(`${lines.join("\n") || t(interaction.locale, "noChanges")}\n\n${plan.warnings.join("\n")}`) }), components: [row] });
      return;
    }
    if (sub === "delete") {
      this.requireAdmin(interaction);
      const branch = interaction.options.getString("branch", true);
      await this.service.branchDelete(interaction.guild!, branch);
      await interaction.editReply(t(interaction.locale, "deletedBranch", { name: branch }));
    }
  }

  private async routeMerge(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });
    this.requireAdmin(interaction);
    const source = interaction.options.getString("from", true);
    const target = interaction.options.getString("to", true);
    const result = await this.service.merge(interaction.guild!, source, target, interaction.user.id);
    if (result.conflicts.length > 0) {
      await interaction.editReply(`${t(interaction.locale, "mergeConflicts", { count: String(result.conflicts.length), mergeId: String(result.mergeId) })}\n${result.conflicts.slice(0, 10).map((c) => `${c.objectType}:${c.internalId}:${c.path} ${c.reason}`).join("\n")}`);
      return;
    }
    await interaction.editReply(t(interaction.locale, "mergeSucceeded", {
      source,
      target,
      hash: result.commit ? shortHash(result.commit.hash) : "unknown",
      summary: result.diff ? formatSummary(result.diff.summary) : ""
    }));
  }

  private async routeTag(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });
    const sub = interaction.options.getSubcommand();
    if (sub === "create") {
      this.requireManageGuild(interaction);
      const name = interaction.options.getString("name", true);
      const manifest = await this.service.tagCreate(interaction.guild!, name, interaction.options.getString("commit") ?? undefined);
      await interaction.editReply(t(interaction.locale, "createdTag", { name, hash: shortHash(manifest.tags[name]!) }));
      return;
    }
    if (sub === "list") {
      const { manifest } = await this.service.loadRepo(interaction.guild!);
      const lines = Object.entries(manifest.tags).map(([name, hash]) => `${name} ${shortHash(hash)}`);
      await interaction.editReply(lines.join("\n") || t(interaction.locale, "none"));
      return;
    }
    if (sub === "delete") {
      this.requireManageGuild(interaction);
      const name = interaction.options.getString("name", true);
      await this.service.tagDelete(interaction.guild!, name);
      await interaction.editReply(t(interaction.locale, "deletedTag", { name }));
    }
  }

  private async routeRepo(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });
    const sub = interaction.options.getSubcommand();
    if (sub === "repair") {
      this.requireAdmin(interaction);
      const result = await this.service.repoRepair(interaction.guild!, interaction.user.id);
      await interaction.editReply(t(interaction.locale, "repairComplete", {
        scanned: String(result.scanned),
        commits: String(result.commits),
        sequence: String(result.manifest.manifestSequence)
      }));
      return;
    }
    if (sub === "export") {
      const result = await this.service.exportSnapshot(interaction.guild!, interaction.options.getString("commit") ?? undefined);
      await interaction.editReply({ content: t(interaction.locale, "exportedFile", { filename: result.filename }), files: [result.attachment] });
      return;
    }
    if (sub === "history") {
      const lines = await this.service.history(interaction.guild!, interaction.options.getString("target", true) as "channel" | "role" | "guild", interaction.options.getString("id") ?? undefined);
      await interaction.editReply(truncateDiscord(lines.join("\n") || t(interaction.locale, "none")));
      return;
    }
    if (sub === "blame") {
      const lines = await this.service.blame(interaction.guild!, interaction.options.getString("target", true) as "channel" | "role" | "guild", interaction.options.getString("id") ?? undefined);
      await interaction.editReply(truncateDiscord(lines.join("\n") || t(interaction.locale, "none")));
    }
  }

  private async routeAdmin(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });
    this.requireAdmin(interaction);
    const group = interaction.options.getSubcommandGroup(true);
    const sub = interaction.options.getSubcommand();
    if (group === "watch") {
      await this.service.setWatch(interaction.guild!, sub === "enable");
      await interaction.editReply(sub === "enable" ? t(interaction.locale, "watchEnabled") : t(interaction.locale, "watchDisabled"));
      return;
    }
    if (group === "autocommit") {
      await this.service.setAutocommit(interaction.guild!, sub === "enable");
      await interaction.editReply(sub === "enable" ? t(interaction.locale, "autocommitEnabled") : t(interaction.locale, "autocommitDisabled"));
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
      await interaction.editReply({ content: t(interaction.locale, "maintenancePreview", {
        steps: String(plan.steps.length),
        dangerous: String(plan.dangerousCount),
        lines: truncateDiscord(`${plan.steps.slice(0, 20).map((step) => step.description).join("\n")}\n\n${plan.warnings.join("\n")}`)
      }), components: [row] });
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
      await interaction.editReply({ content: t(interaction.locale, "branchApplyPreview", {
        branch: manifest.currentBranch,
        dangerous: String(plan.dangerousCount),
        lines: truncateDiscord(`${plan.steps.slice(0, 20).map((step) => step.description).join("\n") || t(interaction.locale, "noChanges")}\n\n${plan.warnings.join("\n")}`)
      }), components: [row] });
    }
  }

  private async routeIgnore(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });
    const sub = interaction.options.getSubcommand();
    if (sub === "list") {
      const { manifest } = await this.service.loadRepo(interaction.guild!);
      await interaction.editReply(`${t(interaction.locale, "channels")}: ${manifest.ignore.channels.join(", ") || t(interaction.locale, "none")}\n${t(interaction.locale, "roles")}: ${manifest.ignore.roles.join(", ") || t(interaction.locale, "none")}\n${t(interaction.locale, "types")}: ${manifest.ignore.types.join(", ") || t(interaction.locale, "none")}\n${t(interaction.locale, "patterns")}: ${manifest.ignore.patterns.join(", ") || t(interaction.locale, "none")}`);
      return;
    }
    const type = interaction.options.getString("type", true) as "channel" | "role" | "objectType" | "pattern";
    const value = interaction.options.getString("value", true);
    this.requireManageGuild(interaction);
    if (sub === "add") await this.service.addIgnore(interaction.guild!, type, value);
    if (sub === "remove") await this.service.removeIgnore(interaction.guild!, type, value);
    await interaction.editReply(`${t(interaction.locale, sub === "add" ? "added" : "removed")} ${t(interaction.locale, "ignoreRule", { type, value })}`);
  }

  private requireAdmin(interaction: ChatInputCommandInteraction): void {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) throw new Error(t(interaction.locale, "adminRequired"));
  }

  private requireManageGuild(interaction: ChatInputCommandInteraction): void {
    if (!hasManageGuildPermission(interaction.memberPermissions)) throw new Error(t(interaction.locale, "manageGuildRequired"));
  }

  private formatStatus(locale: string, branch: string, head: string | null, clean: boolean, summary: string): string {
    return `${t(locale, "statusTitle")}\n${t(locale, "branch")}: ${branch}\n${t(locale, "head")}: ${head ? shortHash(head) : t(locale, "none")}\n${t(locale, "workingTree")}: ${clean ? t(locale, "clean") : t(locale, "dirty")}\n${t(locale, "changes")}: ${summary}`;
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
