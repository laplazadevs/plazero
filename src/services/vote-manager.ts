import { User } from 'discord.js';

import { UserRepository } from '../repositories/user-repository.js';
import { VoteRepository } from '../repositories/vote-repository.js';
import { VoteData } from '../types/vote.js';

export class VoteManager {
    private voteRepo: VoteRepository;
    private userRepo: UserRepository;

    constructor() {
        this.voteRepo = new VoteRepository();
        this.userRepo = new UserRepository();
    }

    // Get active vote by ID
    async getVote(voteId: string): Promise<VoteData | undefined> {
        const voteData = await this.voteRepo.getVote(voteId);
        if (!voteData) return undefined;

        return await this.convertToVoteData(voteData);
    }

    // Get vote by message ID
    async getVoteByMessageId(messageId: string): Promise<VoteData | undefined> {
        const voteData = await this.voteRepo.getVoteByMessageId(messageId);
        if (!voteData) return undefined;

        return await this.convertToVoteData(voteData);
    }

    // Add new vote
    async addVote(vote: VoteData): Promise<void> {
        await this.voteRepo.createVote(
            vote.id,
            vote.targetUser,
            vote.initiator,
            vote.reason,
            vote.messageId,
            vote.channelId
        );
    }

    // Remove vote (cleanup)
    async removeVote(_voteId: string): Promise<boolean> {
        // Votes are automatically cleaned up by the database cleanup functions
        // This method is kept for compatibility but doesn't need to do anything
        return true;
    }

    // Mark vote as completed and schedule cleanup
    async completeVote(voteId: string): Promise<void> {
        const vote = await this.getVote(voteId);
        if (!vote) return;

        const { upVoteCount, downVoteCount, netVotes } = this.calculateVoteCounts(
            vote.upVotes,
            vote.downVotes
        );

        const timeoutApplied = netVotes >= 5;

        await this.voteRepo.completeVote(
            voteId,
            upVoteCount,
            downVoteCount,
            netVotes,
            timeoutApplied
        );

        // Schedule cleanup after 30 seconds to allow for final message updates
        setTimeout(() => {
            console.log(`Vote ${voteId} marked for cleanup`);
        }, 30000);
    }

    // Check if user has an active vote against them
    async hasActiveVoteAgainst(userId: string): Promise<boolean> {
        return await this.voteRepo.hasActiveVoteAgainst(userId);
    }

    // Get all active votes
    async getAllActiveVotes(): Promise<VoteData[]> {
        const activeVotes = await this.voteRepo.getActiveVotes();
        const result: VoteData[] = [];

        for (const voteData of activeVotes) {
            const vote = await this.convertToVoteData(voteData);
            if (vote) {
                result.push(vote);
            }
        }

        return result;
    }

    // Cooldown management
    async setCooldown(userId: string, time: Date): Promise<void> {
        await this.voteRepo.setUserCooldown(userId, time);
    }

    async getCooldown(userId: string): Promise<Date | undefined> {
        const cooldown = await this.voteRepo.getUserCooldown(userId);
        return cooldown?.last_vote_time;
    }

    // Check if user is on cooldown
    async isOnCooldown(
        userId: string,
        cooldownDuration: number
    ): Promise<{ onCooldown: boolean; remainingTime?: number }> {
        return await this.voteRepo.isUserOnCooldown(userId, cooldownDuration);
    }

    // Clean up expired cooldowns (optional maintenance)
    async cleanupExpiredCooldowns(_cooldownDuration: number): Promise<void> {
        // This is now handled by the database cleanup functions
        console.log('Cooldown cleanup is handled by database cleanup functions');
    }

    // Get statistics
    async getStats(): Promise<{
        activeVotes: number;
        completedVotes: number;
        ongoingVotes: number;
        userCooldowns: number;
    }> {
        return await this.voteRepo.getVoteStats();
    }

    // Ensure user exists in database
    async ensureUserExists(user: any): Promise<void> {
        const existingUser = await this.userRepo.getUser(user.id);
        if (!existingUser) {
            // Create user record if it doesn't exist
            await this.userRepo.upsertUser(user);
        }
    }

    // Add vote reaction
    async addVoteReaction(
        voteId: string,
        userId: string,
        reactionType: 'up' | 'down' | 'white',
        weight: number
    ): Promise<void> {
        await this.voteRepo.addVoteReaction(voteId, userId, reactionType, weight);
    }

    // Remove vote reaction
    async removeVoteReaction(
        voteId: string,
        userId: string,
        reactionType: 'up' | 'down' | 'white'
    ): Promise<void> {
        await this.voteRepo.removeVoteReaction(voteId, userId, reactionType);
    }

    // Helper method to convert database data to VoteData format
    private async convertToVoteData(voteData: any): Promise<VoteData | undefined> {
        try {
            // Get users
            const [targetUser, initiator] = await Promise.all([
                this.userRepo.getUser(voteData.target_user_id),
                this.userRepo.getUser(voteData.initiator_id),
            ]);

            if (!targetUser || !initiator) {
                console.error('Could not find users for vote:', voteData.id);
                return undefined;
            }

            // Get vote reactions
            const reactions = await this.voteRepo.getVoteReactions(voteData.id);

            const upVotes = new Map<string, number>();
            const downVotes = new Map<string, number>();
            const whiteVotes = new Map<string, number>();

            for (const reaction of reactions) {
                const weight = reaction.weight;
                switch (reaction.reaction_type) {
                    case 'up':
                        upVotes.set(reaction.user_id, weight);
                        break;
                    case 'down':
                        downVotes.set(reaction.user_id, weight);
                        break;
                    case 'white':
                        whiteVotes.set(reaction.user_id, weight);
                        break;
                }
            }

            // Create User objects from database data
            const targetUserObj = {
                id: targetUser.id,
                username: targetUser.username,
                discriminator: targetUser.discriminator,
                avatarURL: () => targetUser.avatar_url,
            } as User;

            const initiatorObj = {
                id: initiator.id,
                username: initiator.username,
                discriminator: initiator.discriminator,
                avatarURL: () => initiator.avatar_url,
            } as User;

            return {
                id: voteData.id,
                targetUser: targetUserObj,
                initiator: initiatorObj,
                reason: voteData.reason,
                startTime: voteData.start_time,
                upVotes,
                downVotes,
                whiteVotes,
                messageId: voteData.message_id,
                channelId: voteData.channel_id,
                completed: voteData.completed,
            };
        } catch (error) {
            console.error('Error converting vote data:', error);
            return undefined;
        }
    }

    // Helper method to calculate vote counts
    private calculateVoteCounts(
        upVotes: Map<string, number>,
        downVotes: Map<string, number>
    ): { upVoteCount: number; downVoteCount: number; netVotes: number } {
        const upVoteCount = Array.from(upVotes.values()).reduce((sum, weight) => sum + weight, 0);
        const downVoteCount = Array.from(downVotes.values()).reduce(
            (sum, weight) => sum + weight,
            0
        );
        const netVotes = upVoteCount - downVoteCount;

        return { upVoteCount, downVoteCount, netVotes };
    }
}
