import { randomUUID } from 'node:crypto';
import type { Guild, Message, PartialMessage } from 'discord.js';
import { Effect } from 'effect';

import { discordCall } from '../../discord/DiscordClient.js';
import type { PlazeroUser } from '../../domain/User.js';

export interface VoteData {
    id: string;
    targetUser: PlazeroUser;
    initiator: PlazeroUser;
    reason: string;
    startTime: Date;
    upVotes: Map<string, number>; // userId -> vote weight (1 for normal, 2 for boosters)
    downVotes: Map<string, number>; // userId -> vote weight (1 for normal, 2 for boosters)
    whiteVotes: Map<string, number>; // userId -> consecutive white vote count
    messageId: string;
    channelId: string;
    completed: boolean;
}

export interface VoteThreshold {
    votes: number;
    duration: number;
    label: string;
}

// Voting system configuration
export const VOTE_DURATION_MS = 5 * 60 * 1000; // 5 minutes
export const COOLDOWN_DURATION_MS = 15 * 60 * 1000; // 15 minutes
export const REQUIRED_ROLE_NAME = 'One Of Us';
export const SERVER_BOOSTER_ROLE_NAME = 'Server Booster';
export const MODERACION_CHANNEL_NAME = '🧑‍⚖️︱moderación';

// Command names
export const VOTE_TIMEOUT_COMMAND = 'vote-timeout';
export const CANCEL_VOTE_COMMAND = 'cancel-vote';

// Vote thresholds and corresponding timeout durations
export const VOTE_THRESHOLDS: VoteThreshold[] = [
    { votes: 5, duration: 5 * 60 * 1000, label: 'Light Warning (5 min)' },
    { votes: 8, duration: 30 * 60 * 1000, label: 'Light Sanction (30 min)' },
    { votes: 12, duration: 2 * 60 * 60 * 1000, label: 'Moderate Violation (2 hours)' },
    { votes: 15, duration: 8 * 60 * 60 * 1000, label: 'Serious Misconduct (8 hours)' },
    { votes: 21, duration: 12 * 60 * 60 * 1000, label: 'Severe Misconduct (12 hours)' },
    { votes: 25, duration: 24 * 60 * 60 * 1000, label: 'Severe Misconduct (24 hours)' },
];

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
