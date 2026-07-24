import { REST } from '@discordjs/rest';
import * as NodeRuntime from '@effect/platform-node/NodeRuntime';
import { Routes } from 'discord-api-types/v9';
import { Effect, Redacted } from 'effect';

import { DotEnvConfigProviderLive } from './config/AppConfigProvider.js';
import { discordBotToken, discordClientId, discordGuildId } from './config/env.js';
import { discordCall } from './discord/DiscordClient.js';
import { corabastosSlashCommands } from './features/corabastos/CorabastosCommands.js';
import { memeSlashCommands } from './features/meme/MemeCommands.js';
import { voteSlashCommands } from './features/vote/VoteCommands.js';

// Every feature owns its slash-command builders next to the handlers that
// serve them; this entrypoint only registers the union with Discord.
const commands = [...memeSlashCommands, ...voteSlashCommands, ...corabastosSlashCommands].map(
    command => command.toJSON()
);

const program = Effect.gen(function* () {
    const token = yield* discordBotToken;
    const clientId = yield* discordClientId;
    const guildId = yield* discordGuildId;

    const rest = new REST({ version: '9' }).setToken(Redacted.value(token));

    yield* Effect.logInfo('Started refreshing slash commands.');

    yield* discordCall('rest.put', () =>
        rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands })
    ).pipe(
        Effect.andThen(Effect.logInfo('Successfully reloaded slash commands.')),
        Effect.catchCause(cause => Effect.logError(cause))
    );
});

NodeRuntime.runMain(program.pipe(Effect.provide(DotEnvConfigProviderLive)));
