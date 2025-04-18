import { ApplicationCommandOptionType } from 'discord.js';
import { Command } from '../../structures/command';
import { logger } from '../../lib/logging/logger';
import { prisma } from '@lukittu/prisma';
import { regex } from '../../lib/constants/regex';

export default Command({
  data: {
    name: 'choose-team',
    description: 'Choose a team to use with this bot',
    ephemeral: true,
    options: [
      {
        name: 'team',
        description: 'The team to select',
        type: ApplicationCommandOptionType.String,
        required: true,
        autocomplete: true,
      },
    ],
  },
  autocomplete: async (interaction) => {
    try {
      const discordAccount = await prisma.discordAccount.findUnique({
        where: {
          discordId: interaction.user.id,
        },
        include: {
          user: {
            include: {
              teams: {
                where: {
                  deletedAt: null,
                },
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      });

      if (!discordAccount) {
        return interaction.respond([]);
      }

      const teams = discordAccount.user.teams;

      const focusedValue = interaction.options.getFocused().toLowerCase();
      const filtered = teams.filter((team) =>
        team.name.toLowerCase().includes(focusedValue),
      );

      await interaction.respond(
        filtered.map((team) => ({
          name: team.name,
          value: team.id,
        })),
      );
    } catch (error) {
      logger.error('Error in choose-team autocomplete:', error);
      await interaction.respond([]);
    }
  },
  execute: async (interaction) => {
    try {
      const teamId = interaction.options.getString('team', true);

      if (!regex.uuidV4.test(teamId)) {
        await interaction.editReply({
          content: 'Invalid team ID format.',
        });
        return;
      }

      const discordAccount = await prisma.discordAccount.findUnique({
        where: {
          discordId: interaction.user.id,
        },
        include: {
          user: {
            include: {
              teams: {
                where: {
                  id: teamId,
                  deletedAt: null,
                },
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      });

      if (!discordAccount) {
        await interaction.editReply({
          content: 'You need to link your Discord account first.',
        });
        return;
      }

      const isInTeam = Boolean(discordAccount.user.teams.length);

      if (!isInTeam) {
        await interaction.editReply({
          content:
            'You are not a member of this team or the team does not exist.',
        });
        return;
      }

      // Find the selected team name
      const team = discordAccount.user.teams[0];

      // Update the Discord account with the selected team
      await prisma.discordAccount.update({
        where: {
          id: discordAccount.id,
        },
        data: {
          selectedTeamId: teamId,
        },
      });

      await interaction.editReply({
        content: `You have selected the team: ${team.name}`,
      });
    } catch (error) {
      logger.error('Error in choose-team command:', error);
      await interaction.editReply({
        content: 'An error occurred while selecting the team.',
      });
    }
  },
});
