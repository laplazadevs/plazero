import { ButtonInteraction, PermissionFlagsBits } from 'discord.js';

import { WELCOME_ROLE_NAME } from '../config/constants.js';
import { createWelcomeApprovalEmbed } from '../services/welcome-embed.js';
import { WelcomeManager } from '../services/welcome-manager.js';

export async function handleWelcomeButtonInteraction(
    interaction: ButtonInteraction,
    welcomeManager: WelcomeManager
): Promise<void> {
    if (!interaction.customId.startsWith('welcome_approve_')) {
        return;
    }

    try {
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
                content:
                    '❌ Solo los moderadores y administradores pueden aprobar solicitudes de bienvenida.',
                ephemeral: true,
            });
            return;
        }

        // Extract welcome request ID from custom ID
        const welcomeId = interaction.customId.replace('welcome_approve_', '');
        const welcomeData = await welcomeManager.getWelcomeRequest(welcomeId);

        if (!welcomeData) {
            await interaction.reply({
                content: '❌ Solicitud de bienvenida no encontrada.',
                ephemeral: true,
            });
            return;
        }

        if (welcomeData.approved) {
            await interaction.reply({
                content: '❌ Esta solicitud ya ha sido aprobada.',
                ephemeral: true,
            });
            return;
        }

        // Check if user has provided all required information
        if (!welcomeData.linkedinUrl || !welcomeData.presentation || !welcomeData.invitedBy) {
            await interaction.reply({
                content: '❌ El usuario aún no ha proporcionado toda la información requerida.',
                ephemeral: true,
            });
            return;
        }

        // Approve the welcome request
        const success = await welcomeManager.approveWelcomeRequest(welcomeId, interaction.user);
        if (!success) {
            await interaction.reply({
                content: '❌ Error al aprobar la solicitud.',
                ephemeral: true,
            });
            return;
        }

        // Get the member to assign the role
        const guild = interaction.guild;
        if (!guild) {
            await interaction.reply({
                content: '❌ No se pudo acceder al servidor.',
                ephemeral: true,
            });
            return;
        }

        const targetMember = await guild.members.fetch(welcomeData.user.id);
        if (!targetMember) {
            await interaction.reply({
                content: '❌ No se pudo encontrar al usuario en el servidor.',
                ephemeral: true,
            });
            return;
        }

        // Find and assign the welcome role
        const welcomeRole = guild.roles.cache.find(role => role.name === WELCOME_ROLE_NAME);
        if (!welcomeRole) {
            await interaction.reply({
                content: `❌ No se encontró el rol "${WELCOME_ROLE_NAME}".`,
                ephemeral: true,
            });
            return;
        }

        try {
            await targetMember.roles.add(welcomeRole);
        } catch (roleError) {
            console.error('Error assigning role:', roleError);
            await interaction.reply({
                content: '❌ Error al asignar el rol al usuario.',
                ephemeral: true,
            });
            return;
        }

        // Get the updated welcome data with approval timestamp
        const updatedWelcomeData = await welcomeManager.getWelcomeRequest(welcomeId);
        if (!updatedWelcomeData) {
            await interaction.reply({
                content: '❌ No se pudo obtener los datos actualizados de la solicitud.',
                ephemeral: true,
            });
            return;
        }

        // Update the embed to show approval
        const approvalEmbed = createWelcomeApprovalEmbed(updatedWelcomeData);

        await interaction.update({
            embeds: [approvalEmbed],
            components: [], // Remove the button
        });

        // Send a confirmation message
        await interaction.followUp({
            content: `✅ Solicitud de bienvenida aprobada para ${updatedWelcomeData.user.username}. El rol "${WELCOME_ROLE_NAME}" ha sido asignado.`,
            ephemeral: true,
        });

        console.log(
            `Welcome request approved for user ${updatedWelcomeData.user.username} by ${interaction.user.username}`
        );
    } catch (error) {
        console.error('Error handling welcome button interaction:', error);

        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: '❌ Ocurrió un error al procesar la solicitud.',
                ephemeral: true,
            });
        }
    }
}
