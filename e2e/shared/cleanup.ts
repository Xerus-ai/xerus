import { db } from './db'
import { CONFIG } from './config'

const TEST_USER_ID = CONFIG.testUser.uid

/**
 * Clean up test data created during E2E runs.
 * Uses single SQL queries instead of fetch-filter-loop-delete.
 */
export async function cleanupTestData(): Promise<void> {
  // Delete test conversations (cascades to execution_sessions via FK)
  await db.query(
    `DELETE FROM "conversations" WHERE "user_id" = $1 AND "title" LIKE '[E2E]%'`,
    [TEST_USER_ID]
  )

  // Delete test domains (cascades to channels, channel_messages, tasks)
  await db.query(
    `DELETE FROM "domains" WHERE "user_id" = $1 AND "name" LIKE '[E2E]%'`,
    [TEST_USER_ID]
  )

  // Delete cloned test agents
  await db.query(
    `DELETE FROM "agent_registry" WHERE "user_id" = $1 AND "slug" LIKE 'e2e-%'`,
    [TEST_USER_ID]
  )
}

/**
 * Delete a specific conversation by ID.
 */
export async function cleanupConversation(conversationId: string): Promise<void> {
  await db.deleteWhere('conversations', { id: conversationId })
}

/**
 * Delete a specific domain by ID (cascades channels, messages, tasks).
 */
export async function cleanupDomain(domainId: string): Promise<void> {
  await db.deleteWhere('domains', { id: domainId })
}

/**
 * Delete a specific agent by ID (cascades heartbeat_configs, snapshot_configs).
 */
export async function cleanupAgent(agentId: number): Promise<void> {
  await db.deleteWhere('agent_registry', { id: agentId })
}
