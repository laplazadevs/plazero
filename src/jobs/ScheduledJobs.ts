import { Effect, Layer, Schedule, type Scope } from 'effect';
import * as SqlClient from 'effect/unstable/sql/SqlClient';

import { CorabastosManager } from '../features/corabastos/CorabastosManager.js';
import { MemeManager } from '../features/meme/MemeManager.js';
import { completeVote } from '../features/vote/VoteCompletion.js';
import { VOTE_DURATION_MS } from '../features/vote/VoteDomain.js';
import { VoteManager } from '../features/vote/VoteManager.js';
import { updateVoteMessage } from '../features/vote/VoteUpdates.js';

const BOGOTA_TZ = 'America/Bogota';

// Completes expired votes and refreshes the embeds of active ones.
// Replaces the old 30-second setInterval.
const voteSweepTick = Effect.fn('jobs.voteSweep')(function* () {
    const voteManager = yield* VoteManager;

    const activeVotes = yield* voteManager.getAllActiveVotes();
    const now = new Date();

    for (const vote of activeVotes) {
        const timeElapsed = now.getTime() - vote.startTime.getTime();
        if (timeElapsed >= VOTE_DURATION_MS) {
            yield* Effect.logInfo(`Found expired vote ${vote.id}, completing it`);
            yield* completeVote(vote.id);
        } else {
            yield* updateVoteMessage(vote);
        }
    }
});

// Replaces the hourly contest-completion CronJob.
const contestCompletionTick = Effect.fn('jobs.contestCompletion')(function* () {
    yield* Effect.logInfo('Checking for expired contests...');
    const memeManager = yield* MemeManager;
    yield* memeManager.recoverLatestWeeklyContest();
});

// Replaces the every-minute turno-notification CronJob.
const turnoNotificationTick = Effect.fn('jobs.turnoNotifications')(function* () {
    const corabastosManager = yield* CorabastosManager;
    yield* corabastosManager.processActiveSessionTurnos();
});

// Replaces the Saturday-midnight weekly session CronJob.
const weeklySessionTick = Effect.fn('jobs.weeklySessionCreation')(function* () {
    yield* Effect.logInfo('Creating weekly corabastos session...');
    const corabastosManager = yield* CorabastosManager;
    yield* corabastosManager.createWeeklySessionIfNeeded();
});

// Replaces DatabaseService.runCleanup on its hourly setInterval.
const databaseCleanupTick = Effect.fn('jobs.databaseCleanup')(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* Effect.logInfo('Running database cleanup...');
    const rows = yield* sql`SELECT * FROM run_all_cleanup()`;
    yield* Effect.logInfo('Database cleanup completed', rows[0]);
});

// Replaces the 30-minute corabastos cleanup setInterval.
const corabastosCleanupTick = Effect.fn('jobs.corabastosCleanup')(function* () {
    const corabastosManager = yield* CorabastosManager;

    const expiredRequests = yield* corabastosManager.cleanupExpiredRequests();
    if (expiredRequests > 0) {
        yield* Effect.logInfo(`Cleaned up ${expiredRequests} expired emergency requests`);
    }

    const cleanedNotifications = yield* corabastosManager.cleanupOldNotifications();
    if (cleanedNotifications > 0) {
        yield* Effect.logInfo(`Cleaned up ${cleanedNotifications} old turno notifications`);
    }
});

// A failing tick is logged and the schedule keeps running, matching the old
// try/catch inside each interval callback.
const runOnSchedule = <E, R, Out, ScheduleError>(
    label: string,
    tick: Effect.Effect<void, E, R>,
    schedule: Schedule.Schedule<Out, unknown, ScheduleError>
): Effect.Effect<void, never, R | Scope.Scope> =>
    tick.pipe(
        Effect.catchCause(cause => Effect.logError(`Error in scheduled job ${label}:`, cause)),
        Effect.schedule(schedule),
        Effect.catchCause(cause =>
            Effect.logError(`Scheduled job ${label} stopped unexpectedly:`, cause)
        ),
        Effect.forkScoped,
        Effect.asVoid
    );

// Starts every recurring job as a scoped fiber. The fibers live for as long as
// the application layer and are interrupted on shutdown.
export const ScheduledJobsLive = Layer.effectDiscard(
    Effect.gen(function* () {
        // Recover a missing weekly contest immediately on startup instead of
        // waiting until the next hourly cron boundary.
        yield* contestCompletionTick().pipe(
            Effect.catchCause(cause =>
                Effect.logError('Error in initial scheduled job contestCompletion:', cause)
            )
        );

        yield* runOnSchedule('voteSweep', voteSweepTick(), Schedule.spaced('30 seconds'));
        yield* runOnSchedule(
            'contestCompletion',
            contestCompletionTick(),
            Schedule.cron('0 * * * *', BOGOTA_TZ)
        );
        yield* runOnSchedule(
            'turnoNotifications',
            turnoNotificationTick(),
            Schedule.cron('* * * * *', BOGOTA_TZ)
        );
        yield* runOnSchedule(
            'weeklySessionCreation',
            weeklySessionTick(),
            Schedule.cron('0 0 * * 6', BOGOTA_TZ)
        );
        yield* runOnSchedule('databaseCleanup', databaseCleanupTick(), Schedule.spaced('1 hour'));
        yield* runOnSchedule(
            'corabastosCleanup',
            corabastosCleanupTick(),
            Schedule.spaced('30 minutes')
        );

        yield* Effect.logInfo('Scheduled jobs started');
    })
);
