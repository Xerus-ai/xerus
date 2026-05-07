import { db } from './db'
import { CONFIG } from './config'

const TEST_USER_ID = CONFIG.testUser.uid

/**
 * Clean up test data created during E2E runs.
 * Only cleans Neon tables — domain/channel data lives in sandbox workspace.db.
 */
export async function cleanupTestData(): Promise<void> {
  // Delete cloned test agents from agent_registry (Neon)
  await db.query(
    `DELETE FROM "agent_registry" WHERE "user_id" = $1 AND "slug" LIKE 'e2e-%'`,
    [TEST_USER_ID]
  ).catch(() => {})
}

/**
 * Delete a specific agent by ID.
 */
export async function cleanupAgent(agentId: number): Promise<void> {
  await db.deleteWhere('agent_registry', { id: agentId })
}
