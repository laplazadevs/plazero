import { Context, Effect, Layer, Schema } from 'effect';
import * as SqlClient from 'effect/unstable/sql/SqlClient';

import { CountRow } from '../../db/Rows.js';
import type { PlazeroUser } from '../../domain/User.js';
import { UserRepository } from '../../domain/UserRepository.js';

export class MemeContestRow extends Schema.Class<MemeContestRow>('MemeContestRow')({
    id: Schema.String,
    type: Schema.Literals(['weekly', 'yearly']),
    start_date: Schema.Date,
    end_date: Schema.Date,
    status: Schema.Literals(['active', 'completed', 'cancelled']),
    channel_id: Schema.String,
    message_id: Schema.NullOr(Schema.String),
    created_by_id: Schema.String,
    created_at: Schema.Date,
}) {}

export class MemeWinnerRow extends Schema.Class<MemeWinnerRow>('MemeWinnerRow')({
    id: Schema.String,
    contest_id: Schema.String,
    message_id: Schema.String,
    author_id: Schema.String,
    reaction_count: Schema.Number,
    contest_type: Schema.Literals(['meme', 'bone']),
    rank: Schema.Number,
    week_start: Schema.NullOr(Schema.Date),
    week_end: Schema.NullOr(Schema.Date),
    submitted_at: Schema.Date,
}) {}

export class TopContributorRow extends Schema.Class<TopContributorRow>('TopContributorRow')({
    user_id: Schema.String,
    total_wins: Schema.Number,
    meme_wins: Schema.Number,
    bone_wins: Schema.Number,
}) {}

export class MemeTotalsRow extends Schema.Class<MemeTotalsRow>('MemeTotalsRow')({
    total_memes: Schema.NullOr(Schema.FiniteFromString),
    total_bones: Schema.NullOr(Schema.FiniteFromString),
}) {}

class MemeWinnerIdRow extends Schema.Class<MemeWinnerIdRow>('MemeWinnerIdRow')({
    id: Schema.String,
}) {}

export interface MemeWinnerInsert {
    readonly id: string;
    readonly contest_id: string;
    readonly message_id: string;
    readonly author_id: string;
    readonly reaction_count: number;
    readonly contest_type: 'meme' | 'bone';
    readonly rank: number;
    readonly week_start: Date | null;
    readonly week_end: Date | null;
    readonly submitted_at: Date;
}

const decodeContestRows = Schema.decodeUnknownEffect(Schema.Array(MemeContestRow));
const decodeWinnerRows = Schema.decodeUnknownEffect(Schema.Array(MemeWinnerRow));
const decodeTopContributorRows = Schema.decodeUnknownEffect(Schema.Array(TopContributorRow));
const decodeCountRows = Schema.decodeUnknownEffect(Schema.Array(CountRow));
const decodeTotalsRows = Schema.decodeUnknownEffect(Schema.Array(MemeTotalsRow));
const decodeWinnerIdRows = Schema.decodeUnknownEffect(Schema.Array(MemeWinnerIdRow));

