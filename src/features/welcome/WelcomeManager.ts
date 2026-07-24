import { randomUUID } from 'node:crypto';
import { Context, Effect, Layer } from 'effect';

import { type PlazeroUser, plazeroUserFromRow } from '../../domain/User.js';
import { UserRepository } from '../../domain/UserRepository.js';
import type { WelcomeData } from './WelcomeDomain.js';
import {
    WelcomeRepository,
    type WelcomeRequestRow,
    type WelcomeRequestUpdates,
} from './WelcomeRepository.js';

export class WelcomeManager extends Context.Service<WelcomeManager>()('plazero/WelcomeManager', {
    make: Effect.gen(function* () {
        const welcomeRepo = yield* WelcomeRepository;
        const userRepo = yield* UserRepository;

        const convertToWelcomeData = Effect.fn('WelcomeManager.convertToWelcomeData')(function* (
            requestRow: WelcomeRequestRow,
            user: PlazeroUser
        ) {
            const result: WelcomeData = {
                id: requestRow.id,
                user,
                joinTime: requestRow.join_time,
                messageId: requestRow.message_id,
                channelId: requestRow.channel_id,
                approved: requestRow.approved,
            };

            if (requestRow.linkedin_url) {
                result.linkedinUrl = requestRow.linkedin_url;
            }
            if (requestRow.presentation) {
                result.presentation = requestRow.presentation;
            }
            if (requestRow.invited_by) {
                result.invitedBy = requestRow.invited_by;
            }
            if (requestRow.approved_by_id) {
                const approverRow = yield* userRepo.getUser(requestRow.approved_by_id);
                if (approverRow) {
                    result.approvedBy = plazeroUserFromRow(approverRow);
                }
            }
            if (requestRow.approved_at) {
                result.approvedAt = requestRow.approved_at;
            }

            return result;
        });

        const loadWithUser = Effect.fn('WelcomeManager.loadWithUser')(function* (
            requestRow: WelcomeRequestRow | null
        ) {
            if (!requestRow) return undefined;

            const userRow = yield* userRepo.getUser(requestRow.user_id);
            if (!userRow) return undefined;

            return yield* convertToWelcomeData(requestRow, plazeroUserFromRow(userRow));
        });

        const createWelcomeRequest = Effect.fn('WelcomeManager.createWelcomeRequest')(function* (
            user: PlazeroUser,
            messageId: string,
            channelId: string
        ) {
            const requestId = randomUUID();
            const requestRow = yield* welcomeRepo.createWelcomeRequest(
                requestId,
                user,
                messageId,
                channelId
            );
            return yield* convertToWelcomeData(requestRow, user);
        });

        const getWelcomeRequest = Effect.fn('WelcomeManager.getWelcomeRequest')(function* (
            id: string
        ) {
            return yield* loadWithUser(yield* welcomeRepo.getWelcomeRequest(id));
        });

        const updateWelcomeRequest = Effect.fn('WelcomeManager.updateWelcomeRequest')(function* (
            id: string,
            updates: Partial<WelcomeData>
        ) {
            const dbUpdates: WelcomeRequestUpdates = {
                ...(updates.linkedinUrl !== undefined && { linkedin_url: updates.linkedinUrl }),
                ...(updates.presentation !== undefined && { presentation: updates.presentation }),
                ...(updates.invitedBy !== undefined && { invited_by: updates.invitedBy }),
                ...(updates.messageId !== undefined && { message_id: updates.messageId }),
            };

            return yield* welcomeRepo.updateWelcomeRequest(id, dbUpdates);
        });

        const approveWelcomeRequest = Effect.fn('WelcomeManager.approveWelcomeRequest')(function* (
            id: string,
            approvedBy: PlazeroUser
        ) {
            return yield* welcomeRepo.approveWelcomeRequest(id, approvedBy);
        });

        const getAllPendingRequests = Effect.fn('WelcomeManager.getAllPendingRequests')(
            function* () {
                const pendingRequests = yield* welcomeRepo.getPendingRequests();
                const result: WelcomeData[] = [];

                for (const requestRow of pendingRequests) {
                    const welcomeData = yield* loadWithUser(requestRow);
                    if (welcomeData) {
                        result.push(welcomeData);
                    }
                }

                return result;
            }
        );

        const getStats = Effect.fn('WelcomeManager.getStats')(function* () {
            return yield* welcomeRepo.getWelcomeStats();
        });

        return {
            createWelcomeRequest,
            getWelcomeRequest,
            updateWelcomeRequest,
            approveWelcomeRequest,
            getAllPendingRequests,
            getStats,
        } as const;
    }),
}) {
    static readonly layer = Layer.effect(WelcomeManager)(WelcomeManager.make);
}
