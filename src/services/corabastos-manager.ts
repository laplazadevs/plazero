import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone.js';
import { Guild, TextChannel, User, VoiceChannel } from 'discord.js';

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

    // Utility methods
    private getCurrentWeekRange(): { weekStart: Date; weekEnd: Date } {
        const now = dayjs().tz('America/Bogota');
        const weekStart = now.startOf('week').utc().toDate(); // Monday
        const weekEnd = now.endOf('week').utc().toDate(); // Sunday

        return { weekStart, weekEnd };
    }

    private getNextFridayAtNoon(): Date {
        const now = dayjs().tz('America/Bogota');
        let friday = now.day(5).hour(CORABASTOS_FRIDAY_HOUR).minute(0).second(0).millisecond(0);

        // If it's already past Friday noon this week, get next Friday
        if (friday.isBefore(now)) {
            friday = friday.add(1, 'week');
        }

        // Convert to UTC to ensure consistent database storage
        return friday.utc().toDate();
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

    public async cleanupOldSessions(daysOld: number = 90): Promise<number> {
        return await this.repository.cleanupOldSessions(daysOld);
    }
}
