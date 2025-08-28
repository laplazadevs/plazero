import { CronJob } from 'cron';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween.js';
import timezone from 'dayjs/plugin/timezone.js';
import utc from 'dayjs/plugin/utc.js';
import { 
  BaseMessageOptions, 
  Client, 
  Events, 
  GatewayIntentBits, 
  TextChannel 
} from 'discord.js';
import dotenv from 'dotenv';

// Import our modular services
import { VoteManager } from './services/vote-manager.js';
import { setDiscordClient } from './handlers/vote-updates.js';
import { setDiscordClientForCompletion } from './handlers/vote-completion.js';
import { handleVoteReactionAdd, handleVoteReactionRemove } from './handlers/vote-reactions.js';
import { handleVoteTimeoutCommand, handleCancelVoteCommand } from './handlers/vote-commands.js';
import { processMessages, announceYearWinners } from './services/meme-service.js';

// Import constants
import { 
  SCRAP_MESSAGES_COMMAND,
  MEME_OF_THE_YEAR_COMMAND,
  VOTE_TIMEOUT_COMMAND,
  CANCEL_VOTE_COMMAND,
  LAUGH_EMOJIS
} from './config/constants.js';

dotenv.config();

// Setup dayjs
dayjs.extend(isBetween);
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault('America/Bogota');

// Initialize Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
});

// Initialize vote manager
const voteManager = new VoteManager();

// Set up client reference for vote updates and completion
setDiscordClient(client);
setDiscordClientForCompletion(client);

// Discord Bot Login
client
  .login(process.env.DISCORD_BOT_TOKEN)
  .then(() => {
    console.log('Bot logged in!');
  })
  .catch((err) => {
    console.error('Failed to log in:', err);
  });

client.once('ready', () => {
  console.log('Bot is ready!');
  
  // Schedule the command to run every Friday at 11:40 AM Bogota time
  const job = new CronJob(
    '40 11 * * 5', // cronTime
    async () => {  // onTick
      console.log('Running scheduled gettop command...');
      const guild = client.guilds.cache.first();
      if (!guild) return;

      const channel = guild.channels.cache.get(process.env.MEME_CHANNEL_ID as string) as TextChannel;
      if (!channel) return;

      try {
        const fakeInteraction = {
          reply: async (msg: string) => {
            await channel.send(msg);
          },
          followUp: async (msg: string | BaseMessageOptions) => {
            await channel.send(msg);
          },
          deferred: false,
          replied: false,
          editReply: async (msg: string) => {
            await channel.send(msg);
          },
          client: client,
          channel: channel
        } as any;

        await processMessages(fakeInteraction);
      } catch (error) {
        console.error('Error in scheduled command:', error);
      }
    },
    null, // onComplete
    true,  // start
    'America/Bogota' // timeZone
  );

  job.start();
  
  // Clean up expired cooldowns every hour
  setInterval(() => {
    voteManager.cleanupExpiredCooldowns(60 * 60 * 1000); // 1 hour
    console.log('Cleaned up expired cooldowns');
  }, 60 * 60 * 1000);
});

// Handle slash commands
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  try {
    if (interaction.commandName === SCRAP_MESSAGES_COMMAND) {
      await processMessages(interaction);
    } else if (interaction.commandName === MEME_OF_THE_YEAR_COMMAND) {
      await announceYearWinners(interaction);
      
    } else if (interaction.commandName === VOTE_TIMEOUT_COMMAND) {
      await handleVoteTimeoutCommand(interaction, voteManager);
    } else if (interaction.commandName === CANCEL_VOTE_COMMAND) {
      await handleCancelVoteCommand(interaction, voteManager);
    }
  } catch (error) {
    console.error('Error processing command:', error);
    const errorMessage = 'There was an error processing your command.';
    
    try {
      if (interaction.deferred) {
        await interaction.editReply(errorMessage);
      } else if (!interaction.replied) {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    } catch (replyError) {
      // If we can't even send an error message, just log it
      console.error('Could not send error reply:', replyError);
    }
  }
});

// Handle message reactions for voting
client.on(Events.MessageReactionAdd, async (reaction, user) => {
  await handleVoteReactionAdd(reaction, user, voteManager);
});

client.on(Events.MessageReactionRemove, async (reaction, user) => {
  await handleVoteReactionRemove(reaction, user, voteManager);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down gracefully...');
  console.log('Vote Manager Stats:', voteManager.getStats());
  client.destroy();
  process.exit(0);
});

// Export for potential testing
export { client, voteManager };
