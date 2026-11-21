import { randomUUID } from 'node:crypto';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone.js';
import {
    type Channel,
    type Collection,
    type Message,
    SnowflakeUtil,
    TextChannel,
} from 'discord.js';
import { Context, Effect, Layer } from 'effect';

import { DiscordClient, discordCall } from '../../discord/DiscordClient.js';
import { type PlazeroUser, plazeroUserFromRow } from '../../domain/User.js';
import { UserRepository } from '../../domain/UserRepository.js';
import {
    BONE_EMOJI,
    classifyRecoveredWeek,
    getMissedWeeklyWindows,
    getRecoveryStart,
    getWeeklyContestWindow,
    LAUGH_EMOJIS,
    MEME_CHANNEL_NAME,
    type MemeContest,
    type MemeData,
    type MissedContestsResult,
    type RankedEntry,
    type RecoveredWeek,
    type WeeklyContestRecoveryResult,
    winnerId,
} from './MemeDomain.js';
import {
    createMemeContestButtonRow,
    createMemeContestEmbed,
    createMemeWinnersEmbed,
} from './MemeEmbeds.js';
import { type MemeContestRow, MemeRepository } from './MemeRepository.js';

dayjs.extend(timezone);

interface RankedMessage {
    readonly message: Message;
    readonly count: number;
}

export const resolveContestChannel = (
    channels: Collection<string, Channel>,
    preferredId?: string
): TextChannel | undefined => {
    const preferred = preferredId ? channels.get(preferredId) : undefined;
    if (preferred instanceof TextChannel) return preferred;
    return channels.find(
        (channel): channel is TextChannel =>
            channel instanceof TextChannel && channel.name === MEME_CHANNEL_NAME
    );
};

export const snowflakeBefore = (date: Date): string =>
    (((BigInt(date.getTime()) - BigInt(SnowflakeUtil.epoch)) << 22n) - 1n).toString();

// Counts unique users that reacted with any of the given emojis and returns
// the top 3 messages.
export const getTopMessages = Effect.fn('MemeManager.getTopMessages')(function* (
    messages: ReadonlyArray<Message>,
    reactionEmojis: ReadonlyArray<string>
) {
    const counted = yield* Effect.all(
        messages.map(message =>
            Effect.gen(function* () {
                const matching = [...message.reactions.cache.values()].filter(
                    reaction =>
                        reactionEmojis.includes(reaction.emoji.name ?? '') ||
                        reactionEmojis.includes(reaction.emoji.id ?? '')
                );

                const userIds = new Set<string>();
                for (const reaction of matching) {
                    const users = yield* discordCall('reaction.users.fetch', () =>
                        reaction.users.fetch()
                    );
                    for (const userId of users.keys()) {
                        userIds.add(userId);
                    }
                }

                const ranked: RankedMessage = { message, count: userIds.size };
                return ranked;
            })
        ),
        { concurrency: 'unbounded' }
    );

    return counted
        .filter(item => item.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);
});

export const fetchMessagesInRange = Effect.fn('MemeManager.fetchMessagesInRange')(function* (
    channel: Pick<TextChannel, 'messages'>,
    startDate: Date,
    endDate: Date
) {
    const messages: Message[] = [];
    let after = snowflakeBefore(startDate);

    while (true) {
        const page = yield* discordCall('channel.messages.fetch', () =>
            channel.messages.fetch({ limit: 100, after })
        );
        const inRange = page.filter(message => message.createdAt < endDate);
        messages.push(...inRange.values());
        if (page.size < 100 || inRange.size < page.size) break;
        after = page.reduce(
            (newest, message) => (BigInt(message.id) > BigInt(newest) ? message.id : newest),
            after
        );
    }

    return messages;
});

export const toWinners = (
    ranked: ReadonlyArray<RankedMessage>,
    contestId: string,
    contestType: 'meme' | 'bone',
    weekStart: Date,
    weekEnd: Date
): MemeData[] =>
    ranked.map((winner, index) => ({
        id: winnerId(contestType, contestId, index),
        message: winner.message,
        author: winner.message.author,
        reactionCount: winner.count,
        contestType,
        weekStart,
        weekEnd,
        rank: index + 1,
        submittedAt: winner.message.createdAt,
    }));

