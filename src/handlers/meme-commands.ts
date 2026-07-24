import dayjs from 'dayjs';
import { ChatInputCommandInteraction, PermissionFlagsBits, TextChannel } from 'discord.js';
import { Effect } from 'effect';

import { LAUGH_EMOJIS, MEME_CHANNEL_NAME } from '../config/constants.js';
import { discordCall } from '../discord/DiscordClient.js';
import {
    createMemeContestButtonRow,
    createMemeContestEmbed,
    createMemeStatsEmbed,
    createYearlyWinnersEmbed,
} from '../services/meme-embed.js';
import { fetchMessagesInRange, getTopMessages, MemeManager } from '../services/meme-manager.js';
import {
    getCurrentFridayAtNoon,
    getNextFridayAtNoon,
    isValidContestDateRange,
} from '../utils/meme-utils.js';

export const handleMemeOfTheYearCommand = Effect.fn('handleMemeOfTheYearCommand')(function* (
    interaction: ChatInputCommandInteraction
) {
    yield* discordCall('interaction.deferReply', () => interaction.deferReply());

    yield* Effect.gen(function* () {
        // Current year up to the current date
        const now = dayjs().tz('America/Bogota');
        const currentYear = now.year();
        const startDate = dayjs.tz(`${currentYear}-01-01`, 'America/Bogota').startOf('day');
        const endDate = now;

        const channel = interaction.client.channels.cache.find(
            (ch): ch is TextChannel => ch instanceof TextChannel && ch.name === MEME_CHANNEL_NAME
        );
        if (!channel) {
            yield* discordCall('interaction.editReply', () =>
                interaction.editReply(`❌ Canal "${MEME_CHANNEL_NAME}" no encontrado.`)
            );
            return;
        }

        const messages = yield* fetchMessagesInRange(
            channel,
            startDate.utc().toDate(),
            endDate.utc().toDate()
        );
        const winners = yield* getTopMessages(messages, LAUGH_EMOJIS);

        if (winners.length === 0) {
            yield* discordCall('interaction.editReply', () =>
                interaction.editReply(`No se encontraron memes para el año ${currentYear} 😢`)
            );
            return;
        }

        const yearlyWinners = winners.map((winner, index) => ({
            id: `yearly-display-${index}`,
            message: winner.message,
            author: winner.message.author,
            reactionCount: winner.count,
            contestType: 'meme' as const,
            weekStart: startDate.utc().toDate(),
            weekEnd: endDate.utc().toDate(),
            rank: index + 1,
            submittedAt: winner.message.createdAt,
        }));

        const embed = createYearlyWinnersEmbed(
            yearlyWinners,
            currentYear,
            endDate.format('MMMM DD')
        );
        yield* discordCall('interaction.editReply', () =>
            interaction.editReply({ embeds: [embed] })
        );
    }).pipe(
        Effect.catchCause(cause =>
            Effect.gen(function* () {
                yield* Effect.logError('Error in handleMemeOfTheYearCommand:', cause);
                yield* discordCall('interaction.editReply', () =>
                    interaction.editReply('❌ Hubo un error procesando el comando.')
                ).pipe(Effect.ignore);
            })
        )
    );
});

export const handleMemeStatsCommand = Effect.fn('handleMemeStatsCommand')(function* (
    interaction: ChatInputCommandInteraction
) {
    const memeManager = yield* MemeManager;

    yield* discordCall('interaction.deferReply', () => interaction.deferReply());

    yield* Effect.gen(function* () {
        const stats = yield* memeManager.getStats();
        const embed = createMemeStatsEmbed(stats);

        yield* discordCall('interaction.editReply', () =>
            interaction.editReply({ embeds: [embed] })
        );
    }).pipe(
        Effect.catchCause(cause =>
            Effect.gen(function* () {
                yield* Effect.logError('Error in handleMemeStatsCommand:', cause);
                yield* discordCall('interaction.editReply', () =>
                    interaction.editReply('❌ Hubo un error obteniendo las estadísticas.')
                ).pipe(Effect.ignore);
            })
        )
    );
});

