import { User } from 'discord.js';

import { DatabaseService } from '../services/database-service.js';

export interface UserData {
    id: string;
    username: string;
    discriminator?: string;
    avatar_url?: string;
    created_at: Date;
    updated_at: Date;
}

export class UserRepository {
    private db: DatabaseService;

    constructor() {
        this.db = DatabaseService.getInstance();
    }

    public async upsertUser(user: User): Promise<UserData> {
        const query = `
            INSERT INTO users (id, username, discriminator, avatar_url, updated_at)
            VALUES ($1, $2, $3, $4, NOW())
            ON CONFLICT (id) 
            DO UPDATE SET 
                username = EXCLUDED.username,
                discriminator = EXCLUDED.discriminator,
                avatar_url = EXCLUDED.avatar_url,
                updated_at = NOW()
            RETURNING *
        `;

        const result = await this.db.query(query, [
            user.id,
            user.username,
            user.discriminator,
            user.displayAvatarURL(),
        ]);

        return result.rows[0];
    }

    public async getUser(userId: string): Promise<UserData | null> {
        const query = 'SELECT * FROM users WHERE id = $1';
        const result = await this.db.query(query, [userId]);
        return result.rows[0] || null;
    }

    public async getUsers(userIds: string[]): Promise<UserData[]> {
        if (userIds.length === 0) return [];

        const placeholders = userIds.map((_, index) => `$${index + 1}`).join(',');
        const query = `SELECT * FROM users WHERE id IN (${placeholders})`;
        const result = await this.db.query(query, userIds);
        return result.rows;
    }
}
