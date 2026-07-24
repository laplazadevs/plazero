import type { Guild, Message, PartialMessage } from 'discord.js';
import { Effect } from 'effect';
import { randomUUID } from 'node:crypto';

import { SERVER_BOOSTER_ROLE_NAME } from '../config/constants.js';
import { discordCall } from '../discord/DiscordClient.js';

// Vote weight based on user roles: boosters count double. Falls back to 1 when
// the member cannot be fetched, matching the previous behavior.
export const getVoteWeight = Effect.fn('getVoteWeight')(function* (guild: Guild, userId: string) {
    return yield* discordCall('guild.members.fetch', () => guild.members.fetch(userId)).pipe(
        Effect.map(member =>
            member.roles.cache.some(role => role.name === SERVER_BOOSTER_ROLE_NAME) ? 2 : 1
        ),
        Effect.catch(error =>
            Effect.logError('Error fetching member for vote weight:', error).pipe(Effect.as(1))
        )
    );
});

// Calculate weighted vote counts
export function calculateVoteCounts(
    upVotes: Map<string, number>,
    downVotes: Map<string, number>
): { upVoteCount: number; downVoteCount: number; netVotes: number } {
    const upVoteCount = Array.from(upVotes.values()).reduce((sum, weight) => sum + weight, 0);
    const downVoteCount = Array.from(downVotes.values()).reduce((sum, weight) => sum + weight, 0);
    const netVotes = upVoteCount - downVoteCount;

    return { upVoteCount, downVoteCount, netVotes };
}

// Generate unique vote ID
export function generateVoteId(): string {
    return randomUUID();
}

// Check if a message is a vote-related message (completed votes included)
export function isVoteRelatedMessage(
    message: Message | PartialMessage,
    moderacionChannelName: string
): boolean {
    if (!message.guild) return false;

    const channel = message.channel;
    if (!('name' in channel) || channel.name !== moderacionChannelName) return false;

    if (message.embeds && message.embeds.length > 0) {
        const embed = message.embeds[0];
        if (
            embed.title &&
            (embed.title.includes('Votación') ||
                embed.title.includes('Timeout') ||
                embed.title.includes('Cancelada') ||
                embed.title.includes('Rechazada') ||
                embed.title.includes('Aplicado'))
        ) {
            return true;
        }
    }

    return false;
}
