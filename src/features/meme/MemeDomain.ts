import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone.js';
import utc from 'dayjs/plugin/utc.js';

import type { PlazeroUser } from '../../domain/User.js';

dayjs.extend(utc);
dayjs.extend(timezone);

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

export type WeeklyContestRecoveryResult =
    | { readonly _tag: 'Created'; readonly contest: MemeContest }
    | { readonly _tag: 'AlreadyActive'; readonly contest: MemeContest }
    | { readonly _tag: 'NoContestHistory' }
    | { readonly _tag: 'ChannelUnavailable'; readonly channelId: string };

export type WeeklyContestBackfillResult =
    | {
          readonly _tag: 'Recovered';
          readonly contest: MemeContest;
          readonly startDate: Date;
          readonly endDate: Date;
          readonly scannedMessages: number;
          readonly memeWinners: number;
          readonly boneWinners: number;
      }
    | { readonly _tag: 'NoFailedContest' }
    | { readonly _tag: 'NotFinished'; readonly contest: MemeContest; readonly endDate: Date }
    | { readonly _tag: 'MemeChannelUnavailable' };

export interface WeeklyContestWindow {
    readonly start: dayjs.Dayjs;
    readonly end: dayjs.Dayjs;
}

export interface WeeklyContestBackfillWindow {
    readonly start: Date;
    readonly end: Date;
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
export const MEME_RECOVER_CONTEST_COMMAND = 'meme-recover-contest';

/**
 * Returns the Friday-noon window containing the provided Bogota instant.
 * Deriving the end from the start guarantees a full seven-day contest,
 * including when recovery runs before noon on a Friday.
 */
export function getWeeklyContestWindow(
    now: dayjs.Dayjs = dayjs().tz('America/Bogota')
): WeeklyContestWindow {
    const fridayAtNoon = now.day(5).hour(12).minute(0).second(0).millisecond(0);
    const start = now.isBefore(fridayAtNoon) ? fridayAtNoon.subtract(1, 'week') : fridayAtNoon;

    return { start, end: start.add(1, 'week') };
}

/**
 * Expands the start stored by the zero-duration contest bug into the full
 * Friday-to-Friday period whose winners need to be recovered.
 */
export function getWeeklyContestBackfillWindow(startDate: Date): WeeklyContestBackfillWindow {
    const start = dayjs(startDate);
    return { start: start.toDate(), end: start.add(1, 'week').toDate() };
}

/**
 * Get the current week's Friday at noon in Bogota timezone
 */
export function getCurrentFridayAtNoon(): dayjs.Dayjs {
    return getWeeklyContestWindow().start;
}

/**
 * Get the next Friday at noon in Bogota timezone
 */
export function getNextFridayAtNoon(): dayjs.Dayjs {
    return getWeeklyContestWindow().end;
}

/**
 * Validate if a date range is valid for a contest
 */
export function isValidContestDateRange(startDate: Date, endDate: Date): boolean {
    const start = dayjs(startDate);
    const end = dayjs(endDate);

    // End date must be strictly after start date.
    if (!end.isAfter(start)) return false;

    // Contest duration should not exceed 1 year
    if (end.diff(start, 'year') > 1) return false;

    return true;
}
