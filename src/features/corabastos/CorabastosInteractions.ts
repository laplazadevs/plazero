import dayjs from 'dayjs';
import {
    type ButtonInteraction,
    EmbedBuilder,
    type MessageReaction,
    type PartialMessageReaction,
    type PartialUser,
    type User,
} from 'discord.js';
import { Effect } from 'effect';

import { discordCall } from '../../discord/DiscordClient.js';
import {
    CORABASTOS_CANCEL_EMOJI,
    CORABASTOS_CONFIRM_EMOJI,
    corabastosErrorMessage,
    SessionNotFoundError,
} from './CorabastosDomain.js';
import {
    createAgendaCancelledEmbed,
    createAgendaSuccessEmbed,
    createEmergencyApprovedEmbed,
    createEmergencyRejectedEmbed,
    createErrorEmbed,
} from './CorabastosEmbeds.js';
import { CorabastosManager } from './CorabastosManager.js';

const editReplyWithError = Effect.fn('editReplyWithError')(function* (
    interaction: ButtonInteraction,
    message: string
) {
    const embed = createErrorEmbed('Error', message);
    yield* discordCall('interaction.editReply', () =>
        interaction.editReply({ embeds: [embed] })
    ).pipe(Effect.ignore);
});

const handleAgendaConfirmation = Effect.fn('handleAgendaConfirmation')(function* (
    interaction: ButtonInteraction
) {
    const corabastosManager = yield* CorabastosManager;
    const agendaId = interaction.customId.replace('corabastos_confirm_', '');

    yield* discordCall('interaction.deferReply', () => interaction.deferReply({ ephemeral: true }));

    yield* Effect.gen(function* () {
        // Confirm the agenda item
        yield* corabastosManager.confirmAgendaItem(agendaId, interaction.message.id);

        // Get current session for the success message
        const session = yield* corabastosManager.getCurrentWeekSession();
        if (!session) {
            return yield* Effect.fail(SessionNotFoundError.make({}));
        }

        // Extract the agenda details from the original embed
        const originalEmbed = interaction.message.embeds[0];
        const turnoField = originalEmbed.fields.find(field => field.name.includes('Turno'));
        const topicField = originalEmbed.fields.find(field => field.name.includes('Tema'));

        if (!turnoField || !topicField) {
            yield* editReplyWithError(
                interaction,
                'No se pudieron extraer los detalles de la agenda.'
            );
            return;
        }

        const turno = Number.parseInt(turnoField.value.split(' ')[0], 10);
        const topic = topicField.value;

        const weekStart = dayjs(session.weekStart).format('MMM DD');
        const weekEnd = dayjs(session.weekEnd).format('MMM DD, YYYY');
        const sessionWeek = `${weekStart} - ${weekEnd}`;

        const successEmbed = createAgendaSuccessEmbed(interaction.user, turno, topic, sessionWeek);

        yield* discordCall('interaction.editReply', () =>
            interaction.editReply({ embeds: [successEmbed] })
        );

        // Try to update the original message to remove buttons
        yield* Effect.gen(function* () {
            const updatedEmbed = new EmbedBuilder(originalEmbed.data).setColor(0x00ff00).setFooter({
                text: '✅ Tema confirmado y agregado a la agenda.',
            });

            yield* discordCall('message.edit', () =>
                interaction.message.edit({ embeds: [updatedEmbed], components: [] })
            );
        }).pipe(
            Effect.catchCause(cause =>
                Effect.logWarning(
                    'Could not update original confirmation message (may have been deleted):',
                    cause
                )
            )
        );
    }).pipe(
        Effect.catchTag('SessionNotFoundError', error =>
            editReplyWithError(interaction, corabastosErrorMessage(error))
        ),
        Effect.catchCause(cause =>
            Effect.gen(function* () {
                yield* Effect.logError('Error confirming agenda item:', cause);
                yield* editReplyWithError(interaction, 'Error al confirmar el tema');
            })
        )
    );
});