export const handleMemeContestCommand = Effect.fn('handleMemeContestCommand')(function* (
    interaction: ChatInputCommandInteraction
) {
    const memeManager = yield* MemeManager;

    yield* discordCall('interaction.deferReply', () => interaction.deferReply());

    yield* Effect.gen(function* () {
        // Check if user has moderator or admin permissions
        const member = interaction.member;
        if (!member || typeof member.permissions === 'string') {
            yield* discordCall('interaction.editReply', () =>
                interaction.editReply({ content: '❌ No tienes permisos para crear concursos.' })
            );
            return;
        }

        const hasPermission = member.permissions.has([
            PermissionFlagsBits.ModerateMembers,
            PermissionFlagsBits.Administrator,
        ]);

        if (!hasPermission) {
            yield* discordCall('interaction.editReply', () =>
                interaction.editReply({
                    content: '❌ Solo los moderadores y administradores pueden crear concursos.',
                })
            );
            return;
        }

        const contestTypeInput = interaction.options.getString('type', true);
        const contestType: 'weekly' | 'yearly' =
            contestTypeInput === 'yearly' ? 'yearly' : 'weekly';
        const durationStr = interaction.options.getString('duration', false);

        let startDate: Date;
        let endDate: Date;

        if (contestType === 'weekly') {
            startDate = getCurrentFridayAtNoon().utc().toDate();
            endDate = getNextFridayAtNoon().utc().toDate();
        } else {
            startDate = dayjs.tz('2024-01-01', 'America/Bogota').startOf('day').utc().toDate();
            endDate = dayjs.tz('2024-12-31', 'America/Bogota').endOf('day').utc().toDate();
        }

        // Parse custom duration if provided (e.g. "7d", "30d", "1y")
        if (durationStr) {
            const now = dayjs().tz('America/Bogota');
            startDate = now.utc().toDate();

            const match = durationStr.match(/^(\d+)([dmy])$/);
            if (!match) {
                yield* discordCall('interaction.editReply', () =>
                    interaction.editReply(
                        '❌ Formato de duración inválido. Usa formato como "7d", "30d", "1y".'
                    )
                );
                return;
            }

            const value = Number.parseInt(match[1], 10);
            switch (match[2]) {
                case 'd':
                    endDate = now.add(value, 'day').utc().toDate();
                    break;
                case 'm':
                    endDate = now.add(value, 'month').utc().toDate();
                    break;
                case 'y':
                    endDate = now.add(value, 'year').utc().toDate();
                    break;
            }
        }

        if (!isValidContestDateRange(startDate, endDate)) {
            yield* discordCall('interaction.editReply', () =>
                interaction.editReply('❌ Rango de fechas inválido para el concurso.')
            );
            return;
        }

        const contest = yield* memeManager.createContest(
            contestType,
            startDate,
            endDate,
            interaction.channelId,
            interaction.user
        );

        const embed = createMemeContestEmbed(contest);
        const buttonRow = createMemeContestButtonRow(contest);

        const message = yield* discordCall('interaction.editReply', () =>
            interaction.editReply({ embeds: [embed], components: [buttonRow] })
        );

        yield* memeManager.updateContestMessageId(contest.id, message.id);

        yield* discordCall('interaction.followUp', () =>
            interaction.followUp({
                content:
                    '✅ ¡Concurso creado! Los miembros pueden reaccionar con 😂, 🤣, o 🥇 en sus memes para ganar.',
                ephemeral: true,
            })
        );
    }).pipe(
        Effect.catchCause(cause =>
            Effect.gen(function* () {
                yield* Effect.logError('Error in handleMemeContestCommand:', cause);
                yield* discordCall('interaction.editReply', () =>
                    interaction.editReply(
                        '❌ Error al crear el concurso. Por favor intenta de nuevo.'
                    )
                ).pipe(Effect.ignore);
            })
        )
    );
});

export const handleMemeCompleteContestCommand = Effect.fn('handleMemeCompleteContestCommand')(
    function* (interaction: ChatInputCommandInteraction) {
        const memeManager = yield* MemeManager;

        // Check if user has admin permissions
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            yield* discordCall('interaction.reply', () =>
                interaction.reply({
                    content: '❌ Solo los administradores pueden usar este comando.',
                    ephemeral: true,
                })
            );
            return;
        }

        yield* discordCall('interaction.deferReply', () => interaction.deferReply());

        yield* Effect.gen(function* () {
            const contestId = interaction.options.getString('contest-id', true);

            const contest = yield* memeManager.getContest(contestId);
            if (!contest) {
                yield* discordCall('interaction.editReply', () =>
                    interaction.editReply('❌ Concurso no encontrado.')
                );
                return;
            }

            // Debug: show contest details
            yield* discordCall('interaction.editReply', () =>
                interaction.editReply(
                    `🔍 **Debug del Concurso**\n` +
                        `**ID:** ${contest.id}\n` +
                        `**Estado:** ${contest.status}\n` +
                        `**Tipo:** ${contest.type}\n` +
                        `**Inicio:** ${contest.startDate.toISOString()}\n` +
                        `**Fin:** ${contest.endDate.toISOString()}\n` +
                        `**Canal ID:** ${contest.channelId}\n` +
                        `**Ahora:** ${new Date().toISOString()}\n\n` +
                        `🔄 Intentando procesar...`
                )
            );

            const memeChannel = interaction.client.channels.cache.find(
                (ch): ch is TextChannel =>
                    ch instanceof TextChannel && ch.name === MEME_CHANNEL_NAME
            );

            if (!memeChannel) {
                const available = interaction.client.channels.cache
                    .filter((ch): ch is TextChannel => ch instanceof TextChannel)
                    .map(ch => `- ${ch.name} (${ch.id})`)
                    .slice(0, 10)
                    .join('\n');

                yield* discordCall('interaction.editReply', () =>
                    interaction.editReply(
                        `❌ **Error:** Canal "${MEME_CHANNEL_NAME}" no encontrado en la cache.\n\n` +
                            `**Canales disponibles:**\n${available}`
                    )
                );
                return;
            }

            yield* memeManager.processSpecificContest(contest).pipe(
                Effect.matchCauseEffect({
                    onSuccess: () =>
                        discordCall('interaction.editReply', () =>
                            interaction.editReply(
                                `✅ **Concurso procesado exitosamente!**\n\n` +
                                    `El concurso ${contestId} ha sido forzado a completarse.\n\n` +
                                    `Revisa el canal <#${contest.channelId}> para ver los resultados.`
                            )
                        ),
                    onFailure: cause =>
                        Effect.gen(function* () {
                            yield* Effect.logError('Error in processSpecificContest:', cause);
                            yield* discordCall('interaction.editReply', () =>
                                interaction.editReply(
                                    `❌ **Error durante el procesamiento:**\n\n` +
                                        `\`\`\`${String(cause)}\`\`\``
                                )
                            );
                        }),
                })
            );
        }).pipe(
            Effect.catchCause(cause =>
                Effect.gen(function* () {
                    yield* Effect.logError('Error in handleMemeCompleteContestCommand:', cause);
                    yield* discordCall('interaction.editReply', () =>
                        interaction.editReply(
                            `❌ **Error al procesar el concurso:**\n\`\`\`${String(cause)}\`\`\``
                        )
                    ).pipe(Effect.ignore);
                })
            )
        );
    }
);
