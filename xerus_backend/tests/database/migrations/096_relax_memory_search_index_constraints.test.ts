import { query } from '../../../src/database/connection';
import fs from 'fs';
import path from 'path';

// Verifies migration 096 relaxes the memory_search_index scope/memory_type CHECK
// constraints to accept the v2 hierarchical memory model. Runs against the test
// database (real service, no mocks).

const ZERO_VECTOR = `[${new Array(1536).fill(0).join(',')}]`;

describe('Migration 096: relax memory_search_index constraints', () => {
    beforeAll(async () => {
        const migrationSQL = fs.readFileSync(
            path.join(__dirname, '../../../src/database/migrations/096_relax_memory_search_index_constraints.sql'),
            'utf-8',
        );
        await query(migrationSQL);
    });

    describe('constraint definitions', () => {
        async function constraintDef(name: string): Promise<string> {
            const result = await query<{ def: string }>(
                `SELECT pg_get_constraintdef(con.oid) AS def
                 FROM pg_constraint con
                 JOIN pg_class rel ON rel.oid = con.conrelid
                 WHERE rel.relname = 'memory_search_index' AND con.conname = $1`,
                [name],
            );
            expect(result.rows.length).toBe(1);
            return result.rows[0].def;
        }

        it('msi_scope_check accepts the v2 scopes', async () => {
            const def = await constraintDef('msi_scope_check');
            for (const scope of ['company', 'project', 'channel', 'agent', 'user', 'entity', 'topic']) {
                expect(def).toContain(`'${scope}'`);
            }
        });

        it('msi_memory_type_check accepts the v2 memory types', async () => {
            const def = await constraintDef('msi_memory_type_check');
            for (const type of ['working', 'expertise', 'context', 'learnings', 'patterns', 'decisions', 'standup', 'vision', 'preferences']) {
                expect(def).toContain(`'${type}'`);
            }
        });
    });

    describe('data integrity', () => {
        let testUserId: string;
        let testWorkspaceId: string;

        beforeAll(async () => {
            testUserId = `test_msi_${Date.now()}`;
            await query(
                `INSERT INTO users (user_id, email, display_name, role, is_active)
                 VALUES ($1, $2, 'MSI Test', 'user', true)`,
                [testUserId, `${testUserId}@test.local`],
            );
            const ws = await query<{ id: string }>(
                `INSERT INTO workspaces (user_id, slug, name)
                 VALUES ($1, $2, 'MSI Test Workspace')
                 RETURNING id`,
                [testUserId, `msi-test-${Date.now()}`],
            );
            testWorkspaceId = ws.rows[0].id;
        });

        afterAll(async () => {
            await query('DELETE FROM memory_search_index WHERE workspace_id = $1', [testWorkspaceId]);
            await query('DELETE FROM workspaces WHERE id = $1', [testWorkspaceId]);
            await query('DELETE FROM users WHERE user_id = $1', [testUserId]);
        });

        it('accepts a v2 row (memory_type=expertise, scope=agent) that the old constraint rejected', async () => {
            const result = await query<{ id: string }>(
                `INSERT INTO memory_search_index
                    (workspace_id, file_path, chunk_start_line, chunk_end_line, content, content_hash, memory_type, scope, agent_slug, embedding)
                 VALUES ($1, 'agents/seo-agent/expertise.md', 1, 5, 'expertise content', 'hash-expertise', 'expertise', 'agent', 'seo-agent', $2::vector)
                 RETURNING id`,
                [testWorkspaceId, ZERO_VECTOR],
            );
            expect(result.rows[0].id).toBeDefined();
        });

        it('accepts a company-scoped context row', async () => {
            const result = await query<{ id: string }>(
                `INSERT INTO memory_search_index
                    (workspace_id, file_path, chunk_start_line, chunk_end_line, content, content_hash, memory_type, scope, embedding)
                 VALUES ($1, 'company/decisions.md', 1, 3, 'company decision', 'hash-company', 'context', 'company', $2::vector)
                 RETURNING id`,
                [testWorkspaceId, ZERO_VECTOR],
            );
            expect(result.rows[0].id).toBeDefined();
        });

        it('still rejects an unknown scope value', async () => {
            await expect(
                query(
                    `INSERT INTO memory_search_index
                        (workspace_id, file_path, chunk_start_line, chunk_end_line, content, content_hash, memory_type, scope, embedding)
                     VALUES ($1, 'agents/x/working.md', 1, 2, 'x', 'hash-bad-scope', 'working', 'bogus_scope', $2::vector)`,
                    [testWorkspaceId, ZERO_VECTOR],
                ),
            ).rejects.toThrow();
        });

        it('still rejects an unknown memory_type value', async () => {
            await expect(
                query(
                    `INSERT INTO memory_search_index
                        (workspace_id, file_path, chunk_start_line, chunk_end_line, content, content_hash, memory_type, scope, embedding)
                     VALUES ($1, 'agents/x/working.md', 1, 2, 'x', 'hash-bad-type', 'not_a_type', 'agent', $2::vector)`,
                    [testWorkspaceId, ZERO_VECTOR],
                ),
            ).rejects.toThrow();
        });
    });
});