export class MemeRepository extends Context.Service<MemeRepository>()('plazero/MemeRepository', {
    make: Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const users = yield* UserRepository;

        const createContest = Effect.fn('MemeRepository.createContest')(function* (
            contestId: string,
            type: 'weekly' | 'yearly',
            startDate: Date,
            endDate: Date,
            channelId: string,
            createdBy: PlazeroUser
        ) {
            return yield* sql.withTransaction(
                Effect.gen(function* () {
                    yield* users.upsertUser(createdBy);

                    const rows = yield* sql`
                        INSERT INTO meme_contests (
                            id, type, start_date, end_date, status,
                            channel_id, created_by_id, created_at
                        )
                        VALUES (
                            ${contestId}, ${type}, ${startDate}, ${endDate}, 'active',
                            ${channelId}, ${createdBy.id}, NOW()
                        )
                        RETURNING *
                    `;
                    const contests = yield* decodeContestRows(rows);
                    return contests[0];
                })
            );
        });

        const getContest = Effect.fn('MemeRepository.getContest')(function* (contestId: string) {
            const rows = yield* sql`SELECT * FROM meme_contests WHERE id = ${contestId}`;
            const contests = yield* decodeContestRows(rows);
            return contests.length > 0 ? contests[0] : null;
        });

        const getActiveContests = Effect.fn('MemeRepository.getActiveContests')(function* () {
            const rows = yield* sql`SELECT * FROM meme_contests WHERE status = 'active'`;
            return yield* decodeContestRows(rows);
        });

        const getLatestWeeklyContest = Effect.fn('MemeRepository.getLatestWeeklyContest')(
            function* () {
                const rows = yield* sql`
                    SELECT * FROM meme_contests
                    WHERE type = 'weekly'
                    ORDER BY created_at DESC
                    LIMIT 1
                `;
                const contests = yield* decodeContestRows(rows);
                return contests.length > 0 ? contests[0] : null;
            }
        );

        const getLatestFailedWeeklyContest = Effect.fn(
            'MemeRepository.getLatestFailedWeeklyContest'
        )(function* () {
            const rows = yield* sql`
                SELECT * FROM meme_contests
                WHERE type = 'weekly'
                  AND status = 'completed'
                  AND end_date <= start_date
                ORDER BY created_at DESC
                LIMIT 1
            `;
            const contests = yield* decodeContestRows(rows);
            return contests.length > 0 ? contests[0] : null;
        });

        const updateContestMessageId = Effect.fn('MemeRepository.updateContestMessageId')(
            function* (contestId: string, messageId: string) {
                yield* sql`
                    UPDATE meme_contests SET message_id = ${messageId} WHERE id = ${contestId}
                `;
            }
        );

        const completeContest = Effect.fn('MemeRepository.completeContest')(function* (
            contestId: string
        ) {
            yield* sql`
                UPDATE meme_contests SET status = 'completed' WHERE id = ${contestId}
            `;
        });

        const addMemeWinners = Effect.fn('MemeRepository.addMemeWinners')(function* (
            winners: ReadonlyArray<MemeWinnerInsert>
        ) {
            if (winners.length === 0) {
                return;
            }

            yield* Effect.logDebug(
                `addMemeWinners: starting transaction for ${winners.length} winners`
            );
            yield* sql.withTransaction(
                Effect.gen(function* () {
                    const authorIds = [...new Set(winners.map(winner => winner.author_id))];
                    for (const authorId of authorIds) {
                        yield* users.ensureUserId(authorId);
                    }

                    for (const winner of winners) {
                        yield* sql`
                            INSERT INTO meme_winners (
                                id, contest_id, message_id, author_id, reaction_count,
                                contest_type, rank, week_start, week_end, submitted_at
                            )
                            VALUES (
                                ${winner.id}, ${winner.contest_id}, ${winner.message_id},
                                ${winner.author_id}, ${winner.reaction_count}, ${winner.contest_type},
                                ${winner.rank}, ${winner.week_start}, ${winner.week_end},
                                ${winner.submitted_at}
                            )
                            ON CONFLICT (id) DO UPDATE SET
                                reaction_count = EXCLUDED.reaction_count,
                                rank = EXCLUDED.rank
                        `;
                    }

                    // Aggregate wins per author and update their stats.
                    const statsByUser = new Map<string, { memeWins: number; boneWins: number }>();
                    for (const winner of winners) {
                        const stats = statsByUser.get(winner.author_id) ?? {
                            memeWins: 0,
                            boneWins: 0,
                        };
                        if (winner.contest_type === 'meme') {
                            stats.memeWins += 1;
                        } else {
                            stats.boneWins += 1;
                        }
                        statsByUser.set(winner.author_id, stats);
                    }

                    for (const [userId, stats] of statsByUser.entries()) {
                        yield* users.ensureUserId(userId);
                        yield* sql`
                            INSERT INTO user_stats (user_id, total_meme_wins, total_bone_wins, updated_at)
                            VALUES (${userId}, ${stats.memeWins}, ${stats.boneWins}, NOW())
                            ON CONFLICT (user_id)
                            DO UPDATE SET
                                total_meme_wins = user_stats.total_meme_wins + ${stats.memeWins},
                                total_bone_wins = user_stats.total_bone_wins + ${stats.boneWins},
                                updated_at = NOW()
                        `;
                    }
                })
            );
            yield* Effect.logDebug(`addMemeWinners: inserted ${winners.length} winners`);
        });

        // Repairs a contest produced by the historical zero-duration bug and
        // inserts only previously missing winners. Stats are incremented from
        // INSERT ... RETURNING rows, making retries safe.
        const backfillWeeklyContest = Effect.fn('MemeRepository.backfillWeeklyContest')(function* (
            contestId: string,
            recoveredEndDate: Date,
            winners: ReadonlyArray<MemeWinnerInsert>
        ) {
            return yield* sql.withTransaction(
                Effect.gen(function* () {
                    const repairedRows = yield* sql`
                        UPDATE meme_contests
                        SET end_date = ${recoveredEndDate}
                        WHERE id = ${contestId}
                          AND type = 'weekly'
                          AND status = 'completed'
                          AND end_date <= start_date
                        RETURNING id
                    `;
                    const repaired = yield* decodeWinnerIdRows(repairedRows);
                    if (repaired.length === 0) {
                        return { repaired: false, insertedWinners: 0 } as const;
                    }

                    const authorIds = [...new Set(winners.map(winner => winner.author_id))];
                    for (const authorId of authorIds) {
                        yield* users.ensureUserId(authorId);
                    }

                    const insertedWinners: MemeWinnerInsert[] = [];
                    for (const winner of winners) {
                        const insertedRows = yield* sql`
                            INSERT INTO meme_winners (
                                id, contest_id, message_id, author_id, reaction_count,
                                contest_type, rank, week_start, week_end, submitted_at
                            )
                            VALUES (
                                ${winner.id}, ${winner.contest_id}, ${winner.message_id},
                                ${winner.author_id}, ${winner.reaction_count},
                                ${winner.contest_type}, ${winner.rank}, ${winner.week_start},
                                ${winner.week_end}, ${winner.submitted_at}
                            )
                            ON CONFLICT (id) DO NOTHING
                            RETURNING id
                        `;
                        const inserted = yield* decodeWinnerIdRows(insertedRows);
                        if (inserted.length > 0) {
                            insertedWinners.push(winner);
                        }
                    }

                    const statsByUser = new Map<string, { memeWins: number; boneWins: number }>();
                    for (const winner of insertedWinners) {
                        const stats = statsByUser.get(winner.author_id) ?? {
                            memeWins: 0,
                            boneWins: 0,
                        };
                        if (winner.contest_type === 'meme') {
                            stats.memeWins += 1;
                        } else {
                            stats.boneWins += 1;
                        }
                        statsByUser.set(winner.author_id, stats);
                    }

                    for (const [userId, stats] of statsByUser.entries()) {
                        yield* sql`
                            INSERT INTO user_stats (
                                user_id, total_meme_wins, total_bone_wins, updated_at
                            )
                            VALUES (${userId}, ${stats.memeWins}, ${stats.boneWins}, NOW())
                            ON CONFLICT (user_id)
                            DO UPDATE SET
                                total_meme_wins = user_stats.total_meme_wins + ${stats.memeWins},
                                total_bone_wins = user_stats.total_bone_wins + ${stats.boneWins},
                                updated_at = NOW()
                        `;
                    }

                    return {
                        repaired: true,
                        insertedWinners: insertedWinners.length,
                    } as const;
                })
            );
        });

        const getContestWinners = Effect.fn('MemeRepository.getContestWinners')(function* (
            contestId: string
        ) {
            const rows = yield* sql`
                SELECT * FROM meme_winners
                WHERE contest_id = ${contestId}
                ORDER BY contest_type, rank
            `;
            return yield* decodeWinnerRows(rows);
        });

        const getTopContributors = Effect.fn('MemeRepository.getTopContributors')(function* (
            limit: number
        ) {
            const rows = yield* sql`
                SELECT
                    user_id,
                    (total_meme_wins + total_bone_wins) as total_wins,
                    total_meme_wins as meme_wins,
                    total_bone_wins as bone_wins
                FROM user_stats
                ORDER BY total_wins DESC
                LIMIT ${limit}
            `;
            return yield* decodeTopContributorRows(rows);
        });

        const countWinnersByContestType = Effect.fn('MemeRepository.countWinnersByContestType')(
            function* (type: 'weekly' | 'yearly') {
                const rows = yield* sql`
                    SELECT COUNT(*) as count
                    FROM meme_winners mw
                    JOIN meme_contests mc ON mw.contest_id = mc.id
                    WHERE mc.type = ${type}
                `;
                const counts = yield* decodeCountRows(rows);
                return counts[0].count;
            }
        );

        const getMemeStats = Effect.fn('MemeRepository.getMemeStats')(function* () {
            const totalsRows = yield* sql`
                SELECT
                    SUM(total_meme_wins) as total_memes,
                    SUM(total_bone_wins) as total_bones
                FROM user_stats
            `;
            const totals = yield* decodeTotalsRows(totalsRows);

            return {
                totalMemes: totals[0].total_memes ?? 0,
                totalBones: totals[0].total_bones ?? 0,
                weeklyWinners: yield* countWinnersByContestType('weekly'),
                yearlyWinners: yield* countWinnersByContestType('yearly'),
            };
        });

        return {
            createContest,
            getContest,
            getActiveContests,
            getLatestWeeklyContest,
            getLatestFailedWeeklyContest,
            updateContestMessageId,
            completeContest,
            addMemeWinners,
            backfillWeeklyContest,
            getContestWinners,
            getTopContributors,
            getMemeStats,
        } as const;
    }),
}) {
    static readonly layer = Layer.effect(MemeRepository)(MemeRepository.make);
}
