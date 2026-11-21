import assert from 'node:assert/strict';
import test from 'node:test';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone.js';
import utc from 'dayjs/plugin/utc.js';

import {
    chunkLines,
    classifyRecoveredWeek,
    getMissedWeeklyWindows,
    getRecoveryStart,
    getWeeklyContestWindow,
    isValidContestDateRange,
    RECOVERY_FALLBACK_START,
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

const iso = (windows: ReadonlyArray<{ start: Date; end: Date }>) =>
    windows.map(window => [window.start.toISOString(), window.end.toISOString()]);

test('missed windows run Friday noon to Friday noon from the last contest until now', () => {
    const windows = getMissedWeeklyWindows(
        RECOVERY_FALLBACK_START,
        new Date('2026-11-21T12:35:00.000Z')
    );

    assert.equal(RECOVERY_FALLBACK_START.toISOString(), '2026-10-16T17:00:00.000Z');
    assert.deepEqual(iso(windows), [
        ['2026-10-16T17:00:00.000Z', '2026-10-23T17:00:00.000Z'],
        ['2026-10-23T17:00:00.000Z', '2026-10-30T17:00:00.000Z'],
        ['2026-10-30T17:00:00.000Z', '2026-11-06T17:00:00.000Z'],
        ['2026-11-06T17:00:00.000Z', '2026-11-13T17:00:00.000Z'],
        ['2026-11-13T17:00:00.000Z', '2026-11-20T17:00:00.000Z'],
    ]);
});

test('missed windows match the live contest window and skip the unfinished week', () => {
    const now = new Date('2026-11-20T16:59:59.000Z');
    const windows = getMissedWeeklyWindows(new Date('2026-11-04T10:00:00.000Z'), now);
    const live = getWeeklyContestWindow(dayjs.tz('2026-11-04 05:00:00', 'America/Bogota'));

    assert.equal(windows[0].start.toISOString(), live.start.toISOString());
    assert.deepEqual(iso(windows), [
        ['2026-10-30T17:00:00.000Z', '2026-11-06T17:00:00.000Z'],
        ['2026-11-06T17:00:00.000Z', '2026-11-13T17:00:00.000Z'],
    ]);
});

test('recovery starts at the stored contest, after it only when it closed cleanly', () => {
    const start_date = new Date('2026-10-16T17:00:00.000Z');
    const end_date = new Date('2026-10-23T17:00:00.000Z');

    assert.equal(getRecoveryStart(null), RECOVERY_FALLBACK_START);
    assert.equal(getRecoveryStart({ status: 'active', start_date, end_date }), start_date);
    assert.equal(getRecoveryStart({ status: 'completed', start_date, end_date }), end_date);
    assert.equal(
        getRecoveryStart({ status: 'completed', start_date, end_date: start_date }),
        start_date
    );
});

test('a week is recoverable only when some meme has valid reactions', () => {
    assert.deepEqual(classifyRecoveredWeek(12, 2), { _tag: 'Recoverable' });
    assert.deepEqual(classifyRecoveredWeek(12, 0), { _tag: 'NoReactions' });
    assert.deepEqual(classifyRecoveredWeek(0, 0), { _tag: 'NoMessages' });
});

test('report chunks never exceed the Discord message limit', () => {
    const lines = Array.from({ length: 60 }, (_, index) => `${index} ${'x'.repeat(90)}`);
    const chunks = chunkLines([...lines, 'y'.repeat(2500)]);

    assert.ok(chunks.length > 1);
    assert.ok(chunks.every(chunk => chunk.length <= 2000));
    assert.equal(chunks.join('\n').split('\n').length, 61);
});
