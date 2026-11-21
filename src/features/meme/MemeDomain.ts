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
    | { readonly _tag: 'ChannelUnavailable' };

export interface WeeklyContestWindow {
    readonly start: dayjs.Dayjs;
    readonly end: dayjs.Dayjs;
}

export interface ContestWindow {
    readonly start: Date;
    readonly end: Date;
}

export type RecoveredWeekStatus =
    | { readonly _tag: 'Recoverable' }
    | { readonly _tag: 'NoMessages' }
    | { readonly _tag: 'NoReactions' };

export interface RankedEntry {
    readonly url: string;
    readonly authorId: string;
    readonly count: number;
}

export interface RecoveredWeek {
    readonly window: ContestWindow;
    readonly messageCount: number;
    readonly topMemes: ReadonlyArray<RankedEntry>;
    readonly topBones: ReadonlyArray<RankedEntry>;
    readonly status: RecoveredWeekStatus;
    readonly savedWinners?: number;
}

export type MissedContestsResult =
    | { readonly _tag: 'MemeChannelUnavailable' }
    | {
          readonly _tag: 'Scanned';
          readonly from: Date;
          readonly weeks: ReadonlyArray<RecoveredWeek>;
          readonly confirm: boolean;
          readonly announce: boolean;
      };

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
export const MEME_RECOVER_COMMAND = 'meme-recover';

export const RECOVERY_FALLBACK_START = new Date('2026-10-16T17:00:00.000Z');

export const winnerId = (contestType: 'meme' | 'bone', contestId: string, index: number) =>
    `${contestType}-${contestId}-${index}`;

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

export function getMissedWeeklyWindows(from: Date, now: Date): ContestWindow[] {
    const windows: ContestWindow[] = [];
    let { start, end } = getWeeklyContestWindow(dayjs(from).tz('America/Bogota'));
    while (!end.isAfter(now)) {
        windows.push({ start: start.toDate(), end: end.toDate() });
        start = end;
        end = end.add(1, 'week');
    }
    return windows;
}

export const getRecoveryStart = (
    latest: { readonly status: string; readonly start_date: Date; readonly end_date: Date } | null
): Date => {
    if (!latest) return RECOVERY_FALLBACK_START;
    return latest.status !== 'active' && latest.end_date > latest.start_date
        ? latest.end_date
        : latest.start_date;
};

export const classifyRecoveredWeek = (
    messageCount: number,
    winnerCount: number
): RecoveredWeekStatus => {
    if (winnerCount > 0) return { _tag: 'Recoverable' };
    return messageCount === 0 ? { _tag: 'NoMessages' } : { _tag: 'NoReactions' };
};

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

const DISCORD_MESSAGE_LIMIT = 2000;

const unix = (date: Date) => Math.floor(date.getTime() / 1000);

const statusLabel: Record<RecoveredWeekStatus['_tag'], string> = {
    Recoverable: '✅ recuperable',
    NoMessages: '❌ no recuperable: no hay mensajes en el canal',
    NoReactions: '❌ no recuperable: hay mensajes pero ninguno tiene reacciones válidas',
};

const entryLines = (emoji: string, entries: ReadonlyArray<RankedEntry>) =>
    entries.map(
        (entry, index) =>
            `  ${emoji} ${index + 1}. <@${entry.authorId}> (${entry.count}) <${entry.url}>`
    );

export const chunkLines = (lines: ReadonlyArray<string>, limit = DISCORD_MESSAGE_LIMIT) => {
    const chunks: string[] = [];
    let current = '';
    for (const line of lines) {
        const safe = line.length > limit ? `${line.slice(0, limit - 1)}…` : line;
        if (current && current.length + 1 + safe.length > limit) {
            chunks.push(current);
            current = safe;
        } else {
            current = current ? `${current}\n${safe}` : safe;
        }
    }
    if (current) chunks.push(current);
    return chunks;
};

export const formatRecoveryReport = (
    result: Extract<MissedContestsResult, { _tag: 'Scanned' }>
): string[] => {
    const mode = !result.confirm
        ? '🔎 **Simulación**: no se guardó ni se anunció nada.'
        : result.announce
          ? '💾 **Guardado y anunciado.**'
          : '💾 **Guardado** (sin anunciar).';
    const recoverable = result.weeks.filter(week => week.status._tag === 'Recoverable').length;
    const header = [
        mode,
        `Desde <t:${unix(result.from)}:f>: ${result.weeks.length} viernes sin cerrar, ${recoverable} recuperables.`,
    ];
    const weeks = result.weeks.flatMap(week => [
        `**<t:${unix(week.window.start)}:f> → <t:${unix(week.window.end)}:f>** · ${week.messageCount} mensajes · ${statusLabel[week.status._tag]}` +
            (week.savedWinners === undefined
                ? ''
                : ` · ${week.savedWinners} ganadores nuevos guardados`),
        ...entryLines('😂', week.topMemes),
        ...entryLines('🦴', week.topBones),
    ]);
    return chunkLines([...header, ...weeks]);
};
