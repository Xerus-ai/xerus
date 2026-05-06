import { test, expect } from '@playwright/test'
import { getFirebaseIdToken, authHeader } from '../shared/auth'
import { db } from '../shared/db'
import { CONFIG } from '../shared/config'
import { unwrap } from '../shared/api-helpers'

const API = CONFIG.apiURL

let token: string
let headers: Record<string, string>
let clonedAgentIds: number[] = []
let customAgentId: number | null = null
let testDomainId: string | null = null
let generalChannelId: string | null = null
let engineeringChannelId: string | null = null
let marketingChannelId: string | null = null

test.beforeAll(async () => {
  token = await getFirebaseIdToken()
  headers = authHeader(token)

  await new Promise((r) => setTimeout(r, 1000))

  const resp = await fetch(`${API}/company/domains`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: '[E2E] Agent Test Domain' }),
  })
  if (resp.ok) {
    const body = await resp.json()
    const data = body.data || body
    testDomainId = data.domain?.id
    generalChannelId = data.channel?.id

    for (const name of ['engineering', 'marketing']) {
      await new Promise((r) => setTimeout(r, 300))
      const chResp = await fetch(`${API}/company/domains/${testDomainId}/channels`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name }),
      })
      if (chResp.ok) {
        const chBody = await chResp.json()
        const chData = chBody.data || chBody
        const ch = chData.channel || chData
        if (name === 'engineering') engineeringChannelId = ch.id
        if (name === 'marketing') marketingChannelId = ch.id
      }
    }
  }
})

test.afterAll(async () => {
  for (const id of clonedAgentIds) {
    await db.deleteWhere('agent_registry', { id }).catch(() => {})
  }
  if (customAgentId) {
    await db.deleteWhere('agent_registry', { id: customAgentId }).catch(() => {})
  }
  if (testDomainId) {
    await db.deleteWhere('domains', { id: testDomainId }).catch(() => {})
  }
})

