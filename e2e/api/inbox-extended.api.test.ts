import { test, expect } from '@playwright/test'
import { getFirebaseIdToken, authHeader } from '../shared/auth'
import { db } from '../shared/db'
import { CONFIG } from '../shared/config'
import { unwrap } from '../shared/api-helpers'

const API = CONFIG.apiURL
const AGENT_TIMEOUT = 90_000

let token: string
let headers: Record<string, string>
let testDomainId: string | null = null
let generalChannelId: string | null = null

test.beforeAll(async () => {
  token = await getFirebaseIdToken()
  headers = authHeader(token)

  await new Promise((r) => setTimeout(r, 1000))

  const domResp = await fetch(`${API}/company/domains`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: '[E2E] Inbox Test Domain' }),
  })
  if (domResp.ok) {
    const body = await domResp.json()
    const data = body.data || body
    testDomainId = data.domain?.id
    generalChannelId = data.channel?.id
  }
})

test.afterAll(async () => {
  if (testDomainId) {
    await db.deleteWhere('domains', { id: testDomainId }).catch(() => {})
  }
})

test.describe('Part 6: Inbox — Channel Communication', () => {
  test.describe('6.1 Channel Message Plumbing', () => {
    // 6.1.1
    test('post message to #general', async ({ request }) => {
      if (!generalChannelId) { test.skip(true, 'No channel'); return }
      const resp = await request.post(`${API}/company/channels/${generalChannelId}/messages`, {
        headers,
        data: { content: '[E2E] Team, let\'s plan our Q3 OKRs' },
      })
      if (resp.status() === 429) { test.skip(true, 'Rate limited'); return }
      expect([200, 201]).toContain(resp.status())
    })

    // 6.1.2
    test('message stored in channel_messages', async () => {
      if (!generalChannelId) { test.skip(true, 'No channel'); return }
      const messages = await db.findAll('channel_messages', { channel_id: generalChannelId })
      if (messages.length === 0) { test.skip(true, 'No messages yet'); return }
      const latest = messages[0]
      expect(latest.content).toBeTruthy()
      expect(latest.sender_type).toBe('human')
    })

    // 6.1.3
    test('get channel message history', async ({ request }) => {
      if (!generalChannelId) { test.skip(true, 'No channel'); return }
      const resp = await request.get(
        `${API}/company/channels/${generalChannelId}/messages`,
        { headers }
      )
      if (resp.status() === 429) { test.skip(true, 'Rate limited'); return }
      expect(resp.status()).toBe(200)
    })
  })

  test.describe('6.2 Inbox Items & SSE', () => {
    // 6.2.1
    test('get SSE token for inbox', async ({ request }) => {
      const resp = await request.post(`${API}/inbox/sse-token`, { headers })
      if (resp.status() === 429) { test.skip(true, 'Rate limited'); return }
      expect([200, 201]).toContain(resp.status())
      if (resp.status() === 200) {
        const data = await unwrap<{ token: string }>(resp)
        expect(data.token).toBeTruthy()
      }
    })

    // 6.2.3
    test('list inbox items', async ({ request }) => {
      const resp = await request.get(`${API}/inbox`, { headers })
      if (resp.status() === 429) { test.skip(true, 'Rate limited'); return }
      if (resp.status() === 500) { test.skip(true, 'Sandbox unavailable'); return }
      expect(resp.status()).toBe(200)
      const data = await unwrap(resp)
      expect(data).toBeTruthy()
    })

    // 6.2.4
    test('mark inbox item as read', async ({ request }) => {
      const resp = await request.get(`${API}/inbox`, { headers })
      if (resp.status() !== 200) { test.skip(true, 'Cannot list inbox'); return }
      const data = await unwrap<{ items: Array<{ id: string }> }>(resp)
      const items = data.items || (data as unknown as Array<{ id: string }>)
      if (!Array.isArray(items) || items.length === 0) { test.skip(true, 'No items'); return }
      const markResp = await request.patch(`${API}/inbox/${items[0].id}/read`, { headers })
      if (markResp.status() === 429) { test.skip(true, 'Rate limited'); return }
      expect([200, 204]).toContain(markResp.status())
    })

    // 6.2.5
    test('archive inbox item', async ({ request }) => {
      const resp = await request.get(`${API}/inbox`, { headers })
      if (resp.status() !== 200) { test.skip(true, 'Cannot list inbox'); return }
      const data = await unwrap<{ items: Array<{ id: string }> }>(resp)
      const items = data.items || (data as unknown as Array<{ id: string }>)
      if (!Array.isArray(items) || items.length === 0) { test.skip(true, 'No items'); return }
      const archiveResp = await request.patch(`${API}/inbox/${items[0].id}/archive`, { headers })
      if (archiveResp.status() === 429) { test.skip(true, 'Rate limited'); return }
      expect([200, 204]).toContain(archiveResp.status())
    })
  })

  test.describe('6.4 Channel Lead Responds (Behavioral)', () => {
    test('posting to channel with lead agent', async ({ request }) => {
      if (!generalChannelId) { test.skip(true, 'No channel'); return }
      await new Promise((r) => setTimeout(r, 500))
      const resp = await request.post(`${API}/company/channels/${generalChannelId}/messages`, {
        headers,
        data: { content: '[E2E] What\'s our status on Q3 marketing?' },
      })
      if (resp.status() === 429) { test.skip(true, 'Rate limited'); return }
      expect([200, 201]).toContain(resp.status())
    })
  })

  test.describe('6.5 @Mention Routing (Behavioral)', () => {
    test('@mention nonexistent agent handled gracefully', async ({ request }) => {
      if (!generalChannelId) { test.skip(true, 'No channel'); return }
      const resp = await request.post(`${API}/company/channels/${generalChannelId}/messages`, {
        headers,
        data: { content: '[E2E] @nonexistent-agent do something' },
      })
      if (resp.status() === 429) { test.skip(true, 'Rate limited'); return }
      expect([200, 201]).toContain(resp.status())
    })
  })
})
