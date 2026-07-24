import { EmbedBuilder, type GuildMember } from 'discord.js';

export function createDepartureEmbed(member: GuildMember): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setColor(0x808080) // Gray color for departures
        .setTitle('🐵 Miembro se fue del servidor')
        .setDescription(`el socio ${member.user} cogió la curva`)
        .addFields(
            {
                name: '👤 Usuario',
                value: `${member.user.username}${
                    member.user.discriminator ? `#${member.user.discriminator}` : ''
                }`,
                inline: true,
            },
            {
                name: '📅 Se unió',
                value: member.joinedAt
                    ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:R>`
                    : 'Desconocido',
                inline: true,
            },
            {
                name: '⏰ Se fue',
                value: `<t:${Math.floor(Date.now() / 1000)}:R>`,
                inline: true,
            }
        )
        .setTimestamp();

    // Add user avatar if available
    if (member.user.displayAvatarURL()) {
        embed.setThumbnail(member.user.displayAvatarURL());
    }

    // Add roles information if member had roles
    const roles = member.roles.cache
        .filter(role => role.name !== '@everyone')
        .map(role => role.name);

    if (roles.length > 0) {
        embed.addFields({
            name: '🏷️ Roles que tenía',
            value: roles.join(', '),
            inline: false,
        });
    }

    return embed;
}
