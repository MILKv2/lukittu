import {
  Client,
  GatewayIntentBits,
  Events,
  Collection,
  Routes,
  MessageFlags,
  ActivityType,
} from 'discord.js';
import * as fs from 'fs';
import * as path from 'path';
import { Command } from './structures/command';
import { REST } from '@discordjs/rest';
import { prisma } from '@lukittu/prisma';
import { logger } from './lib/logging/logger';

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.commands = new Collection<string, Command>();
const commands: Command[] = [];

// Function to load all commands
async function loadCommands() {
  const commandsPath = path.join(__dirname, 'commands');
  const commandFolders = fs.readdirSync(commandsPath);

  for (const folder of commandFolders) {
    const folderPath = path.join(commandsPath, folder);
    const commandFiles = fs
      .readdirSync(folderPath)
      .filter((file) => file.endsWith('.ts'));

    for (const file of commandFiles) {
      const filePath = path.join(folderPath, file);
      const command = (await import(filePath)).default;

      // Set a new item in the Collection with the key as the command name and the value as the command module
      if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        commands.push(command.data);
      } else {
        logger.info(
          `The command at ${filePath} is missing a required "data" or "execute" property.`,
        );
      }
    }
  }
}

// Register slash commands with Discord
async function registerCommands() {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const token = process.env.DISCORD_BOT_TOKEN;

  if (!clientId) {
    logger.error('Missing DISCORD_CLIENT_ID in environment variables');
    return;
  }

  if (!token) {
    logger.error('Missing DISCORD_BOT_TOKEN in environment variables');
    return;
  }

  const rest = new REST().setToken(token);

  try {
    logger.info(
      `Started refreshing ${commands.length} application (/) commands.`,
    );

    // The route depends on whether you want to register commands globally or for a specific guild
    await rest.put(Routes.applicationCommands(clientId), { body: commands });

    logger.info(`Successfully reloaded application (/) commands.`);
  } catch (error) {
    logger.error(error);
  }
}

// Handle interactions
client.on(Events.InteractionCreate, async (interaction) => {
  // Check if the user has a linked Discord account
  const checkLinkedAccount = async (userId: string) => {
    const discordAccount = await prisma.discordAccount.findUnique({
      where: { discordId: userId },
    });
    return !!discordAccount;
  };

  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);

    if (!command) {
      logger.error(`No command matching ${interaction.commandName} was found.`);
      return;
    }

    try {
      // Check if the user has linked their Discord account
      const hasLinkedAccount = await checkLinkedAccount(interaction.user.id);

      if (!hasLinkedAccount) {
        return interaction.reply({
          content:
            'You need to link your Discord account before using this command.',
          flags: MessageFlags.Ephemeral,
        });
      }

      // Defer the reply to handle long-running commands
      await interaction.deferReply({
        flags: command.data.ephemeral ? MessageFlags.Ephemeral : undefined,
      });

      await command.execute(interaction);
    } catch (error) {
      logger.error(`Error executing ${interaction.commandName}`);
      logger.error(error);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: 'There was an error executing this command!',
          flags: MessageFlags.Ephemeral,
        });
      } else {
        await interaction.reply({
          content: 'There was an error executing this command!',
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  } else if (interaction.isAutocomplete()) {
    const command = client.commands.get(interaction.commandName);

    if (!command || !command.autocomplete) {
      logger.error(
        `No autocomplete handler for ${interaction.commandName} was found.`,
      );
      return;
    }

    try {
      // For autocomplete, we still check if the account is linked
      const hasLinkedAccount = await checkLinkedAccount(interaction.user.id);

      if (!hasLinkedAccount) {
        // If not linked, return an empty response
        return interaction.respond([]);
      }

      await command.autocomplete(interaction);
    } catch (error) {
      logger.error(
        `Error handling autocomplete for ${interaction.commandName}`,
      );
      logger.error(error);
    }
  }
});

async function updateBotStatus() {
  try {
    const licenseCount = await prisma.license.count();

    client.user?.setActivity({
      name: `${licenseCount} licenses`,
      type: ActivityType.Watching,
    });

    logger.info(`Updated status: Watching ${licenseCount} licenses`);
  } catch (error) {
    logger.error('Failed to update bot status:', error);
  }
}

client.once(Events.ClientReady, () => {
  logger.info('Ready!');
  registerCommands().catch(logger.error);

  updateBotStatus();

  // Update status every 30 minutes (1800000 ms)
  setInterval(
    () => {
      updateBotStatus();
    },
    30 * 60 * 1000,
  );
});

// Load commands and login
(async () => {
  try {
    await loadCommands();
    await client.login(process.env.DISCORD_BOT_TOKEN);
  } catch (error) {
    logger.error('Failed to initialize:', error);
  }
})();
