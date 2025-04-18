import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';

export interface Command {
  data: RESTPostAPIChatInputApplicationCommandsJSONBody & {
    ephemeral?: boolean;
  };
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

export const Command = (options: Command): Command => options;
