import dayjs from 'dayjs';
import { ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { Effect } from 'effect';

import {
    CORABASTOS_CANCEL_EMOJI,
    CORABASTOS_CONFIRM_EMOJI,
    CORABASTOS_CONFIRMATION_TIMEOUT_MS,
    CORABASTOS_EMERGENCY_CONFIRMATIONS_NEEDED,
} from '../config/constants.js';
import { discordCall } from '../discord/DiscordClient.js';
import { corabastosErrorMessage } from '../domain/errors.js';
import {
    createAgendaConfirmationButtons,
    createAgendaConfirmationEmbed,
    createAgendaDisplayEmbed,
    createCorabastosStatusEmbed,
    createEmergencyRequestEmbed,
    createErrorEmbed,
} from '../services/corabastos-embed.js';
import { CorabastosManager } from '../services/corabastos-manager.js';
import { isValidTurno } from '../types/corabastos.js';

const replyWithErrorEmbed = Effect.fn('replyWithErrorEmbed')(function* (
    interaction: ChatInputCommandInteraction,
    title: string,
    description: string
) {
    const embed = createErrorEmbed(title, description);
    if (interaction.replied || interaction.deferred) {
        yield* discordCall('interaction.editReply', () =>
            interaction.editReply({ embeds: [embed] })
        );
    } else {
        yield* discordCall('interaction.reply', () =>
            interaction.reply({ embeds: [embed], ephemeral: true })
        );
    }
});

const handleAddAgendaItem = Effect.fn('handleAddAgendaItem')(function* (
    interaction: ChatInputCommandInteraction
) {
    const corabastosManager = yield* CorabastosManager;

    const turno = interaction.options.getInteger('turno', true);
    const topic = interaction.options.getString('tema', true);
    const description = interaction.options.getString('descripcion', false);

    // Validate turno
    if (!isValidTurno(turno)) {
        const embed = createErrorEmbed(
            'Turno Inválido',
            `El turno debe estar entre 0 (12:00 PM) y 8 (8:00 PM). Recibido: ${turno}`
        );
        yield* discordCall('interaction.reply', () =>
            interaction.reply({ embeds: [embed], ephemeral: true })
        );
        return;
    }

    // Validate topic length
    if (topic.length > 200) {
        const embed = createErrorEmbed(
            'Tema Muy Largo',
            'El tema no puede exceder 200 caracteres.'
        );
        yield* discordCall('interaction.reply', () =>
            interaction.reply({ embeds: [embed], ephemeral: true })
        );
        return;
    }

    yield* Effect.gen(function* () {
        const { agendaItem } = yield* corabastosManager.addAgendaItem(
            interaction.user,
            turno,
            topic,
            description ?? undefined
        );

        const confirmationEmbed = createAgendaConfirmationEmbed(
            interaction.user,
            turno,
            topic,
            description ?? undefined
        );
        const buttonRow = createAgendaConfirmationButtons(agendaItem.id);

        yield* discordCall('interaction.reply', () =>
            interaction.reply({
                embeds: [confirmationEmbed],
                components: [buttonRow],
                ephemeral: true,
            })
        );

        // Remove the buttons if there is no response before the timeout
        yield* discordCall('interaction.editReply', () =>
            interaction.editReply({ embeds: [confirmationEmbed], components: [] })
        ).pipe(
            Effect.delay(CORABASTOS_CONFIRMATION_TIMEOUT_MS),
            Effect.catchCause(cause => Effect.logDebug('Timeout error (expected):', cause)),
            Effect.forkDetach
        );
    }).pipe(
        Effect.catchTags({
            InvalidTurnoError: error =>
                replyWithErrorEmbed(interaction, 'Error', corabastosErrorMessage(error)),
            DuplicateAgendaTopicError: error =>
                replyWithErrorEmbed(interaction, 'Error', corabastosErrorMessage(error)),
        }),
        Effect.catchCause(cause =>
            Effect.gen(function* () {
                yield* Effect.logError('Error adding agenda item:', cause);
                yield* replyWithErrorEmbed(
                    interaction,
                    'Error',
                    'Error al agregar tema a la agenda'
                ).pipe(Effect.ignore);
            })
        )
    );
});

const handleViewAgenda = Effect.fn('handleViewAgenda')(function* (
    interaction: ChatInputCommandInteraction
) {
    const corabastosManager = yield* CorabastosManager;

    yield* discordCall('interaction.deferReply', () => interaction.deferReply());

    yield* Effect.gen(function* () {
        const session = yield* corabastosManager.getCurrentWeekSession();
        const agendaItems = yield* corabastosManager.getCurrentWeekAgenda();

        if (!session) {
            const embed = createErrorEmbed(
                'Sin Agenda',
                'No hay una sesión de corabastos programada para esta semana.'
            );
            yield* discordCall('interaction.editReply', () =>
                interaction.editReply({ embeds: [embed] })
            );
            return;
        }

        const embed = createAgendaDisplayEmbed(session, agendaItems);
        yield* discordCall('interaction.editReply', () =>
            interaction.editReply({ embeds: [embed] })
        );
    }).pipe(
        Effect.catchCause(cause =>
            Effect.gen(function* () {
                yield* Effect.logError('Error viewing agenda:', cause);
                const embed = createErrorEmbed('Error', 'No se pudo obtener la agenda.');
                yield* discordCall('interaction.editReply', () =>
                    interaction.editReply({ embeds: [embed] })
                ).pipe(Effect.ignore);
            })
        )
    );
});

export const handleCorabastosAgendaCommand = Effect.fn('handleCorabastosAgendaCommand')(function* (
    interaction: ChatInputCommandInteraction
) {
    const subcommand = interaction.options.getSubcommand();

    yield* Effect.gen(function* () {
        switch (subcommand) {
            case 'agregar':
                yield* handleAddAgendaItem(interaction);
                break;
            case 'ver':
                yield* handleViewAgenda(interaction);
                break;
            default:
                yield* discordCall('interaction.reply', () =>
                    interaction.reply({
                        content: '❌ Subcomando no reconocido.',
                        ephemeral: true,
                    })
                );
        }
    }).pipe(
        Effect.catchCause(cause =>
            Effect.gen(function* () {
                yield* Effect.logError('Error in handleCorabastosAgendaCommand:', cause);
                yield* replyWithErrorEmbed(
                    interaction,
                    'Error en Agenda',
                    'Error desconocido'
                ).pipe(Effect.ignore);
            })
        )
    );
});

export const handleCorabastosEmergencyCommand = Effect.fn('handleCorabastosEmergencyCommand')(
    function* (interaction: ChatInputCommandInteraction) {
        const corabastosManager = yield* CorabastosManager;

        const reason = interaction.options.getString('razon', true);
        const paciente = interaction.options.getUser('paciente', true);

        // Validate reason length
        if (reason.length > 300) {
            const embed = createErrorEmbed(
                'Razón Muy Larga',
                'La razón no puede exceder 300 caracteres.'
            );
            yield* discordCall('interaction.reply', () =>
                interaction.reply({ embeds: [embed], ephemeral: true })
            );
            return;
        }

        yield* discordCall('interaction.deferReply', () => interaction.deferReply());

        yield* Effect.gen(function* () {
            const emergencyRequest = yield* corabastosManager.createEmergencyRequest(
                interaction.user,
                reason,
                paciente
            );

            const embed = createEmergencyRequestEmbed(
                interaction.user,
                reason,
                paciente,
                CORABASTOS_EMERGENCY_CONFIRMATIONS_NEEDED
            );

            const message = yield* discordCall('interaction.editReply', () =>
                interaction.editReply({ embeds: [embed] })
            );

            yield* discordCall('message.react', () => message.react(CORABASTOS_CONFIRM_EMOJI));
            yield* discordCall('message.react', () => message.react(CORABASTOS_CANCEL_EMOJI));

            yield* corabastosManager.updateEmergencyRequestMessage(emergencyRequest.id, message.id);
        }).pipe(
            Effect.catchTag('PendingEmergencyRequestError', error =>
                Effect.gen(function* () {
                    const embed = createErrorEmbed('Error', corabastosErrorMessage(error));
                    yield* discordCall('interaction.editReply', () =>
                        interaction.editReply({ embeds: [embed] })
                    );
                })
            ),
            Effect.catchCause(cause =>
                Effect.gen(function* () {
                    yield* Effect.logError('Error in emergency command:', cause);
                    const embed = createErrorEmbed(
                        'Error',
                        'Error al crear solicitud de emergencia'
                    );
                    yield* discordCall('interaction.editReply', () =>
                        interaction.editReply({ embeds: [embed] })
                    ).pipe(Effect.ignore);
                })
            )
        );
    }
);

export const handleCorabastosStatusCommand = Effect.fn('handleCorabastosStatusCommand')(function* (
    interaction: ChatInputCommandInteraction
) {
    const corabastosManager = yield* CorabastosManager;

    yield* discordCall('interaction.deferReply', () => interaction.deferReply());

    yield* Effect.gen(function* () {
        const currentSession = yield* corabastosManager.getCurrentWeekSession();
        const agendaItems = yield* corabastosManager.getCurrentWeekAgenda();
        const pendingRequests = yield* corabastosManager.getPendingEmergencyRequests();
        const stats = yield* corabastosManager.getStats();

        const embed = createCorabastosStatusEmbed(
            currentSession,
            agendaItems.length,
            pendingRequests.length,
            stats
        );

        yield* discordCall('interaction.editReply', () =>
            interaction.editReply({ embeds: [embed] })
        );
    }).pipe(
        Effect.catchCause(cause =>
            Effect.gen(function* () {
                yield* Effect.logError('Error in status command:', cause);
                const embed = createErrorEmbed(
                    'Error',
                    'No se pudo obtener el estado del corabastos.'
                );
                yield* discordCall('interaction.editReply', () =>
                    interaction.editReply({ embeds: [embed] })
                ).pipe(Effect.ignore);
            })
        )
    );
});

// Admin command to manually create a corabastos session
export const handleCreateCorabastosSession = Effect.fn('handleCreateCorabastosSession')(function* (
    interaction: ChatInputCommandInteraction
) {
    const corabastosManager = yield* CorabastosManager;

    // Check admin permissions
    const member = interaction.member;
    if (!member || typeof member.permissions === 'string') {
        yield* discordCall('interaction.reply', () =>
            interaction.reply({
                content: '❌ No tienes permisos para crear sesiones de corabastos.',
                ephemeral: true,
            })
        );
        return;
    }

    const hasPermission = member.permissions.has([
        PermissionFlagsBits.Administrator,
        PermissionFlagsBits.ModerateMembers,
    ]);

    if (!hasPermission) {
        yield* discordCall('interaction.reply', () =>
            interaction.reply({
                content:
                    '❌ Solo los administradores y moderadores pueden crear sesiones de corabastos.',
                ephemeral: true,
            })
        );
        return;
    }

    yield* discordCall('interaction.deferReply', () => interaction.deferReply({ ephemeral: true }));

    yield* Effect.gen(function* () {
        const session = yield* corabastosManager.getOrCreateCurrentWeekSession(interaction.user);

        const weekStart = dayjs(session.weekStart).format('MMM DD');
        const weekEnd = dayjs(session.weekEnd).format('MMM DD, YYYY');
        const sessionWeek = `${weekStart} - ${weekEnd}`;

        yield* discordCall('interaction.editReply', () =>
            interaction.editReply({
                content: `✅ Sesión de corabastos creada/obtenida para la semana ${sessionWeek}.`,
            })
        );
    }).pipe(
        Effect.catchCause(cause =>
            Effect.gen(function* () {
                yield* Effect.logError('Error creating corabastos session:', cause);
                yield* discordCall('interaction.editReply', () =>
                    interaction.editReply({
                        content: '❌ Error al crear la sesión de corabastos.',
                    })
                ).pipe(Effect.ignore);
            })
        )
    );
});
