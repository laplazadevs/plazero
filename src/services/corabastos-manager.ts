import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone.js';
import { EmbedBuilder, Guild, TextChannel, User, VoiceChannel } from 'discord.js';

import {
    CORABASTOS_FRIDAY_HOUR,
    CORABASTOS_VOICE_CHANNEL_NAME,
    GENERAL_CHANNEL_NAME,
} from '../config/constants.js';
import { CorabastosRepository } from '../repositories/corabastos-repository.js';
import {
    CorabastosAgendaData,
    CorabastosAgendaItem,
    CorabastosEmergencyRequest,
    CorabastosEmergencyRequestData,
    CorabastosSession,
    CorabastosSessionData,
    CorabastosStats,
    isValidTurno,
} from '../types/corabastos.js';

dayjs.extend(timezone);

export class CorabastosManager {
    private repository: CorabastosRepository;

    constructor() {
        this.repository = new CorabastosRepository();
    }

    // Session management
    public async getCurrentWeekSession(): Promise<CorabastosSession | null> {
        const sessionData = await this.repository.getCurrentWeekSession();
        return sessionData ? this.mapSessionDataToSession(sessionData) : null;
    }

    public async getOrCreateCurrentWeekSession(createdBy?: User): Promise<CorabastosSession> {
        let session = await this.getCurrentWeekSession();

        if (!session) {
            const { weekStart, weekEnd } = this.getCurrentWeekRange();
            const scheduledTime = this.getNextFridayAtNoon();

            const sessionData = await this.repository.createSession(
                weekStart,
                weekEnd,
                'regular',
                scheduledTime,
                createdBy
            );

            session = this.mapSessionDataToSession(sessionData);
        }

        return session;
    }

    public async createEmergencySession(
        emergencyRequest: CorabastosEmergencyRequest,
        createdBy: User
    ): Promise<CorabastosSession> {
        const now = dayjs().tz('America/Bogota');
        const weekStart = now.startOf('week').utc().toDate();
        const weekEnd = now.endOf('week').utc().toDate();

        const sessionData = await this.repository.createSession(
            weekStart,
            weekEnd,
            'emergency',
            now.utc().toDate(),
            createdBy
        );

        // Link emergency request to session
        await this.repository.linkEmergencyToSession(emergencyRequest.id, sessionData.id);

        return this.mapSessionDataToSession(sessionData);
    }

    // Agenda management
    public async addAgendaItem(
        user: User,
        turno: number,
        topic: string,
        description?: string
    ): Promise<{ agendaItem: CorabastosAgendaItem; session: CorabastosSession }> {
        if (!isValidTurno(turno)) {
            throw new Error(`Turno inválido: ${turno}. Debe estar entre 0 y 8.`);
        }

        const session = await this.getOrCreateCurrentWeekSession(user);

        // Check if user already has this topic in this turno
        const existingItems = await this.repository.getUserAgendaItems(session.id, user.id);
        const duplicateItem = existingItems.find(
            item => item.turno === turno && item.topic.toLowerCase() === topic.toLowerCase()
        );

        if (duplicateItem) {
            throw new Error('Ya tienes un tema similar agendado para este turno.');
        }

        const agendaData = await this.repository.addAgendaItem(
            session.id,
            user,
            turno,
            topic,
            description
        );
        const agendaItem = await this.mapAgendaDataToItem(agendaData);

        return { agendaItem, session };
    }

    public async confirmAgendaItem(agendaId: string, messageId: string): Promise<void> {
        await this.repository.confirmAgendaItem(agendaId, messageId);
    }

    public async cancelAgendaItem(agendaId: string): Promise<void> {
        await this.repository.cancelAgendaItem(agendaId);
    }

    public async getSessionAgenda(sessionId: string): Promise<CorabastosAgendaItem[]> {
        const agendaData = await this.repository.getSessionAgenda(sessionId);
        return await Promise.all(agendaData.map(data => this.mapAgendaDataToItem(data)));
    }

    public async getCurrentWeekAgenda(): Promise<CorabastosAgendaItem[]> {
        const session = await this.getCurrentWeekSession();
        if (!session) {
            return [];
        }
        return await this.getSessionAgenda(session.id);
    }

