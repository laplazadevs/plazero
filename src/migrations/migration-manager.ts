import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

import { getPoolConfig, parseDatabaseConfig } from '../utils/database-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface Migration {
    version: number;
    name: string;
    up: string;
    down: string;
}

export class MigrationManager {
    private pool: Pool;
    private migrations: Migration[] = [];

    constructor(pool: Pool) {
        this.pool = pool;
        this.loadMigrations();
    }

    private loadMigrations(): void {
        // Load migration files from the migrations directory
        const migrationFiles = [
            '001_initial_schema.sql',
            '002_cleanup_functions.sql',
            '003_indexes.sql',
        ];

        for (const file of migrationFiles) {
            try {
                const migrationPath = join(__dirname, file);
                const content = readFileSync(migrationPath, 'utf-8');
                const version = parseInt(file.split('_')[0]);
                const name = file.replace('.sql', '').replace(/^\d+_/, '');

                // Split content into up and down migrations
                const parts = content.split('-- DOWN MIGRATION');
                const up = parts[0].replace('-- UP MIGRATION', '').trim();
                const down = parts[1] ? parts[1].trim() : '';

                this.migrations.push({
                    version,
                    name,
                    up,
                    down,
                });
            } catch (error) {
                console.warn(`Could not load migration ${file}:`, error);
            }
        }

        // Sort migrations by version
        this.migrations.sort((a, b) => a.version - b.version);
    }

    public async ensureDatabaseExists(): Promise<void> {
        const poolConfig = getPoolConfig();

        // For database creation, we need to connect to the 'postgres' database
        // If using connectionString, we need to modify it to point to 'postgres' database
        let adminPoolConfig;
        if (poolConfig.connectionString) {
            // Parse the connection string and modify the database name
            const url = new URL(poolConfig.connectionString);
            url.pathname = '/postgres';
            adminPoolConfig = { connectionString: url.toString() };
        } else {
            // Use individual config but connect to 'postgres' database
            adminPoolConfig = {
                ...poolConfig,
                database: 'postgres',
            };
        }

        const adminPool = new Pool(adminPoolConfig);

        try {
            // Get the target database name
            const dbConfig = parseDatabaseConfig();

            // Check if database exists
            const result = await adminPool.query('SELECT 1 FROM pg_database WHERE datname = $1', [
                dbConfig.database,
            ]);

            if (result.rows.length === 0) {
                console.log(`Creating database: ${dbConfig.database}`);
                await adminPool.query(`CREATE DATABASE "${dbConfig.database}"`);
                console.log(`✅ Database '${dbConfig.database}' created successfully`);
            } else {
                console.log(`✅ Database '${dbConfig.database}' already exists`);
            }
        } catch (error) {
            console.error('Error creating database:', error);
            throw error;
        } finally {
            await adminPool.end();
        }
    }

    public async createMigrationsTable(): Promise<void> {
        const query = `
            CREATE TABLE IF NOT EXISTS migrations (
                version INTEGER PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                applied_at TIMESTAMP DEFAULT NOW()
            )
        `;
        await this.pool.query(query);
    }

    public async getAppliedMigrations(): Promise<number[]> {
        const result = await this.pool.query('SELECT version FROM migrations ORDER BY version');
        return result.rows.map((row: any) => row.version);
    }

    public async runMigrations(): Promise<void> {
        console.log('🔄 Running database migrations...');

        await this.createMigrationsTable();
        const appliedMigrations = await this.getAppliedMigrations();

        let migrationsRun = 0;

        for (const migration of this.migrations) {
            if (!appliedMigrations.includes(migration.version)) {
                console.log(`📝 Running migration ${migration.version}: ${migration.name}`);

                try {
                    await this.pool.query('BEGIN');
                    await this.pool.query(migration.up);

                    // Record the migration
                    await this.pool.query(
                        'INSERT INTO migrations (version, name) VALUES ($1, $2)',
                        [migration.version, migration.name]
                    );

                    await this.pool.query('COMMIT');
                    console.log(`✅ Migration ${migration.version} completed`);
                    migrationsRun++;
                } catch (error) {
                    await this.pool.query('ROLLBACK');
                    console.error(`❌ Migration ${migration.version} failed:`, error);
                    throw error;
                }
            } else {
                console.log(`⏭️  Migration ${migration.version} already applied`);
            }
        }

        if (migrationsRun === 0) {
            console.log('✅ All migrations are up to date');
        } else {
            console.log(`✅ ${migrationsRun} migrations completed successfully`);
        }
    }

    public async rollbackMigration(version: number): Promise<void> {
        const migration = this.migrations.find(m => m.version === version);
        if (!migration) {
            throw new Error(`Migration ${version} not found`);
        }

        if (!migration.down) {
            throw new Error(`No rollback available for migration ${version}`);
        }

        console.log(`🔄 Rolling back migration ${version}: ${migration.name}`);

        try {
            await this.pool.query('BEGIN');
            await this.pool.query(migration.down);
            await this.pool.query('DELETE FROM migrations WHERE version = $1', [version]);
            await this.pool.query('COMMIT');
            console.log(`✅ Migration ${version} rolled back successfully`);
        } catch (error) {
            await this.pool.query('ROLLBACK');
            console.error(`❌ Rollback of migration ${version} failed:`, error);
            throw error;
        }
    }

    public async getMigrationStatus(): Promise<void> {
        const appliedMigrations = await this.getAppliedMigrations();

        console.log('\n📊 Migration Status:');
        console.log('==================');

        for (const migration of this.migrations) {
            const status = appliedMigrations.includes(migration.version)
                ? '✅ Applied'
                : '⏳ Pending';
            console.log(
                `${migration.version.toString().padStart(3)}: ${migration.name.padEnd(
                    30
                )} ${status}`
            );
        }

        console.log(
            `\nTotal: ${this.migrations.length} migrations, ${appliedMigrations.length} applied`
        );
    }
}
