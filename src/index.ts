import { CronJob } from 'cron';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween.js';
import timezone from 'dayjs/plugin/timezone.js';
import utc from 'dayjs/plugin/utc.js';
import { Client, Events, GatewayIntentBits, Message } from 'discord.js';

// Import our modular services
import {
    CANCEL_VOTE_COMMAND,
    CORABASTOS_AGENDA_COMMAND,
    CORABASTOS_CREATE_SESSION_COMMAND,
    CORABASTOS_EMERGENCY_COMMAND,
    CORABASTOS_STATUS_COMMAND,
    MEME_COMPLETE_CONTEST_COMMAND,
    MEME_CONTEST_COMMAND,
    MEME_OF_THE_YEAR_COMMAND,
    MEME_STATS_COMMAND,
    VOTE_DURATION_MS,
    VOTE_TIMEOUT_COMMAND,
} from './config/constants.js';
import {
    handleCorabastosAgendaCommand,
    handleCorabastosEmergencyCommand,
    handleCorabastosStatusCommand,
    handleCreateCorabastosSession,
} from './handlers/corabastos-commands.js';
import {
    handleCorabastosButtonInteraction,
    handleCorabastosReactionAdd,
    handleCorabastosReactionRemove,
} from './handlers/corabastos-interactions.js';
import { handleMemberLeave } from './handlers/departure-handler.js';
import {
    handleMemeCompleteContestCommand,
    handleMemeContestCommand,
    handleMemeOfTheYearCommand,
    handleMemeStatsCommand,
} from './handlers/meme-commands.js';
import { handleMemeButtonInteraction } from './handlers/meme-interactions.js';
import { handleCancelVoteCommand, handleVoteTimeoutCommand } from './handlers/vote-commands.js';
import { completeVote, setDiscordClientForCompletion } from './handlers/vote-completion.js';
import { handleVoteReactionAdd, handleVoteReactionRemove } from './handlers/vote-reactions.js';
import { setDiscordClient, updateVoteMessage } from './handlers/vote-updates.js';
import { handleMemberJoin } from './handlers/welcome-handler.js';
import { handleWelcomeButtonInteraction } from './handlers/welcome-interactions.js';
import { handleWelcomeMessage } from './handlers/welcome-messages.js';
import { CorabastosManager } from './services/corabastos-manager.js';
import { DatabaseService } from './services/database-service.js';
import { MemeManager } from './services/meme-manager.js';
import { VoteManager } from './services/vote-manager.js';
import { WelcomeManager } from './services/welcome-manager.js';

// Import constants

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
        GatewayIntentBits.GuildMembers,
    ],
});

// Initialize database and managers
const databaseService = DatabaseService.getInstance();
const voteManager = new VoteManager();
const welcomeManager = new WelcomeManager();
const memeManager = new MemeManager();
const corabastosManager = new CorabastosManager();

// Set up client reference for vote updates and completion
setDiscordClient(client);
setDiscordClientForCompletion(client);

// Set up periodic vote completion check and embed updates (every 30 seconds)
setInterval(async () => {
    try {
        const activeVotes = await voteManager.getAllActiveVotes();
        const now = new Date();

        for (const vote of activeVotes) {
            const timeElapsed = now.getTime() - vote.startTime.getTime();
            if (timeElapsed >= VOTE_DURATION_MS) {
                console.log(`Found expired vote ${vote.id}, completing it`);
                await completeVote(vote.id, voteManager);
            } else {
                // Update the embed to show correct time remaining
                await updateVoteMessage(vote);
            }
        }
    } catch (error) {
        console.error('Error in periodic vote completion check:', error);
    }
}, 30000); // Check every 30 seconds

// Initialize database and start bot
async function initializeBot(): Promise<void> {
    try {
        // Test database connection
        const dbConnected = await databaseService.testConnection();
        if (!dbConnected) {
            console.error(
                'Failed to connect to database. Please check your database configuration.'
            );
            process.exit(1);
        }

        // Initialize database schema
        await databaseService.initializeSchema();
        await databaseService.createCleanupFunctions();

        // Start Discord bot
        await client.login(process.env.DISCORD_BOT_TOKEN);
        console.log('Bot logged in!');
    } catch (error) {
        console.error('Failed to initialize bot:', error);
        process.exit(1);
    }
}

initializeBot();

client.once('ready', () => {
    console.log('Bot is ready!');

    // Note: Automatic weekly contest creation/processing is handled by the contest system

    // Schedule contest completion check every hour
    const contestCompletionJob = new CronJob(
        '0 * * * *', // Every hour at minute 0
        async () => {
            console.log('Checking for expired contests...');
            try {
                await memeManager.processExpiredContests(client);
            } catch (error) {
                console.error('Error processing expired contests:', error);
            }
        },
        null, // onComplete
        true, // start
        'America/Bogota' // timeZone
    );
    contestCompletionJob.start();

    // Schedule turno notifications check every minute
    const turnoNotificationJob = new CronJob(
        '* * * * *', // Every minute
        async () => {
            try {
                await corabastosManager.processActiveSessionTurnos(client);
            } catch (error) {
                console.error('Error processing turno notifications:', error);
            }
        },
        null, // onComplete
        true, // start
        'America/Bogota' // timeZone
    );
    turnoNotificationJob.start();

    // Run database cleanup every hour
    setInterval(async () => {
        try {
            await databaseService.runCleanup();
            console.log('Database cleanup completed');
        } catch (error) {
            console.error('Error during database cleanup:', error);
        }
    }, 60 * 60 * 1000); // 1 hour

    // Run corabastos cleanup every 30 minutes
    setInterval(async () => {
        try {
            const expiredRequests = await corabastosManager.cleanupExpiredRequests();
            if (expiredRequests > 0) {
                console.log(`Cleaned up ${expiredRequests} expired emergency requests`);
            }

            // Also cleanup old turno notifications (older than 7 days)
            const cleanedNotifications = await corabastosManager.cleanupOldNotifications();
            if (cleanedNotifications > 0) {
                console.log(`Cleaned up ${cleanedNotifications} old turno notifications`);
            }
        } catch (error) {
            console.error('Error during corabastos cleanup:', error);
        }
    }, 30 * 60 * 1000); // 30 minutes
});

