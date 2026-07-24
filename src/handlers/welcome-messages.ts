import { Message, TextChannel } from 'discord.js';
import { Effect } from 'effect';

import { WELCOME_CHANNEL_NAME, WELCOME_ROLE_NAME } from '../config/constants.js';
import { discordCall } from '../discord/DiscordClient.js';
import {
    createWelcomeApprovalEmbed,
    createWelcomeButtonRow,
    createWelcomeEmbed,
} from '../services/welcome-embed.js';
import { WelcomeManager } from '../services/welcome-manager.js';
import { minimalPlazeroUser } from '../types/user.js';

interface ParsedWelcomeInfo {
    linkedinUrl?: string;
    presentation?: string;
    invitedBy?: string;
}

function parseWelcomeMessage(messageContent: string): ParsedWelcomeInfo {
    const result: ParsedWelcomeInfo = {};
    const content = messageContent.toLowerCase();

    // Parse LinkedIn URL - more flexible patterns
    const linkedinPatterns = [
        /https?:\/\/(www\.)?linkedin\.com\/in\/[a-zA-Z0-9-]+\/?/gi,
        /linkedin\.com\/in\/[a-zA-Z0-9-]+/gi,
        /linked\.in\/[a-zA-Z0-9-]+/gi,
    ];

    for (const pattern of linkedinPatterns) {
        const match = messageContent.match(pattern);
        if (match) {
            result.linkedinUrl = match[0];
            break;
        }
    }

    // Parse presentation - handle various formats
    if (
        content.includes('soy') ||
        content.includes('me llamo') ||
        content.includes('mi nombre') ||
        content.includes('trabajo') ||
        content.includes('estudio') ||
        content.includes('experiencia') ||
        content.includes('presentación') ||
        content.includes('hola, soy') ||
        content.includes('hola soy') ||
        content.includes('soy de') ||
        content.includes('vivo en') ||
        content.includes('tengo') ||
        content.includes('estudiante') ||
        content.includes('me dedico') ||
        content.includes('estoy estudiando') ||
        content.includes('estoy trabajando')
    ) {
        let presentationText = messageContent;

        // Handle structured formats (bullet points, numbered lists, etc.)
        if (
            content.includes('•') ||
            content.includes('-') ||
            content.includes('*') ||
            /\d+\./.test(messageContent)
        ) {
            const lines = messageContent.split('\n');
            const presentationLines = lines.filter(line => {
                const lowerLine = line.toLowerCase();
                return (
                    lowerLine.includes('presentación') ||
                    lowerLine.includes('soy') ||
                    lowerLine.includes('me llamo') ||
                    lowerLine.includes('mi nombre') ||
                    lowerLine.includes('trabajo') ||
                    lowerLine.includes('estudio') ||
                    lowerLine.includes('experiencia') ||
                    lowerLine.includes('soy de') ||
                    lowerLine.includes('vivo en') ||
                    lowerLine.includes('tengo') ||
                    lowerLine.includes('me dedico') ||
                    lowerLine.includes('estoy estudiando') ||
                    lowerLine.includes('estoy trabajando')
                );
            });

            if (presentationLines.length > 0) {
                presentationText = presentationLines
                    .map(line => {
                        // Extract text after bullet point/number and colon
                        const match =
                            line.match(/[•\-*]\s*[^:]*:\s*(.+)/) ||
                            line.match(/\d+\.\s*[^:]*:\s*(.+)/);
                        if (match) {
                            return match[1].trim();
                        }
                        // Remove bullet points/numbers from the beginning
                        return line
                            .replace(/^[•\-*]\s*/, '')
                            .replace(/^\d+\.\s*/, '')
                            .trim();
                    })
                    .join(' ')
                    .trim();
            }
        } else {
            // For unstructured messages, try to extract the most relevant part
            const sentences = messageContent.split(/[.!?]+/).filter(s => s.trim().length > 0);
            const relevantSentences = sentences.filter(sentence => {
                const lowerSentence = sentence.toLowerCase();
                return (
                    lowerSentence.includes('soy') ||
                    lowerSentence.includes('me llamo') ||
                    lowerSentence.includes('mi nombre') ||
                    lowerSentence.includes('trabajo') ||
                    lowerSentence.includes('estudio') ||
                    lowerSentence.includes('experiencia') ||
                    lowerSentence.includes('soy de') ||
                    lowerSentence.includes('vivo en') ||
                    lowerSentence.includes('tengo') ||
                    lowerSentence.includes('me dedico') ||
                    lowerSentence.includes('estoy estudiando') ||
                    lowerSentence.includes('estoy trabajando')
                );
            });

            if (relevantSentences.length > 0) {
                presentationText = relevantSentences.join('. ').trim();
            }
        }

        // Only set if we have substantial content (more than 20 characters)
        if (presentationText.length > 20) {
            result.presentation = presentationText;
        }
    }

    // Parse invitation information - handle various formats
    if (
        content.includes('invit') ||
        content.includes('trajo') ||
        content.includes('me trajo') ||
        content.includes('me invitó') ||
        content.includes('invitado por') ||
        content.includes('quien te invitó') ||
        content.includes('me recomendó') ||
        content.includes('conocí por') ||
        content.includes('vine por') ||
        content.includes('me uní por')
    ) {
        let invitationText = messageContent;

        // Handle structured formats
        if (
            content.includes('•') ||
            content.includes('-') ||
            content.includes('*') ||
            /\d+\./.test(messageContent)
        ) {
            const lines = messageContent.split('\n');
            const invitationLines = lines.filter(line => {
                const lowerLine = line.toLowerCase();
                return (
                    lowerLine.includes('invit') ||
                    lowerLine.includes('trajo') ||
                    lowerLine.includes('quien te invitó') ||
                    lowerLine.includes('me recomendó') ||
                    lowerLine.includes('conocí por') ||
                    lowerLine.includes('vine por') ||
                    lowerLine.includes('me uní por')
                );
            });

            if (invitationLines.length > 0) {
                invitationText = invitationLines
                    .map(line => {
                        const match =
                            line.match(/[•\-*]\s*[^:]*:\s*(.+)/) ||
                            line.match(/\d+\.\s*[^:]*:\s*(.+)/);
                        if (match) {
                            return match[1].trim();
                        }
                        return line
                            .replace(/^[•\-*]\s*/, '')
                            .replace(/^\d+\.\s*/, '')
                            .trim();
                    })
                    .join(' ')
                    .trim();
            }
        } else {
            // For unstructured messages, look for sentences with invitation keywords
            const sentences = messageContent.split(/[.!?]+/).filter(s => s.trim().length > 0);
            const relevantSentences = sentences.filter(sentence => {
                const lowerSentence = sentence.toLowerCase();
                return (
                    lowerSentence.includes('invit') ||
                    lowerSentence.includes('trajo') ||
                    lowerSentence.includes('me recomendó') ||
                    lowerSentence.includes('conocí por') ||
                    lowerSentence.includes('vine por') ||
                    lowerSentence.includes('me uní por')
                );
            });

            if (relevantSentences.length > 0) {
                invitationText = relevantSentences.join('. ').trim();
            }
        }

        result.invitedBy = invitationText;
    }

    return result;
}