    // Emergency request management
    public async createEmergencyRequest(
        user: User,
        reason: string,
        paciente: User
    ): Promise<CorabastosEmergencyRequest> {
        // Check if user has pending emergency requests
        const pendingRequests = await this.repository.getPendingEmergencyRequests();
        const userPendingRequest = pendingRequests.find(req => req.requested_by_id === user.id);

        if (userPendingRequest) {
            throw new Error('Ya tienes una solicitud de corabastos de emergencia pendiente.');
        }

        const requestData = await this.repository.createEmergencyRequest(user, reason, paciente);
        return this.mapEmergencyRequestDataToRequest(requestData);
    }

    public async updateEmergencyRequestMessage(
        requestId: string,
        messageId: string
    ): Promise<void> {
        await this.repository.updateEmergencyRequestMessage(requestId, messageId);
    }

    public async addEmergencyConfirmation(requestId: string, user: User): Promise<boolean> {
        return await this.repository.addEmergencyConfirmation(requestId, user);
    }

    public async getEmergencyRequest(
        requestId: string
    ): Promise<CorabastosEmergencyRequest | null> {
        const requestData = await this.repository.getEmergencyRequest(requestId);
        return requestData ? this.mapEmergencyRequestDataToRequest(requestData) : null;
    }

    public async checkEmergencyRequestApproval(requestId: string): Promise<{
        isApproved: boolean;
        confirmationsReceived: number;
        confirmationsNeeded: number;
        pacienteConfirmed: boolean;
    }> {
        const request = await this.getEmergencyRequest(requestId);
        if (!request) {
            throw new Error('Solicitud de emergencia no encontrada.');
        }

        // Check if the paciente has confirmed
        const pacienteConfirmed = await this.repository.hasPacienteConfirmed(
            requestId,
            request.paciente.id
        );

        // Both conditions must be met: enough confirmations AND paciente confirmed
        const isApproved =
            request.confirmationsReceived >= request.confirmationsNeeded && pacienteConfirmed;

        return {
            isApproved,
            confirmationsReceived: request.confirmationsReceived,
            confirmationsNeeded: request.confirmationsNeeded,
            pacienteConfirmed,
        };
    }

    public async approveEmergencyRequest(requestId: string): Promise<void> {
        await this.repository.updateEmergencyRequestStatus(requestId, 'approved');
    }

    public async rejectEmergencyRequest(requestId: string): Promise<void> {
        await this.repository.updateEmergencyRequestStatus(requestId, 'rejected');
    }

    public async getPendingEmergencyRequests(): Promise<CorabastosEmergencyRequest[]> {
        const requestsData = await this.repository.getPendingEmergencyRequests();
        return requestsData.map(data => this.mapEmergencyRequestDataToRequest(data));
    }

    // Channel management helpers
    public async findCorabastosVoiceChannel(guild: Guild): Promise<VoiceChannel | null> {
        const channel = guild.channels.cache.find(
            ch =>
                ch.isVoiceBased() &&
                ch.name.toLowerCase().includes(CORABASTOS_VOICE_CHANNEL_NAME.toLowerCase())
        ) as VoiceChannel;

        return channel || null;
    }

    public async findGeneralChannel(guild: Guild): Promise<TextChannel | null> {
        const channel = guild.channels.cache.find(
            ch =>
                ch.isTextBased() &&
                ch.name.toLowerCase().includes(GENERAL_CHANNEL_NAME.toLowerCase())
        ) as TextChannel;

        return channel || null;
    }

    // Statistics
    public async getStats(): Promise<CorabastosStats> {
        return await this.repository.getStats();
    }

