import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test from 'node:test';

import { checkHealth, type Readiness, startHealthServer } from '../src/health/HealthServer.js';

const ready = (discordReady: boolean, ping: () => Promise<unknown>): Readiness => ({
    phase: 'ready',
    discordReady: () => discordReady,
    pingDatabase: ping,
});

test('health is 503 while starting', async () => {
    const response = await checkHealth({ phase: 'starting' });
    assert.equal(response.status, 503);
    assert.equal(response.body.reason, 'starting');
});

test('health is 503 when Discord is not ready', async () => {
    const response = await checkHealth(ready(false, () => Promise.resolve()));
    assert.deepEqual([response.status, response.body.reason], [503, 'discord_not_ready']);
});

test('health is 503 when the database ping fails', async t => {
    t.mock.method(console, 'error', () => undefined);
    const response = await checkHealth(ready(true, () => Promise.reject(new Error('down'))));
    assert.deepEqual([response.status, response.body.reason], [503, 'database_unreachable']);
});

test('health is 200 when Discord and the database are up', async () => {
    const response = await checkHealth(ready(true, () => Promise.resolve()));
    assert.equal(response.status, 200);
    assert.equal(response.body.ok, true);
});

test('server serves health paths over HTTP', async t => {
    t.mock.method(console, 'log', () => undefined);
    const server = await startHealthServer(0, () => ({ phase: 'starting' }));
    t.after(() => server.close());
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const health = await fetch(`${base}/api/health`);
    assert.equal(health.status, 503);
    assert.deepEqual(await health.json(), { ok: false, service: 'plazero', reason: 'starting' });
    assert.equal((await fetch(`${base}/other`)).status, 404);
    assert.equal((await fetch(base, { method: 'POST' })).status, 405);
});
