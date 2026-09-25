import { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { getSupportServerUrl } from '../../utils/supportServer.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
    .setName("support")
    .setDescription("Get link to the support server"),

  async execute(interaction) {
    try {
      const supportUrl = getSupportServerUrl();
      const components = [];
      if (supportUrl) {
        const supportButton = new ButtonBuilder()
          .setLabel("Support Server")
          .setStyle(ButtonStyle.Link)
          .setURL(supportUrl);
        components.push(new ActionRowBuilder().addComponents(supportButton));
      }

      await InteractionHelper.safeReply(interaction, {
        embeds: [
          createEmbed({ title: "Need Help?", description: supportUrl
            ? "Open our support server for assistance or suggestions. You must already be a member to access it."
            : "The support server is being set up and is not available yet." }),
        ],
        components,
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      logger.error('Support command error:', error);
      
      try {
        return await InteractionHelper.safeReply(interaction, {
          embeds: [createEmbed({ title: 'System Error', description: 'Could not display support information.', color: 'error' })],
          flags: MessageFlags.Ephemeral,
        });
      } catch (replyError) {
        logger.error('Failed to send error reply:', replyError);
      }
    }
  },
};
