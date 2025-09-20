import { User } from 'discord.js';
import { v4 as uuidv4 } from 'uuid';

import { UserRepository } from './user-repository.js';
import { DatabaseService } from '../services/database-service.js';
import {
    CorabastosAgendaData,
    CorabastosEmergencyConfirmationData,
    CorabastosEmergencyRequestData,
    CorabastosSessionData,
    CorabastosStats,
} from '../types/corabastos.js';

export class CorabastosRepository {
    private db: DatabaseService;
    private userRepo: UserRepository;

    constructor() {
        this.db = DatabaseService.getInstance();
        this.userRepo = new UserRepository();
    }

    // Session management
    public async createSession(
        weekStart: Date,
        weekEnd: Date,
        type: 'regular' | 'emergency' = 'regular',
        scheduledTime?: Date,
        createdBy?: User
    ): Promise<CorabastosSessionData> {
        return await this.db.transaction(async client => {
            const sessionId = uuidv4();

            // Ensure user exists if provided
            if (createdBy) {
                await this.userRepo.upsertUser(createdBy);
            }

            const query = `
                INSERT INTO corabastos_sessions (
                    id, week_start, week_end, scheduled_time, type, 
                    created_by_id, created_at, updated_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
                RETURNING *
            `;

            const result = await client.query(query, [
                sessionId,
                weekStart,
                weekEnd,
                scheduledTime,
                type,
                createdBy?.id || null,
            ]);

            return result.rows[0];
        });
    }

    public async getSessionByWeek(weekStart: Date): Promise<CorabastosSessionData | null> {
        const query = `
            SELECT * FROM corabastos_sessions 
            WHERE week_start = $1 
            ORDER BY created_at DESC 
            LIMIT 1
        `;
        const result = await this.db.query(query, [weekStart]);
        return result.rows[0] || null;
    }

    public async getCurrentWeekSession(): Promise<CorabastosSessionData | null> {
        const query = `
            SELECT * FROM corabastos_sessions 
            WHERE week_start <= NOW() AND week_end >= NOW() 
            ORDER BY created_at DESC 
            LIMIT 1
        `;
        const result = await this.db.query(query);
        return result.rows[0] || null;
    }

    public async updateSessionStatus(
        sessionId: string,
        status: 'scheduled' | 'active' | 'completed' | 'cancelled'
    ): Promise<void> {
        const query = `
            UPDATE corabastos_sessions 
            SET status = $1, updated_at = NOW() 
            WHERE id = $2
        `;
        await this.db.query(query, [status, sessionId]);
    }

    public async updateSessionAnnouncement(
        sessionId: string,
        messageId: string,
        channelId: string
    ): Promise<void> {
        const query = `
            UPDATE corabastos_sessions 
            SET announcement_message_id = $1, announcement_channel_id = $2, updated_at = NOW() 
            WHERE id = $3
        `;
        await this.db.query(query, [messageId, channelId, sessionId]);
    }

    // Agenda management
    public async addAgendaItem(
        sessionId: string,
        user: User,
        turno: number,
        topic: string,
        description?: string
    ): Promise<CorabastosAgendaData> {
        return await this.db.transaction(async client => {
            // Ensure user exists
            await this.userRepo.upsertUser(user);

            const agendaId = uuidv4();

            // Get next order index for this turno
            const orderResult = await client.query(
                `
                SELECT COALESCE(MAX(order_index), -1) + 1 as next_order 
                FROM corabastos_agenda 
                WHERE session_id = $1 AND turno = $2
            `,
                [sessionId, turno]
            );
            const orderIndex = orderResult.rows[0].next_order;

            const query = `
                INSERT INTO corabastos_agenda (
                    id, session_id, user_id, turno, topic, description, 
                    order_index, created_at, updated_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
                RETURNING *
            `;

            const result = await client.query(query, [
                agendaId,
                sessionId,
                user.id,
                turno,
                topic,
                description,
                orderIndex,
            ]);

            return result.rows[0];
        });
    }

