import { Guild } from 'discord.js';
import { randomUUID } from 'node:crypto';

import { SERVER_BOOSTER_ROLE_NAME } from '../config/constants.js';

// Helper function to get vote weight based on user roles
export async function getVoteWeight(guild: Guild, userId: string): Promise<number> {
    try {
        const member = await guild.members.fetch(userId);
        const isBooster = member.roles.cache.some(role => role.name === SERVER_BOOSTER_ROLE_NAME);
        return isBooster ? 2 : 1;
    } catch (error) {
        console.error('Error fetching member for vote weight:', error);
        return 1; // Default to 1 if error
    }
}

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

// Check if a message is a vote-related message
export function isVoteRelatedMessage(message: any, moderacionChannelName: string): boolean {
    if (!message.guild) return false;

    const channel = message.channel;
    if (channel.name !== moderacionChannelName) return false;

    // Check if message has embeds that look like vote messages
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
