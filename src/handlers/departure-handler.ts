import { GuildMember, PartialGuildMember, TextChannel } from 'discord.js';

import { ADMINISTRATION_CHANNEL_NAME } from '../config/constants.js';
import { createDepartureEmbed } from '../services/departure-embed.js';

export async function handleMemberLeave(member: GuildMember | PartialGuildMember): Promise<void> {
    try {
        // Handle partial member
        let fullMember = member;
        if (member.partial) {
            try {
                fullMember = await member.fetch();
            } catch (error) {
                console.error('Failed to fetch full member data for departure:', error);
                return;
            }
        }

        console.log(`Member ${fullMember.user.username} (${fullMember.id}) left the server`);

        // Find the administration channel
        const adminChannel = fullMember.guild.channels.cache.find(
            channel => channel.name === ADMINISTRATION_CHANNEL_NAME && channel.isTextBased()
        ) as TextChannel;

        if (!adminChannel) {
            console.error(`Administration channel "${ADMINISTRATION_CHANNEL_NAME}" not found`);
            return;
        }

        // Create and send departure embed
        const embed = createDepartureEmbed(fullMember as GuildMember);

        await adminChannel.send({
            embeds: [embed],
        });

        console.log(
            `Departure notification sent for user ${fullMember.user.username} (${fullMember.id})`
        );
    } catch (error) {
        console.error('Error handling member departure:', error);
    }
}
