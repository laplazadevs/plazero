import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';

import type { PlazeroUser } from '../../domain/User.js';
import {
    CORABASTOS_CALENDAR_EMOJI,
    CORABASTOS_CANCEL_EMOJI,
    CORABASTOS_CLOCK_EMOJI,
    CORABASTOS_CONFIRM_EMOJI,
    CORABASTOS_EMERGENCY_EMOJI,
    type CorabastosAgendaItem,
    type CorabastosSession,
    type CorabastosStats,
    getTurnoLabel,
} from './CorabastosDomain.js';

dayjs.extend(timezone);

// Agenda confirmation embed and buttons
export function createAgendaConfirmationEmbed(
    user: PlazeroUser,
    turno: number,
    topic: string,
    description?: string
): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setTitle(`${CORABASTOS_CALENDAR_EMOJI} Confirmar Agenda - Corabastos`)
        .setDescription(
            `**${
                user.displayName ?? user.username
            }**, ¿estás seguro de que quieres agregar este tema a la agenda del corabastos?`
        )
        .addFields(
            {
                name: `${CORABASTOS_CLOCK_EMOJI} Turno`,
                value: `${turno} (${getTurnoLabel(turno)})`,
                inline: true,
            },
            { name: '📝 Tema', value: topic, inline: false }
        )
        .setColor(0x00ff00)
        .setFooter({
            text: 'Tienes 30 segundos para confirmar. Recuerda: tendrás represalias de la comunidad (timeout) si no te presentas en el turno agendado y quedas como un faltón.',
        })
        .setTimestamp();

    if (description) {
        embed.addFields({ name: '📄 Descripción', value: description, inline: false });
    }

    return embed;
}

export function createAgendaConfirmationButtons(agendaId: string): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`corabastos_confirm_${agendaId}`)
            .setLabel('Confirmar')
            .setEmoji(CORABASTOS_CONFIRM_EMOJI)
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`corabastos_cancel_${agendaId}`)
            .setLabel('Cancelar')
            .setEmoji(CORABASTOS_CANCEL_EMOJI)
            .setStyle(ButtonStyle.Danger)
    );
}

// Agenda success/error embeds
export function createAgendaSuccessEmbed(
    user: PlazeroUser,
    turno: number,
    topic: string,
    sessionWeek: string
): EmbedBuilder {
    return new EmbedBuilder()
        .setTitle(`${CORABASTOS_CONFIRM_EMOJI} Tema Agregado a la Agenda`)
        .setDescription(
            `**${
                user.displayName ?? user.username
            }**, tu tema ha sido agregado exitosamente a la agenda del corabastos.`
        )
        .addFields(
            { name: '📅 Semana', value: sessionWeek, inline: true },
            {
                name: `${CORABASTOS_CLOCK_EMOJI} Turno`,
                value: `${turno} (${getTurnoLabel(turno)})`,
                inline: true,
            },
            { name: '📝 Tema', value: topic, inline: false }
        )
        .setColor(0x00ff00)
        .setFooter({
            text: 'Recuerda: tendrás represalias de la comunidad (timeout) si no te presentas en el turno agendado y quedas como un faltón.',
        })
        .setTimestamp();
}

export function createAgendaCancelledEmbed(): EmbedBuilder {
    return new EmbedBuilder()
        .setTitle(`${CORABASTOS_CANCEL_EMOJI} Agenda Cancelada`)
        .setDescription('Has cancelado la adición del tema a la agenda.')
        .setColor(0xff0000)
        .setTimestamp();
}

// Agenda display embed
export function createAgendaDisplayEmbed(
    session: CorabastosSession,
    agendaItems: CorabastosAgendaItem[]
): EmbedBuilder {
    const weekStart = dayjs(session.weekStart).format('MMM DD');
    const weekEnd = dayjs(session.weekEnd).format('MMM DD, YYYY');
    const sessionWeek = `${weekStart} - ${weekEnd}`;

    const embed = new EmbedBuilder()
        .setTitle(`${CORABASTOS_CALENDAR_EMOJI} Agenda del Corabastos`)
        .setDescription(`**Semana:** ${sessionWeek}`)
        .setColor(0x0099ff)
        .setTimestamp();

    if (agendaItems.length === 0) {
        embed.addFields({
            name: '📝 Agenda',
            value: 'No hay temas agendados para esta semana.',
            inline: false,
        });
        return embed;
    }

    // Group items by turno
    const initialGroups: Record<number, CorabastosAgendaItem[]> = {};
    const itemsByTurno = agendaItems.reduce((acc, item) => {
        if (!acc[item.turno]) {
            acc[item.turno] = [];
        }
        acc[item.turno].push(item);
        return acc;
    }, initialGroups);

    // Sort turnos and create fields
    const sortedTurnos = Object.keys(itemsByTurno)
        .map(Number)
        .sort((a, b) => a - b);

    for (const turno of sortedTurnos) {
        const items = itemsByTurno[turno];
        const itemsText = items
            .map(item => {
                const status = item.status === 'confirmed' ? '✅' : '⏳';
                return `${status} **${item.user.displayName ?? item.user.username}**: ${
                    item.topic
                }`;
            })
            .join('\n');

        embed.addFields({
            name: `${CORABASTOS_CLOCK_EMOJI} Turno ${turno} (${getTurnoLabel(turno)})`,
            value: itemsText,
            inline: false,
        });
    }

    return embed;
}

