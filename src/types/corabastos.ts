import type { PlazeroUser } from './user.js';

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

// Utility types for commands and interactions
export interface AgendaAddParams {
    turno: number;
    topic: string;
    description?: string;
}

export interface EmergencyRequestParams {
    reason: string;
    paciente: PlazeroUser;
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
