import { User } from 'discord.js';
import { v4 as uuidv4 } from 'uuid';

import { BONE_EMOJI, LAUGH_EMOJIS, MEME_CHANNEL_NAME } from '../config/constants.js';
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

    // Automatic contest completion
    async processExpiredContests(client: any): Promise<void> {
        const activeContests = await this.getActiveContests();
        const now = new Date();

        for (const contest of activeContests) {
            if (contest.endDate <= now) {
                console.log(`Processing expired contest: ${contest.id}`);

                try {
                    // Find the meme channel
                    const memeChannel = client.channels.cache.find(
                        (ch: any) => ch.isTextBased() && ch.name === MEME_CHANNEL_NAME
                    );

                    if (!memeChannel) {
                        console.warn(`Meme channel not found for contest ${contest.id}`);
                        continue;
                    }

                    // Fetch messages from the contest period
                    const messages = await this.fetchMessagesInRange(
                        memeChannel,
                        contest.startDate,
                        contest.endDate
                    );

                    if (messages.length === 0) {
                        console.log(`No messages found for contest ${contest.id}`);
                        await this.memeRepo.completeContest(contest.id);
                        continue;
                    }

                    // Get top memes (laugh reactions)
                    const topMemes = await this.getTopMessages(messages, LAUGH_EMOJIS);

                    // Get top bones (bone reactions)
                    const topBones = await this.getTopMessages(messages, BONE_EMOJI);

                    // Create meme winners
                    const memeWinners = topMemes.map((winner, index) => ({
                        id: `meme-${contest.id}-${index}`,
                        message: winner.message,
                        author: winner.message.author,
                        reactionCount: winner.count,
                        contestType: 'meme' as const,
                        weekStart: contest.startDate,
                        weekEnd: contest.endDate,
                        rank: index + 1,
                        submittedAt: winner.message.createdAt,
                    }));

                    // Create bone winners
                    const boneWinners = topBones.map((winner, index) => ({
                        id: `bone-${contest.id}-${index}`,
                        message: winner.message,
                        author: winner.message.author,
                        reactionCount: winner.count,
                        contestType: 'bone' as const,
                        weekStart: contest.startDate,
                        weekEnd: contest.endDate,
                        rank: index + 1,
                        submittedAt: winner.message.createdAt,
                    }));

                    // Complete the contest with both meme and bone winners
                    await this.completeContest(contest.id, [...memeWinners, ...boneWinners]);

                    // Announce winners in the contest channel
                    if (contest.channelId && (memeWinners.length > 0 || boneWinners.length > 0)) {
                        const contestChannel = client.channels.cache.get(contest.channelId);
                        if (contestChannel) {
                            const period = `${new Date(
                                contest.startDate
                            ).toLocaleDateString()} - ${new Date(
                                contest.endDate
                            ).toLocaleDateString()}`;

                            if (memeWinners.length > 0) {
                                const { createMemeWinnersEmbed } = await import('./meme-embed.js');
                                const memeEmbed = createMemeWinnersEmbed(
                                    memeWinners,
                                    'meme',
                                    period
                                );
                                await contestChannel.send({ embeds: [memeEmbed] });
                            }

                            if (boneWinners.length > 0) {
                                const { createMemeWinnersEmbed } = await import('./meme-embed.js');
                                const boneEmbed = createMemeWinnersEmbed(
                                    boneWinners,
                                    'bone',
                                    period
                                );
                                await contestChannel.send({ embeds: [boneEmbed] });
                            }
                        }
                    }

                    console.log(
                        `✅ Contest ${contest.id} completed with ${memeWinners.length} meme winners and ${boneWinners.length} bone winners`
                    );
                } catch (error) {
                    console.error(`Error processing contest ${contest.id}:`, error);
                }
            }
        }
    }

    // Debug/manual contest processing
    async processSpecificContest(contest: MemeContest, client: any): Promise<void> {
        console.log(`Manually processing contest: ${contest.id}`);

        try {
            // Find the meme channel
            const memeChannel = client.channels.cache.find(
                (ch: any) => ch.isTextBased() && ch.name === MEME_CHANNEL_NAME
            );

            if (!memeChannel) {
                throw new Error(`Meme channel "${MEME_CHANNEL_NAME}" not found`);
            }

            // Fetch messages from the contest period
            const messages = await this.fetchMessagesInRange(
                memeChannel,
                contest.startDate,
                contest.endDate
            );

            console.log(`Found ${messages.length} messages in contest period`);

            if (messages.length === 0) {
                console.log(
                    `No messages found for contest ${contest.id}, completing without winners`
                );
                await this.memeRepo.completeContest(contest.id);
                return;
            }

            // Get top memes (laugh reactions)
            const topMemes = await this.getTopMessages(messages, LAUGH_EMOJIS);
            console.log(`Found ${topMemes.length} top memes`);

            // Get top bones (bone reactions)
            const topBones = await this.getTopMessages(messages, BONE_EMOJI);
            console.log(`Found ${topBones.length} top bones`);

            // Create meme winners
            const memeWinners = topMemes.map((winner, index) => ({
                id: `meme-${contest.id}-${index}`,
                message: winner.message,
                author: winner.message.author,
                reactionCount: winner.count,
                contestType: 'meme' as const,
                weekStart: contest.startDate,
                weekEnd: contest.endDate,
                rank: index + 1,
                submittedAt: winner.message.createdAt,
            }));

            // Create bone winners
            const boneWinners = topBones.map((winner, index) => ({
                id: `bone-${contest.id}-${index}`,
                message: winner.message,
                author: winner.message.author,
                reactionCount: winner.count,
                contestType: 'bone' as const,
                weekStart: contest.startDate,
                weekEnd: contest.endDate,
                rank: index + 1,
                submittedAt: winner.message.createdAt,
            }));

            // Complete the contest with both meme and bone winners
            await this.completeContest(contest.id, [...memeWinners, ...boneWinners]);
            console.log(
                `Contest ${contest.id} completed with ${memeWinners.length} meme winners and ${boneWinners.length} bone winners`
            );

            // Announce winners in the contest channel
            if (contest.channelId && (memeWinners.length > 0 || boneWinners.length > 0)) {
                const contestChannel = client.channels.cache.get(contest.channelId);
                if (contestChannel) {
                    const period = `${new Date(
                        contest.startDate
                    ).toLocaleDateString()} - ${new Date(contest.endDate).toLocaleDateString()}`;

                    if (memeWinners.length > 0) {
                        const { createMemeWinnersEmbed } = await import('./meme-embed.js');
                        const memeEmbed = createMemeWinnersEmbed(memeWinners, 'meme', period);
                        await contestChannel.send({ embeds: [memeEmbed] });
                        console.log(`Posted meme winners announcement`);
                    }

                    if (boneWinners.length > 0) {
                        const { createMemeWinnersEmbed } = await import('./meme-embed.js');
                        const boneEmbed = createMemeWinnersEmbed(boneWinners, 'bone', period);
                        await contestChannel.send({ embeds: [boneEmbed] });
                        console.log(`Posted bone winners announcement`);
                    }
                } else {
                    console.warn(`Contest channel ${contest.channelId} not found in cache`);
                }
            }

            console.log(`✅ Contest ${contest.id} completed successfully with manual processing`);
        } catch (error) {
            console.error(`Error in manual contest processing for ${contest.id}:`, error);
            throw error;
        }
    }

    // Helper methods for automatic processing
    private async fetchMessagesInRange(
        channel: any,
        startDate: Date,
        endDate: Date
    ): Promise<any[]> {
        let messages: any[] = [];
        let lastMessageId: string | undefined;
        let hasMoreMessages = true;
        let iteration = 0;
        const maxIterations = 100; // Safety limit

        const start = new Date(startDate);
        const end = new Date(endDate);

        while (hasMoreMessages && iteration < maxIterations) {
            const options: { limit: number; before?: string } = { limit: 100 };
            if (lastMessageId) options.before = lastMessageId;

            const fetchedMessages = await channel.messages.fetch(options);

            if (fetchedMessages.size === 0) {
                hasMoreMessages = false;
                break;
            }

            const filteredMessages = fetchedMessages.filter((msg: any) => {
                const msgDate = new Date(msg.createdAt);
                return msgDate >= start && msgDate <= end;
            });

            messages.push(...filteredMessages.values());
            lastMessageId = fetchedMessages.last()?.id;

            const oldestMessageDate = new Date(fetchedMessages.last()?.createdAt);
            if (oldestMessageDate < start) {
                break;
            }

            iteration++;
        }

        return messages;
    }

    private async getTopMessages(
        messages: any[],
        reactionEmojis: string[]
    ): Promise<{ message: any; count: number }[]> {
        const messageReactionCounts = await Promise.all(
            messages.map(async message => {
                const userIdSet = new Set<string>();
                const fetchPromises = [];
                let count = 0;

                for (const reaction of message.reactions.cache.values()) {
                    if (
                        reactionEmojis.includes(reaction.emoji.name ?? '') ||
                        reactionEmojis.includes(reaction.emoji.id ?? '')
                    ) {
                        fetchPromises.push(reaction.users.fetch());
                    }
                }

                const userLists = await Promise.all(fetchPromises);
                for (const users of userLists) {
                    for (const user of users) {
                        if (!userIdSet.has(user[0])) {
                            count += 1;
                        }
                        userIdSet.add(user[0]);
                    }
                }

                return { message, count };
            })
        );

        const messagesWithReactions = messageReactionCounts.filter(item => item.count > 0);
        messagesWithReactions.sort((a, b) => b.count - a.count);

        return messagesWithReactions.slice(0, 3); // Top 3
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
            displayAvatarURL: () => userData.avatar_url,
        } as User;
    }
}
