import * as NodeRuntime from '@effect/platform-node/NodeRuntime';
import * as NodeServices from '@effect/platform-node/NodeServices';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween.js';
import timezone from 'dayjs/plugin/timezone.js';
import utc from 'dayjs/plugin/utc.js';
import { Events, Interaction, Message, PartialMessage } from 'discord.js';
import { Effect, FiberSet, Layer, Option } from 'effect';

import { DotEnvConfigProviderLive } from './config/AppConfigProvider.js';
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
    VOTE_TIMEOUT_COMMAND,
} from './config/constants.js';
import { MigrationsBoot, MigrationsLive } from './db/Migrations.js';
import { PgLive } from './db/PgLive.js';
import { discordCall, DiscordClient, DiscordClientLive } from './discord/DiscordClient.js';
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
import { handleVoteReactionAdd, handleVoteReactionRemove } from './handlers/vote-reactions.js';
import { handleMemberJoin } from './handlers/welcome-handler.js';
import { handleWelcomeButtonInteraction } from './handlers/welcome-interactions.js';
import { handleWelcomeMessage } from './handlers/welcome-messages.js';
import { ScheduledJobsLive } from './jobs/scheduled-jobs.js';
import { CorabastosRepositoryLive } from './repositories/corabastos-repository.js';
import { MemeRepositoryLive } from './repositories/meme-repository.js';
import { UserRepositoryLive } from './repositories/user-repository.js';
import { VoteRepositoryLive } from './repositories/vote-repository.js';
import { WelcomeRepositoryLive } from './repositories/welcome-repository.js';
import { CorabastosManager, CorabastosManagerLive } from './services/corabastos-manager.js';
import { MemeManager, MemeManagerLive } from './services/meme-manager.js';
import { VoteManager, VoteManagerLive } from './services/vote-manager.js';
import { WelcomeManager, WelcomeManagerLive } from './services/welcome-manager.js';

// Setup dayjs
dayjs.extend(isBetween);
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault('America/Bogota');

// ---------------------------------------------------------------------------
// Layer composition
// ---------------------------------------------------------------------------

const RepositoriesLive = Layer.mergeAll(
    VoteRepositoryLive,
    WelcomeRepositoryLive,
    MemeRepositoryLive,
    CorabastosRepositoryLive
).pipe(Layer.provideMerge(UserRepositoryLive));

const ManagersLive = Layer.mergeAll(
    VoteManagerLive,
    WelcomeManagerLive,
    MemeManagerLive,
    CorabastosManagerLive
);

// The Discord client only logs in after pending migrations have been applied,
// mirroring the old initializeBot() sequence.
const DiscordAfterMigrations = DiscordClientLive.pipe(Layer.provide(MigrationsBoot));

const AppLive = ScheduledJobsLive.pipe(
    Layer.provideMerge(ManagersLive),
    Layer.provideMerge(RepositoriesLive),
    Layer.provideMerge(DiscordAfterMigrations),
    Layer.provideMerge(MigrationsLive),
    Layer.provideMerge(PgLive),
    Layer.provideMerge(NodeServices.layer),
    Layer.provide(DotEnvConfigProviderLive)
);

// Services the gateway event handlers can reach.
type HandlerContext =
    | VoteManager
    | WelcomeManager
    | MemeManager
    | CorabastosManager
    | DiscordClient;

// ---------------------------------------------------------------------------
// Gateway event handling
// ---------------------------------------------------------------------------

const dispatchInteraction = Effect.fn('dispatchInteraction')(function* (interaction: Interaction) {
    if (interaction.isChatInputCommand()) {
        switch (interaction.commandName) {
            case MEME_OF_THE_YEAR_COMMAND:
                yield* handleMemeOfTheYearCommand(interaction);
                break;
            case MEME_STATS_COMMAND:
                yield* handleMemeStatsCommand(interaction);
                break;
            case MEME_CONTEST_COMMAND:
                yield* handleMemeContestCommand(interaction);
                break;
            case MEME_COMPLETE_CONTEST_COMMAND:
                yield* handleMemeCompleteContestCommand(interaction);
                break;
            case VOTE_TIMEOUT_COMMAND:
                yield* handleVoteTimeoutCommand(interaction);
                break;
            case CANCEL_VOTE_COMMAND:
                yield* handleCancelVoteCommand(interaction);
                break;
            case CORABASTOS_AGENDA_COMMAND:
                yield* handleCorabastosAgendaCommand(interaction);
                break;
            case CORABASTOS_EMERGENCY_COMMAND:
                yield* handleCorabastosEmergencyCommand(interaction);
                break;
            case CORABASTOS_STATUS_COMMAND:
                yield* handleCorabastosStatusCommand(interaction);
                break;
            case CORABASTOS_CREATE_SESSION_COMMAND:
                yield* handleCreateCorabastosSession(interaction);
                break;
        }
    } else if (interaction.isButton()) {
        if (interaction.customId.startsWith('welcome_')) {
            yield* handleWelcomeButtonInteraction(interaction);
        } else if (interaction.customId.startsWith('meme_contest_')) {
            yield* handleMemeButtonInteraction(interaction);
        } else if (interaction.customId.startsWith('corabastos_')) {
            yield* handleCorabastosButtonInteraction(interaction);
        }
    }
});