    // Turno notification system
    public async processActiveSessionTurnos(client: any): Promise<void> {
        const session = await this.getCurrentWeekSession();
        if (!session || session.status !== 'scheduled') {
            return; // Only process scheduled sessions
        }

        const now = dayjs().tz('America/Bogota');
        const currentHour = now.hour();
        const currentMinute = now.minute();

        // Only process notifications on Fridays (day 5)
        // Corabastos sessions are meant to happen only on Fridays
        if (now.day() !== 5) {
            return;
        }

        // Check for pre-session agenda notification (11:50 AM - 10 minutes before Turno 0)
        if (currentHour === 11 && currentMinute === 50) {
            await this.sendPreSessionAgendaNotification(client, session);
            return;
        }

        // Only process turno notifications at the exact start of each hour (minute 0)
        if (currentMinute !== 0) {
            return;
        }

        // Check if we're in a valid turno time (12 PM to 10 PM)
        if (currentHour < 12 || currentHour > 22) {
            return;
        }

        const currentTurno = currentHour - 12; // Turno 0 = 12 PM, Turno 1 = 1 PM, etc.

        // Get agenda items for current turno
        const agendaItems = await this.repository.getSessionAgenda(session.id);
        const currentTurnoItems = agendaItems.filter(
            item => item.turno === currentTurno && item.status === 'confirmed'
        );

        if (currentTurnoItems.length === 0) {
            return;
        }

        // Check if we already notified for this turno today
        const today = now.startOf('day').toDate();
        if (await this.repository.hasNotificationBeenSent(session.id, currentTurno, today)) {
            return;
        }

        try {
            // Send channel notification
            await this.sendTurnoChannelNotification(
                client,
                session,
                currentTurno,
                currentTurnoItems
            );

            // Send DM notifications to agenda submitters
            await this.sendTurnoDMNotifications(client, currentTurno, currentTurnoItems);

            // Mark notification as sent
            await this.repository.markNotificationSent(session.id, currentTurno, today);

            console.log(
                `Sent turno ${currentTurno} notifications for ${currentTurnoItems.length} agenda items`
            );
        } catch (error) {
            console.error(`Error processing turno ${currentTurno} notifications:`, error);
        }
    }

    private async sendPreSessionAgendaNotification(
        client: any,
        session: CorabastosSession
    ): Promise<void> {
        // Check if we already sent the pre-session notification today
        const now = dayjs().tz('America/Bogota');
        const today = now.startOf('day').toDate();

        // Use a special turno number (-1) to track pre-session notifications
        if (await this.repository.hasNotificationBeenSent(session.id, -1, today)) {
            return;
        }

        try {
            // Find general channel first
            const guild = client.guilds.cache.first();
            if (!guild) return;

            const generalChannel = await this.findGeneralChannel(guild);
            if (!generalChannel) return;

            // Get all confirmed agenda items for today
            const agendaItems = await this.repository.getSessionAgenda(session.id);
            const confirmedItems = agendaItems.filter(item => item.status === 'confirmed');

            if (confirmedItems.length === 0) {
                // Send encouragement notification when no agenda items
                await this.sendNoAgendaEncouragementNotification(generalChannel);
                await this.repository.markNotificationSent(session.id, -1, today);
                console.log('Sent no-agenda encouragement notification');
                return;
            }

            // Group items by turno
            const itemsByTurno = new Map<number, CorabastosAgendaData[]>();
            confirmedItems.forEach(item => {
                if (!itemsByTurno.has(item.turno)) {
                    itemsByTurno.set(item.turno, []);
                }
                const turnoItems = itemsByTurno.get(item.turno);
                if (turnoItems) {
                    turnoItems.push(item);
                }
            });

            // Create agenda preview embed
            const embed = new EmbedBuilder()
                .setTitle('📅 Agenda del Corabastos de Hoy')
                .setDescription(
                    '¡El corabastos comienza en **10 minutos**! Aquí está la agenda completa del día:'
                )
                .setColor(0x00ff00)
                .setTimestamp();

            // Add fields for each turno with items
            const sortedTurnos = Array.from(itemsByTurno.keys()).sort((a, b) => a - b);

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

            // Send the notification (no @everyone for pre-session)
            await generalChannel.send({ embeds: [embed] });

            // Mark pre-session notification as sent
            await this.repository.markNotificationSent(session.id, -1, today);

            console.log(
                `Sent pre-session agenda notification for ${confirmedItems.length} agenda items`
            );
        } catch (error) {
            console.error('Error sending pre-session agenda notification:', error);
        }
    }

    private async sendNoAgendaEncouragementNotification(generalChannel: any): Promise<void> {
        const embed = new EmbedBuilder()
            .setTitle('📝 ¡Agenda Vacía para el Corabastos de Hoy!')
            .setDescription(
                '¡El corabastos comienza en **10 minutos** pero aún no hay temas en la agenda!\n\n' +
                    '🚀 **¡Es una oportunidad perfecta para participar!**'
            )
            .setColor(0xffa500) // Orange color for encouragement
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

        await generalChannel.send({ embeds: [embed] });
    }