test.describe('Part 3: Agent Lifecycle', () => {
  test.describe('3.1 Browse & Import Marketplace Agents', () => {
    let marketplaceAgents: Array<{ id: number; slug: string }> = []

    // 3.1.1
    test('list marketplace agents', async ({ request }) => {
      const resp = await request.get(`${API}/agents/marketplace`, { headers })
      if (resp.status() === 429) { test.skip(true, 'Rate limited'); return }
      expect(resp.status()).toBe(200)
      const data = await unwrap<{ agents: Array<{ id: number; slug: string }> }>(resp)
      const agents = data.agents || (data as unknown as Array<{ id: number; slug: string }>)
      expect(Array.isArray(agents)).toBeTruthy()
      expect(agents.length).toBeGreaterThan(0)
      marketplaceAgents = agents
    })

    // 3.1.2
    test('view marketplace agent detail', async ({ request }) => {
      const agents = await db.findAll('agent_registry', {})
      const maven = agents.find((a) => a.slug === 'maven-max')
      if (!maven) { test.skip(true, 'maven-max not in DB'); return }

      const resp = await request.get(`${API}/agents/${maven.id}`, { headers })
      if (resp.status() === 429) { test.skip(true, 'Rate limited'); return }
      expect(resp.status()).toBe(200)
    })

    // 3.1.3 - Clone by ID (route is POST /agents/:id/clone)
    test('clone marketplace agent', async ({ request }) => {
      const agents = await db.findAll('agent_registry', {})
      const marketplace = agents.find(
        (a) => a.slug === 'maven-max' || (typeof a.is_marketplace === 'boolean' && a.is_marketplace)
      )
      if (!marketplace) { test.skip(true, 'No marketplace agent found'); return }

      const resp = await request.post(`${API}/agents/${marketplace.id}/clone`, { headers })
      if (resp.status() === 429) { test.skip(true, 'Rate limited'); return }
      expect([200, 201]).toContain(resp.status())
      const cloned = await db.findLatest('agent_registry', { user_id: CONFIG.testUser.uid })
      clonedAgentIds.push(cloned.id as number)
    })

    // 3.1.6
    test('list my agents', async ({ request }) => {
      const resp = await request.get(`${API}/agents/mine`, { headers })
      if (resp.status() === 429) { test.skip(true, 'Rate limited'); return }
      expect(resp.status()).toBe(200)
      const data = await unwrap<{ agents: unknown[] }>(resp)
      const agents = data.agents || (data as unknown as unknown[])
      expect(Array.isArray(agents)).toBeTruthy()
    })
  })

  test.describe('3.2 Create Custom Agent', () => {
    // 3.2.1
    test('create agent via API', async ({ request }) => {
      const resp = await request.post(`${API}/agents`, {
        headers,
        data: {
          name: '[E2E] Growth Hacker',
          slug: 'e2e-growth-hacker',
          description: 'Custom growth agent',
          model: 'gemma-4-31b-it:free',
        },
      })
      if (resp.status() === 429) { test.skip(true, 'Rate limited'); return }
      expect([200, 201]).toContain(resp.status())
      const agent = await db.findLatest('agent_registry', {
        user_id: CONFIG.testUser.uid,
      })
      if (agent && agent.slug === 'e2e-growth-hacker') {
        customAgentId = agent.id as number
      }
    })

    // 3.2.2
    test('update agent config', async ({ request }) => {
      if (!customAgentId) { test.skip(true, 'No custom agent'); return }
      const resp = await request.patch(`${API}/agents/${customAgentId}`, {
        headers,
        data: { description: 'Updated E2E description' },
      })
      if (resp.status() === 429) { test.skip(true, 'Rate limited'); return }
      expect([200, 204]).toContain(resp.status())
    })

    // 3.2.3
    test('custom agent appears in list', async ({ request }) => {
      const resp = await request.get(`${API}/agents`, { headers })
      if (resp.status() === 429) { test.skip(true, 'Rate limited'); return }
      const data = await unwrap<{ agents: Array<{ slug: string }> }>(resp)
      const agents = data.agents || (data as unknown as Array<{ slug: string }>)
      if (customAgentId) {
        const found = agents.find((a) => a.slug === 'e2e-growth-hacker')
        expect(found).toBeTruthy()
      }
    })
  })

  test.describe('3.4 Agent Channel Assignment', () => {
    // 3.4.1
    test('assign agent to #general', async ({ request }) => {
      if (!clonedAgentIds[0] || !generalChannelId) { test.skip(true, 'Missing prereqs'); return }
      const resp = await request.post(`${API}/agents/${clonedAgentIds[0]}/channels`, {
        headers,
        data: { channelSlug: 'general' },
      })
      if (resp.status() === 429) { test.skip(true, 'Rate limited'); return }
      expect([200, 201]).toContain(resp.status())
    })

    // 3.4.4
    test('set agent as lead of channel', async ({ request }) => {
      if (!clonedAgentIds[0]) { test.skip(true, 'No cloned agent'); return }
      const resp = await request.post(
        `${API}/agents/${clonedAgentIds[0]}/channels/general/primary`,
        { headers }
      )
      if (resp.status() === 429) { test.skip(true, 'Rate limited'); return }
      expect([200, 201, 204]).toContain(resp.status())
    })

    // 3.4.5
    test('list channel agents', async ({ request }) => {
      if (!generalChannelId) { test.skip(true, 'No channel'); return }
      const resp = await request.get(`${API}/company/channels/${generalChannelId}/agents`, {
        headers,
      })
      if (resp.status() === 429) { test.skip(true, 'Rate limited'); return }
      expect(resp.status()).toBe(200)
    })

    // 3.4.6
    test('remove agent from channel', async ({ request }) => {
      if (!clonedAgentIds[0]) { test.skip(true, 'No agent'); return }
      const resp = await request.delete(
        `${API}/agents/${clonedAgentIds[0]}/channels/general`,
        { headers }
      )
      if (resp.status() === 429) { test.skip(true, 'Rate limited'); return }
      expect([200, 204]).toContain(resp.status())
    })

    // 3.4.7
    test('re-assign agent after removal', async ({ request }) => {
      if (!clonedAgentIds[0]) { test.skip(true, 'No agent'); return }
      const resp = await request.post(`${API}/agents/${clonedAgentIds[0]}/channels`, {
        headers,
        data: { channelSlug: 'general' },
      })
      if (resp.status() === 429) { test.skip(true, 'Rate limited'); return }
      expect([200, 201]).toContain(resp.status())
    })
  })
})
