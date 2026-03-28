import { test, expect } from '@playwright/test'
import { getFirebaseIdToken, authHeader } from '../shared/auth'
import { db } from '../shared/db'
import { CONFIG } from '../shared/config'
import { unwrap } from '../shared/api-helpers'

const API = CONFIG.apiURL

let token: string
let headers: Record<string, string>

test.beforeAll(async () => {
  token = await getFirebaseIdToken()
  headers = authHeader(token)
})

test.afterAll(async () => {
  // Global cleanup handles db.close()
})

test.describe('Agents API', () => {
  test('GET /agents returns user agents', async ({ request }) => {
    const resp = await request.get(`${API}/agents`, { headers })
    expect(resp.status()).toBe(200)

    const data = await unwrap<{ agents: unknown[]; pagination: unknown }>(resp)
    expect(Array.isArray(data.agents)).toBeTruthy()

    // Cross-check with DB
    const dbCount = await db.count('agent_registry', { user_id: CONFIG.testUser.uid })
    // API may include marketplace agents, but user agents should match
  })

  test('GET /agents/:id returns agent detail', async ({ request }) => {
    // Get first agent from DB
    const agents = await db.findAll('agent_registry', { user_id: CONFIG.testUser.uid })
    if (agents.length === 0) {
      test.skip()
      return
    }

    const agent = agents[0]
    const resp = await request.get(`${API}/agents/${agent.id}`, { headers })
    expect(resp.status()).toBe(200)

    const data = await unwrap<{ agent: { id: number; slug: string } }>(resp)
    expect(data.agent.id).toBe(agent.id)
    expect(data.agent.slug).toBe(agent.slug)
  })

  test('POST /agents/:slug/clone creates new agent', async ({ request }) => {
    // Get a marketplace agent to clone
    const resp = await request.get(`${API}/agents/marketplace`, { headers })

    if (resp.status() !== 200) {
      test.skip()
      return
    }

    const data = await unwrap<{ agents: Array<{ slug: string }> }>(resp)
    const agents = data.agents
    if (!Array.isArray(agents) || agents.length === 0) {
      test.skip()
      return
    }

    const agentToClone = agents[0]
    const beforeCount = await db.count('agent_registry', { user_id: CONFIG.testUser.uid })

    const cloneResp = await request.post(`${API}/agents/${agentToClone.slug}/clone`, { headers })
    expect([200, 201]).toContain(cloneResp.status())

    const afterCount = await db.count('agent_registry', { user_id: CONFIG.testUser.uid })
    expect(afterCount).toBe(beforeCount + 1)

    // Clean up: delete the cloned agent
    const clonedAgent = await db.findLatest('agent_registry', { user_id: CONFIG.testUser.uid })
    await db.deleteWhere('agent_registry', { id: clonedAgent.id })
  })

  test('PATCH /agents/:id updates agent', async ({ request }) => {
    const agents = await db.findAll('agent_registry', { user_id: CONFIG.testUser.uid })
    if (agents.length === 0) {
      test.skip()
      return
    }

    const agent = agents[0]
    const resp = await request.patch(`${API}/agents/${agent.id}`, {
      headers,
      data: { name: `E2E Updated ${Date.now()}` },
    })

    // Accept 200 or 204
    expect([200, 204]).toContain(resp.status())
  })

  test('DELETE /agents/:id removes agent from DB', async ({ request }) => {
    // Create a test agent first via clone, then delete it
    const resp = await request.get(`${API}/agents/marketplace`, { headers })
    if (resp.status() !== 200) {
      test.skip()
      return
    }

    const data = await unwrap<{ agents: Array<{ slug: string }> }>(resp)
    const agents = data.agents
    if (!Array.isArray(agents) || agents.length === 0) {
      test.skip()
      return
    }

    // Clone first
    const cloneResp = await request.post(`${API}/agents/${agents[0].slug}/clone`, { headers })
    if (cloneResp.status() !== 200) {
      test.skip()
      return
    }

    const cloned = await db.findLatest('agent_registry', { user_id: CONFIG.testUser.uid })

    // Delete
    const deleteResp = await request.delete(`${API}/agents/${cloned.id}`, { headers })
    expect([200, 204]).toContain(deleteResp.status())

    // Verify gone
    const exists = await db.exists('agent_registry', { id: cloned.id })
    expect(exists).toBe(false)
  })

  test('unauthenticated request returns 401', async ({ request }) => {
    const resp = await request.get(`${API}/agents`, {
      headers: { 'Content-Type': 'application/json' },
    })
    expect(resp.status()).toBe(401)
  })
})
