import { type GuildMember, TextChannel } from 'discord.js';
import { Effect } from 'effect';

import { discordCall } from '../../discord/DiscordClient.js';
import { WELCOME_CHANNEL_NAME } from './WelcomeDomain.js';
import { createWelcomeButtonRow, createWelcomeEmbed } from './WelcomeEmbeds.js';
import { WelcomeManager } from './WelcomeManager.js';

export const handleMemberJoin = Effect.fn('handleMemberJoin')(function* (member: GuildMember) {
    const welcomeManager = yield* WelcomeManager;

    yield* Effect.gen(function* () {
        const welcomeChannel = member.guild.channels.cache.find(
            (channel): channel is TextChannel =>
                channel instanceof TextChannel && channel.name === WELCOME_CHANNEL_NAME
        );

        if (!welcomeChannel) {
            yield* Effect.logError(`Welcome channel "${WELCOME_CHANNEL_NAME}" not found`);
            return;
        }

        // Create welcome request (messageId is set after sending)
        const welcomeData = yield* welcomeManager.createWelcomeRequest(
            member.user,
            '',
            welcomeChannel.id
        );

        const embed = createWelcomeEmbed(welcomeData);
        const buttonRow = createWelcomeButtonRow(welcomeData);

        const message = yield* discordCall('channel.send', () =>
            welcomeChannel.send({ embeds: [embed], components: [buttonRow] })
        );

        const updateSuccess = yield* welcomeManager.updateWelcomeRequest(welcomeData.id, {
            messageId: message.id,
        });
        yield* Effect.logDebug(
            `Welcome request ${welcomeData.id} updated with messageId ${message.id}: ${updateSuccess}`
        );

        yield* Effect.logInfo(
            `Welcome message sent for user ${member.user.username} (${member.id})`
        );
    }).pipe(Effect.catchCause(cause => Effect.logError('Error handling member join:', cause)));
});
