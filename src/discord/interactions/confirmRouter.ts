import { ButtonInteraction } from "discord.js";
import { t } from "../../i18n/i18n.js";

export class ConfirmRouter {
  async route(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.customId.startsWith("dgit:")) return;
    await interaction.reply({ ephemeral: true, content: t(interaction.locale, "inactiveConfirmation") });
  }
}
