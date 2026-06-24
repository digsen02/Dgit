import { Guild, PermissionFlagsBits, TextChannel } from "discord.js";
import { t } from "../i18n/i18n.js";
import type { MessageKey } from "../i18n/messages.js";

export class PermissionChecker {
  check(guild: Guild, repositoryChannel: TextChannel | null | undefined, locale: string): string[] {
    const me = guild.members.me;
    if (!me) return [`[ ] ${t(locale, "permissionBotMemberUnavailable")}`];
    const guildPerms = me.permissions;
    const rows: string[] = [];
    const checks: Array<[MessageKey, bigint]> = [
      ["permissionViewChannel", PermissionFlagsBits.ViewChannel],
      ["permissionSendMessages", PermissionFlagsBits.SendMessages],
      ["permissionReadMessageHistory", PermissionFlagsBits.ReadMessageHistory],
      ["permissionAttachFiles", PermissionFlagsBits.AttachFiles],
      ["permissionManageMessages", PermissionFlagsBits.ManageMessages],
      ["permissionManageChannels", PermissionFlagsBits.ManageChannels],
      ["permissionManageRoles", PermissionFlagsBits.ManageRoles],
      ["permissionManageGuild", PermissionFlagsBits.ManageGuild],
      ["permissionViewAuditLog", PermissionFlagsBits.ViewAuditLog]
    ];

    for (const [key, bit] of checks) {
      const label = t(locale, key);
      rows.push(`${guildPerms.has(bit) ? "[x]" : "[ ]"} ${label}`);
    }

    if (repositoryChannel) {
      const channelPerms = repositoryChannel.permissionsFor(me);
      rows.push(`${channelPerms?.has(PermissionFlagsBits.ViewChannel) ? "[x]" : "[ ]"} ${t(locale, "permissionRepositoryVisible")}`);
      rows.push(`${channelPerms?.has(PermissionFlagsBits.AttachFiles) ? "[x]" : "[ ]"} ${t(locale, "permissionRepositoryAttachFiles")}`);
    }

    rows.push(me.roles.highest.managed ? `[ ] ${t(locale, "permissionBotRoleManaged")}` : `[x] ${t(locale, "permissionBotRoleMovable")}`);
    return rows;
  }
}
