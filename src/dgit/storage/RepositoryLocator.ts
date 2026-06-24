import { ChannelType, Guild, PermissionFlagsBits, TextChannel } from "discord.js";
import { t } from "../../i18n/i18n.js";
import { LocalizedError } from "../../i18n/localizedError.js";

export interface RepositoryExposure {
  everyoneCanView: boolean;
  everyoneCanSend: boolean;
  everyoneCanAttach: boolean;
}

export function repositoryExposure(channel: TextChannel): RepositoryExposure {
  const permissions = channel.permissionsFor(channel.guild.roles.everyone);
  return {
    everyoneCanView: permissions?.has(PermissionFlagsBits.ViewChannel) ?? false,
    everyoneCanSend: permissions?.has(PermissionFlagsBits.SendMessages) ?? false,
    everyoneCanAttach: permissions?.has(PermissionFlagsBits.AttachFiles) ?? false
  };
}

export class RepositoryLocator {
  async locate(guild: Guild): Promise<TextChannel | null> {
    await guild.channels.fetch();
    const textChannels = guild.channels.cache.filter((channel): channel is TextChannel => channel?.type === ChannelType.GuildText);
    const marker = `DGIT_REPOSITORY:guild=${guild.id}`;
    const byTopic = textChannels.find((channel) => channel.topic?.includes(marker));
    if (byTopic) return byTopic;
    const byName = textChannels.find((channel) => ["dgit-repository", "server-git", "git-store"].includes(channel.name));
    return byName ?? null;
  }

  async prepare(channel: TextChannel, guildId: string, locale: string): Promise<{ topicSet: boolean; warnings: string[] }> {
    const warnings: string[] = [];
    const me = channel.guild.members.me;
    if (!me) throw new LocalizedError("repositoryBotMemberUnavailable");
    const permissions = channel.permissionsFor(me);
    if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ManageMessages])) {
      throw new LocalizedError("repositoryChannelPermissionsRequired");
    }
    const exposure = repositoryExposure(channel);
    if (exposure.everyoneCanView || exposure.everyoneCanSend || exposure.everyoneCanAttach) {
      throw new LocalizedError("repositoryChannelPubliclyAccessible");
    }
    let topicSet = false;
    if (permissions.has(PermissionFlagsBits.ManageChannels)) {
      const marker = `DGIT_REPOSITORY:guild=${guildId};repoVersion=1`;
      if (!channel.topic?.includes(`DGIT_REPOSITORY:guild=${guildId}`)) {
        await channel.setTopic(channel.topic ? `${channel.topic}\n${marker}` : marker, "Initialize DGit repository marker");
      }
      topicSet = true;
    } else {
      warnings.push(t(locale, "repositoryDiscoveryWarning"));
    }
    return { topicSet, warnings };
  }
}