export class MemeManager extends Context.Service<MemeManager>()('plazero/MemeManager', {
    make: Effect.gen(function* () {
        const memeRepo = yield* MemeRepository;
        const userRepo = yield* UserRepository;
        const client = yield* DiscordClient;

        const convertToMemeContest = (
            contestRow: MemeContestRow,
            createdBy: PlazeroUser
        ): MemeContest => ({
            id: contestRow.id,
            type: contestRow.type,
            startDate: contestRow.start_date,
            endDate: contestRow.end_date,
            status: contestRow.status,
            winners: [], // Winners are loaded separately when needed
            channelId: contestRow.channel_id,
            messageId: contestRow.message_id ?? undefined,
            createdBy,
            createdAt: contestRow.created_at,
        });

        const createContest = Effect.fn('MemeManager.createContest')(function* (
            type: 'weekly' | 'yearly',
            startDate: Date,
            endDate: Date,
            channelId: string,
            createdBy: PlazeroUser
        ) {
            const contestId = randomUUID();
            const contestRow = yield* memeRepo.createContest(
                contestId,
                type,
                startDate,
                endDate,
                channelId,
                createdBy
            );
            return convertToMemeContest(contestRow, createdBy);
        });

        const getContest = Effect.fn('MemeManager.getContest')(function* (contestId: string) {
            const contestRow = yield* memeRepo.getContest(contestId);
            if (!contestRow) return undefined;

            const createdBy = yield* userRepo.getUser(contestRow.created_by_id);
            if (!createdBy) return undefined;

            return convertToMemeContest(contestRow, plazeroUserFromRow(createdBy));
        });

        const getActiveContests = Effect.fn('MemeManager.getActiveContests')(function* () {
            const activeContests = yield* memeRepo.getActiveContests();
            const result: MemeContest[] = [];

            for (const contestRow of activeContests) {
                const createdBy = yield* userRepo.getUser(contestRow.created_by_id);
                if (createdBy) {
                    result.push(convertToMemeContest(contestRow, plazeroUserFromRow(createdBy)));
                }
            }

            return result;
        });

        const getLatestWeeklyContest = Effect.fn('MemeManager.getLatestWeeklyContest')(
            function* () {
                const contestRow = yield* memeRepo.getLatestWeeklyContest();
                if (!contestRow) return undefined;

                const createdBy = yield* userRepo.getUser(contestRow.created_by_id);
                if (!createdBy) return undefined;

                return convertToMemeContest(contestRow, plazeroUserFromRow(createdBy));
            }
        );

        const updateContestMessageId = Effect.fn('MemeManager.updateContestMessageId')(function* (
            contestId: string,
            messageId: string
        ) {
            yield* memeRepo.updateContestMessageId(contestId, messageId);
        });

        const completeContest = Effect.fn('MemeManager.completeContest')(function* (
            contestId: string,
            winners: ReadonlyArray<MemeData>
        ) {
            yield* Effect.logInfo(
                `completeContest: starting for contest ${contestId} with ${winners.length} winners`
            );

            const contest = yield* getContest(contestId);
            if (!contest) {
                yield* Effect.logWarning(`completeContest: contest ${contestId} not found`);
                return false;
            }
            if (contest.status !== 'active') {
                yield* Effect.logWarning(
                    `completeContest: contest ${contestId} status is ${contest.status}, not active`
                );
                return false;
            }

            yield* memeRepo.addMemeWinners(
                winners.map(winner => ({
                    id: winner.id,
                    contest_id: contestId,
                    message_id: winner.message.id,
                    author_id: winner.author.id,
                    reaction_count: winner.reactionCount,
                    contest_type: winner.contestType,
                    rank: winner.rank ?? 0,
                    week_start: winner.weekStart,
                    week_end: winner.weekEnd,
                    submitted_at: winner.submittedAt,
                }))
            );

            yield* memeRepo.completeContest(contestId);
            yield* Effect.logInfo(`completeContest: contest ${contestId} completed`);
            return true;
        });

        const getContestMemes = Effect.fn('MemeManager.getContestMemes')(function* (
            contestId: string
        ) {
            const winners = yield* memeRepo.getContestWinners(contestId);
            const result: MemeData[] = [];

            for (const winner of winners) {
                const author = yield* userRepo.getUser(winner.author_id);
                if (author) {
                    result.push({
                        id: winner.id,
                        message: { id: winner.message_id },
                        author: plazeroUserFromRow(author),
                        reactionCount: winner.reaction_count,
                        contestType: winner.contest_type,
                        weekStart: winner.week_start ?? new Date(),
                        weekEnd: winner.week_end ?? new Date(),
                        rank: winner.rank,
                        submittedAt: winner.submitted_at,
                    });
                }
            }

            return result;
        });

        const analyzeContestMemes = Effect.fn('MemeManager.analyzeContestMemes')(function* (
            contestId: string,
            contestType: 'meme' | 'bone'
        ) {
            const memes = yield* getContestMemes(contestId);
            const filtered = memes
                .filter(meme => meme.contestType === contestType)
                .sort((a, b) => b.reactionCount - a.reactionCount)
                .map((meme, index) => ({ ...meme, rank: index + 1 }));

            return filtered.slice(0, 3);
        });

        const getTopContributors = Effect.fn('MemeManager.getTopContributors')(function* (
            limit: number = 10
        ) {
            const contributors = yield* memeRepo.getTopContributors(limit);
            const result: { user: PlazeroUser; count: number }[] = [];

            for (const contributor of contributors) {
                const userRow = yield* userRepo.getUser(contributor.user_id);
                if (userRow) {
                    result.push({
                        user: plazeroUserFromRow(userRow),
                        count: contributor.total_wins,
                    });
                }
            }

            return result;
        });

        const getStats = Effect.fn('MemeManager.getStats')(function* () {
            const stats = yield* memeRepo.getMemeStats();
            const topContributors = yield* getTopContributors(5);

            return { ...stats, topContributors };
        });

        // Announces winners in the contest channel and auto-creates the next
        // weekly contest, shared by the automatic and manual completion paths.
        const announceWinners = Effect.fn('MemeManager.announceWinners')(function* (
            contest: MemeContest,
            memeWinners: ReadonlyArray<MemeData>,
            boneWinners: ReadonlyArray<MemeData>
        ) {
            if (!contest.channelId || (memeWinners.length === 0 && boneWinners.length === 0)) {
                return;
            }

            const contestChannel = resolveContestChannel(client.channels.cache, contest.channelId);
            if (!contestChannel) {
                yield* Effect.logWarning(`No channel available to announce contest ${contest.id}`);
                return;
            }

            const period = `${new Date(contest.startDate).toLocaleDateString()} - ${new Date(
                contest.endDate
            ).toLocaleDateString()}`;

            if (memeWinners.length > 0) {
                const memeEmbed = createMemeWinnersEmbed([...memeWinners], 'meme', period);
                yield* discordCall('channel.send', () =>
                    contestChannel.send({ embeds: [memeEmbed] })
                );
            }

            if (boneWinners.length > 0) {
                const boneEmbed = createMemeWinnersEmbed([...boneWinners], 'bone', period);
                yield* discordCall('channel.send', () =>
                    contestChannel.send({ embeds: [boneEmbed] })
                );
            }
        });

        const ensureCurrentWeeklyContest = Effect.fn('MemeManager.ensureCurrentWeeklyContest')(
            function* (completedContest?: MemeContest) {
                const activeContests = yield* getActiveContests();
                const activeWeeklyContest = activeContests.find(
                    contest => contest.type === 'weekly'
                );
                if (activeWeeklyContest) {
                    const result: WeeklyContestRecoveryResult = {
                        _tag: 'AlreadyActive',
                        contest: activeWeeklyContest,
                    };
                    return result;
                }

                const previousContest = completedContest ?? (yield* getLatestWeeklyContest());
                const contestChannel = resolveContestChannel(
                    client.channels.cache,
                    previousContest?.channelId
                );
                if (!contestChannel) {
                    yield* Effect.logWarning(
                        `No channel available for weekly recovery (previous ${previousContest?.channelId ?? 'none'})`
                    );
                    const result: WeeklyContestRecoveryResult = { _tag: 'ChannelUnavailable' };
                    return result;
                }

                const window = getWeeklyContestWindow();
                const contest = yield* createContest(
                    'weekly',
                    window.start.utc().toDate(),
                    window.end.utc().toDate(),
                    contestChannel.id,
                    client.user
                );
                const embed = createMemeContestEmbed(contest);
                const buttonRow = createMemeContestButtonRow(contest);

                const message = yield* discordCall('channel.send', () =>
                    contestChannel.send({
                        content: '🎉 **¡Concurso semanal recuperado e iniciado automáticamente!**',
                        embeds: [embed],
                        components: [buttonRow],
                    })
                );

                yield* updateContestMessageId(contest.id, message.id);
                yield* Effect.logInfo(`Recovered weekly contest: ${contest.id}`);

                const result: WeeklyContestRecoveryResult = { _tag: 'Created', contest };
                return result;
            }
        );

        const processContest = Effect.fn('MemeManager.processContest')(function* (
            contest: MemeContest
        ) {
            const memeChannel = resolveContestChannel(client.channels.cache);
            if (!memeChannel) {
                yield* Effect.logWarning(`Meme channel not found for contest ${contest.id}`);
                return;
            }

            const messages = yield* fetchMessagesInRange(
                memeChannel,
                contest.startDate,
                contest.endDate
            );

            if (messages.length === 0) {
                yield* Effect.logInfo(`No messages found for contest ${contest.id}`);
                const completed = yield* completeContest(contest.id, []);
                if (!completed) return;
            } else {
                const topMemes = yield* getTopMessages(messages, LAUGH_EMOJIS);
                const topBones = yield* getTopMessages(messages, BONE_EMOJI);

                const memeWinners = toWinners(
                    topMemes,
                    contest.id,
                    'meme',
                    contest.startDate,
                    contest.endDate
                );
                const boneWinners = toWinners(
                    topBones,
                    contest.id,
                    'bone',
                    contest.startDate,
                    contest.endDate
                );

                const completed = yield* completeContest(contest.id, [
                    ...memeWinners,
                    ...boneWinners,
                ]);
                if (!completed) return;

                yield* announceWinners(contest, memeWinners, boneWinners);
                yield* Effect.logInfo(
                    `Contest ${contest.id} completed with ${memeWinners.length} meme winners and ${boneWinners.length} bone winners`
                );
            }

            if (contest.type === 'weekly') {
                yield* ensureCurrentWeeklyContest(contest).pipe(
                    Effect.catchCause(cause =>
                        Effect.logError('Error recovering weekly contest:', cause)
                    )
                );
            }
        });

        const processExpiredContests = Effect.fn('MemeManager.processExpiredContests')(
            function* () {
                const activeContests = yield* getActiveContests();
                const now = dayjs().tz('America/Bogota').toDate();

                for (const contest of activeContests) {
                    if (contest.endDate <= now) {
                        yield* Effect.logInfo(`Processing expired contest: ${contest.id}`);
                        yield* processContest(contest).pipe(
                            Effect.catchCause(cause =>
                                Effect.logError(`Error processing contest ${contest.id}:`, cause)
                            )
                        );
                    }
                }
            }
        );

        const processSpecificContest = Effect.fn('MemeManager.processSpecificContest')(function* (
            contest: MemeContest
        ) {
            yield* Effect.logInfo(`Manually processing contest: ${contest.id}`);
            yield* processContest(contest);
        });

        const recoverLatestWeeklyContest = Effect.fn('MemeManager.recoverLatestWeeklyContest')(
            function* () {
                yield* processExpiredContests();
                return yield* ensureCurrentWeeklyContest();
            }
        );

        const recoverMissedWeeklyContests = Effect.fn('MemeManager.recoverMissedWeeklyContests')(
            function* (options: { readonly confirm: boolean; readonly announce: boolean }) {
                const memeChannel = resolveContestChannel(client.channels.cache);
                if (!memeChannel) {
                    const result: MissedContestsResult = { _tag: 'MemeChannelUnavailable' };
                    return result;
                }

                const now = new Date();
                const latest = yield* memeRepo.getLatestWeeklyContestBefore(
                    getWeeklyContestWindow(dayjs(now).tz('America/Bogota')).start.toDate()
                );
                const contestChannel =
                    resolveContestChannel(client.channels.cache, latest?.channel_id) ?? memeChannel;
                const from = getRecoveryStart(latest);
                const weeks: RecoveredWeek[] = [];

                for (const window of getMissedWeeklyWindows(from, now)) {
                    const messages = yield* fetchMessagesInRange(
                        memeChannel,
                        window.start,
                        window.end
                    );
                    const topMemes = yield* getTopMessages(messages, LAUGH_EMOJIS);
                    const topBones = yield* getTopMessages(messages, BONE_EMOJI);
                    const toEntry = (ranked: RankedMessage): RankedEntry => ({
                        url: ranked.message.url,
                        authorId: ranked.message.author.id,
                        count: ranked.count,
                    });
                    const week: RecoveredWeek = {
                        window,
                        messageCount: messages.length,
                        topMemes: topMemes.map(toEntry),
                        topBones: topBones.map(toEntry),
                        status: classifyRecoveredWeek(
                            messages.length,
                            topMemes.length + topBones.length
                        ),
                    };

                    if (!options.confirm) {
                        weeks.push(week);
                        continue;
                    }

                    for (const winner of [...topMemes, ...topBones]) {
                        yield* userRepo.upsertUser(winner.message.author);
                    }
                    const toRows = (ranked: ReadonlyArray<RankedMessage>, type: 'meme' | 'bone') =>
                        ranked.map((winner, index) => ({
                            message_id: winner.message.id,
                            author_id: winner.message.author.id,
                            reaction_count: winner.count,
                            contest_type: type,
                            rank: index + 1,
                            week_start: window.start,
                            week_end: window.end,
                            submitted_at: winner.message.createdAt,
                        }));
                    const saved = yield* memeRepo.saveRecoveredWeeklyContest(
                        window,
                        contestChannel.id,
                        client.user,
                        [...toRows(topMemes, 'meme'), ...toRows(topBones, 'bone')]
                    );
                    weeks.push({ ...week, savedWinners: saved.insertedWinners });

                    if (options.announce && week.status._tag === 'Recoverable') {
                        const contest: MemeContest = {
                            id: saved.contestId,
                            type: 'weekly',
                            startDate: window.start,
                            endDate: window.end,
                            status: 'completed',
                            winners: [],
                            channelId: contestChannel.id,
                            createdBy: client.user,
                            createdAt: now,
                        };
                        yield* announceWinners(
                            contest,
                            toWinners(topMemes, saved.contestId, 'meme', window.start, window.end),
                            toWinners(topBones, saved.contestId, 'bone', window.start, window.end)
                        );
                    }
                }

                const result: MissedContestsResult = {
                    _tag: 'Scanned',
                    from,
                    weeks,
                    confirm: options.confirm,
                    announce: options.announce,
                };
                return result;
            }
        );

        return {
            createContest,
            getContest,
            getActiveContests,
            getLatestWeeklyContest,
            updateContestMessageId,
            completeContest,
            getContestMemes,
            analyzeContestMemes,
            getTopContributors,
            getStats,
            processExpiredContests,
            processSpecificContest,
            recoverLatestWeeklyContest,
            recoverMissedWeeklyContests,
        } as const;
    }),
}) {
    static readonly layer = Layer.effect(MemeManager)(MemeManager.make);
}
