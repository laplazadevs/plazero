import { GuildMember, TextChannel } from 'discord.js';

import { WELCOME_CHANNEL_NAME } from '../config/constants.js';
import { createWelcomeButtonRow, createWelcomeEmbed } from '../services/welcome-embed.js';
import { WelcomeManager } from '../services/welcome-manager.js';

export async function handleMemberJoin(
    member: GuildMember,
    welcomeManager: WelcomeManager
): Promise<void> {
    try {
        // Find the welcome channel
        const welcomeChannel = member.guild.channels.cache.find(
            channel => channel.name === WELCOME_CHANNEL_NAME && channel.isTextBased()
        ) as TextChannel;

        if (!welcomeChannel) {
            console.error(`Welcome channel "${WELCOME_CHANNEL_NAME}" not found`);
            return;
        }

        // Create welcome request
        const welcomeData = await welcomeManager.createWelcomeRequest(
            member.user,
            '', // messageId will be set after sending
            welcomeChannel.id
        );

        // Create and send welcome embed
        const embed = createWelcomeEmbed(welcomeData);
        const buttonRow = createWelcomeButtonRow(welcomeData);

        const message = await welcomeChannel.send({
            embeds: [embed],
            components: [buttonRow],
        });

        // Update the welcome data with the message ID
        console.log(`🔧 Updating welcome request ${welcomeData.id} with messageId: ${message.id}`);
        const updateSuccess = await welcomeManager.updateWelcomeRequest(welcomeData.id, { messageId: message.id });
        console.log(`🔧 MessageId update success: ${updateSuccess}`);

        console.log(`Welcome message sent for user ${member.user.username} (${member.id})`);
    } catch (error) {
        console.error('Error handling member join:', error);
    }
}
