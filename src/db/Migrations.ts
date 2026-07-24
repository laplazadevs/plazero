import { fileURLToPath } from 'node:url';
import * as PgClient from '@effect/sql-pg/PgClient';
import { Context, Effect, Layer, Schema } from 'effect';
import * as FileSystem from 'effect/FileSystem';
import * as Path from 'effect/Path';
import * as Reactivity from 'effect/unstable/reactivity/Reactivity';
import * as SqlClient from 'effect/unstable/sql/SqlClient';

import { adminPoolConfig, targetDatabaseName } from '../config/env.js';

export interface Migration {
    readonly version: number;
    readonly name: string;
    readonly up: string;
    readonly down: string;
}

export interface MigrationStatus {
    readonly version: number;
    readonly name: string;
    readonly applied: boolean;
}

const migrationFilePattern = /^\d+_.*\.sql$/;

const AppliedVersionRow = Schema.Struct({ version: Schema.Number });
const decodeAppliedVersions = Schema.decodeUnknownEffect(Schema.Array(AppliedVersionRow));

// The SQL files live next to this module's parent directory both in src/ (dev)
// and dist/ (after `npm run copy-migrations`).
const migrationsDirectory = fileURLToPath(new URL('../migrations', import.meta.url));

// Keeps the exact semantics of the previous MigrationManager: same `migrations`
// table (version, name, applied_at), same `-- UP MIGRATION` / `-- DOWN MIGRATION`
// file format, and rollback support. The Effect SQL Migrator is not used because
// its bookkeeping table is incompatible with the one already in production.
export class Migrations extends Context.Service<Migrations>()('plazero/Migrations', {
    make: Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;

        const loadMigrations = Effect.fn('Migrations.loadMigrations')(function* () {
            const files = yield* fs.readDirectory(migrationsDirectory);
            const migrationFiles = files.filter(file => migrationFilePattern.test(file)).sort();

            yield* Effect.logInfo(
                `Found ${migrationFiles.length} migration files: ${migrationFiles.join(', ')}`
            );

            const migrations: Array<Migration> = [];
            for (const file of migrationFiles) {
                const content = yield* fs.readFileString(path.join(migrationsDirectory, file));
                const version = Number.parseInt(file.split('_')[0], 10);
                const name = file.replace('.sql', '').replace(/^\d+_/, '');

                if (Number.isNaN(version)) {
                    yield* Effect.logWarning(`Skipping ${file}: Invalid version number`);
                    continue;
                }

                const parts = content.split('-- DOWN MIGRATION');
                migrations.push({
                    version,
                    name,
                    up: parts[0].replace('-- UP MIGRATION', '').trim(),
                    down: parts[1] ? parts[1].trim() : '',
                });
            }

            return migrations.sort((a, b) => a.version - b.version);
        });

        const createMigrationsTable = Effect.fn('Migrations.createMigrationsTable')(function* () {
            yield* sql`
                CREATE TABLE IF NOT EXISTS migrations (
                    version INTEGER PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    applied_at TIMESTAMP DEFAULT NOW()
                )
            `;
        });

        const appliedVersions = Effect.fn('Migrations.appliedVersions')(function* () {
            const rows = yield* sql`SELECT version FROM migrations ORDER BY version`;
            const decoded = yield* decodeAppliedVersions(rows);
            return decoded.map(row => row.version);
        });

        const up = Effect.fn('Migrations.up')(function* () {
            yield* Effect.logInfo('Running database migrations...');
            const migrations = yield* loadMigrations();

            yield* createMigrationsTable();
            const applied = yield* appliedVersions();

            let migrationsRun = 0;
            for (const migration of migrations) {
                if (applied.includes(migration.version)) {
                    yield* Effect.logInfo(`Migration ${migration.version} already applied`);
                    continue;
                }

                yield* Effect.logInfo(`Running migration ${migration.version}: ${migration.name}`);
                yield* sql.withTransaction(
                    Effect.gen(function* () {
                        yield* sql.unsafe(migration.up);
                        yield* sql`
                            INSERT INTO migrations ${sql.insert({
                                version: migration.version,
                                name: migration.name,
                            })}
                        `;
                    })
                );
                yield* Effect.logInfo(`Migration ${migration.version} completed`);
                migrationsRun += 1;
            }

            yield* migrationsRun === 0
                ? Effect.logInfo('All migrations are up to date')
                : Effect.logInfo(`${migrationsRun} migrations completed successfully`);

            return migrationsRun;
        });

        const rollback = Effect.fn('Migrations.rollback')(function* (version: number) {
            const migrations = yield* loadMigrations();
            const migration = migrations.find(m => m.version === version);

            if (!migration) {
                return yield* Effect.die(new Error(`Migration ${version} not found`));
            }
            if (!migration.down) {
                return yield* Effect.die(
                    new Error(`No rollback available for migration ${version}`)
                );
            }

            yield* Effect.logInfo(`Rolling back migration ${version}: ${migration.name}`);
            yield* sql.withTransaction(
                Effect.gen(function* () {
                    yield* sql.unsafe(migration.down);
                    yield* sql`DELETE FROM migrations WHERE version = ${version}`;
                })
            );
            yield* Effect.logInfo(`Migration ${version} rolled back successfully`);
        });

        const status = Effect.fn('Migrations.status')(function* () {
            const migrations = yield* loadMigrations();
            yield* createMigrationsTable();
            const applied = yield* appliedVersions();

            const statuses: Array<MigrationStatus> = migrations.map(migration => ({
                version: migration.version,
                name: migration.name,
                applied: applied.includes(migration.version),
            }));

            return statuses;
        });

        return { loadMigrations, up, rollback, status } as const;
    }),
}) {
    static readonly layer = Layer.effect(Migrations)(Migrations.make);

    // Startup layer: runs pending migrations while the application layers are
    // being built, gating anything provided on top of it (the Discord login).
    static readonly boot = Layer.effectDiscard(
        Effect.gen(function* () {
            const migrations = yield* Migrations;
            yield* migrations.up();
        })
    );
}

// Connects to the maintenance `postgres` database and creates the target
// database when missing. Used by `migrate create-db` and before `migrate up`.
export const ensureDatabaseExists = Effect.fn('Migrations.ensureDatabaseExists')(function* () {
    const adminConfig = yield* adminPoolConfig;
    const databaseName = yield* targetDatabaseName;

    yield* Effect.gen(function* () {
        const admin = yield* PgClient.make(adminConfig);
        const existing = yield* admin`SELECT 1 FROM pg_database WHERE datname = ${databaseName}`;

        if (existing.length === 0) {
            yield* Effect.logInfo(`Creating database: ${databaseName}`);
            yield* admin.unsafe(`CREATE DATABASE "${databaseName}"`);
            yield* Effect.logInfo(`Database '${databaseName}' created successfully`);
        } else {
            yield* Effect.logInfo(`Database '${databaseName}' already exists`);
        }
    }).pipe(Effect.scoped, Effect.provide(Reactivity.layer));
});

// Startup layer: runs pending migrations while the application layers are
// being built, replacing the old DatabaseService.initializeSchema().
export const MigrationsBoot = Layer.effectDiscard(
    Effect.gen(function* () {
        const migrations = yield* Migrations;
        yield* migrations.up();
    })
);
