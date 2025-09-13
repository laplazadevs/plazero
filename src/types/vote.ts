import { User } from 'discord.js';

export interface VoteData {
    id: string;
    targetUser: User;
    initiator: User;
    reason: string;
    startTime: Date;
    upVotes: Map<string, number>; // userId -> vote weight (1 for normal, 2 for boosters)
    downVotes: Map<string, number>; // userId -> vote weight (1 for normal, 2 for boosters)
    whiteVotes: Map<string, number>; // userId -> consecutive white vote count
    messageId: string;
    channelId: string;
    completed: boolean;
}

export interface VoteThreshold {
    votes: number;
    duration: number;
    label: string;
}