    public async confirmAgendaItem(agendaId: string, messageId: string): Promise<void> {
        const query = `
            UPDATE corabastos_agenda 
            SET status = 'confirmed', confirmation_message_id = $1, updated_at = NOW() 
            WHERE id = $2
        `;
        await this.db.query(query, [messageId, agendaId]);
    }

    public async cancelAgendaItem(agendaId: string): Promise<void> {
        const query = `
            UPDATE corabastos_agenda 
            SET status = 'cancelled', updated_at = NOW() 
            WHERE id = $1
        `;
        await this.db.query(query, [agendaId]);
    }

    public async getSessionAgenda(sessionId: string): Promise<CorabastosAgendaData[]> {
        const query = `
            SELECT * FROM corabastos_agenda 
            WHERE session_id = $1 AND status NOT IN ('cancelled') 
            ORDER BY turno, order_index
        `;
        const result = await this.db.query(query, [sessionId]);
        return result.rows;
    }

    public async getUserAgendaItems(
        sessionId: string,
        userId: string
    ): Promise<CorabastosAgendaData[]> {
        const query = `
            SELECT * FROM corabastos_agenda 
            WHERE session_id = $1 AND user_id = $2 AND status NOT IN ('cancelled') 
            ORDER BY turno, order_index
        `;
        const result = await this.db.query(query, [sessionId, userId]);
        return result.rows;
    }

    // Emergency requests management
    public async createEmergencyRequest(
        user: User,
        reason: string,
        paciente: User
    ): Promise<CorabastosEmergencyRequestData> {
        return await this.db.transaction(async client => {
            await this.userRepo.upsertUser(user);
            await this.userRepo.upsertUser(paciente);

            const requestId = uuidv4();
            const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours from now

            const query = `
                INSERT INTO corabastos_emergency_requests (
                    id, requested_by_id, reason, paciente_id, expires_at, 
                    created_at, updated_at
                )
                VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
                RETURNING *
            `;

            const result = await client.query(query, [
                requestId,
                user.id,
                reason,
                paciente.id,
                expiresAt,
            ]);
            return result.rows[0];
        });
    }

    public async updateEmergencyRequestMessage(
        requestId: string,
        messageId: string
    ): Promise<void> {
        const query = `
            UPDATE corabastos_emergency_requests 
            SET confirmation_message_id = $1, updated_at = NOW() 
            WHERE id = $2
        `;
        await this.db.query(query, [messageId, requestId]);
    }

    public async addEmergencyConfirmation(requestId: string, user: User): Promise<boolean> {
        return await this.db.transaction(async client => {
            await this.userRepo.upsertUser(user);

            // Check if user already confirmed
            const existingResult = await client.query(
                'SELECT id FROM corabastos_emergency_confirmations WHERE request_id = $1 AND user_id = $2',
                [requestId, user.id]
            );

            if (existingResult.rows.length > 0) {
                return false; // Already confirmed
            }

            // Add confirmation
            await client.query(
                `
                INSERT INTO corabastos_emergency_confirmations (request_id, user_id) 
                VALUES ($1, $2)
            `,
                [requestId, user.id]
            );

            // Update confirmations count
            await client.query(
                `
                UPDATE corabastos_emergency_requests 
                SET confirmations_received = confirmations_received + 1, updated_at = NOW() 
                WHERE id = $1
            `,
                [requestId]
            );

            return true;
        });
    }

    public async hasPacienteConfirmed(requestId: string, pacienteId: string): Promise<boolean> {
        const query = `
            SELECT COUNT(*) as count 
            FROM corabastos_emergency_confirmations 
            WHERE request_id = $1 AND user_id = $2
        `;
        const result = await this.db.query(query, [requestId, pacienteId]);
        return parseInt(result.rows[0].count) > 0;
    }

    public async getEmergencyRequest(
        requestId: string
    ): Promise<CorabastosEmergencyRequestData | null> {
        const query = 'SELECT * FROM corabastos_emergency_requests WHERE id = $1';
        const result = await this.db.query(query, [requestId]);
        return result.rows[0] || null;
    }

