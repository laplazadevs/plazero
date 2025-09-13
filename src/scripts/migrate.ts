#!/usr/bin/env node

import { Pool } from 'pg';

import { MigrationManager } from '../migrations/migration-manager.js';
import { parseDatabaseConfig, getPoolConfig } from '../utils/database-config.js';

async function main(): Promise<void> {
    const command = process.argv[2];

    if (!command) {
        console.log(`
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
        `);
        process.exit(1);
    }

    const dbConfig = parseDatabaseConfig();

    console.log(`🔗 Connecting to database: ${dbConfig.user}@${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);

    try {
        switch (command) {
            case 'create-db':
                await createDatabase();
                break;
            case 'up':
                await runMigrations();
                break;
            case 'status':
                await showStatus();
                break;
            case 'rollback': {
                const version = process.argv[3];
                if (!version) {
                    console.error('❌ Please specify migration version to rollback');
                    console.log('Usage: npm run migrate rollback <version>');
                    process.exit(1);
                }
                await rollbackMigration(parseInt(version));
                break;
            }
            default:
                console.error(`❌ Unknown command: ${command}`);
                process.exit(1);
        }
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

async function createDatabase(): Promise<void> {
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
            console.log(`📝 Creating database: ${dbConfig.database}`);
            await adminPool.query(`CREATE DATABASE "${dbConfig.database}"`);
            console.log(`✅ Database '${dbConfig.database}' created successfully`);
        } else {
            console.log(`✅ Database '${dbConfig.database}' already exists`);
        }
    } finally {
        await adminPool.end();
    }
}

async function runMigrations(): Promise<void> {
    const pool = createPool();
    const migrationManager = new MigrationManager(pool);

    try {
        await migrationManager.ensureDatabaseExists();
        await migrationManager.runMigrations();
        console.log('🎉 All migrations completed successfully!');
    } finally {
        await pool.end();
    }
}

async function showStatus(): Promise<void> {
    const pool = createPool();
    const migrationManager = new MigrationManager(pool);

    try {
        await migrationManager.getMigrationStatus();
    } finally {
        await pool.end();
    }
}

async function rollbackMigration(version: number): Promise<void> {
    const pool = createPool();
    const migrationManager = new MigrationManager(pool);

    try {
        await migrationManager.rollbackMigration(version);
        console.log(`🎉 Migration ${version} rolled back successfully!`);
    } finally {
        await pool.end();
    }
}

function createPool(): Pool {
    const poolConfig = getPoolConfig();

    return new Pool(poolConfig);
}

main().catch(console.error);
