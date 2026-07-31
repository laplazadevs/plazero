import assert from 'node:assert/strict';
import test from 'node:test';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone.js';
import utc from 'dayjs/plugin/utc.js';

import {
    getWeeklyContestBackfillWindow,
    getWeeklyContestWindow,
    isValidContestDateRange,
} from '../src/features/meme/MemeDomain.js';

dayjs.extend(utc);
dayjs.extend(timezone);

test('Friday before noon belongs to the previous full weekly window', () => {
    const window = getWeeklyContestWindow(dayjs.tz('2026-07-24 02:00:37', 'America/Bogota'));

    assert.equal(window.start.toISOString(), '2026-07-17T17:00:00.000Z');
    assert.equal(window.end.toISOString(), '2026-07-24T17:00:00.000Z');
    assert.equal(window.end.diff(window.start, 'hour'), 168);
});

test('Friday after noon starts a new full weekly window', () => {
    const window = getWeeklyContestWindow(dayjs.tz('2026-07-24 13:00:00', 'America/Bogota'));

    assert.equal(window.start.toISOString(), '2026-07-24T17:00:00.000Z');
    assert.equal(window.end.toISOString(), '2026-07-31T17:00:00.000Z');
    assert.equal(window.end.diff(window.start, 'hour'), 168);
});

test('a weekday resolves to the surrounding Friday-to-Friday window', () => {
    const window = getWeeklyContestWindow(dayjs.tz('2026-07-27 09:00:00', 'America/Bogota'));

    assert.equal(window.start.toISOString(), '2026-07-24T17:00:00.000Z');
    assert.equal(window.end.toISOString(), '2026-07-31T17:00:00.000Z');
});

test('contest date validation rejects zero and negative durations', () => {
    const start = new Date('2026-07-24T17:00:00.000Z');

    assert.equal(isValidContestDateRange(start, new Date(start)), false);
    assert.equal(isValidContestDateRange(start, new Date('2026-07-24T16:59:59.999Z')), false);
    assert.equal(isValidContestDateRange(start, new Date('2026-07-31T17:00:00.000Z')), true);
});

test('failed weekly contest expands from July 24 to the July 31 boundary', () => {
    const window = getWeeklyContestBackfillWindow(new Date('2026-07-24T17:00:00.000Z'));

    assert.equal(window.start.toISOString(), '2026-07-24T17:00:00.000Z');
    assert.equal(window.end.toISOString(), '2026-07-31T17:00:00.000Z');
    assert.equal(window.end.getTime() - window.start.getTime(), 7 * 24 * 60 * 60 * 1000);
});
