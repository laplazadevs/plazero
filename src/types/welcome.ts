import type { PlazeroUser } from './user.js';

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

export interface WelcomeFormData {
    linkedinUrl: string;
    presentation: string;
    invitedBy: string;
}
