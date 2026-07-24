import type { PlazeroUser } from '../types/user.js';
import { Context, Effect, Layer, Schema } from 'effect';
import * as SqlClient from 'effect/unstable/sql/SqlClient';

import { UserRepository } from './user-repository.js';
import { CountRow, UserCooldownRow, VoteReactionRow, VoteRow } from '../db/schemas.js';

export type VoteReactionType = 'up' | 'down' | 'white';

const decodeVoteRows = Schema.decodeUnknownEffect(Schema.Array(VoteRow));
const decodeReactionRows = Schema.decodeUnknownEffect(Schema.Array(VoteReactionRow));
const decodeCooldownRows = Schema.decodeUnknownEffect(Schema.Array(UserCooldownRow));
const decodeCountRows = Schema.decodeUnknownEffect(Schema.Array(CountRow));

export class VoteRepository extends Context.Service<VoteRepository>()('plazero/VoteRepository', {
    make: Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const users = yield* UserRepository;

        const createVote = Effect.fn('VoteRepository.createVote')(function* (
            voteId: string,
            targetUser: PlazeroUser,
            initiator: PlazeroUser,
            reason: string,
            messageId: string,
            channelId: string
        ) {
            return yield* sql.withTransaction(
                Effect.gen(function* () {
                    yield* users.upsertUser(targetUser);
                    yield* users.upsertUser(initiator);

                    const rows = yield* sql`
                        INSERT INTO votes (
                            id, target_user_id, initiator_id, reason, start_time,
                            message_id, channel_id, completed
                        )
                        VALUES (
                            ${voteId}, ${targetUser.id}, ${initiator.id}, ${reason}, NOW(),
                            ${messageId}, ${channelId}, FALSE
                        )
                        RETURNING *
                    `;
                    const votes = yield* decodeVoteRows(rows);
                    return votes[0];
                })
            );
        });

        const getVote = Effect.fn('VoteRepository.getVote')(function* (voteId: string) {
            const rows = yield* sql`SELECT * FROM votes WHERE id = ${voteId}`;
            const votes = yield* decodeVoteRows(rows);
            return votes.length > 0 ? votes[0] : null;
        });

        const getVoteByMessageId = Effect.fn('VoteRepository.getVoteByMessageId')(function* (
            messageId: string
        ) {
            const rows = yield* sql`SELECT * FROM votes WHERE message_id = ${messageId}`;
            const votes = yield* decodeVoteRows(rows);
            return votes.length > 0 ? votes[0] : null;
        });

        const getActiveVotes = Effect.fn('VoteRepository.getActiveVotes')(function* () {
            const rows = yield* sql`SELECT * FROM votes WHERE completed = FALSE`;
            return yield* decodeVoteRows(rows);
        });

        const hasActiveVoteAgainst = Effect.fn('VoteRepository.hasActiveVoteAgainst')(function* (
            userId: string
        ) {
            const rows = yield* sql`
                SELECT 1 FROM votes
                WHERE target_user_id = ${userId} AND completed = FALSE
                LIMIT 1
            `;
            return rows.length > 0;
        });

        const completeVote = Effect.fn('VoteRepository.completeVote')(function* (
            voteId: string,
            upVotes: number,
            downVotes: number,
            netVotes: number,
            timeoutApplied: boolean
        ) {
            yield* sql`
                UPDATE votes
                SET completed = TRUE,
                    end_time = NOW(),
                    final_up_votes = ${upVotes},
                    final_down_votes = ${downVotes},
                    final_net_votes = ${netVotes},
                    timeout_applied = ${timeoutApplied}
                WHERE id = ${voteId}
            `;
        });

        const addVoteReaction = Effect.fn('VoteRepository.addVoteReaction')(function* (
            voteId: string,
            userId: string,
            reactionType: VoteReactionType,
            weight: number
        ) {
            yield* sql`
                INSERT INTO vote_reactions (vote_id, user_id, reaction_type, weight)
                VALUES (${voteId}, ${userId}, ${reactionType}, ${weight})
                ON CONFLICT (vote_id, user_id, reaction_type)
                DO UPDATE SET weight = EXCLUDED.weight, created_at = NOW()
            `;
        });

        const removeVoteReaction = Effect.fn('VoteRepository.removeVoteReaction')(function* (
            voteId: string,
            userId: string,
            reactionType: VoteReactionType
        ) {
            yield* sql`
                DELETE FROM vote_reactions
                WHERE vote_id = ${voteId} AND user_id = ${userId} AND reaction_type = ${reactionType}
            `;
        });

        const getVoteReactions = Effect.fn('VoteRepository.getVoteReactions')(function* (
            voteId: string
        ) {
            const rows = yield* sql`SELECT * FROM vote_reactions WHERE vote_id = ${voteId}`;
            return yield* decodeReactionRows(rows);
        });

        const setUserCooldown = Effect.fn('VoteRepository.setUserCooldown')(function* (
            userId: string,
            lastVoteTime: Date
        ) {
            yield* sql`
                INSERT INTO user_cooldowns (user_id, last_vote_time)
                VALUES (${userId}, ${lastVoteTime})
                ON CONFLICT (user_id)
                DO UPDATE SET last_vote_time = EXCLUDED.last_vote_time
            `;
        });

        const getUserCooldown = Effect.fn('VoteRepository.getUserCooldown')(function* (
            userId: string
        ) {
            const rows = yield* sql`SELECT * FROM user_cooldowns WHERE user_id = ${userId}`;
            const cooldowns = yield* decodeCooldownRows(rows);
            return cooldowns.length > 0 ? cooldowns[0] : null;
        });

        const isUserOnCooldown = Effect.fn('VoteRepository.isUserOnCooldown')(function* (
            userId: string,
            cooldownDurationMs: number
        ) {
            const cooldown = yield* getUserCooldown(userId);
            if (!cooldown) {
                return { onCooldown: false as const };
            }

            const timePassed = Date.now() - cooldown.last_vote_time.getTime();
            if (timePassed < cooldownDurationMs) {
                const remainingTime = Math.ceil((cooldownDurationMs - timePassed) / 60000);
                return { onCooldown: true as const, remainingTime };
            }

            return { onCooldown: false as const };
        });

        const countVotes = Effect.fn('VoteRepository.countVotes')(function* (completed: boolean) {
            const rows = yield* sql`SELECT COUNT(*) FROM votes WHERE completed = ${completed}`;
            const counts = yield* decodeCountRows(rows);
            return counts[0].count;
        });

        const getVoteStats = Effect.fn('VoteRepository.getVoteStats')(function* () {
            const activeVotes = yield* countVotes(false);
            const completedVotes = yield* countVotes(true);
            const cooldownRows = yield* sql`SELECT COUNT(*) FROM user_cooldowns`;
            const cooldownCounts = yield* decodeCountRows(cooldownRows);

            return {
                activeVotes,
                completedVotes,
                ongoingVotes: activeVotes,
                userCooldowns: cooldownCounts[0].count,
            };
        });

        return {
            createVote,
            getVote,
            getVoteByMessageId,
            getActiveVotes,
            hasActiveVoteAgainst,
            completeVote,
            addVoteReaction,
            removeVoteReaction,
            getVoteReactions,
            setUserCooldown,
            getUserCooldown,
            isUserOnCooldown,
            getVoteStats,
        } as const;
    }),
}) {}

export const VoteRepositoryLive = Layer.effect(VoteRepository)(VoteRepository.make);
