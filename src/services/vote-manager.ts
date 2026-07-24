import type { VoteRow } from '../db/schemas.js';
import type { VoteData } from '../types/vote.js';
import { Context, Effect, Layer } from 'effect';

import { UserRepository } from '../repositories/user-repository.js';
import { VoteReactionType, VoteRepository } from '../repositories/vote-repository.js';
import { type PlazeroUser, plazeroUserFromRow } from '../types/user.js';
import { calculateVoteCounts } from '../utils/vote-utils.js';

export class VoteManager extends Context.Service<VoteManager>()('plazero/VoteManager', {
    make: Effect.gen(function* () {
        const voteRepo = yield* VoteRepository;
        const userRepo = yield* UserRepository;

        // Rebuilds the in-memory VoteData shape (users + weighted reaction maps)
        // from database rows. Returns undefined when the users are missing,
        // matching the old convertToVoteData helper.
        const convertToVoteData = Effect.fn('VoteManager.convertToVoteData')(function* (
            voteRow: VoteRow
        ) {
            const [targetUser, initiator] = yield* Effect.all(
                [userRepo.getUser(voteRow.target_user_id), userRepo.getUser(voteRow.initiator_id)],
                { concurrency: 2 }
            );

            if (!targetUser || !initiator) {
                yield* Effect.logError(`Could not find users for vote: ${voteRow.id}`);
                return undefined;
            }

            const reactions = yield* voteRepo.getVoteReactions(voteRow.id);

            const upVotes = new Map<string, number>();
            const downVotes = new Map<string, number>();
            const whiteVotes = new Map<string, number>();

            for (const reaction of reactions) {
                switch (reaction.reaction_type) {
                    case 'up':
                        upVotes.set(reaction.user_id, reaction.weight);
                        break;
                    case 'down':
                        downVotes.set(reaction.user_id, reaction.weight);
                        break;
                    case 'white':
                        whiteVotes.set(reaction.user_id, reaction.weight);
                        break;
                }
            }

            const vote: VoteData = {
                id: voteRow.id,
                targetUser: plazeroUserFromRow(targetUser),
                initiator: plazeroUserFromRow(initiator),
                reason: voteRow.reason,
                startTime: voteRow.start_time,
                upVotes,
                downVotes,
                whiteVotes,
                messageId: voteRow.message_id,
                channelId: voteRow.channel_id,
                completed: voteRow.completed,
            };
            return vote;
        });

        const getVote = Effect.fn('VoteManager.getVote')(function* (voteId: string) {
            const voteRow = yield* voteRepo.getVote(voteId);
            if (!voteRow) return undefined;
            return yield* convertToVoteData(voteRow);
        });

        const getVoteByMessageId = Effect.fn('VoteManager.getVoteByMessageId')(function* (
            messageId: string
        ) {
            const voteRow = yield* voteRepo.getVoteByMessageId(messageId);
            if (!voteRow) return undefined;
            return yield* convertToVoteData(voteRow);
        });

        const addVote = Effect.fn('VoteManager.addVote')(function* (vote: VoteData) {
            yield* voteRepo.createVote(
                vote.id,
                vote.targetUser,
                vote.initiator,
                vote.reason,
                vote.messageId,
                vote.channelId
            );
        });

        const completeVote = Effect.fn('VoteManager.completeVote')(function* (voteId: string) {
            const vote = yield* getVote(voteId);
            if (!vote) return;

            const { upVoteCount, downVoteCount, netVotes } = calculateVoteCounts(
                vote.upVotes,
                vote.downVotes
            );

            yield* voteRepo.completeVote(
                voteId,
                upVoteCount,
                downVoteCount,
                netVotes,
                netVotes >= 5
            );
        });

        const hasActiveVoteAgainst = Effect.fn('VoteManager.hasActiveVoteAgainst')(function* (
            userId: string
        ) {
            return yield* voteRepo.hasActiveVoteAgainst(userId);
        });

        const getAllActiveVotes = Effect.fn('VoteManager.getAllActiveVotes')(function* () {
            const activeVotes = yield* voteRepo.getActiveVotes();
            const result: VoteData[] = [];

            for (const voteRow of activeVotes) {
                const vote = yield* convertToVoteData(voteRow);
                if (vote) {
                    result.push(vote);
                }
            }

            return result;
        });

        const setCooldown = Effect.fn('VoteManager.setCooldown')(function* (
            userId: string,
            time: Date
        ) {
            yield* voteRepo.setUserCooldown(userId, time);
        });

        const isOnCooldown = Effect.fn('VoteManager.isOnCooldown')(function* (
            userId: string,
            cooldownDuration: number
        ) {
            return yield* voteRepo.isUserOnCooldown(userId, cooldownDuration);
        });

        const getStats = Effect.fn('VoteManager.getStats')(function* () {
            return yield* voteRepo.getVoteStats();
        });

        const ensureUserExists = Effect.fn('VoteManager.ensureUserExists')(function* (
            user: PlazeroUser
        ) {
            const existingUser = yield* userRepo.getUser(user.id);
            if (!existingUser) {
                yield* userRepo.upsertUser(user);
            }
        });

        const addVoteReaction = Effect.fn('VoteManager.addVoteReaction')(function* (
            voteId: string,
            userId: string,
            reactionType: VoteReactionType,
            weight: number
        ) {
            yield* voteRepo.addVoteReaction(voteId, userId, reactionType, weight);
        });

        const removeVoteReaction = Effect.fn('VoteManager.removeVoteReaction')(function* (
            voteId: string,
            userId: string,
            reactionType: VoteReactionType
        ) {
            yield* voteRepo.removeVoteReaction(voteId, userId, reactionType);
        });

        return {
            getVote,
            getVoteByMessageId,
            addVote,
            completeVote,
            hasActiveVoteAgainst,
            getAllActiveVotes,
            setCooldown,
            isOnCooldown,
            getStats,
            ensureUserExists,
            addVoteReaction,
            removeVoteReaction,
        } as const;
    }),
}) {}

export const VoteManagerLive = Layer.effect(VoteManager)(VoteManager.make);
