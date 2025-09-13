import { User } from 'discord.js';

import { UserRepository } from './user-repository.js';
import { DatabaseService } from '../services/database-service.js';

export interface WelcomeRequestData {
    id: string;
    user_id: string;
    join_time: Date;
    message_id: string;
    channel_id: string;
    linkedin_url?: string;
    presentation?: string;
    invited_by?: string;
    approved: boolean;
    approved_by_id?: string;
    approved_at?: Date;
    created_at: Date;
}

export class WelcomeRepository {
    private db: DatabaseService;
    private userRepo: UserRepository;

    constructor() {
        this.db = DatabaseService.getInstance();
        this.userRepo = new UserRepository();
    }

    public async createWelcomeRequest(
        requestId: string,
        user: User,
        messageId: string,
        channelId: string
    ): Promise<WelcomeRequestData> {
        return await this.db.transaction(async client => {
            // Ensure user exists in database
            await this.userRepo.upsertUser(user);

            const query = `
                INSERT INTO welcome_requests (
                    id, user_id, join_time, message_id, channel_id, approved, created_at
                )
                VALUES ($1, $2, NOW(), $3, $4, FALSE, NOW())
                RETURNING *
            `;

            const result = await client.query(query, [requestId, user.id, messageId, channelId]);

            return result.rows[0];
        });
    }

    public async getWelcomeRequest(requestId: string): Promise<WelcomeRequestData | null> {
        const query = 'SELECT * FROM welcome_requests WHERE id = $1';
        const result = await this.db.query(query, [requestId]);
        return result.rows[0] || null;
    }

    public async getWelcomeRequestByMessageId(
        messageId: string
    ): Promise<WelcomeRequestData | null> {
        const query = 'SELECT * FROM welcome_requests WHERE message_id = $1';
        const result = await this.db.query(query, [messageId]);
        return result.rows[0] || null;
    }

    public async updateWelcomeRequest(
        requestId: string,
        updates: {
            linkedin_url?: string;
            presentation?: string;
            invited_by?: string;
            message_id?: string;
        }
    ): Promise<boolean> {
        const setClause = [];
        const values = [];
        let paramIndex = 1;

        if (updates.linkedin_url !== undefined) {
            setClause.push(`linkedin_url = $${paramIndex++}`);
            values.push(updates.linkedin_url);
        }

        if (updates.presentation !== undefined) {
            setClause.push(`presentation = $${paramIndex++}`);
            values.push(updates.presentation);
        }

        if (updates.invited_by !== undefined) {
            setClause.push(`invited_by = $${paramIndex++}`);
            values.push(updates.invited_by);
        }

        if (updates.message_id !== undefined) {
            setClause.push(`message_id = $${paramIndex++}`);
            values.push(updates.message_id);
        }

        if (setClause.length === 0) {
            console.log(`🔧 No updates to apply for welcome request:`, requestId);
            return false;
        }

        values.push(requestId);
        const query = `
            UPDATE welcome_requests 
            SET ${setClause.join(', ')}
            WHERE id = $${paramIndex}
            RETURNING 1
        `;

        console.log(`🔧 Updating welcome request with query:`, query);
        console.log(`🔧 Update values:`, values);
        console.log(`🔧 Update fields:`, Object.keys(updates).filter(key => updates[key as keyof typeof updates] !== undefined));

        const result = await this.db.query(query, values);
        const success = result.rows.length > 0;
        console.log(`🔧 Welcome request update result:`, success);
        return success;
    }

    public async approveWelcomeRequest(requestId: string, approvedBy: User): Promise<boolean> {
        return await this.db.transaction(async client => {
            // Ensure approver exists in database
            await this.userRepo.upsertUser(approvedBy);

            const query = `
                UPDATE welcome_requests 
                SET approved = TRUE, 
                    approved_by_id = $2, 
                    approved_at = NOW()
                WHERE id = $1 AND approved = FALSE
                RETURNING 1
            `;

            const result = await client.query(query, [requestId, approvedBy.id]);
            return result.rows.length > 0;
        });
    }

    public async getPendingRequests(): Promise<WelcomeRequestData[]> {
        const query =
            'SELECT * FROM welcome_requests WHERE approved = FALSE ORDER BY created_at DESC';
        const result = await this.db.query(query);
        return result.rows;
    }

    public async getApprovedRequests(): Promise<WelcomeRequestData[]> {
        const query =
            'SELECT * FROM welcome_requests WHERE approved = TRUE ORDER BY approved_at DESC';
        const result = await this.db.query(query);
        return result.rows;
    }

    public async deleteWelcomeRequest(requestId: string): Promise<boolean> {
        const query = 'DELETE FROM welcome_requests WHERE id = $1 RETURNING 1';
        const result = await this.db.query(query, [requestId]);
        return result.rows.length > 0;
    }

    public async getWelcomeStats(): Promise<{
        total: number;
        pending: number;
        approved: number;
    }> {
        const totalResult = await this.db.query('SELECT COUNT(*) FROM welcome_requests');
        const pendingResult = await this.db.query(
            'SELECT COUNT(*) FROM welcome_requests WHERE approved = FALSE'
        );
        const approvedResult = await this.db.query(
            'SELECT COUNT(*) FROM welcome_requests WHERE approved = TRUE'
        );

        return {
            total: parseInt(totalResult.rows[0].count),
            pending: parseInt(pendingResult.rows[0].count),
            approved: parseInt(approvedResult.rows[0].count),
        };
    }
}
