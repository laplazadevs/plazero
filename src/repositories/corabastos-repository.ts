import type { CorabastosStats } from '../types/corabastos.js';
import type { PlazeroUser } from '../types/user.js';
import { Context, Effect, Layer, Schema } from 'effect';
import * as SqlClient from 'effect/unstable/sql/SqlClient';
import type * as SqlError from 'effect/unstable/sql/SqlError';
import { randomUUID } from 'node:crypto';

import { UserRepository } from './user-repository.js';
import {
    CorabastosAgendaRow,
    CorabastosEmergencyConfirmationRow,
    CorabastosEmergencyRequestRow,
    CorabastosSessionRow,
    CountRow,
} from '../db/schemas.js';

const decodeSessionRows = Schema.decodeUnknownEffect(Schema.Array(CorabastosSessionRow));
const decodeAgendaRows = Schema.decodeUnknownEffect(Schema.Array(CorabastosAgendaRow));
const decodeRequestRows = Schema.decodeUnknownEffect(Schema.Array(CorabastosEmergencyRequestRow));
const decodeConfirmationRows = Schema.decodeUnknownEffect(
    Schema.Array(CorabastosEmergencyConfirmationRow)
);
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

            const getSessionByWeek = Effect.fn('CorabastosRepository.getSessionByWeek')(function* (
                weekStart: Date
            ) {
                const rows = yield* sql`
                    SELECT * FROM corabastos_sessions
                    WHERE week_start = ${weekStart}
                    ORDER BY created_at DESC
                    LIMIT 1
                `;
                const sessions = yield* decodeSessionRows(rows);
                return sessions.length > 0 ? sessions[0] : null;
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

            const updateSessionStatus = Effect.fn('CorabastosRepository.updateSessionStatus')(
                function* (
                    sessionId: string,
                    status: 'scheduled' | 'active' | 'completed' | 'cancelled'
                ) {
                    yield* sql`
                        UPDATE corabastos_sessions
                        SET status = ${status}, updated_at = NOW()
                        WHERE id = ${sessionId}
                    `;
                }
            );

            const updateSessionAnnouncement = Effect.fn(
                'CorabastosRepository.updateSessionAnnouncement'
            )(function* (sessionId: string, messageId: string, channelId: string) {
                yield* sql`
                    UPDATE corabastos_sessions
                    SET announcement_message_id = ${messageId},
                        announcement_channel_id = ${channelId},
                        updated_at = NOW()
                    WHERE id = ${sessionId}
                `;
            });

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

            const getEmergencyConfirmations = Effect.fn(
                'CorabastosRepository.getEmergencyConfirmations'
            )(function* (requestId: string) {
                const rows = yield* sql`
                    SELECT * FROM corabastos_emergency_confirmations
                    WHERE request_id = ${requestId}
                    ORDER BY confirmed_at
                `;
                return yield* decodeConfirmationRows(rows);
            });

            const recordAttendance = Effect.fn('CorabastosRepository.recordAttendance')(function* (
                sessionId: string,
                user: PlazeroUser
            ) {
                yield* sql.withTransaction(
                    Effect.gen(function* () {
                        yield* users.upsertUser(user);
                        yield* sql`
                            INSERT INTO corabastos_attendance (session_id, user_id)
                            VALUES (${sessionId}, ${user.id})
                            ON CONFLICT (session_id, user_id) DO NOTHING
                        `;
                    })
                );
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

            const cleanupOldSessions = Effect.fn('CorabastosRepository.cleanupOldSessions')(
                function* (daysOld: number) {
                    const rows = yield* sql`
                        DELETE FROM corabastos_sessions
                        WHERE status IN ('completed', 'cancelled')
                        AND created_at < NOW() - make_interval(days => ${daysOld})
                        RETURNING 1 AS deleted
                    `;
                    return rows.length;
                }
            );

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
                getSessionByWeek,
                getCurrentWeekSession,
                updateSessionStatus,
                updateSessionAnnouncement,
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
                getEmergencyConfirmations,
                recordAttendance,
                getStats,
                getUserData,
                cleanupExpiredEmergencyRequests,
                cleanupOldSessions,
                hasNotificationBeenSent,
                markNotificationSent,
                cleanupOldNotifications,
            } as const;
        }),
    }
) {}

export const CorabastosRepositoryLive = Layer.effect(CorabastosRepository)(
    CorabastosRepository.make
);
