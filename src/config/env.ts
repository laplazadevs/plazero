import type { PgPoolConfig } from '@effect/sql-pg/PgClient';
import { Config, Duration, Effect, Option, Redacted } from 'effect';

// Discord credentials
export const discordBotToken = Config.redacted('DISCORD_BOT_TOKEN');
export const discordClientId = Config.string('CLIENT_ID');
export const discordGuildId = Config.string('GUILD_ID');

// Pool tuning mirrors the previous pg.Pool settings (max 20, 30s idle, 2s connect).
const poolTuning = {
    maxConnections: 20,
    idleTimeout: Duration.seconds(30),
    connectTimeout: Duration.seconds(2),
};

// The bot holds a persistent pool, so Neon's direct (unpooled) URL is
// preferred when present; the pooled DATABASE_URL remains the fallback.
const databaseUrl = Config.option(
    Config.redacted('DATABASE_URL_UNPOOLED').pipe(
        Config.orElse(() => Config.redacted('DATABASE_URL'))
    )
);

// Legacy deployments configured the bot pool with PGDATABASE/PGUSER/POSTGRES_PASSWORD
// while the migration tooling read DB_NAME/DB_USER/DB_PASSWORD, so both spellings
// are accepted with the DB_* names taking precedence.
const databaseName = Config.string('DB_NAME').pipe(
    Config.orElse(() => Config.string('PGDATABASE')),
    Config.withDefault('plazero_bot')
);

const databaseUser = Config.string('DB_USER').pipe(
    Config.orElse(() => Config.string('PGUSER')),
    Config.withDefault('postgres')
);

const databasePassword = Config.redacted('DB_PASSWORD').pipe(
    Config.orElse(() => Config.redacted('POSTGRES_PASSWORD')),
    Config.withDefault(Redacted.make('password'))
);

const databaseHost = Config.string('DB_HOST').pipe(Config.withDefault('localhost'));

const databasePort = Config.int('DB_PORT').pipe(Config.withDefault(5432));

// DATABASE_URL wins when present (production); otherwise the discrete variables are used.
export const databasePoolConfig: Effect.Effect<PgPoolConfig, Config.ConfigError> = Effect.gen(
    function* () {
        const url = yield* databaseUrl;

        if (Option.isSome(url)) {
            return { url: url.value, ...poolTuning };
        }

        return {
            host: yield* databaseHost,
            port: yield* databasePort,
            database: yield* databaseName,
            username: yield* databaseUser,
            password: yield* databasePassword,
            ...poolTuning,
        };
    }
);

// Name of the database the bot should use, resolved the same way the pool is.
// Falls back to the discrete variables when DATABASE_URL cannot be parsed,
// matching the behavior of the previous parseDatabaseConfig helper.
export const targetDatabaseName: Effect.Effect<string, Config.ConfigError> = Effect.gen(
    function* () {
        const url = yield* databaseUrl;

        if (Option.isSome(url)) {
            const parsed = yield* Effect.try(() => new URL(Redacted.value(url.value))).pipe(
                Effect.option
            );
            if (Option.isSome(parsed) && parsed.value.pathname.length > 1) {
                return parsed.value.pathname.slice(1);
            }
            yield* Effect.logWarning(
                'Failed to parse DATABASE_URL, falling back to individual environment variables'
            );
        }

        return yield* databaseName;
    }
);

// Admin pool config pointing at the maintenance `postgres` database, used to
// create the application database when it does not exist yet.
export const adminPoolConfig: Effect.Effect<PgPoolConfig, Config.ConfigError> = Effect.gen(
    function* () {
        const url = yield* databaseUrl;

        if (Option.isSome(url)) {
            const parsed = yield* Effect.try(() => new URL(Redacted.value(url.value))).pipe(
                Effect.option
            );
            if (Option.isSome(parsed)) {
                parsed.value.pathname = '/postgres';
                return { url: Redacted.make(parsed.value.toString()), ...poolTuning };
            }
        }

        return {
            host: yield* databaseHost,
            port: yield* databasePort,
            database: 'postgres',
            username: yield* databaseUser,
            password: yield* databasePassword,
            ...poolTuning,
        };
    }
);
