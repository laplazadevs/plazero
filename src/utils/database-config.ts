export interface DatabaseConfig {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
}

export interface PoolConfig {
    connectionString?: string;
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;
}

export function parseDatabaseConfig(): DatabaseConfig {
    // Check if DATABASE_URL is provided (common in production environments)
    const databaseUrl = process.env.DATABASE_URL;
    
    if (databaseUrl) {
        try {
            const url = new URL(databaseUrl);
            return {
                host: url.hostname,
                port: parseInt(url.port) || 5432,
                database: url.pathname.slice(1), // Remove leading slash
                user: url.username,
                password: url.password,
            };
        } catch (error) {
            console.warn('⚠️ Failed to parse DATABASE_URL, falling back to individual environment variables');
        }
    }
    
    // Fallback to individual environment variables
    return {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'plazero_bot',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'password',
    };
}

export function getPoolConfig(): PoolConfig {
    // Use DATABASE_URL if provided (preferred for production)
    if (process.env.DATABASE_URL) {
        return {
            connectionString: process.env.DATABASE_URL,
        };
    }
    
    // Fallback to individual environment variables
    return {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'plazero_bot',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'password',
    };
}
