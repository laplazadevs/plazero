import dayjs from 'dayjs';

import type { PlazeroUser } from '../../domain/User.js';

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

// Emoji configurations
export const LAUGH_EMOJIS = [
    '🤣', // :rofl:
    '😂', // :joy:
    '🥇', // :first_place:
    '🏅', // :medal:
    '🏆', // :trophy:
    '🎖️', // :medal_military:
    '💯', // :100:
    '😄', // :smile:
    '😁', // :grin:
    '😀', // :grinning:
    '🤩', // :star_struck:
    '😆', // :laugh:
    '😸', // :cat_laugh:
    '😹', // :cat_eyes:
    '956966036354265180', // :pepehardlaugh:
    '974777892418519081', // :doggokek:
    '954075635310035024', // :kekw:
    '956966037063106580', // :pepelaugh:
    '1294664027242365000', // :LMAOO:
    '1294664038223052823', // :LuffyLike:
    '1294664055579213907', // :Pogging:
    '993855474548084827', // :lol:
    '974777892208787596', // :pepeOK:
];

export const BONE_EMOJI = ['🦴'];

export const MEME_CHANNEL_NAME = '🤣︱memes';

// Command names
export const MEME_OF_THE_YEAR_COMMAND = 'meme-of-the-year';
export const MEME_STATS_COMMAND = 'meme-stats';
export const MEME_CONTEST_COMMAND = 'meme-contest';
export const MEME_COMPLETE_CONTEST_COMMAND = 'meme-complete-contest';

/**
 * Get the current week's Friday at noon in Bogota timezone
 */
export function getCurrentFridayAtNoon(): dayjs.Dayjs {
    const now = dayjs().tz('America/Bogota');
    const friday = now.day(5).hour(12).minute(0).second(0).millisecond(0);

    // If today is past Friday, we need to get this week's Friday (which already passed)
    // If today is before Friday, we get this week's Friday (which is coming)
    // If today is Friday but before noon, we get today's noon
    // If today is Friday and past noon, we get today's noon (but it already passed)

    return friday;
}

/**
 * Get the next Friday at noon in Bogota timezone
 */
export function getNextFridayAtNoon(): dayjs.Dayjs {
    const now = dayjs().tz('America/Bogota');
    let nextFriday = now.day(5).hour(12).minute(0).second(0).millisecond(0);

    // If it's already Friday and past noon, or if it's past Friday, get next week's Friday
    if ((now.day() === 5 && now.hour() >= 12) || now.day() > 5) {
        nextFriday = nextFriday.add(1, 'week');
    }

    return nextFriday;
}

/**
 * Validate if a date range is valid for a contest
 */
export function isValidContestDateRange(startDate: Date, endDate: Date): boolean {
    const start = dayjs(startDate);
    const end = dayjs(endDate);

    // End date must be after start date
    if (end.isBefore(start)) return false;

    // Contest duration should not exceed 1 year
    if (end.diff(start, 'year') > 1) return false;

    return true;
}
