import * as NodeRuntime from '@effect/platform-node/NodeRuntime';
import * as NodeServices from '@effect/platform-node/NodeServices';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween.js';
import timezone from 'dayjs/plugin/timezone.js';
import utc from 'dayjs/plugin/utc.js';
import { Duration, Effect, Layer } from 'effect';
import * as SqlClient from 'effect/unstable/sql/SqlClient';

import { DotEnvConfigProviderLive } from './config/AppConfigProvider.js';
import { Migrations } from './db/Migrations.js';
import { PgLive } from './db/PgLive.js';
import { DiscordClient } from './discord/DiscordClient.js';
import { GatewayLive } from './discord/Gateway.js';
import { UserRepository } from './domain/UserRepository.js';
import { CorabastosFeatureLive } from './features/corabastos/Corabastos.js';
import { MemeFeatureLive } from './features/meme/Meme.js';
import { VoteFeatureLive } from './features/vote/Vote.js';
import { WelcomeFeatureLive } from './features/welcome/Welcome.js';
import { type Readiness, startHealthServer } from './health/HealthServer.js';
import { ScheduledJobsLive } from './jobs/ScheduledJobs.js';

// Setup dayjs
dayjs.extend(isBetween);
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault('America/Bogota');

// Each feature wires its own repository internally and exposes its manager.
const FeaturesLive = Layer.mergeAll(
    VoteFeatureLive,
    WelcomeFeatureLive,
    MemeFeatureLive,
    CorabastosFeatureLive
);

let readiness: Readiness = { phase: 'starting' };

const ReadinessLive = Layer.effectDiscard(
    Effect.gen(function* () {
        const client = yield* DiscordClient;
        const sql = yield* SqlClient.SqlClient;
        readiness = {
            phase: 'ready',
            discordReady: () => client.isReady(),
            pingDatabase: () =>
                Effect.runPromise(sql`SELECT 1`.pipe(Effect.timeout(Duration.millis(1500)))),
        };
    })
);

// The Discord client only logs in after pending migrations have been applied.
const DiscordAfterMigrations = DiscordClient.layer.pipe(Layer.provide(Migrations.boot));

const MainLive = Layer.mergeAll(GatewayLive, ScheduledJobsLive, ReadinessLive).pipe(
    Layer.provideMerge(FeaturesLive),
    Layer.provideMerge(UserRepository.layer),
    Layer.provideMerge(DiscordAfterMigrations),
    Layer.provideMerge(Migrations.layer),
    Layer.provideMerge(PgLive),
    Layer.provideMerge(NodeServices.layer),
    Layer.provide(DotEnvConfigProviderLive)
);

await startHealthServer(Number(process.env.PORT ?? 8080), () => readiness);

NodeRuntime.runMain(Layer.launch(MainLive));
