#!/usr/bin/env node
import * as NodeRuntime from '@effect/platform-node/NodeRuntime';
import * as NodeServices from '@effect/platform-node/NodeServices';
import { Console, Effect, Layer } from 'effect';

import { DotEnvConfigProviderLive } from '../config/AppConfigProvider.js';
import { targetDatabaseName } from '../config/env.js';
import { ensureDatabaseExists, Migrations } from '../db/Migrations.js';
import { PgLive } from '../db/PgLive.js';

const usage = `
🔄 Plazero Bot Database Migration Tool

Usage:
  npm run migrate [command]

Commands:
  up         Run all pending migrations
  status     Show migration status
  rollback   Rollback last migration (usage: npm run migrate rollback <version>)
  create-db  Create database if it doesn't exist

Examples:
  npm run migrate up
  npm run migrate status
  npm run migrate rollback 1
  npm run migrate create-db
`;

// Layer for commands that talk to the target database.
const MigrateLive = Migrations.layer.pipe(
    Layer.provideMerge(PgLive),
    Layer.provideMerge(NodeServices.layer),
    Layer.provide(DotEnvConfigProviderLive)
);

// Layer for commands that must work before the target database exists.
const AdminLive = Layer.mergeAll(NodeServices.layer, DotEnvConfigProviderLive);

const logConnectionTarget = Effect.gen(function* () {
    const databaseName = yield* targetDatabaseName;
    yield* Console.log(`🔗 Target database: ${databaseName}`);
});

const runUp = Effect.gen(function* () {
    const migrations = yield* Migrations;
    yield* migrations.up();
    yield* Console.log('🎉 All migrations completed successfully!');
});

const showStatus = Effect.gen(function* () {
    const migrations = yield* Migrations;
    const statuses = yield* migrations.status();

    yield* Console.log('\n📊 Migration Status:');
    yield* Console.log('==================');

    for (const migration of statuses) {
        const status = migration.applied ? '✅ Applied' : '⏳ Pending';
        yield* Console.log(
            `${migration.version.toString().padStart(3)}: ${migration.name.padEnd(30)} ${status}`
        );
    }

    const appliedCount = statuses.filter(migration => migration.applied).length;
    yield* Console.log(`\nTotal: ${statuses.length} migrations, ${appliedCount} applied`);
});

const runRollback = Effect.fn('migrate.runRollback')(function* (version: number) {
    const migrations = yield* Migrations;
    yield* migrations.rollback(version);
    yield* Console.log(`🎉 Migration ${version} rolled back successfully!`);
});

const main = Effect.gen(function* () {
    const command = process.argv[2];

    if (!command) {
        yield* Console.log(usage);
        yield* Effect.sync(() => {
            process.exitCode = 1;
        });
        return;
    }

    yield* logConnectionTarget.pipe(Effect.provide(AdminLive));

    switch (command) {
        case 'create-db':
            yield* ensureDatabaseExists().pipe(Effect.provide(AdminLive));
            break;
        case 'up':
            // The database may not exist yet, so it is created through the
            // admin connection before the migration layer connects to it.
            yield* ensureDatabaseExists().pipe(Effect.provide(AdminLive));
            yield* runUp.pipe(Effect.provide(MigrateLive));
            break;
        case 'status':
            yield* showStatus.pipe(Effect.provide(MigrateLive));
            break;
        case 'rollback': {
            const version = process.argv[3];
            if (!version) {
                yield* Console.error('❌ Please specify migration version to rollback');
                yield* Console.log('Usage: npm run migrate rollback <version>');
                yield* Effect.sync(() => {
                    process.exitCode = 1;
                });
                return;
            }
            yield* runRollback(Number.parseInt(version, 10)).pipe(Effect.provide(MigrateLive));
            break;
        }
        default:
            yield* Console.error(`❌ Unknown command: ${command}`);
            yield* Effect.sync(() => {
                process.exitCode = 1;
            });
    }
});

NodeRuntime.runMain(main);
