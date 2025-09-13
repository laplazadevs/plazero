import { User } from 'discord.js';

export interface WelcomeData {
    id: string;
    user: User;
    joinTime: Date;
    linkedinUrl?: string;
    presentation?: string;
    invitedBy?: string;
    messageId: string;
    channelId: string;
    approved: boolean;
    approvedBy?: User;
    approvedAt?: Date;
}

export interface WelcomeFormData {
    linkedinUrl: string;
    presentation: string;
    invitedBy: string;
}
