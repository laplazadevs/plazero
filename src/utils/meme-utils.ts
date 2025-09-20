import dayjs from 'dayjs';
import { Message } from 'discord.js';

import { BONE_EMOJI, LAUGH_EMOJIS } from '../config/constants.js';

/**
 * Check if a message is a meme based on content and attachments
 */
export function isMemeMessage(message: Message): boolean {
    // Check if message has attachments (images, videos, gifs)
    const hasMediaAttachment = message.attachments.some(attachment => {
        const contentType = attachment.contentType || '';
        return (
            contentType.startsWith('image/') ||
            contentType.startsWith('video/') ||
            attachment.name?.endsWith('.gif')
        );
    });

    // Check if message contains meme-related keywords
    const memeKeywords = ['meme', 'funny', 'lol', 'haha', '😂', '🤣', '😆', '😄'];
    const hasMemeKeywords = memeKeywords.some(keyword =>
        message.content.toLowerCase().includes(keyword)
    );

    // Check if message has reactions that indicate it's a meme
    const hasMemeReactions = message.reactions.cache.some(
        reaction =>
            LAUGH_EMOJIS.includes(reaction.emoji.name || '') ||
            LAUGH_EMOJIS.includes(reaction.emoji.id || '')
    );

    return hasMediaAttachment || hasMemeKeywords || hasMemeReactions;
}

/**
 * Check if a message is a "bone" (cringe content)
 */
export function isBoneMessage(message: Message): boolean {
    // Check if message has bone reactions
    const hasBoneReactions = message.reactions.cache.some(
        reaction =>
            BONE_EMOJI.includes(reaction.emoji.name || '') ||
            BONE_EMOJI.includes(reaction.emoji.id || '')
    );

    // Check for cringe-related keywords
    const cringeKeywords = ['cringe', 'bone', 'ouch', 'yikes', 'oof', '🦴'];
    const hasCringeKeywords = cringeKeywords.some(keyword =>
        message.content.toLowerCase().includes(keyword)
    );

    return hasBoneReactions || hasCringeKeywords;
}

/**
 * Get the week period string for display
 */
export function getWeekPeriodString(startDate: dayjs.Dayjs, endDate: dayjs.Dayjs): string {
    const start = startDate.format('MMM DD');
    const end = endDate.format('MMM DD');

    if (startDate.year() !== endDate.year()) {
        return `${startDate.format('MMM DD, YYYY')} - ${endDate.format('MMM DD, YYYY')}`;
    }

    return `${start} - ${end}`;
}

/**
 * Get the current week's Friday at noon in Bogota timezone
 */
export function getCurrentFridayAtNoon(): dayjs.Dayjs {
    const now = dayjs().tz('America/Bogota');
    let friday = now.day(5).hour(12).minute(0).second(0).millisecond(0);

    // If today is past Friday, we need to get this week's Friday (which already passed)
    // If today is before Friday, we get this week's Friday (which is coming)
    // If today is Friday but before noon, we get today's noon
    // If today is Friday and past noon, we get today's noon (but it already passed)

    return friday;
}

/**
 * Get the last Friday at noon in Bogota timezone (previous week's Friday)
 */
export function getLastFridayAtNoon(): dayjs.Dayjs {
    return getCurrentFridayAtNoon().subtract(1, 'week');
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
 * Format reaction count with appropriate emoji
 */
export function formatReactionCount(count: number, type: 'meme' | 'bone'): string {
    const emoji = type === 'meme' ? '😂' : '🦴';
    return `${emoji} ${count}`;
}

/**
 * Get contest type emoji
 */
export function getContestTypeEmoji(type: 'weekly' | 'yearly'): string {
    return type === 'weekly' ? '📅' : '🏆';
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

/**
 * Get time remaining until contest ends
 */
export function getTimeRemaining(endDate: Date): string {
    const now = dayjs();
    const end = dayjs(endDate);

    if (end.isBefore(now)) {
        return 'Finalizado';
    }

    const diff = end.diff(now);
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) {
        return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else {
        return `${minutes}m`;
    }
}
