import { VoteThreshold } from '../types/vote.js';

// Emoji configurations
export const LAUGH_EMOJIS = [
  '🤣', // :rofl:
  '😂', // :joy:
  '🥇', // :first_place:
  '956966036354265180', // :pepehardlaugh:
  '974777892418519081', // :doggokek:
  '954075635310035024', // :kekw:
  '956966037063106580', // :pepelaugh:
];

export const BONE_EMOJI = ['🦴'];

// Command names
export const SCRAP_MESSAGES_COMMAND = 'gettop';
export const MEME_OF_THE_YEAR_COMMAND = 'memeoftheyear';
export const VOTE_TIMEOUT_COMMAND = 'vote-timeout';
export const CANCEL_VOTE_COMMAND = 'cancel-vote';

// Voting system configuration
export const VOTE_DURATION_MS = 5 * 60 * 1000; // 5 minutes
export const COOLDOWN_DURATION_MS = 15 * 60 * 1000; // 15 minutes
export const REQUIRED_ROLE_NAME = 'One Of Us';
export const SERVER_BOOSTER_ROLE_NAME = 'Server Booster';
export const MODERACION_CHANNEL_NAME = '🧑‍⚖️︱moderación';

// Vote thresholds and corresponding timeout durations
export const VOTE_THRESHOLDS: VoteThreshold[] = [
  { votes: 5, duration: 5 * 60 * 1000, label: 'Light Warning (5 min)' },
  { votes: 8, duration: 30 * 60 * 1000, label: 'Moderate Sanction (30 min)' },
  { votes: 12, duration: 2 * 60 * 60 * 1000, label: 'Serious Violation (2 hours)' },
  { votes: 15, duration: 24 * 60 * 60 * 1000, label: 'Severe Misconduct (24 hours)' }
];
