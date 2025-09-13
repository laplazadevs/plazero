import { User } from 'discord.js';

import { UserRepository } from './user-repository.js';
import { DatabaseService } from '../services/database-service.js';

export interface MemeContestData {
    id: string;
    type: 'weekly' | 'yearly';
    start_date: Date;
    end_date: Date;
    status: 'active' | 'completed' | 'cancelled';
    channel_id: string;
    message_id?: string;
    created_by_id: string;
    created_at: Date;
}

export interface MemeWinnerData {
    id: string;
    contest_id: string;
    message_id: string;
    author_id: string;
    reaction_count: number;
    contest_type: 'meme' | 'bone';
    rank: number;
    week_start?: Date;
    week_end?: Date;
    submitted_at: Date;
}

export interface UserStatsData {
    user_id: string;
    total_meme_wins: number;
    total_bone_wins: number;
    total_contests_participated: number;
    updated_at: Date;
}

export class MemeRepository {
    private db: DatabaseService;
    private userRepo: UserRepository;

    constructor() {
        this.db = DatabaseService.getInstance();
        this.userRepo = new UserRepository();
    }

    public async createContest(
        contestId: string,
        type: 'weekly' | 'yearly',
        startDate: Date,
        endDate: Date,
        channelId: string,
        createdBy: User
    ): Promise<MemeContestData> {
        return await this.db.transaction(async client => {
            // Ensure user exists in database
            await this.userRepo.upsertUser(createdBy);

            const query = `
                INSERT INTO meme_contests (
                    id, type, start_date, end_date, status, 
                    channel_id, created_by_id, created_at
                )
                VALUES ($1, $2, $3, $4, 'active', $5, $6, NOW())
                RETURNING *
            `;

            const result = await client.query(query, [
                contestId,
                type,
                startDate,
                endDate,
                channelId,
                createdBy.id,
            ]);

            return result.rows[0];
        });
    }

    public async getContest(contestId: string): Promise<MemeContestData | null> {
        const query = 'SELECT * FROM meme_contests WHERE id = $1';
        const result = await this.db.query(query, [contestId]);
        return result.rows[0] || null;
    }

    public async getActiveContests(): Promise<MemeContestData[]> {
        const query = 'SELECT * FROM meme_contests WHERE status = $1';
        const result = await this.db.query(query, ['active']);
        return result.rows;
    }

    public async updateContestMessageId(contestId: string, messageId: string): Promise<void> {
        const query = 'UPDATE meme_contests SET message_id = $1 WHERE id = $2';
        await this.db.query(query, [messageId, contestId]);
    }

    public async completeContest(contestId: string): Promise<void> {
        const query = 'UPDATE meme_contests SET status = $1 WHERE id = $2';
        await this.db.query(query, ['completed', contestId]);
    }

    public async addMemeWinners(winners: MemeWinnerData[]): Promise<void> {
        if (winners.length === 0) return;

        return await this.db.transaction(async client => {
            // Ensure all authors exist in database
            const authorIds = [...new Set(winners.map(w => w.author_id))];
            for (const authorId of authorIds) {
                // We'll need to fetch the user from Discord API or pass it in
                // For now, we'll create a minimal user record
                await client.query(
                    `
                    INSERT INTO users (id, username, updated_at)
                    VALUES ($1, 'Unknown', NOW())
                    ON CONFLICT (id) DO NOTHING
                `,
                    [authorId]
                );
            }

            // Insert winners
            for (const winner of winners) {
                const query = `
                    INSERT INTO meme_winners (
                        id, contest_id, message_id, author_id, reaction_count,
                        contest_type, rank, week_start, week_end, submitted_at
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                    ON CONFLICT (id) DO UPDATE SET
                        reaction_count = EXCLUDED.reaction_count,
                        rank = EXCLUDED.rank
                `;

                await client.query(query, [
                    winner.id,
                    winner.contest_id,
                    winner.message_id,
                    winner.author_id,
                    winner.reaction_count,
                    winner.contest_type,
                    winner.rank,
                    winner.week_start,
                    winner.week_end,
                    winner.submitted_at,
                ]);
            }

            // Update user statistics
            await this.updateUserStats(winners);
        });
    }