    private async sendTurnoChannelNotification(
        client: any,
        session: CorabastosSession,
        turno: number,
        items: CorabastosAgendaData[]
    ): Promise<void> {
        // Find general channel to send notification
        const guild = client.guilds.cache.first();
        if (!guild) return;

        const generalChannel = await this.findGeneralChannel(guild);
        if (!generalChannel) return;

        const timeStr = turno === 0 ? '12:00 PM' : `${turno}:00 PM`;

        const embed = new EmbedBuilder()
            .setTitle(`🔔 Turno ${turno} - ${timeStr}`)
            .setDescription(
                `Es hora del **Turno ${turno}** del corabastos. Los siguientes temas están programados:`
            )
            .setColor(0x0099ff)
            .setTimestamp();

        // Add each agenda item as a field
        items.forEach((item, index) => {
            embed.addFields({
                name: `📝 Tema ${index + 1}`,
                value: `**${item.topic}**${item.description ? `\n${item.description}` : ''}`,
                inline: false,
            });
        });

        embed.addFields({
            name: '📍 Ubicación',
            value: 'Únanse al canal de voz **corabastos** para participar',
            inline: false,
        });

        await generalChannel.send({
            content: '@everyone',
            embeds: [embed],
        });
    }

    private async sendTurnoDMNotifications(
        client: any,
        turno: number,
        items: CorabastosAgendaData[]
    ): Promise<void> {
        const timeStr = turno === 0 ? '12:00 PM' : `${turno}:00 PM`;

        for (const item of items) {
            try {
                const user = await client.users.fetch(item.user_id);
                if (!user) continue;

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

                await user.send({ embeds: [embed] });
                console.log(`Sent DM notification to user ${user.username} for turno ${turno}`);
            } catch (error) {
                console.error(`Failed to send DM to user ${item.user_id}:`, error);
                // Continue with other notifications even if one fails
            }
        }
    }

    // Utility methods
    private getCurrentWeekRange(): { weekStart: Date; weekEnd: Date } {
        const now = dayjs().tz('America/Bogota');
        const weekStart = now.startOf('week').utc().toDate(); // Monday
        const weekEnd = now.endOf('week').utc().toDate(); // Sunday

        return { weekStart, weekEnd };
    }

    private getNextFridayAtNoon(): Date {
        const now = dayjs().tz('America/Bogota');
        const currentWeekFriday = now
            .startOf('week')
            .add(4, 'day')
            .hour(CORABASTOS_FRIDAY_HOUR)
            .minute(0)
            .second(0)
            .millisecond(0);

        // If current week's Friday hasn't passed yet, use it
        if (currentWeekFriday.isAfter(now)) {
            return currentWeekFriday.utc().toDate();
        }

        // Otherwise, use next week's Friday
        return currentWeekFriday.add(1, 'week').utc().toDate();
    }

    // Automatic weekly session creation
    public async createWeeklySessionIfNeeded(client: any): Promise<void> {
        try {
            console.log('Checking if weekly corabastos session needs to be created...');

            // Check if there's already a session for the current week
            const existingSession = await this.getCurrentWeekSession();
            if (existingSession) {
                console.log(
                    `Weekly session already exists for current week: ${existingSession.id}`
                );
                return;
            }

            // Create the bot user for session creation
            const botUser = client.user;
            if (!botUser) {
                console.warn('Bot user not available for session creation');
                return;
            }

            // Create new weekly session
            const { weekStart, weekEnd } = this.getCurrentWeekRange();
            const scheduledTime = this.getNextFridayAtNoon();

            console.log(`Creating new weekly corabastos session:`);
            console.log(`- Week: ${weekStart.toISOString()} to ${weekEnd.toISOString()}`);
            console.log(`- Scheduled: ${scheduledTime.toISOString()}`);

            const sessionData = await this.repository.createSession(
                weekStart,
                weekEnd,
                'regular',
                scheduledTime,
                botUser
            );

            const session = this.mapSessionDataToSession(sessionData);

            console.log(`✅ Created weekly corabastos session: ${session.id}`);

            // Optionally announce the new session in general channel
            const guild = client.guilds.cache.first();
            if (guild) {
                const generalChannel = await this.findGeneralChannel(guild);
                if (generalChannel) {
                    const scheduledTimeFormatted = dayjs(scheduledTime)
                        .tz('America/Bogota')
                        .format('dddd, MMM DD [at] h:mm A');

                    await generalChannel.send({
                        content:
                            `📅 **Nueva semana, nuevo Corabastos!**\n\n` +
                            `Se ha creado automáticamente la sesión de corabastos para esta semana.\n` +
                            `📍 **Programado para:** ${scheduledTimeFormatted}\n\n` +
                            `¡Usa \`/corabastos-agenda agregar\` para añadir temas a la agenda!`,
                    });

                    console.log('Posted weekly session announcement to general channel');
                }
            }
        } catch (error) {
            console.error('Error creating weekly corabastos session:', error);
        }
    }

