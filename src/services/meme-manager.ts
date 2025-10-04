import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone.js';
import { User } from 'discord.js';
import { v4 as uuidv4 } from 'uuid';

import { BONE_EMOJI, LAUGH_EMOJIS, MEME_CHANNEL_NAME } from '../config/constants.js';
import { MemeRepository } from '../repositories/meme-repository.js';
import { UserRepository } from '../repositories/user-repository.js';
import { MemeContest, MemeData, MemeStats } from '../types/meme.js';

dayjs.extend(timezone);

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
        try {
            console.log(
                `completeContest: Starting for contest ${contestId} with ${winners.length} winners`
            );

            const contest = await this.getContest(contestId);
            if (!contest) {
                console.log(`completeContest: Contest ${contestId} not found`);
                return false;
            }
            if (contest.status !== 'active') {
                console.log(
                    `completeContest: Contest ${contestId} status is ${contest.status}, not active`
                );
                return false;
            }

            console.log(`completeContest: Converting ${winners.length} winners to database format`);
            // Convert winners to database format
            const winnerData = winners.map((winner, index) => {
                console.log(
                    `completeContest: Processing winner ${index + 1}: ${winner.author.username} (${
                        winner.contestType
                    })`
                );
                return {
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
                };
            });

            console.log(`completeContest: Adding ${winnerData.length} winners to database`);
            await this.memeRepo.addMemeWinners(winnerData);

            console.log(`completeContest: Marking contest ${contestId} as completed`);
            await this.memeRepo.completeContest(contestId);

            console.log(`completeContest: Successfully completed contest ${contestId}`);
            return true;
        } catch (error) {
            console.error(`completeContest ERROR for ${contestId}:`, error);
            throw error;
        }
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
        const now = dayjs().tz('America/Bogota').toDate();

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

                    // Auto-create next week's contest if this was a weekly contest
                    if (contest.type === 'weekly') {
                        await this.createNextWeeklyContest(contest, client);
                    }
                } catch (error) {
                    console.error(`Error processing contest ${contest.id}:`, error);
                    console.error(`Error details:`, {
                        contestId: contest.id,
                        error: error instanceof Error ? error.message : String(error),
                        stack: error instanceof Error ? error.stack : undefined,
                    });
                }
            }
        }
    }

    // Debug/manual contest processing
    async processSpecificContest(contest: MemeContest, client: any): Promise<void> {
        console.log(`Manually processing contest: ${contest.id}`);

        try {
            console.log(`Step 1: Looking for meme channel "${MEME_CHANNEL_NAME}"`);
            // Find the meme channel
            const memeChannel = client.channels.cache.find(
                (ch: any) => ch.isTextBased() && ch.name === MEME_CHANNEL_NAME
            );

            if (!memeChannel) {
                console.log(
                    `Available channels:`,
                    client.channels.cache
                        .filter((ch: any) => ch.isTextBased())
                        .map((ch: any) => `${ch.name} (${ch.id})`)
                );
                throw new Error(`Meme channel "${MEME_CHANNEL_NAME}" not found`);
            }
            console.log(`Step 2: Found meme channel: ${memeChannel.name} (${memeChannel.id})`);

            console.log(
                `Step 3: Fetching messages from ${contest.startDate} to ${contest.endDate}`
            );

            // Fetch messages from the contest period
            const messages = await this.fetchMessagesInRange(
                memeChannel,
                contest.startDate,
                contest.endDate
            );

            console.log(`Step 4: Found ${messages.length} messages in contest period`);

            if (messages.length === 0) {
                console.log(
                    `Step 5: No messages found for contest ${contest.id}, completing without winners`
                );
                await this.memeRepo.completeContest(contest.id);
                return;
            }

            console.log(`Step 5: Getting top memes with emojis:`, LAUGH_EMOJIS);
            // Get top memes (laugh reactions)
            const topMemes = await this.getTopMessages(messages, LAUGH_EMOJIS);
            console.log(`Step 6: Found ${topMemes.length} top memes`);

            console.log(`Step 7: Getting top bones with emojis:`, BONE_EMOJI);
            // Get top bones (bone reactions)
            const topBones = await this.getTopMessages(messages, BONE_EMOJI);
            console.log(`Step 8: Found ${topBones.length} top bones`);

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

            console.log(
                `Step 9: Completing contest with ${memeWinners.length} meme winners and ${boneWinners.length} bone winners`
            );

            try {
                // Complete the contest with both meme and bone winners
                const allWinners = [...memeWinners, ...boneWinners];
                console.log(
                    `Step 9.1: Calling completeContest with ${allWinners.length} total winners`
                );

                const success = await this.completeContest(contest.id, allWinners);
                console.log(
                    `Step 10: Contest ${contest.id} database completion result: ${success}`
                );

                if (!success) {
                    throw new Error('Contest completion returned false');
                }
            } catch (error) {
                console.error(`Step 9 ERROR: Failed to complete contest ${contest.id}:`, error);
                throw error;
            }

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

            // Auto-create next week's contest if this was a weekly contest
            if (contest.type === 'weekly') {
                await this.createNextWeeklyContest(contest, client);
            }
        } catch (error) {
            console.error(`Error in manual contest processing for ${contest.id}:`, error);
            throw error;
        }
    }

    // Auto-create next week's contest
    private async createNextWeeklyContest(
        completedContest: MemeContest,
        client: any
    ): Promise<void> {
        try {
            console.log(`Creating next week's contest after completing ${completedContest.id}`);

            // Import the utility function
            const { getNextFridayAtNoon } = await import('../utils/meme-utils.js');

            // Calculate next week's dates (Friday to Friday)
            const nextStartDate = getNextFridayAtNoon().utc().toDate();
            const nextEndDate = getNextFridayAtNoon().add(1, 'week').utc().toDate();

            console.log(
                `Next contest dates: ${nextStartDate.toISOString()} to ${nextEndDate.toISOString()}`
            );

            // Check if there's already an active contest for next week
            const activeContests = await this.getActiveContests();
            const hasNextWeekContest = activeContests.some(contest => {
                const contestStart = new Date(contest.startDate);
                const nextStart = new Date(nextStartDate);
                return Math.abs(contestStart.getTime() - nextStart.getTime()) < 24 * 60 * 60 * 1000; // Within 24 hours
            });

            if (hasNextWeekContest) {
                console.log('Next week contest already exists, skipping auto-creation');
                return;
            }

            // Create the bot user for contest creation
            const botUser = client.user;
            if (!botUser) {
                console.warn('Bot user not available for contest creation');
                return;
            }

            // Create next week's contest
            const nextContest = await this.createContest(
                'weekly',
                nextStartDate,
                nextEndDate,
                completedContest.channelId,
                botUser
            );

            // Post announcement in the same channel where the completed contest was
            const contestChannel = client.channels.cache.get(completedContest.channelId);
            if (contestChannel) {
                const { createMemeContestEmbed, createMemeContestButtonRow } = await import(
                    './meme-embed.js'
                );
                const embed = createMemeContestEmbed(nextContest);
                const buttonRow = createMemeContestButtonRow(nextContest);

                const message = await contestChannel.send({
                    content: '🎉 **¡Nuevo concurso semanal iniciado automáticamente!**',
                    embeds: [embed],
                    components: [buttonRow],
                });

                // Update contest with message ID
                await this.updateContestMessageId(nextContest.id, message.id);

                console.log(`✅ Auto-created next week's contest: ${nextContest.id}`);
            } else {
                console.warn(
                    `Contest channel ${completedContest.channelId} not found for next week announcement`
                );
            }
        } catch (error) {
            console.error('Error creating next week\'s contest:', error);
            // Don't throw - we don't want to break the completion process if auto-creation fails
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
