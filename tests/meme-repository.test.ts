import assert from 'node:assert/strict';
import test from 'node:test';
import * as NodeServices from '@effect/platform-node/NodeServices';
import * as PgClient from '@effect/sql-pg/PgClient';
import { Effect, Layer, Redacted } from 'effect';
import * as SqlClient from 'effect/unstable/sql/SqlClient';

import { Migrations } from '../src/db/Migrations.js';
import { UserRepository } from '../src/domain/UserRepository.js';
import { MemeRepository, type RecoveredWinner } from '../src/features/meme/MemeRepository.js';

const url = process.env.MEME_TEST_DATABASE_URL;

const window = {
    start: new Date('2026-10-16T17:00:00.000Z'),
    end: new Date('2026-10-23T17:00:00.000Z'),
};
const bot = { id: '100', username: 'plazero' };
const winner = (
    authorId: string,
    contestType: 'meme' | 'bone',
    rank: number,
    count: number
): RecoveredWinner => ({
    message_id: `${authorId}${rank}`,
    author_id: authorId,
    reaction_count: count,
    contest_type: contestType,
    rank,
    week_start: window.start,
    week_end: window.end,
    submitted_at: window.start,
});
const winners = [
    winner('201', 'meme', 1, 9),
    winner('202', 'meme', 2, 4),
    winner('201', 'bone', 1, 3),
];

test('recovered weekly contests are saved once even when the save runs twice', {
    skip: !url,
}, async () => {
    const SqlLive = PgClient.layer({ url: Redacted.make(url ?? '') });
    const ReposLive = MemeRepository.layer.pipe(
        Layer.provideMerge(UserRepository.layer),
        Layer.provideMerge(Migrations.layer),
        Layer.provideMerge(SqlLive),
        Layer.provideMerge(NodeServices.layer)
    );

    const program = Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const migrations = yield* Migrations;
        const memes = yield* MemeRepository;
        yield* migrations.up();
        yield* sql`TRUNCATE meme_winners, meme_contests, user_stats, users CASCADE`;

        const stale = yield* memes.createContest(
            '00000000-0000-4000-8000-000000000001',
            'weekly',
            window.start,
            window.end,
            '1',
            bot
        );
        const first = yield* memes.saveRecoveredWeeklyContest(window, '1', bot, winners);
        const second = yield* memes.saveRecoveredWeeklyContest(window, '1', bot, winners);
        const [again] = yield* Effect.all(
            [
                memes.saveRecoveredWeeklyContest(window, '1', bot, winners),
                memes.saveRecoveredWeeklyContest(window, '1', bot, winners),
            ],
            { concurrency: 2 }
        );

        const nextWeek = { start: window.end, end: new Date('2026-10-30T17:00:00.000Z') };
        const fresh = yield* Effect.all(
            [
                memes.saveRecoveredWeeklyContest(nextWeek, '1', bot, []),
                memes.saveRecoveredWeeklyContest(nextWeek, '1', bot, []),
            ],
            { concurrency: 2 }
        );

        const contests = yield* sql`
            SELECT id, status, end_date FROM meme_contests WHERE start_date = ${window.start}
        `;
        const freshRows =
            yield* sql`SELECT id FROM meme_contests WHERE start_date = ${nextWeek.start}`;
        const saved = yield* sql`SELECT id FROM meme_winners ORDER BY id`;
        const stats = yield* sql`
            SELECT user_id, total_meme_wins, total_bone_wins FROM user_stats ORDER BY user_id
        `;
        const latest = yield* memes.getLatestWeeklyContestBefore(window.end);
        return { stale, first, second, again, contests, saved, stats, latest, fresh, freshRows };
    });

    const result = await Effect.runPromise(program.pipe(Effect.provide(ReposLive)));

    assert.equal(result.first.contestId, result.stale.id);
    assert.equal(result.first.insertedWinners, 3);
    assert.equal(result.second.insertedWinners, 0);
    assert.equal(result.again.insertedWinners, 0);
    assert.deepEqual(
        result.contests.map(row => ({ ...row })),
        [{ id: result.stale.id, status: 'completed', end_date: window.end }]
    );
    assert.deepEqual(
        result.saved.map(row => row.id),
        [`bone-${result.stale.id}-0`, `meme-${result.stale.id}-0`, `meme-${result.stale.id}-1`]
    );
    assert.deepEqual(
        result.stats.map(row => ({ ...row })),
        [
            { user_id: '201', total_meme_wins: 1, total_bone_wins: 1 },
            { user_id: '202', total_meme_wins: 1, total_bone_wins: 0 },
        ]
    );
    assert.equal(result.latest?.status, 'completed');
    assert.equal(result.freshRows.length, 1);
    assert.equal(result.fresh[0].contestId, result.fresh[1].contestId);
});
