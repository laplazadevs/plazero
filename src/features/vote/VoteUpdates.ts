import { TextChannel } from 'discord.js';
import { Effect } from 'effect';

import { DiscordClient, discordCall } from '../../discord/DiscordClient.js';
import type { VoteData } from './VoteDomain.js';
import { createVoteEmbed } from './VoteEmbeds.js';

// Refreshes the vote embed with the current tallies.
export const updateVoteMessage = Effect.fn('updateVoteMessage')(function* (vote: VoteData) {
    if (vote.completed) return;

    const client = yield* DiscordClient;
    const channel = client.channels.cache.get(vote.channelId);
    if (!channel || !(channel instanceof TextChannel)) return;

    yield* Effect.gen(function* () {
        const message = yield* discordCall('channel.messages.fetch', () =>
            channel.messages.fetch(vote.messageId)
        );
        const embed = createVoteEmbed(vote);
        yield* discordCall('message.edit', () => message.edit({ embeds: [embed] }));
    }).pipe(Effect.catchCause(cause => Effect.logError('Error updating vote message:', cause)));
});