// Emergency request embeds
export function createEmergencyRequestEmbed(
    user: PlazeroUser,
    reason: string,
    paciente: PlazeroUser,
    confirmationsNeeded: number = 10
): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setTitle(`${CORABASTOS_EMERGENCY_EMOJI} Corabastos de Emergencia`)
        .setDescription(
            `**${
                user.displayName ?? user.username
            }** está solicitando un corabastos de emergencia.\n\n` +
                `Se necesitan **${confirmationsNeeded} confirmaciones** de la comunidad para proceder.\n\n` +
                `**⚠️ IMPORTANTE:** ${
                    paciente.displayName ?? paciente.username
                } debe confirmar su participación para que la solicitud sea válida.`
        )
        .addFields(
            { name: '🚨 Razón', value: reason, inline: false },
            {
                name: '👤 Paciente',
                value: `${paciente.displayName ?? paciente.username} (${paciente.username})`,
                inline: true,
            }
        )
        .setColor(0xff6600)
        .setFooter({
            text: `Reacciona con ${CORABASTOS_CONFIRM_EMOJI} para confirmar o ${CORABASTOS_CANCEL_EMOJI} para rechazar`,
        })
        .setTimestamp();

    return embed;
}

export function createEmergencyApprovedEmbed(
    originalUser: PlazeroUser,
    reason: string,
    paciente: PlazeroUser,
    confirmationsReceived: number
): EmbedBuilder {
    return new EmbedBuilder()
        .setTitle(`${CORABASTOS_CONFIRM_EMOJI} Corabastos de Emergencia Aprobado`)
        .setDescription(
            `El corabastos de emergencia solicitado por **${
                originalUser.displayName ?? originalUser.username
            }** ha sido aprobado.\n\n` +
                `**@everyone** Se convoca un corabastos de emergencia. Únanse al canal de voz corabastos para discutir:`
        )
        .addFields(
            { name: '🚨 Tema', value: reason, inline: false },
            {
                name: '👤 Liderado por',
                value: `${paciente.displayName ?? paciente.username} (${paciente.username})`,
                inline: true,
            }
        )
        .setColor(0x00ff00)
        .setFooter({
            text: `Aprobado con ${confirmationsReceived} confirmaciones de la comunidad`,
        })
        .setTimestamp();
}

export function createEmergencyRejectedEmbed(reason: string): EmbedBuilder {
    return new EmbedBuilder()
        .setTitle(`${CORABASTOS_CANCEL_EMOJI} Corabastos de Emergencia Rechazado`)
        .setDescription(
            'La solicitud de corabastos de emergencia no obtuvo suficientes confirmaciones.'
        )
        .addFields({ name: '🚨 Tema', value: reason, inline: false })
        .setColor(0xff0000)
        .setTimestamp();
}

// Status embed
export function createCorabastosStatusEmbed(
    currentSession: CorabastosSession | null,
    agendaCount: number,
    pendingEmergencyRequests: number,
    stats: CorabastosStats
): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setTitle(`${CORABASTOS_CALENDAR_EMOJI} Estado del Corabastos`)
        .setColor(0x0099ff)
        .setTimestamp();

    if (currentSession) {
        const weekStart = dayjs(currentSession.weekStart).format('MMM DD');
        const weekEnd = dayjs(currentSession.weekEnd).format('MMM DD, YYYY');
        const sessionWeek = `${weekStart} - ${weekEnd}`;

        embed.addFields(
            { name: '📅 Semana Actual', value: sessionWeek, inline: true },
            { name: '📊 Estado', value: currentSession.status, inline: true },
            { name: '📝 Temas Agendados', value: agendaCount.toString(), inline: true }
        );

        if (currentSession.scheduledTime) {
            const scheduledTime = dayjs(currentSession.scheduledTime)
                .tz('America/Bogota')
                .format('dddd, MMM DD [at] h:mm A');
            embed.addFields({
                name: `${CORABASTOS_CLOCK_EMOJI} Programado`,
                value: scheduledTime,
                inline: false,
            });
        }
    } else {
        embed.addFields({
            name: '📅 Semana Actual',
            value: 'No hay sesión programada para esta semana',
            inline: false,
        });
    }

    if (pendingEmergencyRequests > 0) {
        embed.addFields({
            name: `${CORABASTOS_EMERGENCY_EMOJI} Emergencias Pendientes`,
            value: pendingEmergencyRequests.toString(),
            inline: true,
        });
    }

    // Statistics
    embed.addFields(
        { name: '📊 Estadísticas Globales', value: '\u200b', inline: false },
        { name: 'Total Sesiones', value: stats.totalSessions.toString(), inline: true },
        { name: 'Sesiones Activas', value: stats.activeSessions.toString(), inline: true },
        { name: 'Total Temas', value: stats.totalAgendaItems.toString(), inline: true },
        {
            name: 'Emergencias Solicitadas',
            value: stats.totalEmergencyRequests.toString(),
            inline: true,
        }
    );

    return embed;
}

// Error embeds
export function createErrorEmbed(title: string, description: string): EmbedBuilder {
    return new EmbedBuilder()
        .setTitle(`${CORABASTOS_CANCEL_EMOJI} ${title}`)
        .setDescription(description)
        .setColor(0xff0000)
        .setTimestamp();
}
