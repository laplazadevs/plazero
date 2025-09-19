import dayjs from 'dayjs';
import { ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';

import {
    CORABASTOS_CANCEL_EMOJI,
    CORABASTOS_CONFIRM_EMOJI,
    CORABASTOS_CONFIRMATION_TIMEOUT_MS,
    CORABASTOS_EMERGENCY_CONFIRMATIONS_NEEDED,
} from '../config/constants.js';
import {
    createAgendaConfirmationButtons,
    createAgendaConfirmationEmbed,
    createAgendaDisplayEmbed,
    createCorabastosStatusEmbed,
    createEmergencyRequestEmbed,
    createErrorEmbed,
} from '../services/corabastos-embed.js';
import { CorabastosManager } from '../services/corabastos-manager.js';
import { isValidTurno } from '../types/corabastos.js';

export async function handleCorabastosAgendaCommand(
    interaction: ChatInputCommandInteraction,
    corabastosManager: CorabastosManager
): Promise<void> {
    const subcommand = interaction.options.getSubcommand();

    try {
        switch (subcommand) {
            case 'agregar':
                await handleAddAgendaItem(interaction, corabastosManager);
                break;
            case 'ver':
                await handleViewAgenda(interaction, corabastosManager);
                break;
            default:
                await interaction.reply({
                    content: '❌ Subcomando no reconocido.',
                    ephemeral: true,
                });
        }
    } catch (error) {
        console.error('Error in handleCorabastosAgendaCommand:', error);

        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        const embed = createErrorEmbed('Error en Agenda', errorMessage);

        if (interaction.replied || interaction.deferred) {
            await interaction.editReply({ embeds: [embed] });
        } else {
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    }
}

async function handleAddAgendaItem(
    interaction: ChatInputCommandInteraction,
    corabastosManager: CorabastosManager
): Promise<void> {
    const turno = interaction.options.getInteger('turno', true);
    const topic = interaction.options.getString('tema', true);
    const description = interaction.options.getString('descripcion', false);

    // Validate turno
    if (!isValidTurno(turno)) {
        const embed = createErrorEmbed(
            'Turno Inválido',
            `El turno debe estar entre 0 (12:00 PM) y 8 (8:00 PM). Recibido: ${turno}`
        );
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
    }

    // Validate topic length
    if (topic.length > 200) {
        const embed = createErrorEmbed(
            'Tema Muy Largo',
            'El tema no puede exceder 200 caracteres.'
        );
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
    }

    try {
        const { agendaItem } = await corabastosManager.addAgendaItem(
            interaction.user,
            turno,
            topic,
            description || undefined
        );

        // Create confirmation embed and buttons
        const confirmationEmbed = createAgendaConfirmationEmbed(
            interaction.user,
            turno,
            topic,
            description || undefined
        );
        const buttonRow = createAgendaConfirmationButtons(agendaItem.id);

        await interaction.reply({
            embeds: [confirmationEmbed],
            components: [buttonRow],
            ephemeral: true,
        });

        // Set timeout to remove buttons if no response
        setTimeout(async () => {
            try {
                await interaction.editReply({
                    embeds: [confirmationEmbed],
                    components: [], // Remove buttons
                });
            } catch (error) {
                // Ignore timeout errors
                console.log('Timeout error (expected):', error);
            }
        }, CORABASTOS_CONFIRMATION_TIMEOUT_MS);
    } catch (error) {
        const errorMessage =
            error instanceof Error ? error.message : 'Error al agregar tema a la agenda';
        const embed = createErrorEmbed('Error', errorMessage);
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
}

async function handleViewAgenda(
    interaction: ChatInputCommandInteraction,
    corabastosManager: CorabastosManager
): Promise<void> {
    await interaction.deferReply();

    try {
        const session = await corabastosManager.getCurrentWeekSession();
        const agendaItems = await corabastosManager.getCurrentWeekAgenda();

        if (!session) {
            const embed = createErrorEmbed(
                'Sin Agenda',
                'No hay una sesión de corabastos programada para esta semana.'
            );
            await interaction.editReply({ embeds: [embed] });
            return;
        }

        const embed = createAgendaDisplayEmbed(session, agendaItems);
        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('Error viewing agenda:', error);
        const embed = createErrorEmbed('Error', 'No se pudo obtener la agenda.');
        await interaction.editReply({ embeds: [embed] });
    }
}

export async function handleCorabastosEmergencyCommand(
    interaction: ChatInputCommandInteraction,
    corabastosManager: CorabastosManager
): Promise<void> {
    const reason = interaction.options.getString('razon', true);
    const description = interaction.options.getString('descripcion', false);

    // Validate reason length
    if (reason.length > 300) {
        const embed = createErrorEmbed(
            'Razón Muy Larga',
            'La razón no puede exceder 300 caracteres.'
        );
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
    }

    await interaction.deferReply();

    try {
        const emergencyRequest = await corabastosManager.createEmergencyRequest(
            interaction.user,
            reason,
            description || undefined
        );

        // Create emergency request embed
        const embed = createEmergencyRequestEmbed(
            interaction.user,
            reason,
            description || undefined,
            CORABASTOS_EMERGENCY_CONFIRMATIONS_NEEDED
        );

        const message = await interaction.editReply({ embeds: [embed] });

        // Add reaction emojis for confirmation
        await message.react(CORABASTOS_CONFIRM_EMOJI);
        await message.react(CORABASTOS_CANCEL_EMOJI);

        // Update emergency request with message ID
        await corabastosManager.updateEmergencyRequestMessage(emergencyRequest.id, message.id);
    } catch (error) {
        console.error('Error in emergency command:', error);
        const errorMessage =
            error instanceof Error ? error.message : 'Error al crear solicitud de emergencia';
        const embed = createErrorEmbed('Error', errorMessage);
        await interaction.editReply({ embeds: [embed] });
    }
}

export async function handleCorabastosStatusCommand(
    interaction: ChatInputCommandInteraction,
    corabastosManager: CorabastosManager
): Promise<void> {
    await interaction.deferReply();

    try {
        const currentSession = await corabastosManager.getCurrentWeekSession();
        const agendaItems = await corabastosManager.getCurrentWeekAgenda();
        const pendingRequests = await corabastosManager.getPendingEmergencyRequests();
        const stats = await corabastosManager.getStats();

        const embed = createCorabastosStatusEmbed(
            currentSession,
            agendaItems.length,
            pendingRequests.length,
            stats
        );

        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('Error in status command:', error);
        const embed = createErrorEmbed('Error', 'No se pudo obtener el estado del corabastos.');
        await interaction.editReply({ embeds: [embed] });
    }
}

// Admin command to manually create a corabastos session
export async function handleCreateCorabastosSession(
    interaction: ChatInputCommandInteraction,
    corabastosManager: CorabastosManager
): Promise<void> {
    // Check admin permissions
    const member = interaction.member;
    if (!member || typeof member.permissions === 'string') {
        await interaction.reply({
            content: '❌ No tienes permisos para crear sesiones de corabastos.',
            ephemeral: true,
        });
        return;
    }

    const hasPermission = member.permissions.has([
        PermissionFlagsBits.Administrator,
        PermissionFlagsBits.ModerateMembers,
    ]);

    if (!hasPermission) {
        await interaction.reply({
            content:
                '❌ Solo los administradores y moderadores pueden crear sesiones de corabastos.',
            ephemeral: true,
        });
        return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
        const session = await corabastosManager.getOrCreateCurrentWeekSession(interaction.user);

        const weekStart = dayjs(session.weekStart).format('MMM DD');
        const weekEnd = dayjs(session.weekEnd).format('MMM DD, YYYY');
        const sessionWeek = `${weekStart} - ${weekEnd}`;

        await interaction.editReply({
            content: `✅ Sesión de corabastos creada/obtenida para la semana ${sessionWeek}.`,
        });
    } catch (error) {
        console.error('Error creating corabastos session:', error);
        await interaction.editReply({
            content: '❌ Error al crear la sesión de corabastos.',
        });
    }
}
