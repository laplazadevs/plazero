import dayjs from 'dayjs';
import { ChatInputCommandInteraction, PermissionFlagsBits, TextChannel } from 'discord.js';

import { LAUGH_EMOJIS, MEME_CHANNEL_NAME } from '../config/constants.js';
import {
    createMemeContestButtonRow,
    createMemeContestEmbed,
    createMemeStatsEmbed,
    createMemeWinnersEmbed,
    createYearlyWinnersEmbed,
} from '../services/meme-embed.js';
import { MemeManager } from '../services/meme-manager.js';
import {
    getCurrentFridayAtNoon,
    getNextFridayAtNoon,
    isValidContestDateRange,
} from '../utils/meme-utils.js';

export async function handleGetTopCommand(
    interaction: ChatInputCommandInteraction,
    memeManager: MemeManager
): Promise<void> {
    await interaction.deferReply();

    try {
        // Create a weekly contest for this period
        const now = dayjs().tz('America/Bogota');
        const lastFriday = getLastFridayAtNoon();
        const thisFriday = lastFriday.add(7, 'day');
        const endDate = now.isBefore(thisFriday) ? now : thisFriday;

        const contest = await memeManager.createContest(
            'weekly',
            lastFriday.toDate(),
            endDate.toDate(),
            interaction.channelId,
            interaction.user
        );

        // Process messages and get winners
        const channel = interaction.client.channels.cache.find(
            ch => ch.isTextBased() && (ch as TextChannel).name === MEME_CHANNEL_NAME
        ) as TextChannel;
        if (!channel) {
            await interaction.editReply(`❌ Canal "${MEME_CHANNEL_NAME}" no encontrado.`);
            return;
        }

        const allMessages = await fetchMessagesInRange(channel, lastFriday, endDate);

        if (allMessages.length === 0) {
            await interaction.editReply(
                'No se encontraron mensajes en el rango de fechas especificado.'
            );
            return;
        }

        // Get top memes and bones
        const topMemes = await getTopMessages(allMessages, [
            '🤣',
            '😂',
            '🥇',
            '956966036354265180',
            '974777892418519081',
            '954075635310035024',
            '956966037063106580',
        ]);
        const topBones = await getTopMessages(allMessages, ['🦴']);

        // Create meme data for winners
        const memeWinners = topMemes.map((winner, index) => ({
            id: `meme-${contest.id}-${index}`,
            message: winner.message,
            author: winner.message.author,
            reactionCount: winner.count,
            contestType: 'meme' as const,
            weekStart: lastFriday.toDate(),
            weekEnd: endDate.toDate(),
            rank: index + 1,
            submittedAt: winner.message.createdAt,
        }));

        const boneWinners = topBones.map((winner, index) => ({
            id: `bone-${contest.id}-${index}`,
            message: winner.message,
            author: winner.message.author,
            reactionCount: winner.count,
            contestType: 'bone' as const,
            weekStart: lastFriday.toDate(),
            weekEnd: endDate.toDate(),
            rank: index + 1,
            submittedAt: winner.message.createdAt,
        }));

        // Add winners to contest
        [...memeWinners, ...boneWinners].forEach(winner => {
            memeManager.addMemeToContest(contest.id, winner);
        });

        // Complete the contest
        await memeManager.completeContest(contest.id, [...memeWinners, ...boneWinners]);

        // Announce winners
        const period = `${lastFriday.format('MMM DD')} - ${endDate.format('MMM DD')}`;

        if (memeWinners.length > 0) {
            const memeEmbed = createMemeWinnersEmbed(memeWinners, 'meme', period);
            await interaction.followUp({ embeds: [memeEmbed] });
        }

        if (boneWinners.length > 0) {
            const boneEmbed = createMemeWinnersEmbed(boneWinners, 'bone', period);
            await interaction.followUp({ embeds: [boneEmbed] });
        }

        await interaction.editReply('✅ Ganadores anunciados!');
    } catch (error) {
        console.error('Error in handleGetTopCommand:', error);
        await interaction.editReply('❌ Hubo un error procesando el comando.');
    }
}

export async function handleMemeOfTheYearCommand(
    interaction: ChatInputCommandInteraction,
    _memeManager: MemeManager
): Promise<void> {
    await interaction.deferReply();

    try {
        // Get current year and date
        const now = dayjs().tz('America/Bogota');
        const currentYear = now.year();
        const startDate = dayjs.tz(`${currentYear}-01-01`, 'America/Bogota').startOf('day');
        const endDate = now; // Use current date instead of end of year

        // Process messages for the year up to current date
        const channel = interaction.client.channels.cache.find(
            ch => ch.isTextBased() && (ch as TextChannel).name === MEME_CHANNEL_NAME
        ) as TextChannel;
        if (!channel) {
            await interaction.editReply(`❌ Canal "${MEME_CHANNEL_NAME}" no encontrado.`);
            return;
        }

        const messages = await fetchMessagesInRange(channel, startDate, endDate);
        const winners = await getTopMessages(messages, LAUGH_EMOJIS);

        if (winners.length === 0) {
            await interaction.editReply(`No se encontraron memes para el año ${currentYear} 😢`);
            return;
        }

        // Create meme data for winners (no need to create contest, just display results)
        const yearlyWinners = winners.map((winner, index) => ({
            id: `yearly-display-${index}`,
            message: winner.message,
            author: winner.message.author,
            reactionCount: winner.count,
            contestType: 'meme' as const,
            weekStart: startDate.toDate(),
            weekEnd: endDate.toDate(),
            rank: index + 1,
            submittedAt: winner.message.createdAt,
        }));

        // Create and send the embed with current year information
        const embed = createYearlyWinnersEmbed(
            yearlyWinners,
            currentYear,
            endDate.format('MMMM DD')
        );
        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('Error in handleMemeOfTheYearCommand:', error);
        await interaction.editReply('❌ Hubo un error procesando el comando.');
    }
}

