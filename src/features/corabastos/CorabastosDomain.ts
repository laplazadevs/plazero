import { Schema } from 'effect';

import type { PlazeroUser } from '../../domain/User.js';

export interface CorabastosSession {
    id: string;
    weekStart: Date;
    weekEnd: Date;
    scheduledTime?: Date;
    status: 'scheduled' | 'active' | 'completed' | 'cancelled';
    type: 'regular' | 'emergency';
    channelId?: string;
    announcementMessageId?: string;
    announcementChannelId?: string;
    createdBy: PlazeroUser;
    createdAt: Date;
    updatedAt: Date;
}

export interface CorabastosAgendaItem {
    id: string;
    sessionId: string;
    user: PlazeroUser;
    turno: number; // 0 = 12pm, 1 = 1pm, 2 = 2pm, etc.
    topic: string;
    description?: string;
    status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
    confirmationMessageId?: string;
    orderIndex: number;
    createdAt: Date;
    updatedAt: Date;
}

export interface CorabastosEmergencyRequest {
    id: string;
    requestedBy: PlazeroUser;
    reason: string;
    paciente: PlazeroUser;
    status: 'pending' | 'approved' | 'rejected' | 'cancelled';
    confirmationMessageId?: string;
    confirmationsNeeded: number;
    confirmationsReceived: number;
    expiresAt?: Date;
    approvedAt?: Date;
    sessionId?: string; // Created session if approved
    createdAt: Date;
    updatedAt: Date;
}

export interface CorabastosStats {
    totalSessions: number;
    activeSessions: number;
    totalAgendaItems: number;
    totalEmergencyRequests: number;
    thisWeekAgendaItems: number;
    emergencyRequestsPending: number;
}

// Constants for turnos (time slots)
export const TURNO_LABELS = {
    0: '12:00 PM',
    1: '1:00 PM',
    2: '2:00 PM',
    3: '3:00 PM',
    4: '4:00 PM',
    5: '5:00 PM',
    6: '6:00 PM',
    7: '7:00 PM',
    8: '8:00 PM',
} as const;

export type TurnoNumber = keyof typeof TURNO_LABELS;

export function getTurnoLabel(turno: number): string {
    return isValidTurno(turno) ? TURNO_LABELS[turno] : `${12 + turno}:00 PM`;
}

export function isValidTurno(turno: number): turno is TurnoNumber {
    return Number.isInteger(turno) && turno >= 0 && turno <= 8;
}

// Command names
export const CORABASTOS_AGENDA_COMMAND = 'corabastos-agenda';
export const CORABASTOS_EMERGENCY_COMMAND = 'corabastos-emergencia';
export const CORABASTOS_STATUS_COMMAND = 'corabastos-estado';
export const CORABASTOS_CREATE_SESSION_COMMAND = 'corabastos-crear-sesion';

// Corabastos configuration
export const CORABASTOS_FRIDAY_HOUR = 12; // 12 PM (noon)
export const CORABASTOS_EMERGENCY_CONFIRMATIONS_NEEDED = 10;
// NOTE: the repository currently hardcodes a 2h expiry for emergency requests;
// this declared value is the intended source of truth (known drift, fix pending).
export const CORABASTOS_EMERGENCY_EXPIRY_HOURS = 1;
export const CORABASTOS_CONFIRMATION_TIMEOUT_MS = 60 * 1000; // 60 seconds for agenda confirmations

// Corabastos emojis
export const CORABASTOS_CONFIRM_EMOJI = '✅';
export const CORABASTOS_CANCEL_EMOJI = '❌';
export const CORABASTOS_EMERGENCY_EMOJI = '🚨';
export const CORABASTOS_CALENDAR_EMOJI = '📅';
export const CORABASTOS_CLOCK_EMOJI = '🕐';

// Channel names
export const GENERAL_CHANNEL_NAME = '🗿︱general';

// Corabastos domain failures. Handlers translate these tags into the
// user-facing Spanish messages the bot has always shown.
export class InvalidTurnoError extends Schema.TaggedErrorClass<InvalidTurnoError>()(
    'InvalidTurnoError',
    { turno: Schema.Number }
) {}

export class DuplicateAgendaTopicError extends Schema.TaggedErrorClass<DuplicateAgendaTopicError>()(
    'DuplicateAgendaTopicError',
    { turno: Schema.Number, topic: Schema.String }
) {}

export class PendingEmergencyRequestError extends Schema.TaggedErrorClass<PendingEmergencyRequestError>()(
    'PendingEmergencyRequestError',
    { userId: Schema.String }
) {}

export class EmergencyRequestNotFoundError extends Schema.TaggedErrorClass<EmergencyRequestNotFoundError>()(
    'EmergencyRequestNotFoundError',
    { requestId: Schema.String }
) {}

export class SessionNotFoundError extends Schema.TaggedErrorClass<SessionNotFoundError>()(
    'SessionNotFoundError',
    {}
) {}

export const corabastosErrorMessage = (
    error:
        | InvalidTurnoError
        | DuplicateAgendaTopicError
        | PendingEmergencyRequestError
        | EmergencyRequestNotFoundError
        | SessionNotFoundError
): string => {
    switch (error._tag) {
        case 'InvalidTurnoError':
            return `Turno inválido: ${error.turno}. Debe estar entre 0 y 8.`;
        case 'DuplicateAgendaTopicError':
            return 'Ya tienes un tema similar agendado para este turno.';
        case 'PendingEmergencyRequestError':
            return 'Ya tienes una solicitud de corabastos de emergencia pendiente.';
        case 'EmergencyRequestNotFoundError':
            return 'Solicitud de emergencia no encontrada.';
        case 'SessionNotFoundError':
            return 'No se encontró la sesión actual.';
    }
};
