import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone.js';
import { type Client, EmbedBuilder, type Guild, TextChannel } from 'discord.js';
import { Context, Effect, Layer } from 'effect';

import { DiscordClient, discordCall } from '../../discord/DiscordClient.js';
import { minimalPlazeroUser, type PlazeroUser, plazeroUserFromRow } from '../../domain/User.js';
import {
    CORABASTOS_FRIDAY_HOUR,
    type CorabastosAgendaItem,
    type CorabastosEmergencyRequest,
    type CorabastosSession,
    DuplicateAgendaTopicError,
    EmergencyRequestNotFoundError,
    GENERAL_CHANNEL_NAME,
    InvalidTurnoError,
    isValidTurno,
    PendingEmergencyRequestError,
} from './CorabastosDomain.js';
import {
    type CorabastosAgendaRow,
    type CorabastosEmergencyRequestRow,
    CorabastosRepository,
    type CorabastosSessionRow,
} from './CorabastosRepository.js';

dayjs.extend(timezone);

const mapSessionRowToSession = (row: CorabastosSessionRow): CorabastosSession => ({
    id: row.id,
    weekStart: row.week_start,
    weekEnd: row.week_end,
    scheduledTime: row.scheduled_time ?? undefined,
    status: row.status,
    type: row.type,
    channelId: row.channel_id ?? undefined,
    announcementMessageId: row.announcement_message_id ?? undefined,
    announcementChannelId: row.announcement_channel_id ?? undefined,
    createdBy: minimalPlazeroUser(row.created_by_id ?? 'unknown'),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});

const mapEmergencyRequestRowToRequest = (
    row: CorabastosEmergencyRequestRow
): CorabastosEmergencyRequest => ({
    id: row.id,
    requestedBy: minimalPlazeroUser(row.requested_by_id),
    reason: row.reason,
    paciente: minimalPlazeroUser(row.paciente_id),
    status: row.status,
    confirmationMessageId: row.confirmation_message_id ?? undefined,
    confirmationsNeeded: row.confirmations_needed,
    confirmationsReceived: row.confirmations_received,
    expiresAt: row.expires_at ?? undefined,
    approvedAt: row.approved_at ?? undefined,
    sessionId: row.session_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});

// Corabastos week runs from Saturday 00:01 to Friday 23:59 (Bogota time).
const getCurrentWeekRange = (): { weekStart: Date; weekEnd: Date } => {
    const now = dayjs().tz('America/Bogota');

    let weekStart: dayjs.Dayjs;
    let weekEnd: dayjs.Dayjs;

    if (now.day() === 6) {
        // Saturday: a new corabastos week starts today
        weekStart = now.hour(0).minute(1).second(0).millisecond(0);
        weekEnd = now.add(6, 'day').hour(23).minute(59).second(59).millisecond(999);
    } else {
        const daysSinceSaturday = (now.day() + 1) % 7;
        weekStart = now
            .subtract(daysSinceSaturday, 'day')
            .hour(0)
            .minute(1)
            .second(0)
            .millisecond(0);
        weekEnd = weekStart.add(6, 'day').hour(23).minute(59).second(59).millisecond(999);
    }

    return {
        weekStart: weekStart.utc().toDate(),
        weekEnd: weekEnd.utc().toDate(),
    };
};

const getNextFridayAtNoon = (): Date => {
    const now = dayjs().tz('America/Bogota');
    const currentWeekFriday = now
        .startOf('week')
        .add(5, 'day')
        .hour(CORABASTOS_FRIDAY_HOUR)
        .minute(0)
        .second(0)
        .millisecond(0);

    if (currentWeekFriday.isAfter(now)) {
        return currentWeekFriday.utc().toDate();
    }

    return currentWeekFriday.add(1, 'week').utc().toDate();
};

const findGeneralChannelIn = (guild: Guild): TextChannel | null => {
    const channel = guild.channels.cache.find(
        (ch): ch is TextChannel =>
            ch instanceof TextChannel &&
            ch.name.toLowerCase().includes(GENERAL_CHANNEL_NAME.toLowerCase())
    );
    return channel ?? null;
};