const handleAgendaCancellation = Effect.fn('handleAgendaCancellation')(function* (
    interaction: ButtonInteraction
) {
    const corabastosManager = yield* CorabastosManager;
    const agendaId = interaction.customId.replace('corabastos_cancel_', '');

    yield* discordCall('interaction.deferReply', () => interaction.deferReply({ ephemeral: true }));

    yield* Effect.gen(function* () {
        yield* corabastosManager.cancelAgendaItem(agendaId);

        const cancelledEmbed = createAgendaCancelledEmbed();
        yield* discordCall('interaction.editReply', () =>
            interaction.editReply({ embeds: [cancelledEmbed] })
        );

        // Try to update the original message to remove buttons
        yield* Effect.gen(function* () {
            const originalEmbed = interaction.message.embeds[0];
            const updatedEmbed = new EmbedBuilder(originalEmbed.data).setColor(0xff0000).setFooter({
                text: '❌ Tema cancelado.',
            });

            yield* discordCall('message.edit', () =>
                interaction.message.edit({ embeds: [updatedEmbed], components: [] })
            );
        }).pipe(
            Effect.catchCause(cause =>
                Effect.logWarning(
                    'Could not update original cancellation message (may have been deleted):',
                    cause
                )
            )
        );
    }).pipe(
        Effect.catchCause(cause =>
            Effect.gen(function* () {
                yield* Effect.logError('Error cancelling agenda item:', cause);
                yield* editReplyWithError(interaction, 'Error al cancelar el tema');
            })
        )
    );
});

export const handleCorabastosButtonInteraction = Effect.fn('handleCorabastosButtonInteraction')(
    function* (interaction: ButtonInteraction) {
        const customId = interaction.customId;

        yield* Effect.gen(function* () {
            if (customId.startsWith('corabastos_confirm_')) {
                yield* handleAgendaConfirmation(interaction);
            } else if (customId.startsWith('corabastos_cancel_')) {
                yield* handleAgendaCancellation(interaction);
            } else {
                yield* discordCall('interaction.reply', () =>
                    interaction.reply({
                        content: '❌ Interacción no reconocida.',
                        ephemeral: true,
                    })
                );
            }
        }).pipe(
            Effect.catchCause(cause =>
                Effect.gen(function* () {
                    yield* Effect.logError('Error in corabastos button interaction:', cause);

                    const embed = createErrorEmbed('Error', 'Error desconocido');
                    if (interaction.replied || interaction.deferred) {
                        yield* discordCall('interaction.editReply', () =>
                            interaction.editReply({ embeds: [embed] })
                        ).pipe(Effect.ignore);
                    } else {
                        yield* discordCall('interaction.reply', () =>
                            interaction.reply({ embeds: [embed], ephemeral: true })
                        ).pipe(Effect.ignore);
                    }
                })
            )
        );
    }
);

const handleEmergencyConfirmation = Effect.fn('handleEmergencyConfirmation')(function* (
    reaction: MessageReaction | PartialMessageReaction,
    user: User,
    requestId: string
) {
    const corabastosManager = yield* CorabastosManager;

    yield* Effect.gen(function* () {
        const wasAdded = yield* corabastosManager.addEmergencyConfirmation(requestId, user);

        if (!wasAdded) {
            // User already confirmed, silently ignore
            return;
        }

        // Check if we have enough confirmations
        const approvalStatus = yield* corabastosManager.checkEmergencyRequestApproval(requestId);

        if (!approvalStatus.isApproved) {
            return;
        }

        // Approve the emergency request
        yield* corabastosManager.approveEmergencyRequest(requestId);

        const emergencyRequest = yield* corabastosManager.getEmergencyRequest(requestId);
        if (!emergencyRequest) return;

        // Create emergency session
        yield* corabastosManager.createEmergencySession(
            emergencyRequest,
            emergencyRequest.requestedBy
        );

        const approvalEmbed = createEmergencyApprovedEmbed(
            emergencyRequest.requestedBy,
            emergencyRequest.reason,
            emergencyRequest.paciente,
            approvalStatus.confirmationsReceived
        );

        // Announce in the general channel
        const guild = reaction.message.guild;
        if (guild) {
            const generalChannel = yield* corabastosManager.findGeneralChannel(guild);
            if (generalChannel) {
                yield* discordCall('channel.send', () =>
                    generalChannel.send({ content: '@everyone', embeds: [approvalEmbed] })
                );
            }
        }

        // Update the original message
        yield* discordCall('message.edit', () =>
            reaction.message.edit({ embeds: [approvalEmbed], components: [] })
        );
    }).pipe(
        Effect.catchCause(cause => Effect.logError('Error handling emergency confirmation:', cause))
    );
});

