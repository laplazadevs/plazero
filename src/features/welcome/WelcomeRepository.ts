import { Context, Effect, Layer, Schema } from 'effect';
import * as SqlClient from 'effect/unstable/sql/SqlClient';

import { CountRow } from '../../db/Rows.js';
import type { PlazeroUser } from '../../domain/User.js';
import { UserRepository } from '../../domain/UserRepository.js';

// Row schema for the `welcome_requests` table. The `pg` driver already converts
// TIMESTAMP columns to `Date` instances.
export class WelcomeRequestRow extends Schema.Class<WelcomeRequestRow>('WelcomeRequestRow')({
    id: Schema.String,
    user_id: Schema.String,
    join_time: Schema.Date,
    message_id: Schema.String,
    channel_id: Schema.String,
    linkedin_url: Schema.NullOr(Schema.String),
    presentation: Schema.NullOr(Schema.String),
    invited_by: Schema.NullOr(Schema.String),
    approved: Schema.Boolean,
    approved_by_id: Schema.NullOr(Schema.String),
    approved_at: Schema.NullOr(Schema.Date),
    created_at: Schema.Date,
}) {}

export interface WelcomeRequestUpdates {
    readonly linkedin_url?: string;
    readonly presentation?: string;
    readonly invited_by?: string;
    readonly message_id?: string;
}

const decodeWelcomeRows = Schema.decodeUnknownEffect(Schema.Array(WelcomeRequestRow));
const decodeCountRows = Schema.decodeUnknownEffect(Schema.Array(CountRow));

export class WelcomeRepository extends Context.Service<WelcomeRepository>()(
    'plazero/WelcomeRepository',
    {
        make: Effect.gen(function* () {
            const sql = yield* SqlClient.SqlClient;
            const users = yield* UserRepository;

            const createWelcomeRequest = Effect.fn('WelcomeRepository.createWelcomeRequest')(
                function* (
                    requestId: string,
                    user: PlazeroUser,
                    messageId: string,
                    channelId: string
                ) {
                    return yield* sql.withTransaction(
                        Effect.gen(function* () {
                            yield* users.upsertUser(user);

                            const rows = yield* sql`
                                INSERT INTO welcome_requests (
                                    id, user_id, join_time, message_id, channel_id, approved, created_at
                                )
                                VALUES (${requestId}, ${user.id}, NOW(), ${messageId}, ${channelId}, FALSE, NOW())
                                RETURNING *
                            `;
                            const requests = yield* decodeWelcomeRows(rows);
                            return requests[0];
                        })
                    );
                }
            );

            const getWelcomeRequest = Effect.fn('WelcomeRepository.getWelcomeRequest')(function* (
                requestId: string
            ) {
                const rows = yield* sql`SELECT * FROM welcome_requests WHERE id = ${requestId}`;
                const requests = yield* decodeWelcomeRows(rows);
                return requests.length > 0 ? requests[0] : null;
            });

            const updateWelcomeRequest = Effect.fn('WelcomeRepository.updateWelcomeRequest')(
                function* (requestId: string, updates: WelcomeRequestUpdates) {
                    const fields: Record<string, string> = {};
                    if (updates.linkedin_url !== undefined)
                        fields.linkedin_url = updates.linkedin_url;
                    if (updates.presentation !== undefined)
                        fields.presentation = updates.presentation;
                    if (updates.invited_by !== undefined) fields.invited_by = updates.invited_by;
                    if (updates.message_id !== undefined) fields.message_id = updates.message_id;

                    if (Object.keys(fields).length === 0) {
                        yield* Effect.logDebug(
                            `No updates to apply for welcome request: ${requestId}`
                        );
                        return false;
                    }

                    const rows = yield* sql`
                        UPDATE welcome_requests
                        SET ${sql.update(fields)}
                        WHERE id = ${requestId}
                        RETURNING 1 AS updated
                    `;
                    return rows.length > 0;
                }
            );

            const approveWelcomeRequest = Effect.fn('WelcomeRepository.approveWelcomeRequest')(
                function* (requestId: string, approvedBy: PlazeroUser) {
                    return yield* sql.withTransaction(
                        Effect.gen(function* () {
                            yield* users.upsertUser(approvedBy);

                            const rows = yield* sql`
                                UPDATE welcome_requests
                                SET approved = TRUE,
                                    approved_by_id = ${approvedBy.id},
                                    approved_at = NOW()
                                WHERE id = ${requestId} AND approved = FALSE
                                RETURNING 1 AS updated
                            `;
                            return rows.length > 0;
                        })
                    );
                }
            );

            const getPendingRequests = Effect.fn('WelcomeRepository.getPendingRequests')(
                function* () {
                    const rows = yield* sql`
                        SELECT * FROM welcome_requests
                        WHERE approved = FALSE
                        ORDER BY created_at DESC
                    `;
                    return yield* decodeWelcomeRows(rows);
                }
            );

            const countRequests = Effect.fn('WelcomeRepository.countRequests')(function* (
                approved: boolean | null
            ) {
                const rows =
                    approved === null
                        ? yield* sql`SELECT COUNT(*) FROM welcome_requests`
                        : yield* sql`SELECT COUNT(*) FROM welcome_requests WHERE approved = ${approved}`;
                const counts = yield* decodeCountRows(rows);
                return counts[0].count;
            });

            const getWelcomeStats = Effect.fn('WelcomeRepository.getWelcomeStats')(function* () {
                return {
                    total: yield* countRequests(null),
                    pending: yield* countRequests(false),
                    approved: yield* countRequests(true),
                };
            });

            return {
                createWelcomeRequest,
                getWelcomeRequest,
                updateWelcomeRequest,
                approveWelcomeRequest,
                getPendingRequests,
                getWelcomeStats,
            } as const;
        }),
    }
) {
    static readonly layer = Layer.effect(WelcomeRepository)(WelcomeRepository.make);
}
