import { User } from 'discord.js';

import { UserRepository } from './user-repository.js';
import { DatabaseService } from '../services/database-service.js';

export interface VoteData {
    id: string;
    target_user_id: string;
    initiator_id: string;
    reason: string;
    start_time: Date;
    end_time?: Date;
    message_id: string;
    channel_id: string;
    completed: boolean;
    timeout_applied: boolean;
    final_up_votes: number;
    final_down_votes: number;
    final_net_votes: number;
    created_at: Date;
}

export interface VoteReactionData {
    id: number;
    vote_id: string;
    user_id: string;
    reaction_type: 'up' | 'down' | 'white';
    weight: number;
    created_at: Date;
}

export interface UserCooldownData {
    user_id: string;
    last_vote_time: Date;
    created_at: Date;
}

export class VoteRepository {
    private db: DatabaseService;
    private userRepo: UserRepository;

    constructor() {
        this.db = DatabaseService.getInstance();
        this.userRepo = new UserRepository();
    }

    public async createVote(
        voteId: string,
        targetUser: User,
        initiator: User,
        reason: string,
        messageId: string,
        channelId: string
    ): Promise<VoteData> {
        return await this.db.transaction(async client => {
            // Ensure users exist in database
            await this.userRepo.upsertUser(targetUser);
            await this.userRepo.upsertUser(initiator);

            const query = `
                INSERT INTO votes (
                    id, target_user_id, initiator_id, reason, start_time, 
                    message_id, channel_id, completed
                )
                VALUES ($1, $2, $3, $4, NOW(), $5, $6, FALSE)
                RETURNING *
            `;

            const result = await client.query(query, [
                voteId,
                targetUser.id,
                initiator.id,
                reason,
                messageId,
                channelId,
            ]);

            return result.rows[0];
        });
    }

    public async getVote(voteId: string): Promise<VoteData | null> {
        const query = 'SELECT * FROM votes WHERE id = $1';
        const result = await this.db.query(query, [voteId]);
        return result.rows[0] || null;
    }

    public async getVoteByMessageId(messageId: string): Promise<VoteData | null> {
        const query = 'SELECT * FROM votes WHERE message_id = $1';
        const result = await this.db.query(query, [messageId]);
        return result.rows[0] || null;
    }

    public async getActiveVotes(): Promise<VoteData[]> {
        const query = 'SELECT * FROM votes WHERE completed = FALSE';
        const result = await this.db.query(query);
        return result.rows;
    }

    public async hasActiveVoteAgainst(userId: string): Promise<boolean> {
        const query = 'SELECT 1 FROM votes WHERE target_user_id = $1 AND completed = FALSE LIMIT 1';
        const result = await this.db.query(query, [userId]);
        return result.rows.length > 0;
    }

    public async completeVote(
        voteId: string,
        upVotes: number,
        downVotes: number,
        netVotes: number,
        timeoutApplied: boolean
    ): Promise<void> {
        const query = `
            UPDATE votes 
            SET completed = TRUE, 
                end_time = NOW(),
                final_up_votes = $2,
                final_down_votes = $3,
                final_net_votes = $4,
                timeout_applied = $5
            WHERE id = $1
        `;

        await this.db.query(query, [voteId, upVotes, downVotes, netVotes, timeoutApplied]);
    }

    public async addVoteReaction(
        voteId: string,
        userId: string,
        reactionType: 'up' | 'down' | 'white',
        weight: number
    ): Promise<void> {
        const query = `
            INSERT INTO vote_reactions (vote_id, user_id, reaction_type, weight)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (vote_id, user_id, reaction_type)
            DO UPDATE SET weight = EXCLUDED.weight, created_at = NOW()
        `;

        await this.db.query(query, [voteId, userId, reactionType, weight]);
    }

    public async removeVoteReaction(
        voteId: string,
        userId: string,
        reactionType: 'up' | 'down' | 'white'
    ): Promise<void> {
        const query = `
            DELETE FROM vote_reactions 
            WHERE vote_id = $1 AND user_id = $2 AND reaction_type = $3
        `;

        await this.db.query(query, [voteId, userId, reactionType]);
    }

    public async getVoteReactions(voteId: string): Promise<VoteReactionData[]> {
        const query = 'SELECT * FROM vote_reactions WHERE vote_id = $1';
        const result = await this.db.query(query, [voteId]);
        return result.rows;
    }

    public async setUserCooldown(userId: string, lastVoteTime: Date): Promise<void> {
        const query = `
            INSERT INTO user_cooldowns (user_id, last_vote_time)
            VALUES ($1, $2)
            ON CONFLICT (user_id)
            DO UPDATE SET last_vote_time = EXCLUDED.last_vote_time
        `;

        await this.db.query(query, [userId, lastVoteTime]);
    }

    public async getUserCooldown(userId: string): Promise<UserCooldownData | null> {
        const query = 'SELECT * FROM user_cooldowns WHERE user_id = $1';
        const result = await this.db.query(query, [userId]);
        return result.rows[0] || null;
    }

    public async isUserOnCooldown(
        userId: string,
        cooldownDurationMs: number
    ): Promise<{
        onCooldown: boolean;
        remainingTime?: number;
    }> {
        const cooldown = await this.getUserCooldown(userId);
        if (!cooldown) {
            return { onCooldown: false };
        }

        const now = Date.now();
        const timePassed = now - cooldown.last_vote_time.getTime();

        if (timePassed < cooldownDurationMs) {
            const remainingTime = Math.ceil((cooldownDurationMs - timePassed) / 60000);
            return { onCooldown: true, remainingTime };
        }

        return { onCooldown: false };
    }

    public async getVoteStats(): Promise<{
        activeVotes: number;
        completedVotes: number;
        ongoingVotes: number;
        userCooldowns: number;
    }> {
        const activeResult = await this.db.query(
            'SELECT COUNT(*) FROM votes WHERE completed = FALSE'
        );
        const completedResult = await this.db.query(
            'SELECT COUNT(*) FROM votes WHERE completed = TRUE'
        );
        const cooldownResult = await this.db.query('SELECT COUNT(*) FROM user_cooldowns');

        return {
            activeVotes: parseInt(activeResult.rows[0].count),
            completedVotes: parseInt(completedResult.rows[0].count),
            ongoingVotes: parseInt(activeResult.rows[0].count),
            userCooldowns: parseInt(cooldownResult.rows[0].count),
        };
    }
}