const handleEmergencyRejection = Effect.fn('handleEmergencyRejection')(function* (
    reaction: MessageReaction | PartialMessageReaction,
    user: User,
    requestId: string
) {
    const corabastosManager = yield* CorabastosManager;

    yield* Effect.gen(function* () {
        // Only admins/moderators can reject
        const member = reaction.message.guild?.members.cache.get(user.id);
        if (!member?.permissions.has(['Administrator', 'ModerateMembers'])) {
            return;
        }

        yield* corabastosManager.rejectEmergencyRequest(requestId);

        const emergencyRequest = yield* corabastosManager.getEmergencyRequest(requestId);
        if (!emergencyRequest) return;

        const rejectionEmbed = createEmergencyRejectedEmbed(emergencyRequest.reason);

        yield* discordCall('message.edit', () =>
            reaction.message.edit({ embeds: [rejectionEmbed], components: [] })
        );
    }).pipe(
        Effect.catchCause(cause => Effect.logError('Error handling emergency rejection:', cause))
    );
});

export const handleCorabastosReactionAdd = Effect.fn('handleCorabastosReactionAdd')(function* (
    partialReaction: MessageReaction | PartialMessageReaction,
    partialUser: User | PartialUser
) {
    if (partialUser.bot) return;

    const corabastosManager = yield* CorabastosManager;

    yield* Effect.gen(function* () {
        // Fetch partial data if needed
        const reaction = partialReaction.partial
            ? yield* discordCall('reaction.fetch', () => partialReaction.fetch())
            : partialReaction;
        const user = partialUser.partial
            ? yield* discordCall('user.fetch', () => partialUser.fetch())
            : partialUser;

        const message = reaction.message;
        const emoji = reaction.emoji.name;

        // Check if this is an emergency request message
        if (
            !message.embeds.length ||
            !message.embeds[0].title?.includes('Corabastos de Emergencia')
        ) {
            return;
        }

        // Only handle confirm/cancel emojis
        if (![CORABASTOS_CONFIRM_EMOJI, CORABASTOS_CANCEL_EMOJI].includes(emoji ?? '')) {
            return;
        }

        // Find the pending request tied to this message
        const pendingRequests = yield* corabastosManager.getPendingEmergencyRequests();
        const emergencyRequest = pendingRequests.find(
            req => req.confirmationMessageId === message.id
        );

        if (!emergencyRequest) {
            yield* Effect.logDebug('Emergency request not found for reaction');
            return;
        }

        if (emoji === CORABASTOS_CONFIRM_EMOJI) {
            yield* handleEmergencyConfirmation(reaction, user, emergencyRequest.id);
        } else if (emoji === CORABASTOS_CANCEL_EMOJI) {
            yield* handleEmergencyRejection(reaction, user, emergencyRequest.id);
        }
    }).pipe(
        Effect.catchCause(cause => Effect.logError('Error handling corabastos reaction:', cause))
    );
});

export const handleCorabastosReactionRemove = Effect.fn('handleCorabastosReactionRemove')(
    function* (_reaction: MessageReaction | PartialMessageReaction, _user: User | PartialUser) {
        // Reaction removals are not handled; emergency requests expire on their own.
        yield* Effect.void;
    }
);
