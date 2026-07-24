import type { MemeContest } from '../types/meme.js';
import { ButtonInteraction, PermissionFlagsBits } from 'discord.js';
import { Effect } from 'effect';

import { discordCall } from '../discord/DiscordClient.js';
import { createMemeStatsEmbed } from '../services/meme-embed.js';
import { MemeManager } from '../services/meme-manager.js';

const handleEndContest = Effect.fn('handleEndContest')(function* (
    interaction: ButtonInteraction,
    contest: MemeContest
) {
    // Check if user has moderator or admin permissions
    const member = interaction.member;
    if (!member || typeof member.permissions === 'string') {
        yield* discordCall('interaction.reply', () =>
            interaction.reply({
                content: '❌ No tienes permisos para realizar esta acción.',
                ephemeral: true,
            })
        );
        return;
    }

    const hasPermission = member.permissions.has([
        PermissionFlagsBits.ModerateMembers,
        PermissionFlagsBits.Administrator,
    ]);

    if (!hasPermission) {
        yield* discordCall('interaction.reply', () =>
            interaction.reply({
                content: '❌ Solo los moderadores y administradores pueden finalizar concursos.',
                ephemeral: true,
            })
        );
        return;
    }

    if (contest.status !== 'active') {
        yield* discordCall('interaction.reply', () =>
            interaction.reply({
                content: '❌ Este concurso ya ha sido finalizado.',
                ephemeral: true,
            })
        );
        return;
    }

    yield* discordCall('interaction.reply', () =>
        interaction.reply({
            content: `✅ Concurso \`${contest.id}\` finalizado exitosamente.`,
            ephemeral: true,
        })
    );
});

const handleShowStats = Effect.fn('handleShowStats')(function* (
    interaction: ButtonInteraction,
    contest: MemeContest
) {
    const memeManager = yield* MemeManager;

    const contestMemes = yield* memeManager.getContestMemes(contest.id);
    const memeWinners = yield* memeManager.analyzeContestMemes(contest.id, 'meme');
    const boneWinners = yield* memeManager.analyzeContestMemes(contest.id, 'bone');
    const overallStats = yield* memeManager.getStats();

    yield* Effect.logDebug(
        `Contest ${contest.id} stats: ${contestMemes.length} stored winners, ` +
            `${memeWinners.length} memes / ${boneWinners.length} bones ranked`
    );

    const embed = createMemeStatsEmbed(overallStats);

    yield* discordCall('interaction.reply', () =>
        interaction.reply({ embeds: [embed], ephemeral: true })
    );
});

export const handleMemeButtonInteraction = Effect.fn('handleMemeButtonInteraction')(function* (
    interaction: ButtonInteraction
) {
    if (!interaction.customId.startsWith('meme_contest_')) {
        return;
    }

    const memeManager = yield* MemeManager;

    yield* Effect.gen(function* () {
        const parts = interaction.customId.split('_');
        const contestId = parts[2];
        const action = parts[3];

        const contest = yield* memeManager.getContest(contestId);
        if (!contest) {
            yield* discordCall('interaction.reply', () =>
                interaction.reply({ content: '❌ Concurso no encontrado.', ephemeral: true })
            );
            return;
        }

        switch (action) {
            case 'end':
                yield* handleEndContest(interaction, contest);
                break;
            case 'stats':
                yield* handleShowStats(interaction, contest);
                break;
            default:
                yield* discordCall('interaction.reply', () =>
                    interaction.reply({ content: '❌ Acción no reconocida.', ephemeral: true })
                );
        }
    }).pipe(
        Effect.catchCause(cause =>
            Effect.gen(function* () {
                yield* Effect.logError('Error handling meme button interaction:', cause);
                yield* discordCall('interaction.reply', () =>
                    interaction.reply({
                        content: '❌ Hubo un error procesando la interacción.',
                        ephemeral: true,
                    })
                ).pipe(Effect.ignore);
            })
        )
    );
});
