import {
    type MessageReaction,
    type PartialMessageReaction,
    type PartialUser,
    PermissionFlagsBits,
    TextChannel,
    type User,
} from 'discord.js';
import { Effect, Option } from 'effect';

import { discordCall } from '../../discord/DiscordClient.js';
import { getVoteWeight, isVoteRelatedMessage, MODERACION_CHANNEL_NAME } from './VoteDomain.js';
import { VoteManager } from './VoteManager.js';
import { updateVoteMessage } from './VoteUpdates.js';

const fetchFullReaction = Effect.fn('fetchFullReaction')(function* (
    reaction: MessageReaction | PartialMessageReaction
) {
    if (!reaction.partial) return reaction;
    return yield* discordCall('reaction.fetch', () => reaction.fetch());
});

const fetchFullUser = Effect.fn('fetchFullUser')(function* (user: User | PartialUser) {
    if (!user.partial) return user;
    return yield* discordCall('user.fetch', () => user.fetch());
});

export const handleVoteReactionAdd = Effect.fn('handleVoteReactionAdd')(function* (
    partialReaction: MessageReaction | PartialMessageReaction,
    partialUser: User | PartialUser
) {
    if (partialUser.bot) return;

    const voteManager = yield* VoteManager;

    const maybeReaction = yield* fetchFullReaction(partialReaction).pipe(
        Effect.tapCause(cause =>
            Effect.logError('Something went wrong when fetching the reaction:', cause)
        ),
        Effect.option
    );
    if (Option.isNone(maybeReaction)) return;
    const reaction = maybeReaction.value;

    const maybeUser = yield* fetchFullUser(partialUser).pipe(
        Effect.tapCause(cause =>
            Effect.logError('Something went wrong when fetching the user:', cause)
        ),
        Effect.option
    );
    if (Option.isNone(maybeUser)) return;
    const user = maybeUser.value;

    const message = reaction.message;
    const emojiName = reaction.emoji.name;

    // Check if this is a vote message (either active or completed)
    const vote = yield* voteManager.getVoteByMessageId(message.id);
    const isVoteMessage = vote !== undefined;

    // Also check if message is in moderation channel and has vote-like embeds
    const isModChannelVoteMessage =
        !isVoteMessage && isVoteRelatedMessage(message, MODERACION_CHANNEL_NAME);

    if (!isVoteMessage && !isModChannelVoteMessage) {
        return;
    }

    // Only allow the three voting emojis
    if (emojiName !== '👍' && emojiName !== '👎' && emojiName !== '⬜') {
        yield* discordCall('reaction.users.remove', () => reaction.users.remove(user.id)).pipe(
            Effect.catchCause(cause => Effect.logError('Error removing invalid reaction:', cause))
        );
        return;
    }

    // Handle ⬜ (tibio) punishment for any vote message
    if (emojiName === '⬜') {
        yield* handleTibioReaction(reaction, user);
        return;
    }

    // If vote is not active or completed, don't count the vote
    if (!vote || vote.completed) {
        yield* discordCall('reaction.users.remove', () => reaction.users.remove(user.id)).pipe(
            Effect.catchCause(cause =>
                Effect.logError('Error removing reaction from completed vote:', cause)
            )
        );
        return;
    }

    const guild = message.guild;
    if (!guild) return;

    // Ensure user exists in database before adding reaction
    yield* voteManager.ensureUserExists(user);
    const weight = yield* getVoteWeight(guild, user.id);

    // Remove other reactions from the message to prevent multiple voting
    yield* Effect.gen(function* () {
        const downReaction = message.reactions.cache.get('👎');
        const whiteReaction = message.reactions.cache.get('⬜');

        if (downReaction) {
            yield* discordCall('reaction.users.remove', () => downReaction.users.remove(user.id));
        }
        if (whiteReaction) {
            yield* discordCall('reaction.users.remove', () => whiteReaction.users.remove(user.id));
        }
    }).pipe(Effect.catchCause(cause => Effect.logError('Error removing other reactions:', cause)));

    if (emojiName === '👍') {
        yield* voteManager.addVoteReaction(vote.id, user.id, 'up', weight);
        yield* voteManager.removeVoteReaction(vote.id, user.id, 'down');
        yield* voteManager.removeVoteReaction(vote.id, user.id, 'white');

        vote.upVotes.set(user.id, weight);
        vote.downVotes.delete(user.id);
        vote.whiteVotes.delete(user.id);
    } else {
        yield* voteManager.addVoteReaction(vote.id, user.id, 'down', weight);
        yield* voteManager.removeVoteReaction(vote.id, user.id, 'up');
        yield* voteManager.removeVoteReaction(vote.id, user.id, 'white');

        vote.downVotes.set(user.id, weight);
        vote.upVotes.delete(user.id);
        vote.whiteVotes.delete(user.id);
    }

    yield* updateVoteMessage(vote);
});

