declare module 'pg' {
    export type QueryResultRow = Record<string, unknown>;

    export interface QueryResult<T = QueryResultRow> {
        rows: T[];
        rowCount: number | null;
    }

    export interface PoolClient {
        query<T = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<T>>;
        release(): void;
    }

    export interface PoolConfig {
        connectionString?: string;
        ssl?: unknown;
        max?: number;
        min?: number;
        idleTimeoutMillis?: number;
        connectionTimeoutMillis?: number;
        allowExitOnIdle?: boolean;
    }

    export class Pool {
        constructor(config?: PoolConfig);
        query<T = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<T>>;
        connect(): Promise<PoolClient>;
        end(): Promise<void>;
        on(event: string, listener: (...args: any[]) => void): void;
    }
}
