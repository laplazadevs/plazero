import type { PlazeroUser } from '../types/user.js';
import { Context, Effect, Layer, Schema } from 'effect';
import * as SqlClient from 'effect/unstable/sql/SqlClient';

import { UserRepository } from './user-repository.js';
import { CountRow, WelcomeRequestRow } from '../db/schemas.js';

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

            const getWelcomeRequestByMessageId = Effect.fn(
                'WelcomeRepository.getWelcomeRequestByMessageId'
            )(function* (messageId: string) {
                const rows = yield* sql`
                    SELECT * FROM welcome_requests WHERE message_id = ${messageId}
                `;
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

            const getApprovedRequests = Effect.fn('WelcomeRepository.getApprovedRequests')(
                function* () {
                    const rows = yield* sql`
                        SELECT * FROM welcome_requests
                        WHERE approved = TRUE
                        ORDER BY approved_at DESC
                    `;
                    return yield* decodeWelcomeRows(rows);
                }
            );

            const deleteWelcomeRequest = Effect.fn('WelcomeRepository.deleteWelcomeRequest')(
                function* (requestId: string) {
                    const rows = yield* sql`
                        DELETE FROM welcome_requests WHERE id = ${requestId} RETURNING 1 AS deleted
                    `;
                    return rows.length > 0;
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
                getWelcomeRequestByMessageId,
                updateWelcomeRequest,
                approveWelcomeRequest,
                getPendingRequests,
                getApprovedRequests,
                deleteWelcomeRequest,
                getWelcomeStats,
            } as const;
        }),
    }
) {}

export const WelcomeRepositoryLive = Layer.effect(WelcomeRepository)(WelcomeRepository.make);
