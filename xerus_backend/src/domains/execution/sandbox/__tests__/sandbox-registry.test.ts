// Sandbox Registry Tests
// TTL cache, inflight dedup, invalidation, eviction

import { SandboxRegistry, RegistryDatabase } from '../sandbox-registry';
import type { SandboxRegistryEntry } from '../sandbox.types';

function makeEntry(userId: string, status = 'running'): SandboxRegistryEntry {
    return {
        id: `ws-${userId}`,
        user_id: userId,
        slug: 'default',
        name: 'Default Workspace',
        sandbox_id: `sbx-${userId}`,
        sandbox_status: status as SandboxRegistryEntry['sandbox_status'],
        sandbox_template_version: null,
        sandbox_active_agent_id: null,
        sandbox_active_execution_count: 0,
        created_at: new Date(),
        sandbox_paused_at: null,
        sandbox_last_activity_at: new Date(),
        sandbox_total_runtime_seconds: 0,
        sandbox_resume_count: 0,
        sandbox_novnc_url: null,
    };
}

class InMemoryDB implements RegistryDatabase {
    public rows: Map<string, SandboxRegistryEntry> = new Map();
    public queryCount = 0;
    public lastQuery = '';
    public delay = 0;

    async query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> {
        this.lastQuery = sql;
        this.queryCount++;
        if (this.delay > 0) {
            await new Promise(resolve => setTimeout(resolve, this.delay));
        }
        const normalizedSql = sql.toLowerCase().trim();
        if (normalizedSql.includes('from workspaces') && normalizedSql.includes('where user_id')) {
            const userId = params?.[0] as string;
            const entry = this.rows.get(userId);
            return { rows: (entry ? [entry] : []) as T[] };
        }
        return { rows: [] };
    }
}

describe('SandboxRegistry', () => {
    let db: InMemoryDB;
    let registry: SandboxRegistry;

    beforeEach(() => {
        db = new InMemoryDB();
        registry = new SandboxRegistry(db);
    });

    describe('TTL cache', () => {
        it('caches getByUserId results within TTL window', async () => {
            db.rows.set('user-1', makeEntry('user-1'));

            const first = await registry.getByUserId('user-1');
            const second = await registry.getByUserId('user-1');

            expect(first).toEqual(second);
            expect(db.queryCount).toBe(1);
        });

        it('returns null for non-existent users', async () => {
            const result = await registry.getByUserId('user-missing');
            expect(result).toBeNull();
            expect(db.queryCount).toBe(1);
        });

        it('caches null results (negative cache)', async () => {
            await registry.getByUserId('user-missing');
            await registry.getByUserId('user-missing');
            expect(db.queryCount).toBe(1);
        });
    });

    describe('cache invalidation', () => {
        it('invalidates cache on persist', async () => {
            db.rows.set('user-1', makeEntry('user-1'));
            await registry.getByUserId('user-1');
            expect(db.queryCount).toBe(1);

            await registry.persist({
                userId: 'user-1',
                sandboxId: 'sbx-new',
                status: 'running',
                createdAt: new Date(),
                lastActivityAt: new Date(),
                wasResumed: false,
                activeExecutionCount: 0,
            });

            await registry.getByUserId('user-1');
            // persist INSERT + getByUserId SELECT = 2 more queries
            expect(db.queryCount).toBe(3);
        });

        it('invalidates cache on updateStatus', async () => {
            db.rows.set('user-1', makeEntry('user-1'));
            await registry.getByUserId('user-1');

            await registry.updateStatus('user-1', 'paused');
            await registry.getByUserId('user-1');
            expect(db.queryCount).toBe(3);
        });

        it('invalidates cache on incrementResumeCount', async () => {
            db.rows.set('user-1', makeEntry('user-1'));
            await registry.getByUserId('user-1');

            await registry.incrementResumeCount('user-1');
            await registry.getByUserId('user-1');
            expect(db.queryCount).toBe(3);
        });

        it('invalidate() clears cache for a specific user', async () => {
            db.rows.set('user-1', makeEntry('user-1'));
            db.rows.set('user-2', makeEntry('user-2'));
            await registry.getByUserId('user-1');
            await registry.getByUserId('user-2');
            expect(db.queryCount).toBe(2);

            registry.invalidate('user-1');
            await registry.getByUserId('user-1');
            await registry.getByUserId('user-2'); // still cached
            expect(db.queryCount).toBe(3);
        });
    });

    describe('inflight dedup', () => {
        it('collapses concurrent getByUserId calls into a single DB query', async () => {
            db.rows.set('user-1', makeEntry('user-1'));
            db.delay = 50; // simulate slow query

            const [r1, r2, r3] = await Promise.all([
                registry.getByUserId('user-1'),
                registry.getByUserId('user-1'),
                registry.getByUserId('user-1'),
            ]);

            expect(r1).toEqual(r2);
            expect(r2).toEqual(r3);
            expect(db.queryCount).toBe(1);
        });

        it('handles DB error during inflight dedup', async () => {
            let calls = 0;
            const failingDb: RegistryDatabase = {
                async query() {
                    calls++;
                    throw new Error('DB down');
                },
            };
            const reg = new SandboxRegistry(failingDb);

            const results = await Promise.allSettled([
                reg.getByUserId('user-1'),
                reg.getByUserId('user-1'),
            ]);

            // Both should reject with the same error
            expect(results[0].status).toBe('rejected');
            expect(results[1].status).toBe('rejected');
            // Only one actual DB call
            expect(calls).toBe(1);
        });

        it('allows new query after inflight error resolves', async () => {
            let shouldFail = true;
            db.rows.set('user-1', makeEntry('user-1'));
            const conditionalDb: RegistryDatabase = {
                async query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> {
                    if (shouldFail) throw new Error('transient');
                    return db.query<T>(sql, params);
                },
            };
            const reg = new SandboxRegistry(conditionalDb);

            await expect(reg.getByUserId('user-1')).rejects.toThrow('transient');

            shouldFail = false;
            const result = await reg.getByUserId('user-1');
            expect(result).not.toBeNull();
            expect(result!.user_id).toBe('user-1');
        });
    });
});
