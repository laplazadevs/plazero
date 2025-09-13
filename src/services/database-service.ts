import { Pool, PoolClient, QueryResult } from 'pg';

import { MigrationManager } from '../migrations/migration-manager.js';

export class DatabaseService {
    private pool: Pool;
    private static instance: DatabaseService;

    private constructor() {
        // Use DATABASE_URL if provided, otherwise construct from individual variables
        const connectionConfig = process.env.DATABASE_URL
            ? {
                  connectionString: process.env.DATABASE_URL,
              }
            : {
                  host: process.env.DB_HOST || 'localhost',
                  port: parseInt(process.env.DB_PORT || '5432'),
                  database: process.env.PGDATABASE || 'plazero_bot',
                  user: process.env.PGUSER || 'postgres',
                  password: process.env.POSTGRES_PASSWORD || 'password',
              };

        this.pool = new Pool({
            ...connectionConfig,
            max: 20, // Maximum number of clients in the pool
            idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
            connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
        });

        // Handle pool errors
        this.pool.on('error', (err: Error) => {
            console.error('Unexpected error on idle client', err);
        });
    }

    public static getInstance(): DatabaseService {
        if (!DatabaseService.instance) {
            DatabaseService.instance = new DatabaseService();
        }
        return DatabaseService.instance;
    }

    public async query(text: string, params?: any[]): Promise<QueryResult> {
        const start = Date.now();
        try {
            const result = await this.pool.query(text, params);
            const duration = Date.now() - start;
            console.log('Executed query', { text, duration, rows: result.rowCount });
            return result;
        } catch (error) {
            console.error('Database query error:', error);
            throw error;
        }
    }

    public async getClient(): Promise<PoolClient> {
        return await this.pool.connect();
    }

    public async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
        const client = await this.getClient();
        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    public async close(): Promise<void> {
        await this.pool.end();
    }

    public async testConnection(): Promise<boolean> {
        try {
            await this.query('SELECT NOW()');
            console.log('Database connection successful');
            return true;
        } catch (error) {
            console.error('Database connection failed:', error);
            return false;
        }
    }

    public async initializeSchema(): Promise<void> {
        console.log('🔄 Running database migrations...');

        const migrationManager = new MigrationManager(this.pool);

        try {
            await migrationManager.ensureDatabaseExists();
            await migrationManager.runMigrations();
            console.log('✅ Database schema initialized successfully');
        } catch (error) {
            console.error('❌ Failed to initialize database schema:', error);
            throw error;
        }
    }

    public async createCleanupFunctions(): Promise<void> {
        // Cleanup functions are now created by migrations
        console.log('✅ Cleanup functions are managed by migrations');
    }

    public async runCleanup(): Promise<void> {
        try {
            console.log('🧹 Running database cleanup...');

            const result = await this.query('SELECT * FROM run_all_cleanup()');
            const cleanup = result.rows[0];

            console.log('✅ Cleanup completed:', {
                votes: cleanup.votes_cleaned || 0,
                cooldowns: cleanup.cooldowns_cleaned || 0,
                welcomeRequests: cleanup.welcome_requests_cleaned || 0,
            });
        } catch (error) {
            console.error('❌ Error during cleanup:', error);
        }
    }
}