    public async updateEmergencyRequestStatus(
        requestId: string,
        status: 'approved' | 'rejected' | 'cancelled'
    ): Promise<void> {
        const approvedAt = status === 'approved' ? new Date() : null;
        const query = `
            UPDATE corabastos_emergency_requests 
            SET status = $1, approved_at = $2, updated_at = NOW() 
            WHERE id = $3
        `;
        await this.db.query(query, [status, approvedAt, requestId]);
    }

    public async linkEmergencyToSession(requestId: string, sessionId: string): Promise<void> {
        const query = `
            UPDATE corabastos_emergency_requests 
            SET session_id = $1, updated_at = NOW() 
            WHERE id = $2
        `;
        await this.db.query(query, [sessionId, requestId]);
    }

    public async getPendingEmergencyRequests(): Promise<CorabastosEmergencyRequestData[]> {
        const query = `
            SELECT * FROM corabastos_emergency_requests 
            WHERE status = 'pending' AND expires_at > NOW() 
            ORDER BY created_at DESC
        `;
        const result = await this.db.query(query);
        return result.rows;
    }

    public async getEmergencyConfirmations(
        requestId: string
    ): Promise<CorabastosEmergencyConfirmationData[]> {
        const query = `
            SELECT * FROM corabastos_emergency_confirmations 
            WHERE request_id = $1 
            ORDER BY confirmed_at
        `;
        const result = await this.db.query(query, [requestId]);
        return result.rows;
    }

    // Attendance tracking (for future features)
    public async recordAttendance(sessionId: string, user: User): Promise<void> {
        await this.db.transaction(async client => {
            await this.userRepo.upsertUser(user);

            const query = `
                INSERT INTO corabastos_attendance (session_id, user_id) 
                VALUES ($1, $2)
                ON CONFLICT (session_id, user_id) DO NOTHING
            `;
            await client.query(query, [sessionId, user.id]);
        });
    }

    // Statistics
    public async getStats(): Promise<CorabastosStats> {
        const totalSessionsResult = await this.db.query(
            'SELECT COUNT(*) as count FROM corabastos_sessions'
        );
        const activeSessionsResult = await this.db.query(
            'SELECT COUNT(*) as count FROM corabastos_sessions WHERE status = \'active\''
        );
        const totalAgendaResult = await this.db.query(
            'SELECT COUNT(*) as count FROM corabastos_agenda'
        );
        const totalEmergencyResult = await this.db.query(
            'SELECT COUNT(*) as count FROM corabastos_emergency_requests'
        );

        const thisWeekResult = await this.db.query(`
            SELECT COUNT(*) as count 
            FROM corabastos_agenda ca 
            JOIN corabastos_sessions cs ON ca.session_id = cs.id 
            WHERE cs.week_start <= NOW() AND cs.week_end >= NOW()
        `);

        const emergencyPendingResult = await this.db.query(`
            SELECT COUNT(*) as count 
            FROM corabastos_emergency_requests 
            WHERE status = 'pending' AND expires_at > NOW()
        `);

        return {
            totalSessions: parseInt(totalSessionsResult.rows[0]?.count || '0'),
            activeSessions: parseInt(activeSessionsResult.rows[0]?.count || '0'),
            totalAgendaItems: parseInt(totalAgendaResult.rows[0]?.count || '0'),
            totalEmergencyRequests: parseInt(totalEmergencyResult.rows[0]?.count || '0'),
            thisWeekAgendaItems: parseInt(thisWeekResult.rows[0]?.count || '0'),
            emergencyRequestsPending: parseInt(emergencyPendingResult.rows[0]?.count || '0'),
        };
    }

    // Cleanup operations
    public async cleanupExpiredEmergencyRequests(): Promise<number> {
        const query = `
            UPDATE corabastos_emergency_requests 
            SET status = 'rejected', updated_at = NOW() 
            WHERE status = 'pending' AND expires_at <= NOW()
        `;
        const result = await this.db.query(query);
        return result.rowCount || 0;
    }

    public async cleanupOldSessions(daysOld: number = 90): Promise<number> {
        const query = `
            DELETE FROM corabastos_sessions 
            WHERE status IN ('completed', 'cancelled') 
            AND created_at < NOW() - INTERVAL '${daysOld} days'
        `;
        const result = await this.db.query(query);
        return result.rowCount || 0;
    }
}
