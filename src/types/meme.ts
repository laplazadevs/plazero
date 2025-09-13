import { Message, User } from 'discord.js';

export interface MemeData {
    id: string;
    message: Message;
    author: User;
    reactionCount: number;
    contestType: 'meme' | 'bone';
    weekStart: Date;
    weekEnd: Date;
    rank?: number;
    submittedAt: Date;
}

export interface MemeContest {
    id: string;
    type: 'weekly' | 'yearly';
    startDate: Date;
    endDate: Date;
    status: 'active' | 'completed' | 'cancelled';
    winners: MemeData[];
    channelId: string;
    messageId?: string;
    createdBy: User;
    createdAt: Date;
}

export interface MemeStats {
    totalMemes: number;
    totalBones: number;
    weeklyWinners: number;
    yearlyWinners: number;
    topContributors: { user: User; count: number }[];
}