    private async updateUserStats(winners: MemeWinnerData[]): Promise<void> {
        const userStats = new Map<string, { memeWins: number; boneWins: number }>();

        for (const winner of winners) {
            const stats = userStats.get(winner.author_id) || { memeWins: 0, boneWins: 0 };
            if (winner.contest_type === 'meme') {
                stats.memeWins++;
            } else {
                stats.boneWins++;
            }
            userStats.set(winner.author_id, stats);
        }

        for (const [userId, stats] of userStats.entries()) {
            const query = `
                INSERT INTO user_stats (user_id, total_meme_wins, total_bone_wins, updated_at)
                VALUES ($1, $2, $3, NOW())
                ON CONFLICT (user_id)
                DO UPDATE SET
                    total_meme_wins = user_stats.total_meme_wins + $2,
                    total_bone_wins = user_stats.total_bone_wins + $3,
                    updated_at = NOW()
            `;

            await this.db.query(query, [userId, stats.memeWins, stats.boneWins]);
        }
    }

    public async getContestWinners(contestId: string): Promise<MemeWinnerData[]> {
        const query = `
            SELECT * FROM meme_winners 
            WHERE contest_id = $1 
            ORDER BY contest_type, rank
        `;
        const result = await this.db.query(query, [contestId]);
        return result.rows;
    }

    public async getUserStats(userId: string): Promise<UserStatsData | null> {
        const query = 'SELECT * FROM user_stats WHERE user_id = $1';
        const result = await this.db.query(query, [userId]);
        return result.rows[0] || null;
    }

    public async getTopContributors(limit: number = 10): Promise<
        {
            user_id: string;
            total_wins: number;
            meme_wins: number;
            bone_wins: number;
        }[]
    > {
        const query = `
            SELECT 
                user_id,
                (total_meme_wins + total_bone_wins) as total_wins,
                total_meme_wins as meme_wins,
                total_bone_wins as bone_wins
            FROM user_stats
            ORDER BY total_wins DESC
            LIMIT $1
        `;
        const result = await this.db.query(query, [limit]);
        return result.rows;
    }

    public async getMemeStats(): Promise<{
        totalMemes: number;
        totalBones: number;
        weeklyWinners: number;
        yearlyWinners: number;
        topContributors: any[];
    }> {
        const totalStatsResult = await this.db.query(`
            SELECT 
                SUM(total_meme_wins) as total_memes,
                SUM(total_bone_wins) as total_bones
            FROM user_stats
        `);

        const weeklyWinnersResult = await this.db.query(`
            SELECT COUNT(*) as count
            FROM meme_winners mw
            JOIN meme_contests mc ON mw.contest_id = mc.id
            WHERE mc.type = 'weekly'
        `);

        const yearlyWinnersResult = await this.db.query(`
            SELECT COUNT(*) as count
            FROM meme_winners mw
            JOIN meme_contests mc ON mw.contest_id = mc.id
            WHERE mc.type = 'yearly'
        `);

        const topContributors = await this.getTopContributors(5);

        return {
            totalMemes: parseInt(totalStatsResult.rows[0]?.total_memes || '0'),
            totalBones: parseInt(totalStatsResult.rows[0]?.total_bones || '0'),
            weeklyWinners: parseInt(weeklyWinnersResult.rows[0]?.count || '0'),
            yearlyWinners: parseInt(yearlyWinnersResult.rows[0]?.count || '0'),
            topContributors,
        };
    }

    public async cleanupOldContests(daysOld: number = 30): Promise<number> {
        const query = `
            DELETE FROM meme_contests 
            WHERE status = 'completed' 
            AND created_at < NOW() - INTERVAL '${daysOld} days'
        `;
        const result = await this.db.query(query);
        return result.rowCount || 0;
    }
}