export const handleWelcomeMessage = Effect.fn('handleWelcomeMessage')(function* (message: Message) {
    // Only process messages in the welcome channel
    if (
        !(message.channel instanceof TextChannel) ||
        message.channel.name !== WELCOME_CHANNEL_NAME ||
        message.author.bot
    ) {
        return;
    }
    const channel = message.channel;

    const welcomeManager = yield* WelcomeManager;

    yield* Effect.gen(function* () {
        // Find the welcome request for this user
        const welcomeRequests = yield* welcomeManager.getAllPendingRequests();
        const userWelcomeRequest = welcomeRequests.find(
            request => request.user.id === message.author.id && !request.approved
        );

        if (!userWelcomeRequest) {
            return; // No pending welcome request for this user
        }

        // Parse the message for different types of information
        const parsedInfo = parseWelcomeMessage(message.content);
        let updated = false;

        if (parsedInfo.linkedinUrl && parsedInfo.linkedinUrl !== userWelcomeRequest.linkedinUrl) {
            yield* welcomeManager.updateWelcomeRequest(userWelcomeRequest.id, {
                linkedinUrl: parsedInfo.linkedinUrl,
            });
            updated = true;
        }

        if (
            parsedInfo.presentation &&
            parsedInfo.presentation !== userWelcomeRequest.presentation
        ) {
            yield* welcomeManager.updateWelcomeRequest(userWelcomeRequest.id, {
                presentation: parsedInfo.presentation,
            });
            updated = true;
        }

        if (parsedInfo.invitedBy && parsedInfo.invitedBy !== userWelcomeRequest.invitedBy) {
            yield* welcomeManager.updateWelcomeRequest(userWelcomeRequest.id, {
                invitedBy: parsedInfo.invitedBy,
            });
            updated = true;
        }

        // Get the latest request data (either from updates or original)
        const currentRequest = updated
            ? yield* welcomeManager.getWelcomeRequest(userWelcomeRequest.id)
            : userWelcomeRequest;

        if (!currentRequest) {
            yield* Effect.logWarning(
                `Could not retrieve current welcome request: ${userWelcomeRequest.id}`
            );
            return;
        }

        // Check if all required information is now complete
        const hasAllInfo =
            currentRequest.linkedinUrl && currentRequest.presentation && currentRequest.invitedBy;

        if (hasAllInfo && !currentRequest.approved) {
            yield* Effect.logInfo(
                `All welcome information complete for user ${currentRequest.user.username}, auto-approving...`
            );

            // The bot approves on its own behalf
            const botUser = minimalPlazeroUser('plazero#2570', 'plazero');

            const approvalSuccess = yield* welcomeManager.approveWelcomeRequest(
                currentRequest.id,
                botUser
            );

            if (!approvalSuccess) {
                yield* Effect.logError(
                    `Failed to auto-approve welcome request for ${currentRequest.user.username}`
                );
                return;
            }

            yield* Effect.logInfo(
                `Auto-approved welcome request for ${currentRequest.user.username}`
            );

            // Assign the welcome role
            const guild = message.guild;
            if (guild) {
                yield* Effect.gen(function* () {
                    const targetMember = yield* discordCall('guild.members.fetch', () =>
                        guild.members.fetch(currentRequest.user.id)
                    );
                    const welcomeRole = guild.roles.cache.find(
                        role => role.name === WELCOME_ROLE_NAME
                    );

                    if (targetMember && welcomeRole) {
                        yield* discordCall('member.roles.add', () =>
                            targetMember.roles.add(welcomeRole)
                        );
                        yield* Effect.logInfo(
                            `Assigned "${WELCOME_ROLE_NAME}" role to ${currentRequest.user.username}`
                        );
                    } else {
                        yield* Effect.logWarning('Could not assign role: member or role not found');
                    }
                }).pipe(
                    Effect.catchCause(cause =>
                        Effect.logError('Error assigning role during auto-approval:', cause)
                    )
                );
            }

            // Update the embed with the approval data
            const finalRequest = yield* welcomeManager.getWelcomeRequest(currentRequest.id);
            if (finalRequest) {
                const approvalEmbed = createWelcomeApprovalEmbed(finalRequest);

                yield* Effect.gen(function* () {
                    const originalMessage = yield* discordCall('channel.messages.fetch', () =>
                        channel.messages.fetch(finalRequest.messageId)
                    );
                    yield* discordCall('message.edit', () =>
                        originalMessage.edit({ embeds: [approvalEmbed], components: [] })
                    );
                    yield* Effect.logInfo('Updated welcome message with auto-approval');
                }).pipe(
                    Effect.catchCause(cause =>
                        Effect.logError('Error updating message after auto-approval:', cause)
                    )
                );
            }
        } else if (updated) {
            // Information was updated but not auto-approved: refresh the embed
            yield* Effect.logDebug(
                `Information was updated, refreshing embed for request: ${userWelcomeRequest.id}`
            );

            const embed = createWelcomeEmbed(currentRequest);
            const buttonRow = createWelcomeButtonRow(currentRequest);

            yield* Effect.gen(function* () {
                const originalMessage = yield* discordCall('channel.messages.fetch', () =>
                    channel.messages.fetch(currentRequest.messageId)
                );
                yield* discordCall('message.edit', () =>
                    originalMessage.edit({ embeds: [embed], components: [buttonRow] })
                );
                yield* Effect.logDebug(
                    `Successfully updated welcome message: ${currentRequest.messageId}`
                );
            }).pipe(
                Effect.catchCause(cause =>
                    Effect.logError(
                        `Error updating welcome message ${currentRequest.messageId}:`,
                        cause
                    )
                )
            );
        }
    }).pipe(Effect.catchCause(cause => Effect.logError('Error handling welcome message:', cause)));
});
