import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';

import type { WelcomeData } from './WelcomeDomain.js';

export function createWelcomeEmbed(welcomeData: WelcomeData): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setTitle('🎉 ¡Bienvenido a La Plaza Devs!')
        .setDescription(
            `¡Hola ${welcomeData.user.username}! 👋\n\n` +
                `Para obtener acceso completo al servidor, necesitamos que proporciones la siguiente información:\n\n` +
                `**📋 Información Requerida:**\n` +
                `• **LinkedIn:** ${welcomeData.linkedinUrl || '❌ No proporcionado'}\n` +
                `• **Presentación:** ${
                    welcomeData.presentation ? '✅ Completada' : '❌ Pendiente'
                }\n` +
                `• **Quien te invitó:** ${welcomeData.invitedBy || '❌ No especificado'}\n\n` +
                `**📝 Instrucciones:**\n` +
                `1. Proporciona tu perfil de LinkedIn\n` +
                `2. Escribe una breve presentación sobre ti y tu experiencia\n` +
                `3. Menciona quién te invitó al servidor\n\n` +
                `Una vez que hayas proporcionado toda la información, un moderador revisará tu solicitud y te dará acceso al servidor.`
        )
        .setColor(0x00ff00)
        .setTimestamp(welcomeData.joinTime)
        .setFooter({
            text: `ID de solicitud: ${welcomeData.id}`,
        });

    return embed;
}

export function createWelcomeApprovalEmbed(welcomeData: WelcomeData): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setTitle('✅ Solicitud de Bienvenida Aprobada')
        .setDescription(
            `**Usuario:** ${welcomeData.user.username}\n` +
                `**LinkedIn:** ${welcomeData.linkedinUrl}\n` +
                `**Presentación:** ${welcomeData.presentation}\n` +
                `**Invitado por:** ${welcomeData.invitedBy}\n\n` +
                `**Aprobado por:** ${welcomeData.approvedBy?.username}\n` +
                `**Fecha de aprobación:** <t:${Math.floor(
                    (welcomeData.approvedAt || new Date()).getTime() / 1000
                )}:F>`
        )
        .setColor(0x00ff00)
        .setTimestamp(welcomeData.approvedAt || new Date())
        .setFooter({
            text: `ID de solicitud: ${welcomeData.id}`,
        });

    return embed;
}

export function createWelcomeButtonRow(welcomeData: WelcomeData): ActionRowBuilder<ButtonBuilder> {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`welcome_approve_${welcomeData.id}`)
            .setLabel('Bienvenido')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅')
    );

    return row;
}