export const handleVoteReactionRemove = Effect.fn('handleVoteReactionRemove')(function* (
    partialReaction: MessageReaction | PartialMessageReaction,
    partialUser: User | PartialUser
) {
    if (partialUser.bot) return;

    const voteManager = yield* VoteManager;

    const maybeReaction = yield* fetchFullReaction(partialReaction).pipe(
        Effect.tapCause(cause =>
            Effect.logError('Something went wrong when fetching the reaction:', cause)
        ),
        Effect.option
    );
    if (Option.isNone(maybeReaction)) return;
    const reaction = maybeReaction.value;

    const maybeUser = yield* fetchFullUser(partialUser).pipe(
        Effect.tapCause(cause =>
            Effect.logError('Something went wrong when fetching the user:', cause)
        ),
        Effect.option
    );
    if (Option.isNone(maybeUser)) return;
    const user = maybeUser.value;

    const message = reaction.message;
    const activeVote = yield* voteManager.getVoteByMessageId(message.id);

    // Only process removal for active votes
    if (!activeVote || activeVote.completed) return;

    const emojiName = reaction.emoji.name;

    if (emojiName === '👍') {
        yield* voteManager.removeVoteReaction(activeVote.id, user.id, 'up');
        activeVote.upVotes.delete(user.id);
        yield* updateVoteMessage(activeVote);
    } else if (emojiName === '👎') {
        yield* voteManager.removeVoteReaction(activeVote.id, user.id, 'down');
        activeVote.downVotes.delete(user.id);
        yield* updateVoteMessage(activeVote);
    }

    // Clear the white vote count when user changes their vote
    if (emojiName === '👍' || emojiName === '👎') {
        yield* voteManager.removeVoteReaction(activeVote.id, user.id, 'white');
        activeVote.whiteVotes.delete(user.id);
    }
});

const handleTibioReaction = Effect.fn('handleTibioReaction')(function* (
    reaction: MessageReaction,
    user: User
) {
    const voteManager = yield* VoteManager;

    yield* Effect.gen(function* () {
        const guild = reaction.message.guild;
        if (!guild) return;

        const member = yield* discordCall('guild.members.fetch', () =>
            guild.members.fetch(user.id)
        );

        // Don't timeout admins
        if (member.permissions.has(PermissionFlagsBits.Administrator)) {
            return;
        }

        const vote = yield* voteManager.getVoteByMessageId(reaction.message.id);
        let consecutiveWhiteVotes = 1;

        if (vote) {
            // Remove other reactions from the message to prevent multiple voting
            yield* Effect.gen(function* () {
                const downReaction = reaction.message.reactions.cache.get('👎');
                const whiteReaction = reaction.message.reactions.cache.get('⬜');

                if (downReaction) {
                    yield* discordCall('reaction.users.remove', () =>
                        downReaction.users.remove(user.id)
                    );
                }
                if (whiteReaction) {
                    yield* discordCall('reaction.users.remove', () =>
                        whiteReaction.users.remove(user.id)
                    );
                }
            }).pipe(
                Effect.catchCause(cause =>
                    Effect.logError('Error removing other reactions:', cause)
                )
            );

            consecutiveWhiteVotes = (vote.whiteVotes.get(user.id) ?? 0) + 1;

            yield* voteManager.addVoteReaction(vote.id, user.id, 'white', consecutiveWhiteVotes);
            yield* voteManager.removeVoteReaction(vote.id, user.id, 'up');
            yield* voteManager.removeVoteReaction(vote.id, user.id, 'down');

            vote.whiteVotes.set(user.id, consecutiveWhiteVotes);
            vote.upVotes.delete(user.id);
            vote.downVotes.delete(user.id);
        }

        // Exponential timeout: 1 minute * 10^(consecutive_votes - 1)
        const timeoutDuration = 60000 * 10 ** (consecutiveWhiteVotes - 1);

        yield* discordCall('member.timeout', () =>
            member.timeout(
                timeoutDuration,
                `Votó como tibio (${consecutiveWhiteVotes} vez consecutiva)`
            )
        );

        // Send punishment message to moderation channel
        const moderacionChannel = guild.channels.cache.find(
            (channel): channel is TextChannel =>
                channel instanceof TextChannel && channel.name === MODERACION_CHANNEL_NAME
        );

        if (moderacionChannel) {
            const timeoutMinutes = Math.floor(timeoutDuration / 60000);
            yield* discordCall('channel.send', () =>
                moderacionChannel.send(
                    `${user} recibió un timeout de ${timeoutMinutes} minuto(s) por votar como tibio (${consecutiveWhiteVotes} vez consecutiva)`
                )
            );
        }
    }).pipe(Effect.catchCause(cause => Effect.logError('Error applying tibio timeout:', cause)));

    // Always remove the tibio reaction
    yield* discordCall('reaction.users.remove', () => reaction.users.remove(user.id)).pipe(
        Effect.catchCause(cause => Effect.logError('Error removing tibio reaction:', cause))
    );
});
