import {
    MessageReaction,
    PartialMessageReaction,
    PartialUser,
    PermissionFlagsBits,
    TextChannel,
    User,
} from 'discord.js';

import { updateVoteMessage } from './vote-updates.js';
import { MODERACION_CHANNEL_NAME } from '../config/constants.js';
import { VoteManager } from '../services/vote-manager.js';
import { getVoteWeight, isVoteRelatedMessage } from '../utils/vote-utils.js';

export async function handleVoteReactionAdd(
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
    voteManager: VoteManager
): Promise<void> {
    if (user.bot) return;

    // Fetch partial data if needed
    if (reaction.partial) {
        try {
            reaction = await reaction.fetch();
        } catch (error) {
            console.error('Something went wrong when fetching the reaction:', error);
            return;
        }
    }

    if (user.partial) {
        try {
            user = await user.fetch();
        } catch (error) {
            console.error('Something went wrong when fetching the user:', error);
            return;
        }
    }

    const message = reaction.message;
    const emojiName = reaction.emoji.name;

    // Check if this is a vote message (either active or completed)
    const vote = await voteManager.getVoteByMessageId(message.id);
    const isVoteMessage = vote !== undefined;

    // Also check if message is in moderation channel and has vote-like embeds (for completed votes)
    const isModChannelVoteMessage =
        !isVoteMessage && isVoteRelatedMessage(message, MODERACION_CHANNEL_NAME);

    // If this is any type of vote message, manage the reactions
    if (isVoteMessage || isModChannelVoteMessage) {
        // Only allow the three voting emojis
        if (emojiName !== '👍' && emojiName !== '👎' && emojiName !== '⬜') {
            // Remove any other emojis that aren't allowed
            try {
                await reaction.users.remove(user.id);
            } catch (error) {
                console.error('Error removing invalid reaction:', error);
            }
            return;
        }

        // Handle ⬜ (tibio) punishment for any vote message
        if (emojiName === '⬜') {
            await handleTibioReaction(reaction, user, voteManager);
            return;
        }

        // If vote is not active or completed, don't count the vote
        if (!vote || vote.completed) {
            // For completed/non-active votes, remove the reaction to prevent confusion
            try {
                await reaction.users.remove(user.id);
            } catch (error) {
                console.error('Error removing reaction from completed vote:', error);
            }
            return;
        }

        // Process active vote reactions
        if (emojiName === '👍') {
            const guild = message.guild;
            if (!guild) return;

            // Ensure user exists in database before adding reaction
            await voteManager.ensureUserExists(user);
            const weight = await getVoteWeight(guild, user.id);

            // Update database
            await voteManager.addVoteReaction(vote.id, user.id, 'up', weight);
            await voteManager.removeVoteReaction(vote.id, user.id, 'down');
            await voteManager.removeVoteReaction(vote.id, user.id, 'white');

            // Update local vote object for immediate UI update
            vote.upVotes.set(user.id, weight);
            vote.downVotes.delete(user.id);
            vote.whiteVotes.delete(user.id);
        } else if (emojiName === '👎') {
            const guild = message.guild;
            if (!guild) return;

            // Ensure user exists in database before adding reaction
            await voteManager.ensureUserExists(user);
            const weight = await getVoteWeight(guild, user.id);

            // Update database
            await voteManager.addVoteReaction(vote.id, user.id, 'down', weight);
            await voteManager.removeVoteReaction(vote.id, user.id, 'up');
            await voteManager.removeVoteReaction(vote.id, user.id, 'white');

            // Update local vote object for immediate UI update
            vote.downVotes.set(user.id, weight);
            vote.upVotes.delete(user.id);
            vote.whiteVotes.delete(user.id);
        }

        await updateVoteMessage(vote);
    }
}

export async function handleVoteReactionRemove(
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
    voteManager: VoteManager
): Promise<void> {
    if (user.bot) return;

    // Fetch partial data if needed
    if (reaction.partial) {
        try {
            reaction = await reaction.fetch();
        } catch (error) {
            console.error('Something went wrong when fetching the reaction:', error);
            return;
        }
    }

    if (user.partial) {
        try {
            user = await user.fetch();
        } catch (error) {
            console.error('Something went wrong when fetching the user:', error);
            return;
        }
    }

    const message = reaction.message;
    const activeVote = await voteManager.getVoteByMessageId(message.id);

    // Only process removal for active votes
    if (!activeVote || activeVote.completed) return;

    const emojiName = reaction.emoji.name;

    if (emojiName === '👍') {
        // Update database
        await voteManager.removeVoteReaction(activeVote.id, user.id, 'up');
        // Update local vote object
        activeVote.upVotes.delete(user.id);
        await updateVoteMessage(activeVote);
    } else if (emojiName === '👎') {
        // Update database
        await voteManager.removeVoteReaction(activeVote.id, user.id, 'down');
        // Update local vote object
        activeVote.downVotes.delete(user.id);
        await updateVoteMessage(activeVote);
    }
    // Note: ⬜ reactions are already removed automatically, so no need to handle removal
    // But we should clear the white vote count when user changes their vote
    if (emojiName === '👍' || emojiName === '👎') {
        // Update database
        await voteManager.removeVoteReaction(activeVote.id, user.id, 'white');
        // Update local vote object
        activeVote.whiteVotes.delete(user.id);
    }
}

async function handleTibioReaction(
    reaction: MessageReaction,
    user: User,
    voteManager: VoteManager
): Promise<void> {
    try {
        const guild = reaction.message.guild;
        if (guild) {
            const member = await guild.members.fetch(user.id);

            // Don't timeout admins
            if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
                // Get the vote to track consecutive white votes
                const vote = await voteManager.getVoteByMessageId(reaction.message.id);
                let consecutiveWhiteVotes = 1;

                if (vote) {
                    // Get current consecutive white vote count for this user
                    consecutiveWhiteVotes = (vote.whiteVotes.get(user.id) || 0) + 1;

                    // Update database
                    await voteManager.addVoteReaction(
                        vote.id,
                        user.id,
                        'white',
                        consecutiveWhiteVotes
                    );

                    // Update local vote object
                    vote.whiteVotes.set(user.id, consecutiveWhiteVotes);
                }

                // Calculate exponential timeout: 1 minute * 10^(consecutive_votes - 1)
                // 1st vote: 1 minute, 2nd vote: 10 minutes, 3rd vote: 100 minutes, etc.
                const timeoutDuration = 60000 * Math.pow(10, consecutiveWhiteVotes - 1);

                await member.timeout(
                    timeoutDuration,
                    `Votó como tibio (${consecutiveWhiteVotes} vez consecutiva)`
                );

                // Send punishment message to moderation channel
                const moderacionChannel = guild.channels.cache.find(
                    channel => channel.name === MODERACION_CHANNEL_NAME && channel.isTextBased()
                ) as TextChannel;

                if (moderacionChannel) {
                    const timeoutMinutes = Math.floor(timeoutDuration / 60000);
                    await moderacionChannel.send(
                        `${user} recibió un timeout de ${timeoutMinutes} minuto(s) por votar como tibio (${consecutiveWhiteVotes} vez consecutiva)`
                    );
                }
            }
        }
    } catch (error) {
        console.error('Error applying tibio timeout:', error);
    }

    // Always remove the tibio reaction
    try {
        await reaction.users.remove(user.id);
    } catch (error) {
        console.error('Error removing tibio reaction:', error);
    }
}