export class CorabastosManager extends Context.Service<CorabastosManager>()(
    'plazero/CorabastosManager',
    {
        make: Effect.gen(function* () {
            const repository = yield* CorabastosRepository;
            const client: Client<true> = yield* DiscordClient;

            const getCurrentWeekSession = Effect.fn('CorabastosManager.getCurrentWeekSession')(
                function* () {
                    const sessionRow = yield* repository.getCurrentWeekSession();
                    return sessionRow ? mapSessionRowToSession(sessionRow) : null;
                }
            );

            const getOrCreateCurrentWeekSession = Effect.fn(
                'CorabastosManager.getOrCreateCurrentWeekSession'
            )(function* (createdBy?: PlazeroUser) {
                const session = yield* getCurrentWeekSession();
                if (session) {
                    return session;
                }

                const { weekStart, weekEnd } = getCurrentWeekRange();
                const sessionRow = yield* repository.createSession(
                    weekStart,
                    weekEnd,
                    'regular',
                    getNextFridayAtNoon(),
                    createdBy
                );
                return mapSessionRowToSession(sessionRow);
            });

            const createEmergencySession = Effect.fn('CorabastosManager.createEmergencySession')(
                function* (emergencyRequest: CorabastosEmergencyRequest, createdBy: PlazeroUser) {
                    const now = dayjs().tz('America/Bogota');
                    const weekStart = now.startOf('week').utc().toDate();
                    const weekEnd = now.endOf('week').utc().toDate();

                    const sessionRow = yield* repository.createSession(
                        weekStart,
                        weekEnd,
                        'emergency',
                        now.utc().toDate(),
                        createdBy
                    );

                    yield* repository.linkEmergencyToSession(emergencyRequest.id, sessionRow.id);
                    return mapSessionRowToSession(sessionRow);
                }
            );

            const mapAgendaRowToItem = Effect.fn('CorabastosManager.mapAgendaRowToItem')(function* (
                row: CorabastosAgendaRow
            ) {
                const userRow = yield* repository.getUserData(row.user_id);
                const user = userRow
                    ? plazeroUserFromRow(userRow)
                    : minimalPlazeroUser(row.user_id);

                const item: CorabastosAgendaItem = {
                    id: row.id,
                    sessionId: row.session_id,
                    user,
                    turno: row.turno,
                    topic: row.topic,
                    description: row.description ?? undefined,
                    status: row.status,
                    confirmationMessageId: row.confirmation_message_id ?? undefined,
                    orderIndex: row.order_index,
                    createdAt: row.created_at,
                    updatedAt: row.updated_at,
                };
                return item;
            });

            // Agenda management
            const addAgendaItem = Effect.fn('CorabastosManager.addAgendaItem')(function* (
                user: PlazeroUser,
                turno: number,
                topic: string,
                description?: string
            ) {
                if (!isValidTurno(turno)) {
                    return yield* Effect.fail(InvalidTurnoError.make({ turno }));
                }

                const session = yield* getOrCreateCurrentWeekSession(user);

                const existingItems = yield* repository.getUserAgendaItems(session.id, user.id);
                const duplicateItem = existingItems.find(
                    item => item.turno === turno && item.topic.toLowerCase() === topic.toLowerCase()
                );

                if (duplicateItem) {
                    return yield* Effect.fail(DuplicateAgendaTopicError.make({ turno, topic }));
                }

                const agendaRow = yield* repository.addAgendaItem(
                    session.id,
                    user,
                    turno,
                    topic,
                    description
                );
                const agendaItem = yield* mapAgendaRowToItem(agendaRow);

                return { agendaItem, session };
            });

            const confirmAgendaItem = Effect.fn('CorabastosManager.confirmAgendaItem')(function* (
                agendaId: string,
                messageId: string
            ) {
                yield* repository.confirmAgendaItem(agendaId, messageId);
            });

            const cancelAgendaItem = Effect.fn('CorabastosManager.cancelAgendaItem')(function* (
                agendaId: string
            ) {
                yield* repository.cancelAgendaItem(agendaId);
            });

            const getSessionAgenda = Effect.fn('CorabastosManager.getSessionAgenda')(function* (
                sessionId: string
            ) {
                const agendaRows = yield* repository.getSessionAgenda(sessionId);
                const items: CorabastosAgendaItem[] = [];
                for (const row of agendaRows) {
                    items.push(yield* mapAgendaRowToItem(row));
                }
                return items;
            });

            const getCurrentWeekAgenda = Effect.fn('CorabastosManager.getCurrentWeekAgenda')(
                function* () {
                    const session = yield* getCurrentWeekSession();
                    if (!session) {
                        const noItems: CorabastosAgendaItem[] = [];
                        return noItems;
                    }
                    return yield* getSessionAgenda(session.id);
                }
            );

            // Emergency request management
            const createEmergencyRequest = Effect.fn('CorabastosManager.createEmergencyRequest')(
                function* (user: PlazeroUser, reason: string, paciente: PlazeroUser) {
                    const pendingRequests = yield* repository.getPendingEmergencyRequests();
                    const userPendingRequest = pendingRequests.find(
                        req => req.requested_by_id === user.id
                    );

                    if (userPendingRequest) {
                        return yield* Effect.fail(
                            PendingEmergencyRequestError.make({ userId: user.id })
                        );
                    }

                    const requestRow = yield* repository.createEmergencyRequest(
                        user,
                        reason,
                        paciente
                    );
                    return mapEmergencyRequestRowToRequest(requestRow);
                }
            );

            const updateEmergencyRequestMessage = Effect.fn(
                'CorabastosManager.updateEmergencyRequestMessage'
            )(function* (requestId: string, messageId: string) {
                yield* repository.updateEmergencyRequestMessage(requestId, messageId);
            });

            const addEmergencyConfirmation = Effect.fn(
                'CorabastosManager.addEmergencyConfirmation'
            )(function* (requestId: string, user: PlazeroUser) {
                return yield* repository.addEmergencyConfirmation(requestId, user);
            });

            const getEmergencyRequest = Effect.fn('CorabastosManager.getEmergencyRequest')(
                function* (requestId: string) {
                    const requestRow = yield* repository.getEmergencyRequest(requestId);
                    return requestRow ? mapEmergencyRequestRowToRequest(requestRow) : null;
                }
            );

            const checkEmergencyRequestApproval = Effect.fn(
                'CorabastosManager.checkEmergencyRequestApproval'
            )(function* (requestId: string) {
                const request = yield* getEmergencyRequest(requestId);
                if (!request) {
                    return yield* Effect.fail(EmergencyRequestNotFoundError.make({ requestId }));
                }

                const pacienteConfirmed = yield* repository.hasPacienteConfirmed(
                    requestId,
                    request.paciente.id
                );

                const isApproved =
                    request.confirmationsReceived >= request.confirmationsNeeded &&
                    pacienteConfirmed;

                return {
                    isApproved,
                    confirmationsReceived: request.confirmationsReceived,
                    confirmationsNeeded: request.confirmationsNeeded,
                    pacienteConfirmed,
                };
            });

            const approveEmergencyRequest = Effect.fn('CorabastosManager.approveEmergencyRequest')(
                function* (requestId: string) {
                    yield* repository.updateEmergencyRequestStatus(requestId, 'approved');
                }
            );

            const rejectEmergencyRequest = Effect.fn('CorabastosManager.rejectEmergencyRequest')(
                function* (requestId: string) {
                    yield* repository.updateEmergencyRequestStatus(requestId, 'rejected');
                }
            );

            const getPendingEmergencyRequests = Effect.fn(
                'CorabastosManager.getPendingEmergencyRequests'
            )(function* () {
                const requestRows = yield* repository.getPendingEmergencyRequests();
                return requestRows.map(mapEmergencyRequestRowToRequest);
            });

            // Channel helpers
            const findGeneralChannel = Effect.fn('CorabastosManager.findGeneralChannel')(function* (
                guild: Guild
            ) {
                return yield* Effect.succeed(findGeneralChannelIn(guild));
            });

            const getStats = Effect.fn('CorabastosManager.getStats')(function* () {
                return yield* repository.getStats();
            });

            // Turno notification helpers
            const sendNoAgendaEncouragementNotification = Effect.fn(
                'CorabastosManager.sendNoAgendaEncouragement'
            )(function* (generalChannel: TextChannel) {
                const embed = new EmbedBuilder()
                    .setTitle('📝 ¡Agenda Vacía para el Corabastos de Hoy!')
                    .setDescription(
                        '¡El corabastos comienza en **10 minutos** pero aún no hay temas en la agenda!\n\n' +
                            '🚀 **¡Es una oportunidad perfecta para participar!**'
                    )
                    .setColor(0xffa500)
                    .addFields(
                        {
                            name: '💡 ¿Qué puedes hacer?',
                            value:
                                '• Agregar un tema con `/corabastos-agenda agregar`\n' +
                                '• Compartir una pregunta o consulta\n' +
                                '• Proponer una discusión interesante\n' +
                                '• ¡Cualquier tema es bienvenido!',
                            inline: false,
                        },
                        {
                            name: '⏰ ¿Cuándo?',
                            value:
                                '• **Turno 0**: 12:00 PM (¡perfecto para empezar!)\n' +
                                '• **Turno 1**: 1:00 PM\n' +
                                '• **Turno 2**: 2:00 PM\n' +
                                '• Y así hasta las 10:00 PM',
                            inline: true,
                        },
                        {
                            name: '🎯 Beneficios',
                            value:
                                '• Recibirás notificación DM a tu hora\n' +
                                '• Tu tema aparecerá en @everyone\n' +
                                '• ¡La comunidad te ayudará!',
                            inline: true,
                        }
                    )
                    .addFields({
                        name: '📍 Recordatorio',
                        value:
                            '**Canal de voz:** corabastos\n' +
                            '**Inicio:** En 10 minutos (12:00 PM)\n' +
                            '**Duración:** ¡Los turnos que necesites!',
                        inline: false,
                    })
                    .setFooter({
                        text: '¡Los temas se pueden agregar incluso durante el corabastos!',
                    })
                    .setTimestamp();

                yield* discordCall('channel.send', () => generalChannel.send({ embeds: [embed] }));
            });

            const sendPreSessionAgendaNotification = Effect.fn(
                'CorabastosManager.sendPreSessionAgendaNotification'
            )(function* (session: CorabastosSession) {
                const now = dayjs().tz('America/Bogota');
                const today = now.startOf('day').toDate();

                // Turno -1 tracks the pre-session notification
                if (yield* repository.hasNotificationBeenSent(session.id, -1, today)) {
                    return;
                }

                const guild = client.guilds.cache.first();
                if (!guild) return;

                const generalChannel = findGeneralChannelIn(guild);
                if (!generalChannel) return;

                const agendaRows = yield* repository.getSessionAgenda(session.id);
                const confirmedItems = agendaRows.filter(item => item.status === 'confirmed');

                if (confirmedItems.length === 0) {
                    yield* sendNoAgendaEncouragementNotification(generalChannel);
                    yield* repository.markNotificationSent(session.id, -1, today);
                    yield* Effect.logInfo('Sent no-agenda encouragement notification');
                    return;
                }

                const itemsByTurno = new Map<number, CorabastosAgendaRow[]>();
                for (const item of confirmedItems) {
                    const turnoItems = itemsByTurno.get(item.turno) ?? [];
                    turnoItems.push(item);
                    itemsByTurno.set(item.turno, turnoItems);
                }

                const embed = new EmbedBuilder()
                    .setTitle('📅 Agenda del Corabastos de Hoy')
                    .setDescription(
                        '¡El corabastos comienza en **10 minutos**! Aquí está la agenda completa del día:'
                    )
                    .setColor(0x00ff00)
                    .setTimestamp();

                const sortedTurnos = [...itemsByTurno.keys()].sort((a, b) => a - b);
                for (const turno of sortedTurnos) {
                    const items = itemsByTurno.get(turno);
                    if (!items) continue;

                    const timeStr = turno === 0 ? '12:00 PM' : `${turno}:00 PM`;
                    const itemsList = items
                        .map(
                            (item, index) =>
                                `${index + 1}. **${item.topic}**${
                                    item.description ? ` - ${item.description}` : ''
                                }`
                        )
                        .join('\n');

                    embed.addFields({
                        name: `🕐 Turno ${turno} (${timeStr})`,
                        value: itemsList,
                        inline: false,
                    });
                }

                embed.addFields(
                    {
                        name: '📍 Ubicación',
                        value: 'Canal de voz **corabastos**',
                        inline: true,
                    },
                    {
                        name: '⏰ Inicio',
                        value: 'En **10 minutos** (12:00 PM)',
                        inline: true,
                    }
                );

                yield* discordCall('channel.send', () => generalChannel.send({ embeds: [embed] }));
                yield* repository.markNotificationSent(session.id, -1, today);

                yield* Effect.logInfo(
                    `Sent pre-session agenda notification for ${confirmedItems.length} agenda items`
                );
            });

            const sendTurnoChannelNotification = Effect.fn(
                'CorabastosManager.sendTurnoChannelNotification'
            )(function* (turno: number, items: ReadonlyArray<CorabastosAgendaRow>) {
                const guild = client.guilds.cache.first();
                if (!guild) return;

                const generalChannel = findGeneralChannelIn(guild);
                if (!generalChannel) return;

                const timeStr = turno === 0 ? '12:00 PM' : `${turno}:00 PM`;

                const embed = new EmbedBuilder()
                    .setTitle(`🔔 Turno ${turno} - ${timeStr}`)
                    .setDescription(
                        `Es hora del **Turno ${turno}** del corabastos. Los siguientes temas están programados:`
                    )
                    .setColor(0x0099ff)
                    .setTimestamp();

                items.forEach((item, index) => {
                    embed.addFields({
                        name: `📝 Tema ${index + 1}`,
                        value: `**${item.topic}**${
                            item.description ? `\n${item.description}` : ''
                        }`,
                        inline: false,
                    });
                });

                embed.addFields({
                    name: '📍 Ubicación',
                    value: 'Únanse al canal de voz **corabastos** para participar',
                    inline: false,
                });

                yield* discordCall('channel.send', () =>
                    generalChannel.send({ content: '@everyone', embeds: [embed] })
                );
            });

            const sendTurnoDMNotifications = Effect.fn(
                'CorabastosManager.sendTurnoDMNotifications'
            )(function* (turno: number, items: ReadonlyArray<CorabastosAgendaRow>) {
                const timeStr = turno === 0 ? '12:00 PM' : `${turno}:00 PM`;

                for (const item of items) {
                    yield* Effect.gen(function* () {
                        const user = yield* discordCall('users.fetch', () =>
                            client.users.fetch(item.user_id)
                        );

                        const embed = new EmbedBuilder()
                            .setTitle(`⏰ Recordatorio de Corabastos - Turno ${turno}`)
                            .setDescription(
                                `¡Es hora de tu tema en el corabastos!\n\n` +
                                    `**Tu tema:** ${item.topic}\n` +
                                    `**Turno:** ${turno} (${timeStr})\n` +
                                    `**Ubicación:** Canal de voz corabastos`
                            )
                            .setColor(0x00ff00)
                            .setTimestamp();

                        if (item.description) {
                            embed.addFields({
                                name: '📋 Descripción',
                                value: item.description,
                                inline: false,
                            });
                        }

                        embed.addFields({
                            name: '💡 Recordatorio',
                            value: 'Únete al canal de voz **corabastos** para presentar tu tema.',
                            inline: false,
                        });

                        yield* discordCall('user.send', () => user.send({ embeds: [embed] }));
                        yield* Effect.logInfo(
                            `Sent DM notification to user ${user.username} for turno ${turno}`
                        );
                    }).pipe(
                        Effect.catchCause(cause =>
                            Effect.logError(`Failed to send DM to user ${item.user_id}:`, cause)
                        )
                    );
                }
            });

            const processActiveSessionTurnos = Effect.fn(
                'CorabastosManager.processActiveSessionTurnos'
            )(function* () {
                const session = yield* getCurrentWeekSession();
                if (session?.status !== 'scheduled') {
                    yield* Effect.logDebug(
                        `processActiveSessionTurnos: no scheduled session found or session status is ${session?.status}`
                    );
                    return;
                }

                const now = dayjs().tz('America/Bogota');
                const currentHour = now.hour();
                const currentMinute = now.minute();

                // Corabastos sessions only happen on Fridays (day 5)
                if (now.day() !== 5) {
                    yield* Effect.logDebug(
                        `processActiveSessionTurnos: not Friday (current day: ${now.day()}), skipping`
                    );
                    return;
                }

                // Pre-session agenda notification at 11:50 AM
                if (currentHour === 11 && currentMinute === 50) {
                    yield* Effect.logInfo(
                        'processActiveSessionTurnos: pre-session notification time (11:50 AM)'
                    );
                    yield* sendPreSessionAgendaNotification(session);
                    return;
                }

                if (currentMinute !== 0) {
                    yield* Effect.logDebug(
                        `processActiveSessionTurnos: not at minute 0 (current minute: ${currentMinute}), skipping`
                    );
                    return;
                }

                if (currentHour < 12 || currentHour > 22) {
                    yield* Effect.logDebug(
                        `processActiveSessionTurnos: not in valid turno time (current hour: ${currentHour}), skipping`
                    );
                    return;
                }

                const currentTurno = currentHour - 12;
                yield* Effect.logInfo(
                    `processActiveSessionTurnos: processing turno ${currentTurno} at ${currentHour}:${currentMinute}`
                );

                const agendaRows = yield* repository.getSessionAgenda(session.id);
                const currentTurnoItems = agendaRows.filter(
                    item => item.turno === currentTurno && item.status === 'confirmed'
                );

                if (currentTurnoItems.length === 0) {
                    yield* Effect.logDebug(
                        `processActiveSessionTurnos: no confirmed agenda items for turno ${currentTurno}, skipping`
                    );
                    return;
                }

                const today = now.startOf('day').toDate();
                const alreadyNotified = yield* repository.hasNotificationBeenSent(
                    session.id,
                    currentTurno,
                    today
                );
                if (alreadyNotified) {
                    yield* Effect.logDebug(
                        `processActiveSessionTurnos: notification already sent for turno ${currentTurno} today`
                    );
                    return;
                }

                yield* sendTurnoChannelNotification(currentTurno, currentTurnoItems);
                yield* sendTurnoDMNotifications(currentTurno, currentTurnoItems);
                yield* repository.markNotificationSent(session.id, currentTurno, today);

                yield* Effect.logInfo(
                    `Sent turno ${currentTurno} notifications for ${currentTurnoItems.length} agenda items`
                );
            });

            // Automatic weekly session creation
            const createWeeklySessionIfNeeded = Effect.fn(
                'CorabastosManager.createWeeklySessionIfNeeded'
            )(function* () {
                yield* Effect.logInfo(
                    'Checking if weekly corabastos session needs to be created...'
                );

                const existingSession = yield* getCurrentWeekSession();
                if (existingSession) {
                    yield* Effect.logInfo(
                        `Weekly session already exists for current week: ${existingSession.id}`
                    );
                    return;
                }

                const { weekStart, weekEnd } = getCurrentWeekRange();
                const scheduledTime = getNextFridayAtNoon();

                yield* Effect.logInfo(
                    `Creating new weekly corabastos session: ${weekStart.toISOString()} to ${weekEnd.toISOString()}, scheduled ${scheduledTime.toISOString()}`
                );

                const sessionRow = yield* repository.createSession(
                    weekStart,
                    weekEnd,
                    'regular',
                    scheduledTime,
                    client.user
                );
                const session = mapSessionRowToSession(sessionRow);

                yield* Effect.logInfo(`Created weekly corabastos session: ${session.id}`);

                const guild = client.guilds.cache.first();
                if (guild) {
                    const generalChannel = findGeneralChannelIn(guild);
                    if (generalChannel) {
                        const scheduledTimeFormatted = dayjs(scheduledTime)
                            .tz('America/Bogota')
                            .format('dddd, MMM DD [at] h:mm A');

                        yield* discordCall('channel.send', () =>
                            generalChannel.send({
                                content:
                                    `📅 **Nueva semana, nuevo Corabastos!**\n\n` +
                                    `Se ha creado automáticamente la sesión de corabastos para esta semana.\n` +
                                    `📍 **Programado para:** ${scheduledTimeFormatted}\n\n` +
                                    `¡Usa \`/corabastos-agenda agregar\` para añadir temas a la agenda!`,
                            })
                        );

                        yield* Effect.logInfo(
                            'Posted weekly session announcement to general channel'
                        );
                    }
                }
            });

            // Cleanup
            const cleanupExpiredRequests = Effect.fn('CorabastosManager.cleanupExpiredRequests')(
                function* () {
                    return yield* repository.cleanupExpiredEmergencyRequests();
                }
            );

            const cleanupOldNotifications = Effect.fn('CorabastosManager.cleanupOldNotifications')(
                function* (daysOld: number = 7) {
                    return yield* repository.cleanupOldNotifications(daysOld);
                }
            );

            return {
                getCurrentWeekSession,
                getOrCreateCurrentWeekSession,
                createEmergencySession,
                addAgendaItem,
                confirmAgendaItem,
                cancelAgendaItem,
                getSessionAgenda,
                getCurrentWeekAgenda,
                createEmergencyRequest,
                updateEmergencyRequestMessage,
                addEmergencyConfirmation,
                getEmergencyRequest,
                checkEmergencyRequestApproval,
                approveEmergencyRequest,
                rejectEmergencyRequest,
                getPendingEmergencyRequests,
                findGeneralChannel,
                getStats,
                processActiveSessionTurnos,
                sendPreSessionAgendaNotification,
                createWeeklySessionIfNeeded,
                cleanupExpiredRequests,
                cleanupOldNotifications,
            } as const;
        }),
    }
) {
    static readonly layer = Layer.effect(CorabastosManager)(CorabastosManager.make);
}