// Helper functions (moved from meme-service.ts for better organization)
function getLastFridayAtNoon(): dayjs.Dayjs {
    const now = dayjs().tz('America/Bogota');
    let lastFriday = now.day(5).hour(12).minute(0).second(0).millisecond(0);
    lastFriday = lastFriday.subtract(1, 'week');
    return lastFriday;
}

async function fetchMessagesInRange(
    channel: TextChannel,
    startDate: dayjs.Dayjs,
    endDate: dayjs.Dayjs
): Promise<any[]> {
    let messages: any[] = [];
    let lastMessageId: string | undefined;
    let hasMoreMessages = true;
    let iteration = 0;

    while (hasMoreMessages) {
        console.log(`Fetching messages, iteration ${iteration}`);
        const options: { limit: number; before?: string } = { limit: 100 };
        if (lastMessageId) options.before = lastMessageId;

        const fetchedMessages = await channel.messages.fetch(options);
        console.log(`Fetched ${fetchedMessages.size} messages`);

        if (fetchedMessages.size === 0) {
            hasMoreMessages = false;
            break;
        }

        const filteredMessages = fetchedMessages.filter(msg => {
            const msgDate = dayjs(msg.createdAt);
            return msgDate.isBetween(startDate, endDate, null, '[)');
        });

        console.log(`Filtered ${filteredMessages.size} messages in date range`);

        messages.push(...filteredMessages.values());
        lastMessageId = fetchedMessages.last()?.id;

        const oldestMessageDate = dayjs(fetchedMessages.last()?.createdAt);
        if (oldestMessageDate.isBefore(startDate)) {
            console.log('Oldest message is before start date, breaking loop');
            break;
        }

        iteration++;
    }

    console.log(`Total messages collected: ${messages.length}`);
    return messages;
}

async function getTopMessages(
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

    return messagesWithReactions.slice(0, 3);
}

export async function handleMemeStatsCommand(
    interaction: ChatInputCommandInteraction,
    memeManager: MemeManager
): Promise<void> {
    await interaction.deferReply();

    try {
        const stats = await memeManager.getStats();
        const embed = createMemeStatsEmbed(stats);

        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('Error in handleMemeStatsCommand:', error);
        await interaction.editReply('❌ Hubo un error obteniendo las estadísticas.');
    }
}

export async function handleMemeContestCommand(
    interaction: ChatInputCommandInteraction,
    memeManager: MemeManager
): Promise<void> {
    await interaction.deferReply();

    try {
        // Check if user has moderator or admin permissions
        const member = interaction.member;
        if (!member || typeof member.permissions === 'string') {
            await interaction.editReply({
                content: '❌ No tienes permisos para crear concursos.',
            });
            return;
        }

        const hasPermission = member.permissions.has([
            PermissionFlagsBits.ModerateMembers,
            PermissionFlagsBits.Administrator,
        ]);

        if (!hasPermission) {
            await interaction.editReply({
                content: '❌ Solo los moderadores y administradores pueden crear concursos.',
            });
            return;
        }

        const contestType = interaction.options.getString('type', true) as 'weekly' | 'yearly';
        const durationStr = interaction.options.getString('duration', false);

        let startDate: Date;
        let endDate: Date;

        if (contestType === 'weekly') {
            // Use current Friday-to-Friday period
            startDate = getCurrentFridayAtNoon().toDate();
            endDate = getNextFridayAtNoon().toDate();
        } else {
            // Yearly contest
            startDate = dayjs.tz('2024-01-01', 'America/Bogota').startOf('day').toDate();
            endDate = dayjs.tz('2024-12-31', 'America/Bogota').endOf('day').toDate();
        }

        // Parse custom duration if provided
        if (durationStr) {
            const now = dayjs().tz('America/Bogota');
            startDate = now.toDate();

            // Parse duration (e.g., "7d", "30d", "1y")
            const match = durationStr.match(/^(\d+)([dmy])$/);
            if (match) {
                const value = parseInt(match[1]);
                const unit = match[2];

                switch (unit) {
                    case 'd':
                        endDate = now.add(value, 'day').toDate();
                        break;
                    case 'm':
                        endDate = now.add(value, 'month').toDate();
                        break;
                    case 'y':
                        endDate = now.add(value, 'year').toDate();
                        break;
                }
            } else {
                await interaction.editReply(
                    '❌ Formato de duración inválido. Usa formato como "7d", "30d", "1y".'
                );
                return;
            }
        }

        // Validate date range
        if (!isValidContestDateRange(startDate, endDate)) {
            await interaction.editReply('❌ Rango de fechas inválido para el concurso.');
            return;
        }

        // Create contest
        const contest = await memeManager.createContest(
            contestType,
            startDate,
            endDate,
            interaction.channelId,
            interaction.user
        );

        // Create and send contest embed
        const embed = createMemeContestEmbed(contest);
        const buttonRow = createMemeContestButtonRow(contest);

        const message = await interaction.editReply({
            embeds: [embed],
            components: [buttonRow],
        });

        // Update contest with message ID
        await memeManager.updateContestMessageId(contest.id, message.id);

        await interaction.followUp({
            content: `✅ Concurso de memes creado exitosamente! ID: \`${contest.id}\``,
            ephemeral: true,
        });
    } catch (error) {
        console.error('Error in handleMemeContestCommand:', error);
        await interaction.editReply('❌ Hubo un error creando el concurso.');
    }
}
