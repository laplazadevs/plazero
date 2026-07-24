import type { PlazeroUser } from './user.js';

// Reference to a Discord message. Live discord.js `Message` objects satisfy
// this shape; messages rebuilt from the database only carry the id.
export interface MemeMessageRef {
    readonly id: string;
    readonly url?: string;
    readonly createdAt?: Date;
}

export interface MemeData {
    id: string;
    message: MemeMessageRef;
    author: PlazeroUser;
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
    createdBy: PlazeroUser;
    createdAt: Date;
}

export interface MemeStats {
    totalMemes: number;
    totalBones: number;
    weeklyWinners: number;
    yearlyWinners: number;
    topContributors: { user: PlazeroUser; count: number }[];
}
