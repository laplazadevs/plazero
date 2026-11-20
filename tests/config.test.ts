import assert from 'node:assert/strict';
import test from 'node:test';
import { ConfigProvider, Duration, Effect } from 'effect';

import { databasePoolConfig, hasDatabaseUrl } from '../src/config/env.js';

const withEnv = <A, E>(effect: Effect.Effect<A, E>, env: Record<string, string>) =>
    Effect.runPromise(
        effect.pipe(Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(env))))
    );

test('database connect timeout defaults to 10 seconds', async () => {
    const config = await withEnv(databasePoolConfig, { DATABASE_URL: 'postgresql://h/db' });
    assert.deepEqual(config.connectTimeout, Duration.millis(10_000));
});

test('DB_CONNECT_TIMEOUT_MS overrides the connect timeout', async () => {
    const config = await withEnv(databasePoolConfig, { DB_CONNECT_TIMEOUT_MS: '2500' });
    assert.deepEqual(config.connectTimeout, Duration.millis(2500));
});

test('hasDatabaseUrl detects either connection string', async () => {
    assert.equal(await withEnv(hasDatabaseUrl, {}), false);
    assert.equal(await withEnv(hasDatabaseUrl, { DATABASE_URL: 'postgresql://h/db' }), true);
    assert.equal(
        await withEnv(hasDatabaseUrl, { DATABASE_URL_UNPOOLED: 'postgresql://h/db' }),
        true
    );
});
