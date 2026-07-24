import { randomUUID } from 'node:crypto';
import { Context, Effect, Layer, Schema } from 'effect';
import * as SqlClient from 'effect/unstable/sql/SqlClient';
import type * as SqlError from 'effect/unstable/sql/SqlError';

import { CountRow } from '../../db/Rows.js';
import type { PlazeroUser } from '../../domain/User.js';
import { UserRepository } from '../../domain/UserRepository.js';
import type { CorabastosStats } from './CorabastosDomain.js';

// Row schemas for the corabastos tables. The `pg` driver already converts
// TIMESTAMP columns to `Date` instances and INTEGER columns to numbers.
export class CorabastosSessionRow extends Schema.Class<CorabastosSessionRow>(
    'CorabastosSessionRow'
)({
    id: Schema.String,
    week_start: Schema.Date,
    week_end: Schema.Date,
    scheduled_time: Schema.NullOr(Schema.Date),
    status: Schema.Literals(['scheduled', 'active', 'completed', 'cancelled']),
    type: Schema.Literals(['regular', 'emergency']),
    channel_id: Schema.NullOr(Schema.String),
    announcement_message_id: Schema.NullOr(Schema.String),
    announcement_channel_id: Schema.NullOr(Schema.String),
    created_by_id: Schema.NullOr(Schema.String),
    created_at: Schema.Date,
    updated_at: Schema.Date,
}) {}

export class CorabastosAgendaRow extends Schema.Class<CorabastosAgendaRow>('CorabastosAgendaRow')({
    id: Schema.String,
    session_id: Schema.String,
    user_id: Schema.String,
    turno: Schema.Number,
    topic: Schema.String,
    description: Schema.NullOr(Schema.String),
    status: Schema.Literals(['pending', 'confirmed', 'completed', 'cancelled']),
    confirmation_message_id: Schema.NullOr(Schema.String),
    order_index: Schema.Number,
    created_at: Schema.Date,
    updated_at: Schema.Date,
}) {}

export class CorabastosEmergencyRequestRow extends Schema.Class<CorabastosEmergencyRequestRow>(
    'CorabastosEmergencyRequestRow'
)({
    id: Schema.String,
    requested_by_id: Schema.String,
    reason: Schema.String,
    paciente_id: Schema.String,
    status: Schema.Literals(['pending', 'approved', 'rejected', 'cancelled']),
    confirmation_message_id: Schema.NullOr(Schema.String),
    confirmations_needed: Schema.Number,
    confirmations_received: Schema.Number,
    expires_at: Schema.NullOr(Schema.Date),
    approved_at: Schema.NullOr(Schema.Date),
    session_id: Schema.NullOr(Schema.String),
    created_at: Schema.Date,
    updated_at: Schema.Date,
}) {}

const decodeSessionRows = Schema.decodeUnknownEffect(Schema.Array(CorabastosSessionRow));
const decodeAgendaRows = Schema.decodeUnknownEffect(Schema.Array(CorabastosAgendaRow));
const decodeRequestRows = Schema.decodeUnknownEffect(Schema.Array(CorabastosEmergencyRequestRow));
const decodeCountRows = Schema.decodeUnknownEffect(Schema.Array(CountRow));

const NextOrderRow = Schema.Struct({ next_order: Schema.Number });
const decodeNextOrderRows = Schema.decodeUnknownEffect(Schema.Array(NextOrderRow));

