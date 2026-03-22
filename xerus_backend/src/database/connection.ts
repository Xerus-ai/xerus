import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: true,
    max: parseInt(process.env.DB_POOL_MAX || process.env.DATABASE_POOL_MAX || '20', 10),
    min: parseInt(process.env.DATABASE_POOL_MIN || '6', 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
});

pool.on('error', (err: Error) => {
    // Neon serverless postgres closes idle connections - this is expected
    // Log but don't crash - the pool will create new connections as needed
    console.warn('Pool client error (will reconnect):', err.message);
});

export interface QueryOptions {
    text: string;
    values?: unknown[];
}

export async function query<T = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<T>> {
    const start = Date.now();
    const result = await pool.query<T>(text, values);
    const duration = Date.now() - start;

    if (process.env.NODE_ENV === 'development') {
        console.log('Executed query', { text, duration, rows: result.rowCount });
    }

    return result;
}

export async function getClient(): Promise<PoolClient> {
    return pool.connect();
}

export async function transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
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

export async function testConnection(): Promise<boolean> {
    const result = await pool.query('SELECT NOW()');
    console.log('Database connected:', result.rows[0]);
    return true;
}

/**
 * Eagerly establish pool connections by firing concurrent queries.
 * pg Pool creates connections lazily (min only prevents reaping),
 * so this forces N connections to be established at startup.
 * Call after testConnection() during server init.
 */
export async function warmPool(): Promise<void> {
    const target = parseInt(process.env.DATABASE_POOL_MIN || '6', 10);
    const t0 = Date.now();
    await Promise.all(
        Array.from({ length: target }, () => pool.query('SELECT 1')),
    );
    console.log(`Pool warmed: ${target} connections in ${Date.now() - t0}ms`);
}

export async function closePool(): Promise<void> {
    await pool.end();
}

export { pool };
