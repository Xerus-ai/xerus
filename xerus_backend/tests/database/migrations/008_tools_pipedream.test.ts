import { query } from '../../../src/database/connection';
import fs from 'fs';
import path from 'path';

describe('Migration 008: Tools Pipedream', () => {
  beforeAll(async () => {
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, '../../../src/database/migrations/008_tools_pipedream.sql'),
      'utf-8'
    );
    await query(migrationSQL);
  });

  describe('Cleanup', () => {
    it('should drop legacy Connectors tables', async () => {
      const legacyTables = ['tool_configurations', 'mcp_tool_manifests'];

      for (const tableName of legacyTables) {
        const result = await query(
          `SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name = $1
          )`,
          [tableName]
        );
        expect(result.rows[0].exists).toBe(false);
      }
    });
  });

  describe('connected_accounts table', () => {
    it('should exist with correct schema', async () => {
      const result = await query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'connected_accounts'
        ORDER BY ordinal_position
      `);

      expect(result.rows).toEqual([
        expect.objectContaining({ column_name: 'id', data_type: 'integer', is_nullable: 'NO' }),
        expect.objectContaining({ column_name: 'user_id', data_type: 'character varying', is_nullable: 'NO' }),
        expect.objectContaining({ column_name: 'app_slug', data_type: 'character varying', is_nullable: 'NO' }),
        expect.objectContaining({ column_name: 'app_name', data_type: 'character varying', is_nullable: 'NO' }),
        expect.objectContaining({
          column_name: 'pipedream_account_id',
          data_type: 'character varying',
          is_nullable: 'NO',
        }),
        expect.objectContaining({
          column_name: 'created_at',
          data_type: 'timestamp with time zone',
          is_nullable: 'NO',
        }),
        expect.objectContaining({
          column_name: 'last_used_at',
          data_type: 'timestamp with time zone',
          is_nullable: 'YES',
        }),
      ]);
    });

    it('should have correct indexes', async () => {
      const result = await query(`
        SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'connected_accounts'
        ORDER BY indexname
      `);

      const indexNames = result.rows.map((r: any) => r.indexname);
      expect(indexNames).toContain('connected_accounts_pkey');
      expect(indexNames).toContain('idx_connected_accounts_user');
      expect(indexNames).toContain('idx_connected_accounts_app');
      expect(indexNames).toContain('idx_connected_accounts_pipedream');
    });

    it('should have unique constraint on pipedream_account_id', async () => {
      const result = await query(`
        SELECT constraint_name, constraint_type
        FROM information_schema.table_constraints
        WHERE table_name = 'connected_accounts'
        AND constraint_type = 'UNIQUE'
      `);

      const uniqueConstraints = result.rows.map((r: any) => r.constraint_name);
      expect(uniqueConstraints).toContain('connected_accounts_pipedream_account_id_key');
    });

    it('should enforce foreign key to users', async () => {
      const result = await query(`
        SELECT constraint_name
        FROM information_schema.table_constraints
        WHERE table_name = 'connected_accounts'
        AND constraint_type = 'FOREIGN KEY'
      `);

      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.rows.some((r: any) => r.constraint_name.includes('user'))).toBe(true);
    });
  });

  describe('agent_tools table', () => {
    it('should exist with correct schema', async () => {
      const result = await query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'agent_tools'
        ORDER BY ordinal_position
      `);

      expect(result.rows).toEqual([
        expect.objectContaining({ column_name: 'id', data_type: 'integer', is_nullable: 'NO' }),
        expect.objectContaining({ column_name: 'agent_id', data_type: 'integer', is_nullable: 'NO' }),
        expect.objectContaining({ column_name: 'app_slug', data_type: 'character varying', is_nullable: 'NO' }),
        expect.objectContaining({
          column_name: 'created_at',
          data_type: 'timestamp with time zone',
          is_nullable: 'NO',
        }),
      ]);
    });

    it('should have correct indexes', async () => {
      const result = await query(`
        SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'agent_tools'
        ORDER BY indexname
      `);

      const indexNames = result.rows.map((r: any) => r.indexname);
      expect(indexNames).toContain('agent_tools_pkey');
      expect(indexNames).toContain('idx_agent_tools_agent');
      expect(indexNames).toContain('idx_agent_tools_app');
      expect(indexNames).toContain('agent_tools_unique');
    });

    it('should enforce unique constraint on agent_id and app_slug', async () => {
      const result = await query(`
        SELECT constraint_name
        FROM information_schema.table_constraints
        WHERE table_name = 'agent_tools'
        AND constraint_type = 'UNIQUE'
      `);

      const uniqueConstraints = result.rows.map((r: any) => r.constraint_name);
      expect(uniqueConstraints).toContain('agent_tools_unique');
    });

    it('should enforce foreign key to agents', async () => {
      const result = await query(`
        SELECT constraint_name
        FROM information_schema.table_constraints
        WHERE table_name = 'agent_tools'
        AND constraint_type = 'FOREIGN KEY'
      `);

      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.rows.some((r: any) => r.constraint_name.includes('agent'))).toBe(true);
    });
  });

  describe('tool_executions table', () => {
    it('should exist with correct schema', async () => {
      const result = await query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'tool_executions'
        ORDER BY ordinal_position
      `);

      expect(result.rows).toEqual([
        expect.objectContaining({ column_name: 'id', data_type: 'integer', is_nullable: 'NO' }),
        expect.objectContaining({ column_name: 'agent_id', data_type: 'integer', is_nullable: 'YES' }),
        expect.objectContaining({ column_name: 'run_id', data_type: 'integer', is_nullable: 'YES' }),
        expect.objectContaining({ column_name: 'app_slug', data_type: 'character varying', is_nullable: 'NO' }),
        expect.objectContaining({ column_name: 'action_key', data_type: 'character varying', is_nullable: 'NO' }),
        expect.objectContaining({ column_name: 'input', data_type: 'jsonb', is_nullable: 'YES' }),
        expect.objectContaining({ column_name: 'output', data_type: 'jsonb', is_nullable: 'YES' }),
        expect.objectContaining({ column_name: 'success', data_type: 'boolean', is_nullable: 'NO' }),
        expect.objectContaining({ column_name: 'error', data_type: 'text', is_nullable: 'YES' }),
        expect.objectContaining({ column_name: 'duration_ms', data_type: 'integer', is_nullable: 'YES' }),
        expect.objectContaining({
          column_name: 'created_at',
          data_type: 'timestamp with time zone',
          is_nullable: 'NO',
        }),
      ]);
    });

    it('should have correct indexes', async () => {
      const result = await query(`
        SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'tool_executions'
        ORDER BY indexname
      `);

      const indexNames = result.rows.map((r: any) => r.indexname);
      expect(indexNames).toContain('tool_executions_pkey');
      expect(indexNames).toContain('idx_tool_executions_agent');
      expect(indexNames).toContain('idx_tool_executions_run');
      expect(indexNames).toContain('idx_tool_executions_app');
      expect(indexNames).toContain('idx_tool_executions_created');
      expect(indexNames).toContain('idx_tool_executions_success');
    });

    it('should enforce foreign keys to agents and agent_runs', async () => {
      const result = await query(`
        SELECT constraint_name
        FROM information_schema.table_constraints
        WHERE table_name = 'tool_executions'
        AND constraint_type = 'FOREIGN KEY'
      `);

      expect(result.rows.length).toBe(2);
      expect(result.rows.some((r: any) => r.constraint_name.includes('agent'))).toBe(true);
      expect(result.rows.some((r: any) => r.constraint_name.includes('run'))).toBe(true);
    });
  });

  describe('Data integrity', () => {
    let testUserId: string;
    let testAgentId: number;

    beforeAll(async () => {
      const userResult = await query(
        `INSERT INTO users (user_id, email, role, is_active)
         VALUES ($1, $2, 'user', true)
         RETURNING user_id`,
        [`test_user_${Date.now()}`, `test_${Date.now()}@example.com`]
      );
      testUserId = userResult.rows[0].user_id;

      const agentResult = await query(
        `INSERT INTO agents (name, description, system_prompt, user_id, agent_type)
         VALUES ($1, $2, $3::jsonb, $4, 'private')
         RETURNING id`,
        [`Test Agent ${Date.now()}`, 'Test Description', '""', testUserId]
      );
      testAgentId = agentResult.rows[0].id;
    });

    afterAll(async () => {
      await query('DELETE FROM agents WHERE id = $1', [testAgentId]);
      await query('DELETE FROM users WHERE user_id = $1', [testUserId]);
    });

    it('should allow inserting connected_accounts', async () => {
      const result = await query(
        `INSERT INTO connected_accounts (user_id, app_slug, app_name, pipedream_account_id)
         VALUES ($1, 'gmail', 'Gmail', $2)
         RETURNING id`,
        [testUserId, `pd_acc_${Date.now()}`]
      );

      expect(result.rows[0].id).toBeDefined();

      await query('DELETE FROM connected_accounts WHERE id = $1', [result.rows[0].id]);
    });

    it('should allow inserting agent_tools', async () => {
      const result = await query(
        `INSERT INTO agent_tools (agent_id, app_slug)
         VALUES ($1, 'slack')
         RETURNING id`,
        [testAgentId]
      );

      expect(result.rows[0].id).toBeDefined();

      await query('DELETE FROM agent_tools WHERE id = $1', [result.rows[0].id]);
    });

    it('should prevent duplicate agent_tools entries', async () => {
      await query(`INSERT INTO agent_tools (agent_id, app_slug) VALUES ($1, 'github')`, [testAgentId]);

      await expect(
        query(`INSERT INTO agent_tools (agent_id, app_slug) VALUES ($1, 'github')`, [testAgentId])
      ).rejects.toThrow();

      await query('DELETE FROM agent_tools WHERE agent_id = $1 AND app_slug = $2', [testAgentId, 'github']);
    });

    it('should allow inserting tool_executions', async () => {
      const result = await query(
        `INSERT INTO tool_executions (agent_id, app_slug, action_key, success, duration_ms)
         VALUES ($1, 'gmail', 'gmail-send-email', true, 250)
         RETURNING id`,
        [testAgentId]
      );

      expect(result.rows[0].id).toBeDefined();

      await query('DELETE FROM tool_executions WHERE id = $1', [result.rows[0].id]);
    });

    it('should cascade delete agent_tools when agent is deleted', async () => {
      const tempAgentResult = await query(
        `INSERT INTO agents (name, description, system_prompt, user_id, agent_type)
         VALUES ('Temp Agent', 'Temp', $1::jsonb, $2, 'private')
         RETURNING id`,
        ['""', testUserId]
      );
      const tempAgentId = tempAgentResult.rows[0].id;

      await query(`INSERT INTO agent_tools (agent_id, app_slug) VALUES ($1, 'notion')`, [tempAgentId]);

      await query('DELETE FROM agents WHERE id = $1', [tempAgentId]);

      const toolsResult = await query(`SELECT * FROM agent_tools WHERE agent_id = $1`, [tempAgentId]);
      expect(toolsResult.rows.length).toBe(0);
    });

    it('should cascade delete connected_accounts when user is deleted', async () => {
      const tempUserResult = await query(
        `INSERT INTO users (user_id, email, role, is_active)
         VALUES ($1, $2, 'user', true)
         RETURNING user_id`,
        [`temp_user_${Date.now()}`, `temp_${Date.now()}@example.com`]
      );
      const tempUserId = tempUserResult.rows[0].user_id;

      await query(
        `INSERT INTO connected_accounts (user_id, app_slug, app_name, pipedream_account_id)
         VALUES ($1, 'dropbox', 'Dropbox', $2)`,
        [tempUserId, `pd_acc_temp_${Date.now()}`]
      );

      await query('DELETE FROM users WHERE user_id = $1', [tempUserId]);

      const accountsResult = await query(`SELECT * FROM connected_accounts WHERE user_id = $1`, [tempUserId]);
      expect(accountsResult.rows.length).toBe(0);
    });
  });
});
