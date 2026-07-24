import { PermissionFlagsBits, TextChannel } from 'discord.js';
import { Effect } from 'effect';

import { VOTE_THRESHOLDS } from '../config/constants.js';
import { discordCall, DiscordClient } from '../discord/DiscordClient.js';
import { createCompletionEmbed } from '../services/vote-embed.js';
import { VoteManager } from '../services/vote-manager.js';
import { calculateVoteCounts } from '../utils/vote-utils.js';

// Completes a vote: applies (or not) the timeout, updates the embed, applies
// the initiator penalty for rejected votes, and notifies the target user.
export const completeVote = Effect.fn('completeVote')(function* (voteId: string) {
    yield* Effect.logInfo(`Attempting to complete vote ${voteId}`);

    const voteManager = yield* VoteManager;
    const client = yield* DiscordClient;

    const vote = yield* voteManager.getVote(voteId);
    if (!vote) {
        yield* Effect.logInfo(`Vote ${voteId} not found`);
        return;
    }
    if (vote.completed) {
        yield* Effect.logInfo(`Vote ${voteId} already completed`);
        return;
    }

    // Mark as completed first to prevent race conditions
    yield* voteManager.completeVote(voteId);

    const { upVoteCount, downVoteCount, netVotes } = calculateVoteCounts(
        vote.upVotes,
        vote.downVotes
    );

    const channel = client.channels.cache.get(vote.channelId);
    if (!channel || !(channel instanceof TextChannel)) return;

    yield* Effect.logInfo(`Completing vote ${voteId}: ${netVotes} net votes`);

    let timeoutApplied = false;
    let timeoutDuration = 0;
    let timeoutLabel = '';
    let errored = false;

    if (netVotes >= 5) {
        let selectedThreshold = VOTE_THRESHOLDS[0];
        for (const threshold of VOTE_THRESHOLDS) {
            if (netVotes >= threshold.votes) {
                selectedThreshold = threshold;
            }
        }

        timeoutDuration = selectedThreshold.duration;
        timeoutLabel = selectedThreshold.label;

        yield* Effect.gen(function* () {
            const targetMember = yield* discordCall('guild.members.fetch', () =>
                channel.guild.members.fetch(vote.targetUser.id)
            );
            yield* discordCall('member.timeout', () =>
                targetMember.timeout(timeoutDuration, `Votación comunitaria: ${vote.reason}`)
            );
            timeoutApplied = true;
            yield* Effect.logInfo(`Applied ${timeoutLabel} timeout to ${vote.targetUser.username}`);
        }).pipe(
            Effect.catchCause(cause =>
                Effect.logError('Error applying timeout:', cause).pipe(
                    Effect.tap(() =>
                        Effect.sync(() => {
                            errored = true;
                        })
                    )
                )
            )
        );
    }

    const resultEmbed = createCompletionEmbed(
        vote,
        netVotes,
        upVoteCount,
        downVoteCount,
        timeoutApplied,
        timeoutLabel,
        errored
    );

    yield* Effect.gen(function* () {
        const message = yield* discordCall('channel.messages.fetch', () =>
            channel.messages.fetch(vote.messageId)
        );
        yield* discordCall('message.edit', () => message.edit({ embeds: [resultEmbed] }));
    }).pipe(
        Effect.catchCause(cause => Effect.logError('Error updating final vote message:', cause))
    );

    // Initiator penalty when the vote was rejected
    if (!timeoutApplied && netVotes < 5) {
        yield* Effect.gen(function* () {
            const initiatorMember = yield* discordCall('guild.members.fetch', () =>
                channel.guild.members.fetch(vote.initiator.id)
            );

            if (!initiatorMember.permissions.has(PermissionFlagsBits.Administrator)) {
                yield* discordCall('member.timeout', () =>
                    initiatorMember.timeout(
                        5 * 60 * 1000,
                        'Votación rechazada - penalización por votación fallida'
                    )
                );
                yield* Effect.logInfo(
                    `Applied 5-minute penalty timeout to initiator ${vote.initiator.username} for failed vote`
                );
            }
        }).pipe(
            Effect.catchCause(cause =>
                Effect.logError('Error applying initiator penalty timeout:', cause)
            )
        );
    }

    // Notify the target user via DM. The user is fetched from Discord because
    // the vote data was rebuilt from the database.
    yield* Effect.gen(function* () {
        const targetUser = yield* discordCall('users.fetch', () =>
            client.users.fetch(vote.targetUser.id)
        );

        if (timeoutApplied) {
            const timeoutMinutes = Math.floor(timeoutDuration / 60000);
            const timeoutHours = Math.floor(timeoutMinutes / 60);
            const durationText =
                timeoutHours > 0 ? `${timeoutHours} hora(s)` : `${timeoutMinutes} minuto(s)`;

            yield* discordCall('user.send', () =>
                targetUser.send(
                    `⚠️ Se te ha aplicado un timeout de **${durationText}** en **${channel.guild.name}**.\n` +
                        `**Razón:** ${vote.reason}\n` +
                        `**Votos:** 👍 ${upVoteCount} | 👎 ${downVoteCount} (${netVotes} netos)`
                )
            );
        } else {
            yield* discordCall('user.send', () =>
                targetUser.send(
                    `✅ La votación de timeout en tu contra ha sido rechazada en **${channel.guild.name}**.\n` +
                        `**Votos:** 👍 ${upVoteCount} | 👎 ${downVoteCount} (${netVotes} netos)`
                )
            );
        }
    }).pipe(Effect.ignore); // User might have DMs disabled

    yield* Effect.logInfo(
        `Vote ${voteId} completed. Result: ${timeoutApplied ? 'Timeout applied' : 'Rejected'}`
    );
});
