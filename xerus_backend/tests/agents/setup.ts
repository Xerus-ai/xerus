// Agent Tests Setup
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

import { query } from '../../src/database/connection';

async function cleanupTestAgents(): Promise<void> {
  await query("DELETE FROM heartbeat_executions WHERE agent_id IN (SELECT id FROM agent_registry WHERE slug LIKE 'test-%')");
  await query("DELETE FROM heartbeat_configs WHERE agent_id IN (SELECT id FROM agent_registry WHERE slug LIKE 'test-%')");
  await query("DELETE FROM agent_registry WHERE slug LIKE 'test-%'");
  await query("DELETE FROM users WHERE user_id LIKE 'test_agent_%'");
}

async function createTestUser(userId: string): Promise<void> {
  // Generate unique email using timestamp + random to avoid UNIQUE constraint violations
  const uniqueEmail = `${userId}_${Date.now()}_${Math.random().toString(36).substring(7)}@test.com`;
  await query(`
    INSERT INTO users (user_id, email, display_name)
    VALUES ($1, $2, $3)
    ON CONFLICT (user_id) DO UPDATE SET
      email = EXCLUDED.email,
      display_name = EXCLUDED.display_name
  `, [userId, uniqueEmail, 'Test User']);
}

beforeAll(async () => {
  await cleanupTestAgents();
});

// afterAll cleanup removed - global tests/setup.ts handles cleanup and pool closure

export { query, createTestUser };
