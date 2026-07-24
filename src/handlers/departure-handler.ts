import { GuildMember, PartialGuildMember, TextChannel } from 'discord.js';
import { Effect } from 'effect';

import { ADMINISTRATION_CHANNEL_NAME } from '../config/constants.js';
import { discordCall } from '../discord/DiscordClient.js';
import { createDepartureEmbed } from '../services/departure-embed.js';

export const handleMemberLeave = Effect.fn('handleMemberLeave')(function* (
    member: GuildMember | PartialGuildMember
) {
    yield* Effect.gen(function* () {
        // Handle partial member
        let fullMember: GuildMember;
        if (member.partial) {
            const fetched = yield* discordCall('member.fetch', () => member.fetch()).pipe(
                Effect.tapCause(cause =>
                    Effect.logError('Failed to fetch full member data for departure:', cause)
                ),
                Effect.option
            );
            if (fetched._tag === 'None') return;
            fullMember = fetched.value;
        } else {
            fullMember = member;
        }

        yield* Effect.logInfo(
            `Member ${fullMember.user.username} (${fullMember.id}) left the server`
        );

        const adminChannel = fullMember.guild.channels.cache.find(
            (channel): channel is TextChannel =>
                channel instanceof TextChannel && channel.name === ADMINISTRATION_CHANNEL_NAME
        );

        if (!adminChannel) {
            yield* Effect.logError(
                `Administration channel "${ADMINISTRATION_CHANNEL_NAME}" not found`
            );
            return;
        }

        const embed = createDepartureEmbed(fullMember);
        yield* discordCall('channel.send', () => adminChannel.send({ embeds: [embed] }));

        yield* Effect.logInfo(
            `Departure notification sent for user ${fullMember.user.username} (${fullMember.id})`
        );
    }).pipe(Effect.catchCause(cause => Effect.logError('Error handling member departure:', cause)));
});