    // Manual trigger for testing - can be called via admin command if needed
    public async forceCreateWeeklySession(client: any): Promise<CorabastosSession | null> {
        try {
            console.log('Force creating weekly corabastos session...');

            const botUser = client.user;
            if (!botUser) {
                console.warn('Bot user not available for session creation');
                return null;
            }

            const { weekStart, weekEnd } = this.getCurrentWeekRange();
            const scheduledTime = this.getNextFridayAtNoon();

            const sessionData = await this.repository.createSession(
                weekStart,
                weekEnd,
                'regular',
                scheduledTime,
                botUser
            );

            const session = this.mapSessionDataToSession(sessionData);
            console.log(`✅ Force created weekly corabastos session: ${session.id}`);

            return session;
        } catch (error) {
            console.error('Error force creating weekly corabastos session:', error);
            return null;
        }
    }

    // Mapping functions
    private mapSessionDataToSession(data: CorabastosSessionData): CorabastosSession {
        return {
            id: data.id,
            weekStart: data.week_start,
            weekEnd: data.week_end,
            scheduledTime: data.scheduled_time,
            status: data.status,
            type: data.type,
            channelId: data.channel_id,
            announcementMessageId: data.announcement_message_id,
            announcementChannelId: data.announcement_channel_id,
            createdBy: { id: data.created_by_id } as User, // Minimal user object
            createdAt: data.created_at,
            updatedAt: data.updated_at,
        };
    }

    private async mapAgendaDataToItem(data: CorabastosAgendaData): Promise<CorabastosAgendaItem> {
        // Get user data from database to properly populate User object
        const userData = await this.repository.getUserData(data.user_id);

        // Create User object with proper data or fallback to minimal
        const user = userData
            ? ({
                  id: userData.id,
                  username: userData.username,
                  discriminator: userData.discriminator,
                  displayName: userData.username, // Use username as displayName fallback
                  displayAvatarURL: () => userData.avatar_url,
              } as User)
            : ({
                  id: data.user_id,
                  username: 'Unknown User',
                  displayName: 'Unknown User',
              } as User);

        return {
            id: data.id,
            sessionId: data.session_id,
            user: user,
            turno: data.turno,
            topic: data.topic,
            description: data.description,
            status: data.status,
            confirmationMessageId: data.confirmation_message_id,
            orderIndex: data.order_index,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
        };
    }

    private mapEmergencyRequestDataToRequest(
        data: CorabastosEmergencyRequestData
    ): CorabastosEmergencyRequest {
        return {
            id: data.id,
            requestedBy: { id: data.requested_by_id } as User, // Minimal user object
            reason: data.reason,
            paciente: { id: data.paciente_id } as User, // Minimal user object
            status: data.status,
            confirmationMessageId: data.confirmation_message_id,
            confirmationsNeeded: data.confirmations_needed,
            confirmationsReceived: data.confirmations_received,
            expiresAt: data.expires_at,
            approvedAt: data.approved_at,
            sessionId: data.session_id,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
        };
    }

    // Cleanup methods
    public async cleanupExpiredRequests(): Promise<number> {
        return await this.repository.cleanupExpiredEmergencyRequests();
    }

    public async cleanupOldNotifications(daysOld: number = 7): Promise<number> {
        return await this.repository.cleanupOldNotifications(daysOld);
    }

    public async cleanupOldSessions(daysOld: number = 90): Promise<number> {
        return await this.repository.cleanupOldSessions(daysOld);
    }
}
