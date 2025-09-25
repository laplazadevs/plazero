import dayjs from 'dayjs';
import {
    ButtonInteraction,
    EmbedBuilder,
    MessageReaction,
    PartialMessageReaction,
    PartialUser,
    User,
} from 'discord.js';

import { CORABASTOS_CANCEL_EMOJI, CORABASTOS_CONFIRM_EMOJI } from '../config/constants.js';
import {
    createAgendaCancelledEmbed,
    createAgendaSuccessEmbed,
    createEmergencyApprovedEmbed,
    createEmergencyRejectedEmbed,
    createErrorEmbed,
} from '../services/corabastos-embed.js';
import { CorabastosManager } from '../services/corabastos-manager.js';

export async function handleCorabastosButtonInteraction(
    interaction: ButtonInteraction,
    corabastosManager: CorabastosManager
): Promise<void> {
    const customId = interaction.customId;

    try {
        if (customId.startsWith('corabastos_confirm_')) {
            await handleAgendaConfirmation(interaction, corabastosManager);
        } else if (customId.startsWith('corabastos_cancel_')) {
            await handleAgendaCancellation(interaction, corabastosManager);
        } else {
            await interaction.reply({
                content: '❌ Interacción no reconocida.',
                ephemeral: true,
            });
        }
    } catch (error) {
        console.error('Error in corabastos button interaction:', error);

        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        const embed = createErrorEmbed('Error', errorMessage);

        if (interaction.replied || interaction.deferred) {
            await interaction.editReply({ embeds: [embed] });
        } else {
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    }
}

async function handleAgendaConfirmation(
    interaction: ButtonInteraction,
    corabastosManager: CorabastosManager
): Promise<void> {
    const agendaId = interaction.customId.replace('corabastos_confirm_', '');

    await interaction.deferReply({ ephemeral: true });

    try {
        // Confirm the agenda item
        await corabastosManager.confirmAgendaItem(agendaId, interaction.message.id);

        // Get current session for success message
        const session = await corabastosManager.getCurrentWeekSession();
        if (!session) {
            throw new Error('No se encontró la sesión actual.');
        }

        // We need to extract the agenda details from the original embed
        const originalEmbed = interaction.message.embeds[0];
        const turnoField = originalEmbed.fields.find(field => field.name.includes('Turno'));
        const topicField = originalEmbed.fields.find(field => field.name.includes('Tema'));

        if (!turnoField || !topicField) {
            throw new Error('No se pudieron extraer los detalles de la agenda.');
        }

        const turno = parseInt(turnoField.value.split(' ')[0]);
        const topic = topicField.value;

        const weekStart = dayjs(session.weekStart).format('MMM DD');
        const weekEnd = dayjs(session.weekEnd).format('MMM DD, YYYY');
        const sessionWeek = `${weekStart} - ${weekEnd}`;

        const successEmbed = createAgendaSuccessEmbed(interaction.user, turno, topic, sessionWeek);

        await interaction.editReply({ embeds: [successEmbed] });

        // Try to update the original message to remove buttons, but handle if it no longer exists
        try {
            const updatedEmbed = new EmbedBuilder(originalEmbed.data).setColor(0x00ff00).setFooter({
                text: '✅ Tema confirmado y agregado a la agenda.',
            });

            await interaction.message.edit({
                embeds: [updatedEmbed],
                components: [],
            });
        } catch (messageError) {
            // If the original message is no longer available, log the error but don't fail the operation
            console.warn(
                'Could not update original confirmation message (may have been deleted):',
                messageError
            );
            // The agenda item was still successfully confirmed in the database
        }
    } catch (error) {
        console.error('Error confirming agenda item:', error);
        const errorMessage = error instanceof Error ? error.message : 'Error al confirmar el tema';
        const embed = createErrorEmbed('Error', errorMessage);
        await interaction.editReply({ embeds: [embed] });
    }
}

async function handleAgendaCancellation(
    interaction: ButtonInteraction,
    corabastosManager: CorabastosManager
): Promise<void> {
    const agendaId = interaction.customId.replace('corabastos_cancel_', '');

    await interaction.deferReply({ ephemeral: true });

    try {
        // Cancel the agenda item
        await corabastosManager.cancelAgendaItem(agendaId);

        const cancelledEmbed = createAgendaCancelledEmbed();
        await interaction.editReply({ embeds: [cancelledEmbed] });

        // Try to update the original message to remove buttons, but handle if it no longer exists
        try {
            const originalEmbed = interaction.message.embeds[0];
            const updatedEmbed = new EmbedBuilder(originalEmbed.data).setColor(0xff0000).setFooter({
                text: '❌ Tema cancelado.',
            });

            await interaction.message.edit({
                embeds: [updatedEmbed],
                components: [],
            });
        } catch (messageError) {
            // If the original message is no longer available, log the error but don't fail the operation
            console.warn(
                'Could not update original cancellation message (may have been deleted):',
                messageError
            );
            // The agenda item was still successfully cancelled in the database
        }
    } catch (error) {
        console.error('Error cancelling agenda item:', error);
        const errorMessage = error instanceof Error ? error.message : 'Error al cancelar el tema';
        const embed = createErrorEmbed('Error', errorMessage);
        await interaction.editReply({ embeds: [embed] });
    }
}

export async function handleCorabastosReactionAdd(
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
    corabastosManager: CorabastosManager
): Promise<void> {
    // Ignore bot reactions
    if (user.bot) return;

    try {
        // Fetch partial data if needed
        if (reaction.partial) {
            await reaction.fetch();
        }
        if (user.partial) {
            await user.fetch();
        }

        const message = reaction.message;
        const emoji = reaction.emoji.name;

        // Check if this is an emergency request message
        if (
            !message.embeds.length ||
            !message.embeds[0].title?.includes('Corabastos de Emergencia')
        ) {
            return;
        }

        // Only handle confirm/cancel emojis
        if (![CORABASTOS_CONFIRM_EMOJI, CORABASTOS_CANCEL_EMOJI].includes(emoji || '')) {
            return;
        }

        // Extract request ID from the message
        const pendingRequests = await corabastosManager.getPendingEmergencyRequests();

        const emergencyRequest = pendingRequests.find(
            req => req.confirmationMessageId === message.id
        );

        if (!emergencyRequest) {
            console.log('Emergency request not found for reaction');
            return;
        }

        if (emoji === CORABASTOS_CONFIRM_EMOJI) {
            await handleEmergencyConfirmation(
                reaction,
                user as User,
                corabastosManager,
                emergencyRequest.id
            );
        } else if (emoji === CORABASTOS_CANCEL_EMOJI) {
            await handleEmergencyRejection(
                reaction,
                user as User,
                corabastosManager,
                emergencyRequest.id
            );
        }
    } catch (error) {
        console.error('Error handling corabastos reaction:', error);
    }
}

async function handleEmergencyConfirmation(
    reaction: MessageReaction | PartialMessageReaction,
    user: User,
    corabastosManager: CorabastosManager,
    requestId: string
): Promise<void> {
    try {
        const wasAdded = await corabastosManager.addEmergencyConfirmation(requestId, user);

        if (!wasAdded) {
            // User already confirmed, silently ignore
            return;
        }

        // Check if we have enough confirmations
        const approvalStatus = await corabastosManager.checkEmergencyRequestApproval(requestId);

        if (approvalStatus.isApproved) {
            // Approve the emergency request
            await corabastosManager.approveEmergencyRequest(requestId);

            // Get the updated request
            const emergencyRequest = await corabastosManager.getEmergencyRequest(requestId);
            if (!emergencyRequest) return;

            // Create emergency session
            await corabastosManager.createEmergencySession(
                emergencyRequest,
                emergencyRequest.requestedBy
            );

            // Send approval message
            const approvalEmbed = createEmergencyApprovedEmbed(
                emergencyRequest.requestedBy,
                emergencyRequest.reason,
                emergencyRequest.paciente,
                approvalStatus.confirmationsReceived
            );

            // Find general channel to send @everyone announcement
            const guild = reaction.message.guild;
            if (guild) {
                const generalChannel = await corabastosManager.findGeneralChannel(guild);
                if (generalChannel) {
                    await generalChannel.send({
                        content: '@everyone',
                        embeds: [approvalEmbed],
                    });
                }
            }

            // Update the original message
            await reaction.message.edit({
                embeds: [approvalEmbed],
                components: [],
            });
        }
    } catch (error) {
        console.error('Error handling emergency confirmation:', error);
    }
}

async function handleEmergencyRejection(
    reaction: MessageReaction | PartialMessageReaction,
    user: User,
    corabastosManager: CorabastosManager,
    requestId: string
): Promise<void> {
    try {
        // For simplicity, we'll only reject if an admin/moderator cancels
        const member = reaction.message.guild?.members.cache.get(user.id);
        if (!member?.permissions.has(['Administrator', 'ModerateMembers'])) {
            return; // Only admins can reject
        }

        await corabastosManager.rejectEmergencyRequest(requestId);

        const emergencyRequest = await corabastosManager.getEmergencyRequest(requestId);
        if (!emergencyRequest) return;

        const rejectionEmbed = createEmergencyRejectedEmbed(emergencyRequest.reason);

        await reaction.message.edit({
            embeds: [rejectionEmbed],
            components: [],
        });
    } catch (error) {
        console.error('Error handling emergency rejection:', error);
    }
}

export async function handleCorabastosReactionRemove(
    _reaction: MessageReaction | PartialMessageReaction,
    _user: User | PartialUser,
    _corabastosManager: CorabastosManager
): Promise<void> {
    // For now, we won't handle reaction removals as it would complicate the confirmation logic
    // The emergency requests have an expiry time, so they'll be cleaned up automatically
    return;
}