// Handle interactions (slash commands and button interactions)
client.on(Events.InteractionCreate, async interaction => {
    try {
        if (interaction.isChatInputCommand()) {
            if (interaction.commandName === MEME_OF_THE_YEAR_COMMAND) {
                await handleMemeOfTheYearCommand(interaction, memeManager);
            } else if (interaction.commandName === MEME_STATS_COMMAND) {
                await handleMemeStatsCommand(interaction, memeManager);
            } else if (interaction.commandName === MEME_CONTEST_COMMAND) {
                await handleMemeContestCommand(interaction, memeManager);
            } else if (interaction.commandName === MEME_COMPLETE_CONTEST_COMMAND) {
                await handleMemeCompleteContestCommand(interaction, memeManager);
            } else if (interaction.commandName === VOTE_TIMEOUT_COMMAND) {
                await handleVoteTimeoutCommand(interaction, voteManager);
            } else if (interaction.commandName === CANCEL_VOTE_COMMAND) {
                await handleCancelVoteCommand(interaction, voteManager);
            } else if (interaction.commandName === CORABASTOS_AGENDA_COMMAND) {
                await handleCorabastosAgendaCommand(interaction, corabastosManager);
            } else if (interaction.commandName === CORABASTOS_EMERGENCY_COMMAND) {
                await handleCorabastosEmergencyCommand(interaction, corabastosManager);
            } else if (interaction.commandName === CORABASTOS_STATUS_COMMAND) {
                await handleCorabastosStatusCommand(interaction, corabastosManager);
            } else if (interaction.commandName === CORABASTOS_CREATE_SESSION_COMMAND) {
                await handleCreateCorabastosSession(interaction, corabastosManager);
            }
        } else if (interaction.isButton()) {
            if (interaction.customId.startsWith('welcome_')) {
                await handleWelcomeButtonInteraction(interaction, welcomeManager);
            } else if (interaction.customId.startsWith('meme_contest_')) {
                await handleMemeButtonInteraction(interaction, memeManager);
            } else if (interaction.customId.startsWith('corabastos_')) {
                await handleCorabastosButtonInteraction(interaction, corabastosManager);
            }
        }
    } catch (error) {
        console.error('Error processing interaction:', error);
        const errorMessage = 'There was an error processing your interaction.';

        try {
            if (interaction.isRepliable()) {
                if (interaction.deferred) {
                    await interaction.editReply(errorMessage);
                } else if (!interaction.replied) {
                    await interaction.reply({ content: errorMessage, ephemeral: true });
                }
            }
        } catch (replyError) {
            // If we can't even send an error message, just log it
            console.error('Could not send error reply:', replyError);
        }
    }
});

// Handle message reactions for voting and corabastos
client.on(Events.MessageReactionAdd, async (reaction, user) => {
    await handleVoteReactionAdd(reaction, user, voteManager);
    await handleCorabastosReactionAdd(reaction, user, corabastosManager);
});

client.on(Events.MessageReactionRemove, async (reaction, user) => {
    await handleVoteReactionRemove(reaction, user, voteManager);
    await handleCorabastosReactionRemove(reaction, user, corabastosManager);
});

// Handle new member joins
client.on(Events.GuildMemberAdd, async member => {
    await handleMemberJoin(member, welcomeManager);
});

// Handle member departures
client.on(Events.GuildMemberRemove, async member => {
    await handleMemberLeave(member);
});

// Handle messages for welcome information collection
client.on(Events.MessageCreate, async message => {
    await handleWelcomeMessage(message, welcomeManager);
});

// Handle message edits for welcome information collection
client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
    let fullMessage: Message;

    if (newMessage.partial) {
        try {
            fullMessage = await newMessage.fetch();
        } catch (error) {
            console.error('Failed to fetch partial message:', error);
            return;
        }
    } else {
        fullMessage = newMessage;
    }

    // Only handle full messages with content
    if (!fullMessage.content) return;

    await handleWelcomeMessage(fullMessage, welcomeManager);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down gracefully...');

    try {
        const [voteStats, welcomeStats, memeStats, corabastosStats] = await Promise.all([
            voteManager.getStats(),
            welcomeManager.getStats(),
            memeManager.getStats(),
            corabastosManager.getStats(),
        ]);

        console.log('Vote Manager Stats:', voteStats);
        console.log('Welcome Manager Stats:', welcomeStats);
        console.log('Meme Manager Stats:', memeStats);
        console.log('Corabastos Manager Stats:', corabastosStats);

        await databaseService.close();
        client.destroy();
        process.exit(0);
    } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
    }
});

// Export for potential testing
export { client, voteManager, welcomeManager, memeManager, corabastosManager };
