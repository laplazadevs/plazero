import { User } from 'discord.js';

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
    createdBy: User;
    createdAt: Date;
    updatedAt: Date;
}

export interface CorabastosAgendaItem {
    id: string;
    sessionId: string;
    user: User;
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
    requestedBy: User;
    reason: string;
    paciente: User;
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

export interface CorabastosEmergencyConfirmation {
    id: number;
    requestId: string;
    user: User;
    confirmedAt: Date;
}

export interface CorabastosAttendance {
    id: number;
    sessionId: string;
    user: User;
    joinedAt: Date;
    leftAt?: Date;
    totalDuration?: number; // In minutes
}

// Database row interfaces for repository layer
export interface CorabastosSessionData {
    id: string;
    week_start: Date;
    week_end: Date;
    scheduled_time?: Date;
    status: 'scheduled' | 'active' | 'completed' | 'cancelled';
    type: 'regular' | 'emergency';
    channel_id?: string;
    announcement_message_id?: string;
    announcement_channel_id?: string;
    created_by_id: string;
    created_at: Date;
    updated_at: Date;
}

export interface CorabastosAgendaData {
    id: string;
    session_id: string;
    user_id: string;
    turno: number;
    topic: string;
    description?: string;
    status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
    confirmation_message_id?: string;
    order_index: number;
    created_at: Date;
    updated_at: Date;
}

export interface CorabastosEmergencyRequestData {
    id: string;
    requested_by_id: string;
    reason: string;
    paciente_id: string;
    status: 'pending' | 'approved' | 'rejected' | 'cancelled';
    confirmation_message_id?: string;
    confirmations_needed: number;
    confirmations_received: number;
    expires_at?: Date;
    approved_at?: Date;
    session_id?: string;
    created_at: Date;
    updated_at: Date;
}

export interface CorabastosEmergencyConfirmationData {
    id: number;
    request_id: string;
    user_id: string;
    confirmed_at: Date;
}

export interface CorabastosAttendanceData {
    id: number;
    session_id: string;
    user_id: string;
    joined_at: Date;
    left_at?: Date;
    total_duration?: number;
}

// Utility types for commands and interactions
export interface AgendaAddParams {
    turno: number;
    topic: string;
    description?: string;
}

export interface EmergencyRequestParams {
    reason: string;
    paciente: User;
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
    return TURNO_LABELS[turno as TurnoNumber] || `${12 + turno}:00 PM`;
}

export function isValidTurno(turno: number): turno is TurnoNumber {
    return turno >= 0 && turno <= 8;
}
