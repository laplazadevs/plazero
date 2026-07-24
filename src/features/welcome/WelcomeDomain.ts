import type { PlazeroUser } from '../../domain/User.js';

export interface WelcomeData {
    id: string;
    user: PlazeroUser;
    joinTime: Date;
    linkedinUrl?: string;
    presentation?: string;
    invitedBy?: string;
    messageId: string;
    channelId: string;
    approved: boolean;
    approvedBy?: PlazeroUser;
    approvedAt?: Date;
}

export const WELCOME_CHANNEL_NAME = '👋︱nuevos';
export const WELCOME_ROLE_NAME = 'One Of Us';