// Wraps interaction handling with the old top-level error reply behavior.
const safeInteraction = (interaction: Interaction): Effect.Effect<void, never, HandlerContext> =>
    dispatchInteraction(interaction).pipe(
        Effect.catchCause(cause =>
            Effect.gen(function* () {
                yield* Effect.logError('Error processing interaction:', cause);

                const errorMessage = 'There was an error processing your interaction.';
                if (interaction.isRepliable()) {
                    if (interaction.deferred) {
                        yield* discordCall('interaction.editReply', () =>
                            interaction.editReply(errorMessage)
                        ).pipe(
                            Effect.catchCause(replyCause =>
                                Effect.logError('Could not send error reply:', replyCause)
                            )
                        );
                    } else if (!interaction.replied) {
                        yield* discordCall('interaction.reply', () =>
                            interaction.reply({ content: errorMessage, ephemeral: true })
                        ).pipe(
                            Effect.catchCause(replyCause =>
                                Effect.logError('Could not send error reply:', replyCause)
                            )
                        );
                    }
                }
            })
        )
    );

const logStatsOnShutdown = Effect.gen(function* () {
    yield* Effect.logInfo('Shutting down gracefully...');

    const voteManager = yield* VoteManager;
    const welcomeManager = yield* WelcomeManager;
    const memeManager = yield* MemeManager;
    const corabastosManager = yield* CorabastosManager;

    const [voteStats, welcomeStats, memeStats, corabastosStats] = yield* Effect.all(
        [
            voteManager.getStats(),
            welcomeManager.getStats(),
            memeManager.getStats(),
            corabastosManager.getStats(),
        ],
        { concurrency: 4 }
    );

    yield* Effect.logInfo('Vote Manager Stats:', voteStats);
    yield* Effect.logInfo('Welcome Manager Stats:', welcomeStats);
    yield* Effect.logInfo('Meme Manager Stats:', memeStats);
    yield* Effect.logInfo('Corabastos Manager Stats:', corabastosStats);
});

const handleUpdatedMessage = Effect.fn('handleUpdatedMessage')(function* (
    newMessage: Message | PartialMessage
) {
    const fullMessage = newMessage.partial
        ? yield* discordCall('message.fetch', () => newMessage.fetch()).pipe(
              Effect.tapCause(cause => Effect.logError('Failed to fetch partial message:', cause)),
              Effect.option
          )
        : Option.some(newMessage);

    if (Option.isNone(fullMessage)) return;

    // Only handle full messages with content
    if (!fullMessage.value.content) return;

    yield* handleWelcomeMessage(fullMessage.value);
});

const program = Effect.gen(function* () {
    const client = yield* DiscordClient;
    const runFork = yield* FiberSet.makeRuntime<HandlerContext>();

    // Handle interactions (slash commands and button interactions)
    client.on(Events.InteractionCreate, interaction => {
        runFork(safeInteraction(interaction));
    });

    // Handle message reactions for voting and corabastos
    client.on(Events.MessageReactionAdd, (reaction, user) => {
        runFork(
            Effect.gen(function* () {
                yield* handleVoteReactionAdd(reaction, user);
                yield* handleCorabastosReactionAdd(reaction, user);
            }).pipe(
                Effect.catchCause(cause => Effect.logError('Error handling reaction add:', cause))
            )
        );
    });

    client.on(Events.MessageReactionRemove, (reaction, user) => {
        runFork(
            Effect.gen(function* () {
                yield* handleVoteReactionRemove(reaction, user);
                yield* handleCorabastosReactionRemove(reaction, user);
            }).pipe(
                Effect.catchCause(cause =>
                    Effect.logError('Error handling reaction remove:', cause)
                )
            )
        );
    });

    // Handle new member joins
    client.on(Events.GuildMemberAdd, member => {
        runFork(handleMemberJoin(member));
    });

    // Handle member departures
    client.on(Events.GuildMemberRemove, member => {
        runFork(handleMemberLeave(member));
    });

    // Handle messages for welcome information collection
    client.on(Events.MessageCreate, message => {
        runFork(handleWelcomeMessage(message));
    });

    // Handle message edits for welcome information collection
    client.on(Events.MessageUpdate, (_oldMessage, newMessage) => {
        runFork(handleUpdatedMessage(newMessage));
    });

    // Print manager statistics when the application shuts down.
    yield* Effect.addFinalizer(() => logStatsOnShutdown.pipe(Effect.ignore));

    yield* Effect.logInfo('Bot is ready!');
    yield* Effect.never;
});

NodeRuntime.runMain(Effect.scoped(program).pipe(Effect.provide(AppLive)));