export class CorabastosRepository extends Context.Service<CorabastosRepository>()(
    'plazero/CorabastosRepository',
    {
        make: Effect.gen(function* () {
            const sql = yield* SqlClient.SqlClient;
            const users = yield* UserRepository;

            const countQuery = Effect.fn('CorabastosRepository.countQuery')(function* (
                statement: Effect.Effect<ReadonlyArray<object>, SqlError.SqlError>
            ) {
                const rows = yield* statement;
                const counts = yield* decodeCountRows(rows);
                return counts[0].count;
            });

            // Session management
            const createSession = Effect.fn('CorabastosRepository.createSession')(function* (
                weekStart: Date,
                weekEnd: Date,
                type: 'regular' | 'emergency',
                scheduledTime?: Date,
                createdBy?: PlazeroUser
            ) {
                return yield* sql.withTransaction(
                    Effect.gen(function* () {
                        const sessionId = randomUUID();

                        if (createdBy) {
                            yield* users.upsertUser(createdBy);
                        }

                        const rows = yield* sql`
                            INSERT INTO corabastos_sessions (
                                id, week_start, week_end, scheduled_time, type,
                                created_by_id, created_at, updated_at
                            )
                            VALUES (
                                ${sessionId}, ${weekStart}, ${weekEnd}, ${scheduledTime ?? null},
                                ${type}, ${createdBy?.id ?? null}, NOW(), NOW()
                            )
                            RETURNING *
                        `;
                        const sessions = yield* decodeSessionRows(rows);
                        return sessions[0];
                    })
                );
            });

            const getCurrentWeekSession = Effect.fn('CorabastosRepository.getCurrentWeekSession')(
                function* () {
                    const rows = yield* sql`
                        SELECT * FROM corabastos_sessions
                        WHERE week_start <= NOW() AND week_end >= NOW()
                        ORDER BY created_at DESC
                        LIMIT 1
                    `;
                    const sessions = yield* decodeSessionRows(rows);
                    return sessions.length > 0 ? sessions[0] : null;
                }
            );

            // Agenda management
            const addAgendaItem = Effect.fn('CorabastosRepository.addAgendaItem')(function* (
                sessionId: string,
                user: PlazeroUser,
                turno: number,
                topic: string,
                description?: string
            ) {
                return yield* sql.withTransaction(
                    Effect.gen(function* () {
                        yield* users.upsertUser(user);

                        const agendaId = randomUUID();

                        const orderRows = yield* sql`
                            SELECT COALESCE(MAX(order_index), -1) + 1 as next_order
                            FROM corabastos_agenda
                            WHERE session_id = ${sessionId} AND turno = ${turno}
                        `;
                        const orders = yield* decodeNextOrderRows(orderRows);
                        const orderIndex = orders[0].next_order;

                        const rows = yield* sql`
                            INSERT INTO corabastos_agenda (
                                id, session_id, user_id, turno, topic, description,
                                order_index, created_at, updated_at
                            )
                            VALUES (
                                ${agendaId}, ${sessionId}, ${user.id}, ${turno}, ${topic},
                                ${description ?? null}, ${orderIndex}, NOW(), NOW()
                            )
                            RETURNING *
                        `;
                        const items = yield* decodeAgendaRows(rows);
                        return items[0];
                    })
                );
            });

            const confirmAgendaItem = Effect.fn('CorabastosRepository.confirmAgendaItem')(
                function* (agendaId: string, messageId: string) {
                    yield* sql`
                        UPDATE corabastos_agenda
                        SET status = 'confirmed', confirmation_message_id = ${messageId}, updated_at = NOW()
                        WHERE id = ${agendaId}
                    `;
                }
            );

            const cancelAgendaItem = Effect.fn('CorabastosRepository.cancelAgendaItem')(function* (
                agendaId: string
            ) {
                yield* sql`
                    UPDATE corabastos_agenda
                    SET status = 'cancelled', updated_at = NOW()
                    WHERE id = ${agendaId}
                `;
            });

            const getSessionAgenda = Effect.fn('CorabastosRepository.getSessionAgenda')(function* (
                sessionId: string
            ) {
                const rows = yield* sql`
                    SELECT * FROM corabastos_agenda
                    WHERE session_id = ${sessionId} AND status NOT IN ('cancelled')
                    ORDER BY turno, order_index
                `;
                return yield* decodeAgendaRows(rows);
            });

            const getUserAgendaItems = Effect.fn('CorabastosRepository.getUserAgendaItems')(
                function* (sessionId: string, userId: string) {
                    const rows = yield* sql`
                        SELECT * FROM corabastos_agenda
                        WHERE session_id = ${sessionId} AND user_id = ${userId}
                            AND status NOT IN ('cancelled')
                        ORDER BY turno, order_index
                    `;
                    return yield* decodeAgendaRows(rows);
                }
            );

            // Emergency requests
            const createEmergencyRequest = Effect.fn('CorabastosRepository.createEmergencyRequest')(
                function* (user: PlazeroUser, reason: string, paciente: PlazeroUser) {
                    return yield* sql.withTransaction(
                        Effect.gen(function* () {
                            yield* users.upsertUser(user);
                            yield* users.upsertUser(paciente);

                            const requestId = randomUUID();
                            const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);

                            const rows = yield* sql`
                            INSERT INTO corabastos_emergency_requests (
                                id, requested_by_id, reason, paciente_id, expires_at,
                                created_at, updated_at
                            )
                            VALUES (
                                ${requestId}, ${user.id}, ${reason}, ${paciente.id}, ${expiresAt},
                                NOW(), NOW()
                            )
                            RETURNING *
                        `;
                            const requests = yield* decodeRequestRows(rows);
                            return requests[0];
                        })
                    );
                }
            );

            const updateEmergencyRequestMessage = Effect.fn(
                'CorabastosRepository.updateEmergencyRequestMessage'
            )(function* (requestId: string, messageId: string) {
                yield* sql`
                    UPDATE corabastos_emergency_requests
                    SET confirmation_message_id = ${messageId}, updated_at = NOW()
                    WHERE id = ${requestId}
                `;
            });

            const addEmergencyConfirmation = Effect.fn(
                'CorabastosRepository.addEmergencyConfirmation'
            )(function* (requestId: string, user: PlazeroUser) {
                return yield* sql.withTransaction(
                    Effect.gen(function* () {
                        yield* users.upsertUser(user);

                        const existing = yield* sql`
                            SELECT id FROM corabastos_emergency_confirmations
                            WHERE request_id = ${requestId} AND user_id = ${user.id}
                        `;
                        if (existing.length > 0) {
                            return false;
                        }

                        yield* sql`
                            INSERT INTO corabastos_emergency_confirmations (request_id, user_id)
                            VALUES (${requestId}, ${user.id})
                        `;
                        yield* sql`
                            UPDATE corabastos_emergency_requests
                            SET confirmations_received = confirmations_received + 1, updated_at = NOW()
                            WHERE id = ${requestId}
                        `;
                        return true;
                    })
                );
            });

            const hasPacienteConfirmed = Effect.fn('CorabastosRepository.hasPacienteConfirmed')(
                function* (requestId: string, pacienteId: string) {
                    const count = yield* countQuery(
                        sql`
                            SELECT COUNT(*) as count
                            FROM corabastos_emergency_confirmations
                            WHERE request_id = ${requestId} AND user_id = ${pacienteId}
                        `
                    );
                    return count > 0;
                }
            );

            const getEmergencyRequest = Effect.fn('CorabastosRepository.getEmergencyRequest')(
                function* (requestId: string) {
                    const rows = yield* sql`
                        SELECT * FROM corabastos_emergency_requests WHERE id = ${requestId}
                    `;
                    const requests = yield* decodeRequestRows(rows);
                    return requests.length > 0 ? requests[0] : null;
                }
            );

            const updateEmergencyRequestStatus = Effect.fn(
                'CorabastosRepository.updateEmergencyRequestStatus'
            )(function* (requestId: string, status: 'approved' | 'rejected' | 'cancelled') {
                const approvedAt = status === 'approved' ? new Date() : null;
                yield* sql`
                    UPDATE corabastos_emergency_requests
                    SET status = ${status}, approved_at = ${approvedAt}, updated_at = NOW()
                    WHERE id = ${requestId}
                `;
            });

            const linkEmergencyToSession = Effect.fn('CorabastosRepository.linkEmergencyToSession')(
                function* (requestId: string, sessionId: string) {
                    yield* sql`
                    UPDATE corabastos_emergency_requests
                    SET session_id = ${sessionId}, updated_at = NOW()
                    WHERE id = ${requestId}
                `;
                }
            );

            const getPendingEmergencyRequests = Effect.fn(
                'CorabastosRepository.getPendingEmergencyRequests'
            )(function* () {
                const rows = yield* sql`
                    SELECT * FROM corabastos_emergency_requests
                    WHERE status = 'pending' AND expires_at > NOW()
                    ORDER BY created_at DESC
                `;
                return yield* decodeRequestRows(rows);
            });

            // Statistics
            const getStats = Effect.fn('CorabastosRepository.getStats')(function* () {
                const stats: CorabastosStats = {
                    totalSessions: yield* countQuery(
                        sql`SELECT COUNT(*) as count FROM corabastos_sessions`
                    ),
                    activeSessions: yield* countQuery(
                        sql`SELECT COUNT(*) as count FROM corabastos_sessions WHERE status = 'active'`
                    ),
                    totalAgendaItems: yield* countQuery(
                        sql`SELECT COUNT(*) as count FROM corabastos_agenda`
                    ),
                    totalEmergencyRequests: yield* countQuery(
                        sql`SELECT COUNT(*) as count FROM corabastos_emergency_requests`
                    ),
                    thisWeekAgendaItems: yield* countQuery(
                        sql`
                            SELECT COUNT(*) as count
                            FROM corabastos_agenda ca
                            JOIN corabastos_sessions cs ON ca.session_id = cs.id
                            WHERE cs.week_start <= NOW() AND cs.week_end >= NOW()
                        `
                    ),
                    emergencyRequestsPending: yield* countQuery(
                        sql`
                            SELECT COUNT(*) as count
                            FROM corabastos_emergency_requests
                            WHERE status = 'pending' AND expires_at > NOW()
                        `
                    ),
                };
                return stats;
            });

            // User data helper
            const getUserData = Effect.fn('CorabastosRepository.getUserData')(function* (
                userId: string
            ) {
                return yield* users.getUser(userId);
            });

            // Cleanup operations
            const cleanupExpiredEmergencyRequests = Effect.fn(
                'CorabastosRepository.cleanupExpiredEmergencyRequests'
            )(function* () {
                const rows = yield* sql`
                    UPDATE corabastos_emergency_requests
                    SET status = 'rejected', updated_at = NOW()
                    WHERE status = 'pending' AND expires_at <= NOW()
                    RETURNING 1 AS updated
                `;
                return rows.length;
            });

            // Turno notification tracking
            const hasNotificationBeenSent = Effect.fn(
                'CorabastosRepository.hasNotificationBeenSent'
            )(function* (sessionId: string, turno: number, date: Date) {
                const count = yield* countQuery(
                    sql`
                        SELECT COUNT(*) as count
                        FROM turno_notifications
                        WHERE session_id = ${sessionId} AND turno = ${turno}
                            AND notification_date = ${date}
                    `
                );
                return count > 0;
            });

            const markNotificationSent = Effect.fn('CorabastosRepository.markNotificationSent')(
                function* (sessionId: string, turno: number, date: Date) {
                    yield* sql`
                        INSERT INTO turno_notifications (session_id, turno, notification_date)
                        VALUES (${sessionId}, ${turno}, ${date})
                        ON CONFLICT (session_id, turno, notification_date) DO NOTHING
                    `;
                }
            );

            const cleanupOldNotifications = Effect.fn(
                'CorabastosRepository.cleanupOldNotifications'
            )(function* (daysOld: number) {
                const rows = yield* sql`
                    DELETE FROM turno_notifications
                    WHERE sent_at < NOW() - make_interval(days => ${daysOld})
                    RETURNING 1 AS deleted
                `;
                return rows.length;
            });

            return {
                createSession,
                getCurrentWeekSession,
                addAgendaItem,
                confirmAgendaItem,
                cancelAgendaItem,
                getSessionAgenda,
                getUserAgendaItems,
                createEmergencyRequest,
                updateEmergencyRequestMessage,
                addEmergencyConfirmation,
                hasPacienteConfirmed,
                getEmergencyRequest,
                updateEmergencyRequestStatus,
                linkEmergencyToSession,
                getPendingEmergencyRequests,
                getStats,
                getUserData,
                cleanupExpiredEmergencyRequests,
                hasNotificationBeenSent,
                markNotificationSent,
                cleanupOldNotifications,
            } as const;
        }),
    }
) {
    static readonly layer = Layer.effect(CorabastosRepository)(CorabastosRepository.make);
}
