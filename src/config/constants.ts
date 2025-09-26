import { VoteThreshold } from '../types/vote.js';

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

// Command names
export const MEME_OF_THE_YEAR_COMMAND = 'meme-of-the-year';
export const MEME_STATS_COMMAND = 'meme-stats';
export const MEME_CONTEST_COMMAND = 'meme-contest';
export const MEME_COMPLETE_CONTEST_COMMAND = 'meme-complete-contest';
export const VOTE_TIMEOUT_COMMAND = 'vote-timeout';
export const CANCEL_VOTE_COMMAND = 'cancel-vote';

// Corabastos commands
export const CORABASTOS_AGENDA_COMMAND = 'corabastos-agenda';
export const CORABASTOS_EMERGENCY_COMMAND = 'corabastos-emergencia';
export const CORABASTOS_STATUS_COMMAND = 'corabastos-estado';

// Voting system configuration
export const VOTE_DURATION_MS = 5 * 60 * 1000; // 5 minutes
export const COOLDOWN_DURATION_MS = 15 * 60 * 1000; // 15 minutes
export const REQUIRED_ROLE_NAME = 'One Of Us';
export const SERVER_BOOSTER_ROLE_NAME = 'Server Booster';
export const MODERACION_CHANNEL_NAME = '🧑‍⚖️︱moderación';
export const WELCOME_CHANNEL_NAME = '👋︱nuevos';
export const WELCOME_ROLE_NAME = 'One Of Us';
export const MEME_CHANNEL_NAME = '🤣︱memes';
export const CORABASTOS_VOICE_CHANNEL_NAME = '🇨🇴︱corabastos';
export const GENERAL_CHANNEL_NAME = '🗿︱general';
export const ADMINISTRATION_CHANNEL_NAME = '🐵︱administración';

// Vote thresholds and corresponding timeout durations
export const VOTE_THRESHOLDS: VoteThreshold[] = [
    { votes: 5, duration: 5 * 60 * 1000, label: 'Light Warning (5 min)' },
    { votes: 8, duration: 30 * 60 * 1000, label: 'Light Sanction (30 min)' },
    { votes: 12, duration: 2 * 60 * 60 * 1000, label: 'Moderate Violation (2 hours)' },
    { votes: 15, duration: 8 * 60 * 60 * 1000, label: 'Serious Misconduct (8 hours)' },
    { votes: 21, duration: 12 * 60 * 60 * 1000, label: 'Severe Misconduct (12 hours)' },
    { votes: 25, duration: 24 * 60 * 60 * 1000, label: 'Severe Misconduct (24 hours)' },
];

// Corabastos configuration
export const CORABASTOS_FRIDAY_HOUR = 12; // 12 PM (noon)
export const CORABASTOS_EMERGENCY_CONFIRMATIONS_NEEDED = 10;
export const CORABASTOS_EMERGENCY_EXPIRY_HOURS = 1; // Emergency requests expire after 1 hours
export const CORABASTOS_MAX_TURNO = 10; // Maximum turno (10 PM)
export const CORABASTOS_CONFIRMATION_TIMEOUT_MS = 60 * 1000; // 60 seconds for agenda confirmations

// Corabastos emojis
export const CORABASTOS_CONFIRM_EMOJI = '✅';
export const CORABASTOS_CANCEL_EMOJI = '❌';
export const CORABASTOS_EMERGENCY_EMOJI = '🚨';
export const CORABASTOS_CALENDAR_EMOJI = '📅';
export const CORABASTOS_CLOCK_EMOJI = '🕐';
