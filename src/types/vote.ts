import type { PlazeroUser } from './user.js';

export interface VoteData {
    id: string;
    targetUser: PlazeroUser;
    initiator: PlazeroUser;
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
