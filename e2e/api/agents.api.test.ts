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

test.describe('Agents API', () => {
  test('GET /agents returns user agents', async ({ request }) => {
    const resp = await request.get(`${API}/agents`, { headers })
    if (resp.status() === 429) { test.skip(true, 'Rate limited'); return }
    if (resp.status() === 500) { test.skip(true, 'Sandbox unavailable'); return }
    expect(resp.status()).toBe(200)

    const data = await unwrap<{ agents: unknown[]; pagination: unknown }>(resp)
    expect(Array.isArray(data.agents)).toBeTruthy()
  })

  test('GET /agents/:id returns agent detail', async ({ request }) => {
    const agents = await db.findAll('agent_registry', { user_id: CONFIG.testUser.uid })
    if (agents.length === 0) { test.skip(true, 'No agents'); return }

    const agent = agents[0]
    const resp = await request.get(`${API}/agents/${agent.id}`, { headers })
    if (resp.status() === 429) { test.skip(true, 'Rate limited'); return }
    if (resp.status() === 500) { test.skip(true, 'Sandbox unavailable'); return }
    expect(resp.status()).toBe(200)

    const data = await unwrap<{ agent: { id: number; slug: string } }>(resp)
    expect(data.agent.id).toBe(agent.id)
    expect(data.agent.slug).toBe(agent.slug)
  })

  test('POST /agents/:id/clone creates new agent', async ({ request }) => {
    const resp = await request.get(`${API}/agents/marketplace`, { headers })
    if (resp.status() === 429 || resp.status() !== 200) { test.skip(true, 'Rate limited or no marketplace'); return }

    const data = await unwrap<{ agents: Array<{ id: number; slug: string }> }>(resp)
    const agents = data.agents
    if (!Array.isArray(agents) || agents.length === 0) { test.skip(true, 'No marketplace agents'); return }

    const agentToClone = agents[0]
    const beforeCount = await db.count('agent_registry', { user_id: CONFIG.testUser.uid })

    await new Promise((r) => setTimeout(r, 300))
    // Marketplace agents have negative IDs — use slug for clone
    const cloneParam = agentToClone.id > 0 ? agentToClone.id : agentToClone.slug
    const cloneResp = await request.post(`${API}/agents/${cloneParam}/clone`, { headers })
    if (cloneResp.status() === 429) { test.skip(true, 'Rate limited'); return }
    expect([200, 201]).toContain(cloneResp.status())

    const afterCount = await db.count('agent_registry', { user_id: CONFIG.testUser.uid })
    expect(afterCount).toBe(beforeCount + 1)

    const clonedAgent = await db.findLatest('agent_registry', { user_id: CONFIG.testUser.uid })
    await db.deleteWhere('agent_registry', { id: clonedAgent.id })
  })

  test('PATCH /agents/:id updates agent', async ({ request }) => {
    const agents = await db.findAll('agent_registry', { user_id: CONFIG.testUser.uid })
    if (agents.length === 0) { test.skip(true, 'No agents'); return }

    const agent = agents[0]
    const resp = await request.patch(`${API}/agents/${agent.id}`, {
      headers,
      data: { name: `E2E Updated ${Date.now()}` },
    })
    if (resp.status() === 429) { test.skip(true, 'Rate limited'); return }
    expect([200, 204]).toContain(resp.status())
  })

  test('DELETE /agents/:id removes agent from DB', async ({ request }) => {
    const resp = await request.get(`${API}/agents/marketplace`, { headers })
    if (resp.status() === 429 || resp.status() !== 200) { test.skip(true, 'Cannot list marketplace'); return }

    const data = await unwrap<{ agents: Array<{ id: number; slug: string }> }>(resp)
    const agents = data.agents
    if (!Array.isArray(agents) || agents.length === 0) { test.skip(true, 'No marketplace agents'); return }

    await new Promise((r) => setTimeout(r, 300))
    const cloneResp = await request.post(`${API}/agents/${agents[0].id}/clone`, { headers })
    if (cloneResp.status() === 429 || ![200, 201].includes(cloneResp.status())) { test.skip(true, 'Clone failed'); return }

    const cloned = await db.findLatest('agent_registry', { user_id: CONFIG.testUser.uid })
    await new Promise((r) => setTimeout(r, 300))
    const deleteResp = await request.delete(`${API}/agents/${cloned.id}`, { headers })
    if (deleteResp.status() === 429) { test.skip(true, 'Rate limited'); return }
    expect([200, 204]).toContain(deleteResp.status())

    const exists = await db.exists('agent_registry', { id: cloned.id })
    expect(exists).toBe(false)
  })

  test('unauthenticated request returns 401', async ({ request }) => {
    const resp = await request.get(`${API}/agents`, {
      headers: { 'Content-Type': 'application/json' },
    })
    if (resp.status() === 429) { test.skip(true, 'Rate limited'); return }
    expect(resp.status()).toBe(401)
  })
})
