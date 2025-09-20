import { User } from 'discord.js';
import { v4 as uuidv4 } from 'uuid';

import { MemeRepository } from '../repositories/meme-repository.js';
import { UserRepository } from '../repositories/user-repository.js';
import { MemeContest, MemeData, MemeStats } from '../types/meme.js';

export class MemeManager {
    private memeRepo: MemeRepository;
    private userRepo: UserRepository;

    constructor() {
        this.memeRepo = new MemeRepository();
        this.userRepo = new UserRepository();
    }

    // Contest management
    async createContest(
        type: 'weekly' | 'yearly',
        startDate: Date,
        endDate: Date,
        channelId: string,
        createdBy: User
    ): Promise<MemeContest> {
        const contestId = uuidv4();

        const contestData = await this.memeRepo.createContest(
            contestId,
            type,
            startDate,
            endDate,
            channelId,
            createdBy
        );

        return this.convertToMemeContest(contestData, createdBy);
    }

    async getContest(contestId: string): Promise<MemeContest | undefined> {
        const contestData = await this.memeRepo.getContest(contestId);
        if (!contestData) return undefined;

        const createdBy = await this.userRepo.getUser(contestData.created_by_id);
        if (!createdBy) return undefined;

        const createdByUser = this.convertToUser(createdBy);
        return this.convertToMemeContest(contestData, createdByUser);
    }

    async getActiveContests(): Promise<MemeContest[]> {
        const activeContests = await this.memeRepo.getActiveContests();
        const result: MemeContest[] = [];

        for (const contestData of activeContests) {
            const createdBy = await this.userRepo.getUser(contestData.created_by_id);
            if (createdBy) {
                const createdByUser = this.convertToUser(createdBy);
                result.push(this.convertToMemeContest(contestData, createdByUser));
            }
        }

        return result;
    }

    async updateContestMessageId(contestId: string, messageId: string): Promise<void> {
        await this.memeRepo.updateContestMessageId(contestId, messageId);
    }

    async completeContest(contestId: string, winners: MemeData[]): Promise<boolean> {
        const contest = await this.getContest(contestId);
        if (!contest || contest.status !== 'active') return false;

        // Convert winners to database format
        const winnerData = winners.map(winner => ({
            id: winner.id,
            contest_id: contestId,
            message_id: winner.message.id,
            author_id: winner.author.id,
            reaction_count: winner.reactionCount,
            contest_type: winner.contestType,
            rank: winner.rank || 0,
            week_start: winner.weekStart,
            week_end: winner.weekEnd,
            submitted_at: winner.submittedAt,
        }));

        await this.memeRepo.addMemeWinners(winnerData);
        await this.memeRepo.completeContest(contestId);

        return true;
    }

    // Meme data management
    async addMemeToContest(contestId: string, _memeData: MemeData): Promise<boolean> {
        const contest = await this.getContest(contestId);
        if (!contest || contest.status !== 'active') return false;

        // For now, we only store winners, so this method is kept for compatibility
        // but doesn't actually store individual memes
        return true;
    }

    async getContestMemes(contestId: string): Promise<MemeData[]> {
        const winners = await this.memeRepo.getContestWinners(contestId);
        const result: MemeData[] = [];

        for (const winner of winners) {
            const author = await this.userRepo.getUser(winner.author_id);
            if (author) {
                const authorUser = this.convertToUser(author);
                result.push({
                    id: winner.id,
                    message: { id: winner.message_id } as any, // We don't store full message objects
                    author: authorUser,
                    reactionCount: winner.reaction_count,
                    contestType: winner.contest_type,
                    weekStart: winner.week_start || new Date(),
                    weekEnd: winner.week_end || new Date(),
                    rank: winner.rank,
                    submittedAt: winner.submitted_at,
                });
            }
        }

        return result;
    }

    // Analysis and ranking
    async analyzeContestMemes(
        contestId: string,
        contestType: 'meme' | 'bone'
    ): Promise<MemeData[]> {
        const memes = await this.getContestMemes(contestId);
        const filteredMemes = memes.filter(meme => meme.contestType === contestType);

        // Sort by reaction count (descending)
        filteredMemes.sort((a, b) => b.reactionCount - a.reactionCount);

        // Assign ranks
        filteredMemes.forEach((meme, index) => {
            meme.rank = index + 1;
        });

        return filteredMemes.slice(0, 3); // Top 3
    }

    // User statistics
    async getUserStats(userId: string): Promise<{ memes: number; bones: number }> {
        const stats = await this.memeRepo.getUserStats(userId);
        return {
            memes: stats?.total_meme_wins || 0,
            bones: stats?.total_bone_wins || 0,
        };
    }

    async getTopContributors(limit: number = 10): Promise<{ user: User; count: number }[]> {
        const contributors = await this.memeRepo.getTopContributors(limit);
        const result: { user: User; count: number }[] = [];

        for (const contributor of contributors) {
            const userData = await this.userRepo.getUser(contributor.user_id);
            if (userData) {
                result.push({
                    user: this.convertToUser(userData),
                    count: contributor.total_wins,
                });
            }
        }

        return result;
    }

    // Overall statistics
    async getStats(): Promise<MemeStats> {
        const stats = await this.memeRepo.getMemeStats();
        const topContributors = await this.getTopContributors(5);

        return {
            totalMemes: stats.totalMemes,
            totalBones: stats.totalBones,
            weeklyWinners: stats.weeklyWinners,
            yearlyWinners: stats.yearlyWinners,
            topContributors,
        };
    }

    // Cleanup old data
    async cleanupOldContests(daysOld: number = 30): Promise<number> {
        return await this.memeRepo.cleanupOldContests(daysOld);
    }

    // Helper methods
    private convertToMemeContest(contestData: any, createdBy: User): MemeContest {
        return {
            id: contestData.id,
            type: contestData.type,
            startDate: contestData.start_date,
            endDate: contestData.end_date,
            status: contestData.status,
            winners: [], // Winners are loaded separately when needed
            channelId: contestData.channel_id,
            messageId: contestData.message_id,
            createdBy,
            createdAt: contestData.created_at,
        };
    }

    private convertToUser(userData: any): User {
        return {
            id: userData.id,
            username: userData.username,
            discriminator: userData.discriminator,
            avatarURL: () => userData.avatar_url,
        } as User;
    }
}
