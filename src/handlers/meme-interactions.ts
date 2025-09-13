import { ButtonInteraction, PermissionFlagsBits } from 'discord.js';

import { createMemeStatsEmbed } from '../services/meme-embed.js';
import { MemeManager } from '../services/meme-manager.js';

export async function handleMemeButtonInteraction(
    interaction: ButtonInteraction,
    memeManager: MemeManager
): Promise<void> {
    if (!interaction.customId.startsWith('meme_contest_')) {
        return;
    }

    try {
        const parts = interaction.customId.split('_');
        const contestId = parts[2];
        const action = parts[3];

        const contest = await memeManager.getContest(contestId);
        if (!contest) {
            await interaction.reply({
                content: '❌ Concurso no encontrado.',
                ephemeral: true,
            });
            return;
        }

        switch (action) {
            case 'end':
                await handleEndContest(interaction, contest, memeManager);
                break;
            case 'stats':
                await handleShowStats(interaction, contest, memeManager);
                break;
            default:
                await interaction.reply({
                    content: '❌ Acción no reconocida.',
                    ephemeral: true,
                });
        }
    } catch (error) {
        console.error('Error handling meme button interaction:', error);
        await interaction.reply({
            content: '❌ Hubo un error procesando la interacción.',
            ephemeral: true,
        });
    }
}

async function handleEndContest(
    interaction: ButtonInteraction,
    contest: any,
    _memeManager: MemeManager
): Promise<void> {
    // Check if user has moderator or admin permissions
    const member = interaction.member;
    if (!member || typeof member.permissions === 'string') {
        await interaction.reply({
            content: '❌ No tienes permisos para realizar esta acción.',
            ephemeral: true,
        });
        return;
    }

    const hasPermission = member.permissions.has([
        PermissionFlagsBits.ModerateMembers,
        PermissionFlagsBits.Administrator,
    ]);

    if (!hasPermission) {
        await interaction.reply({
            content: '❌ Solo los moderadores y administradores pueden finalizar concursos.',
            ephemeral: true,
        });
        return;
    }

    if (contest.status !== 'active') {
        await interaction.reply({
            content: '❌ Este concurso ya ha sido finalizado.',
            ephemeral: true,
        });
        return;
    }

    // Mark contest as completed
    contest.status = 'completed';

    await interaction.reply({
        content: `✅ Concurso \`${contest.id}\` finalizado exitosamente.`,
        ephemeral: true,
    });

    // Update the original message to reflect the completed status
    try {
        const originalMessage = await interaction.channel?.messages.fetch(contest.messageId || '');
        if (originalMessage) {
            // You could update the embed here to show completed status
            // This would require importing the embed creation function
        }
    } catch (error) {
        console.error('Error updating original message:', error);
    }
}

async function handleShowStats(
    interaction: ButtonInteraction,
    contest: any,
    memeManager: MemeManager
): Promise<void> {
    const contestMemes = await memeManager.getContestMemes(contest.id);
    const memeWinners = await memeManager.analyzeContestMemes(contest.id, 'meme');
    const boneWinners = await memeManager.analyzeContestMemes(contest.id, 'bone');
    const overallStats = await memeManager.getStats();

    const contestStats = {
        contestId: contest.id,
        contestType: contest.type,
        contestMemes: contestMemes.filter(m => m.contestType === 'meme').length,
        contestBones: contestMemes.filter(m => m.contestType === 'bone').length,
        memeWinners: memeWinners.length,
        boneWinners: boneWinners.length,
    };

    const stats = {
        ...overallStats,
        ...contestStats,
    };

    const embed = createMemeStatsEmbed(stats);

    await interaction.reply({
        embeds: [embed],
        ephemeral: true,
    });
}
