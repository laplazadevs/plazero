import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';

import { MemeContest, MemeData } from '../types/meme.js';

export function createMemeContestEmbed(contest: MemeContest): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setTitle(
            `🏆 ${contest.type === 'weekly' ? 'Concurso Semanal' : 'Concurso Anual'} de Memes`
        )
        .setDescription(
            `**Tipo:** ${contest.type === 'weekly' ? 'Semanal' : 'Anual'}\n` +
                `**Estado:** ${getStatusEmoji(contest.status)} ${contest.status}\n` +
                `**Fecha de inicio:** <t:${Math.floor(contest.startDate.getTime() / 1000)}:F>\n` +
                `**Fecha de fin:** <t:${Math.floor(contest.endDate.getTime() / 1000)}:F>\n` +
                `**Creado por:** ${contest.createdBy.username}\n\n` +
                `**📋 Instrucciones:**\n` +
                `• Sube tus memes en el canal designado\n` +
                `• Los memes con más reacciones ganan\n` +
                `• Se anunciarán los ganadores al final del período`
        )
        .setColor(contest.type === 'weekly' ? 0x00ff00 : 0xffd700)
        .setTimestamp(contest.createdAt)
        .setFooter({
            text: `ID del concurso: ${contest.id}`,
        });

    return embed;
}

export function createMemeWinnersEmbed(
    winners: MemeData[],
    contestType: 'meme' | 'bone',
    contestPeriod: string
): EmbedBuilder {
    const emoji = contestType === 'meme' ? '🎉' : '🦴';
    const contestName = contestType === 'meme' ? 'Meme de la semana' : 'Hueso de la semana';

    let description = `${emoji} **Ganadores del "${contestName}" - ${contestPeriod}** ${emoji}\n\n`;

    if (winners.length === 0) {
        description += `No se encontraron ganadores para esta categoría. 😢`;
    } else {
        for (const [index, winner] of winners.entries()) {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉';
            const winnerLink = winner.message.url;
            description += `${medal} **#${index + 1}** - ¡Felicitaciones, ${
                winner.author.username
            }! Tu post ha ganado con ${winner.reactionCount} reacciones.\n`;
            description += `[Ver mensaje](${winnerLink})\n\n`;
        }
    }

    const embed = new EmbedBuilder()
        .setTitle(`${emoji} ${contestName} - ${contestPeriod}`)
        .setDescription(description)
        .setColor(contestType === 'meme' ? 0x00ff00 : 0xffa500)
        .setTimestamp()
        .setFooter({
            text: `Concurso finalizado`,
        });

    return embed;
}

export function createYearlyWinnersEmbed(winners: MemeData[]): EmbedBuilder {
    let description = `🏆 **LOS MEJORES MEMES DEL 2024** 🏆\n\n`;

    if (winners.length === 0) {
        description += `No se encontraron memes para el año 2024 😢`;
    } else {
        for (const [index, winner] of winners.entries()) {
            const medal = index === 0 ? '👑' : index === 1 ? '🥈' : '🥉';
            const winnerLink = winner.message.url;
            description += `${medal} **${index + 1}° Lugar** - ¡Felicitaciones ${
                winner.author.username
            }! Tu meme alcanzó ${winner.reactionCount} reacciones\n`;
            description += `${winnerLink}\n\n`;
        }
        description += '¡Gracias a todos por otro año lleno de risas! 🎉';
    }

    const embed = new EmbedBuilder()
        .setTitle('🏆 Memes del Año 2024')
        .setDescription(description)
        .setColor(0xffd700)
        .setTimestamp()
        .setFooter({
            text: 'Concurso anual finalizado',
        });

    return embed;
}

export function createMemeStatsEmbed(stats: any): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setTitle('📊 Estadísticas de Memes')
        .setDescription(
            `**📈 Resumen General:**\n` +
                `• Total de memes: ${stats.totalMemes}\n` +
                `• Total de huesos: ${stats.totalBones}\n` +
                `• Ganadores semanales: ${stats.weeklyWinners}\n` +
                `• Ganadores anuales: ${stats.yearlyWinners}\n\n` +
                `**🏆 Top Contribuidores:**\n` +
                `${
                    stats.topContributors.length > 0
                        ? stats.topContributors
                              .map(
                                  (contributor: any, index: number) =>
                                      `${index + 1}. ${
                                          contributor.user.username || 'Usuario desconocido'
                                      }: ${contributor.count} posts`
                              )
                              .join('\n')
                        : 'No hay datos disponibles'
                }`
        )
        .setColor(0x0099ff)
        .setTimestamp()
        .setFooter({
            text: 'Estadísticas actualizadas',
        });

    return embed;
}

export function createMemeContestButtonRow(contest: MemeContest): ActionRowBuilder<ButtonBuilder> {
    const row = new ActionRowBuilder<ButtonBuilder>();

    if (contest.status === 'active') {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`meme_contest_${contest.id}_end`)
                .setLabel('Finalizar Concurso')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🏁')
        );
    }

    row.addComponents(
        new ButtonBuilder()
            .setCustomId(`meme_contest_${contest.id}_stats`)
            .setLabel('Ver Estadísticas')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('📊')
    );

    return row;
}

function getStatusEmoji(status: string): string {
    switch (status) {
        case 'active':
            return '🟢';
        case 'completed':
            return '✅';
        case 'cancelled':
            return '❌';
        default:
            return '⚪';
    }
}
