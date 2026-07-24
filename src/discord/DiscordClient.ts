import { Client, Events, GatewayIntentBits } from 'discord.js';
import { Context, Effect, Layer, Redacted, Schema } from 'effect';

import { discordBotToken } from '../config/env.js';

// Wraps any failure coming out of the Discord API / discord.js.
export class DiscordError extends Schema.TaggedErrorClass<DiscordError>()('DiscordError', {
    operation: Schema.String,
    cause: Schema.Defect(),
}) {}

// Runs a discord.js / Discord REST promise inside Effect with a typed error.
export const discordCall = <A>(
    operation: string,
    run: () => Promise<A>
): Effect.Effect<A, DiscordError> =>
    Effect.tryPromise({
        try: run,
        catch: cause => DiscordError.make({ operation, cause }),
    });

const acquireClient = Effect.gen(function* () {
    const token = yield* discordBotToken;

    const client = yield* Effect.sync(
        () =>
            new Client({
                intents: [
                    GatewayIntentBits.Guilds,
                    GatewayIntentBits.GuildMessages,
                    GatewayIntentBits.MessageContent,
                    GatewayIntentBits.GuildMessageReactions,
                    GatewayIntentBits.GuildMembers,
                ],
            })
    );

    yield* discordCall('client.login', () => client.login(Redacted.value(token)));

    yield* Effect.callback<void>(resume => {
        if (client.isReady()) {
            resume(Effect.void);
            return;
        }
        client.once(Events.ClientReady, () => resume(Effect.void));
    });

    yield* Effect.logInfo('Bot logged in!');

    if (!client.isReady()) {
        return yield* Effect.die(new Error('Discord client did not become ready'));
    }

    return client;
});

// The discord.js client as an Effect service. The layer logs in during
// construction, waits until the gateway is ready, and destroys the client when
// the application scope closes.
export class DiscordClient extends Context.Service<DiscordClient, Client<true>>()(
    'plazero/DiscordClient'
) {
    static readonly layer = Layer.effect(DiscordClient)(
        Effect.acquireRelease(acquireClient, client =>
            Effect.promise(() => client.destroy()).pipe(
                Effect.ignore,
                Effect.tap(() => Effect.logInfo('Discord client destroyed'))
            )
        )
    );
}
