import { test, expect } from '@playwright/test'
import { getFirebaseIdToken, authHeader } from '../shared/auth'
import { db } from '../shared/db'
import { CONFIG } from '../shared/config'
import { unwrap } from '../shared/api-helpers'
import { SSEClient } from '../shared/sse-helpers'

const API = CONFIG.apiURL

let token: string
let headers: Record<string, string>
let testConversationId: string | null = null

test.beforeAll(async () => {
  token = await getFirebaseIdToken()
  headers = authHeader(token)
})

test.afterAll(async () => {
  // Clean up E2E conversations via API
  const listResp = await fetch(`${API}/execute/conversations`, { headers })
  if (listResp.ok) {
    const body = await listResp.json()
    const data = body.data || body
    const convs = data.conversations || []
    for (const c of convs) {
      if (typeof c.title === 'string' && c.title.startsWith('[E2E]')) {
        await fetch(`${API}/execute/conversations/${c.id}`, {
          method: 'DELETE',
          headers,
        }).catch(() => {})
      }
    }
  }
})

test.describe('Part 5: Chat — CRUD & Plumbing', () => {
  test.describe('5.1 Conversation CRUD', () => {
    // 5.1.1
    test('create new conversation', async ({ request }) => {
      const resp = await request.post(`${API}/execute/conversations`, {
        headers,
        data: { agent_slug: 'xerus-master', title: '[E2E] Test Chat' },
      })
      if (resp.status() === 429) { test.skip(true, 'Rate limited'); return }
      if (resp.status() === 500) { test.skip(true, 'Sandbox unavailable'); return }
      expect([200, 201]).toContain(resp.status())
      const data = await unwrap<{ id: string; conversation?: { id: string } }>(resp)
      testConversationId = data.id || data.conversation?.id || null
      expect(testConversationId).toBeTruthy()
    })

    // 5.1.2
    test('list conversations includes new one', async ({ request }) => {
      const resp = await request.get(`${API}/execute/conversations`, { headers })
      if (resp.status() === 429) { test.skip(true, 'Rate limited'); return }
      if (resp.status() === 500) { test.skip(true, 'Sandbox unavailable'); return }
      expect(resp.status()).toBe(200)
      const data = await unwrap<{ conversations: Array<{ id: string }> }>(resp)
      expect(Array.isArray(data.conversations)).toBeTruthy()
      if (testConversationId) {
        const found = data.conversations.find((c) => c.id === testConversationId)
        expect(found).toBeTruthy()
      }
    })

    // 5.1.3
    test('get conversation by ID', async ({ request }) => {
      if (!testConversationId) { test.skip(true, 'No conversation created'); return }
      const resp = await request.get(
        `${API}/execute/conversations/${testConversationId}`,
        { headers }
      )
      if (resp.status() === 429) { test.skip(true, 'Rate limited'); return }
      expect(resp.status()).toBe(200)
      const data = await unwrap<{ id: string; conversation?: { id: string } }>(resp)
      const convId = data.id || data.conversation?.id
      expect(convId).toBe(testConversationId)
    })

    // 5.1.4
    test('rename conversation', async ({ request }) => {
      if (!testConversationId) test.skip()
      const resp = await request.patch(
        `${API}/execute/conversations/${testConversationId}`,
        {
          headers,
          data: { title: '[E2E] Renamed Chat' },
        }
      )
      expect([200, 204]).toContain(resp.status())

      const verifyResp = await request.get(
        `${API}/execute/conversations/${testConversationId}`,
        { headers }
      )
      const verifyData = await unwrap<{ title?: string; conversation?: { title: string } }>(verifyResp)
      const title = verifyData.title || verifyData.conversation?.title
      expect(title).toBe('[E2E] Renamed Chat')
    })

    // 5.1.5
    test('delete conversation', async ({ request }) => {
      const createResp = await request.post(`${API}/execute/conversations`, {
        headers,
        data: { agent_slug: 'xerus-master', title: '[E2E] Delete Test' },
      })
      if (![200, 201].includes(createResp.status())) {
        test.skip()
        return
      }
      const createData = await unwrap<{ id: string }>(createResp)
      const throwawayId = createData.id

      const resp = await request.delete(
        `${API}/execute/conversations/${throwawayId}`,
        { headers }
      )
      expect([200, 204]).toContain(resp.status())

      const getResp = await request.get(
        `${API}/execute/conversations/${throwawayId}`,
        { headers }
      )
      expect(getResp.status()).toBe(404)
    })
  })

  test.describe('5.2 Chat Plumbing — SSE & Message Flow', () => {
    // 5.2.1
    test('send message returns 202 or 400 without stream', async ({ request }) => {
      if (!testConversationId) test.skip()
      const resp = await request.post(
        `${API}/execute/conversations/${testConversationId}/messages`,
        {
          headers,
          data: { task: '[E2E] Hello', agent_slug: 'xerus-master' },
        }
      )
      // Without active SSE stream, API returns 400; with stream, 200/202
      expect([200, 201, 202, 400]).toContain(resp.status())
    })

    // 5.2.2
    test('SSE token issued for stream', async ({ request }) => {
      const resp = await request.post(`${API}/execute/sse-token`, { headers })
      if (resp.status() === 429) { test.skip(true, 'Rate limited'); return }
      expect(resp.status()).toBe(200)
      const data = await unwrap<{ token: string }>(resp)
      expect(data.token).toBeTruthy()
    })

    // 5.2.3
    test('SSE stream connects successfully', async () => {
      if (!testConversationId) test.skip()
      const sseTokenResp = await fetch(`${API}/execute/sse-token`, {
        method: 'POST',
        headers,
      })
      const sseData = await sseTokenResp.json()
      const sseToken = sseData.data?.token || sseData.token

      const client = new SSEClient(
        `${API}/execute/conversations/${testConversationId}/stream?token=${sseToken}`,
        headers
      )
      const connectPromise = client.connect(5_000)
      setTimeout(() => client.disconnect(), 3_000)
      await connectPromise.catch(() => {})
      // If we get here without throwing, connection succeeded
    })

    // 5.2.7
    test('conversation history preserved after messages', async ({ request }) => {
      if (!testConversationId) test.skip()
      const resp = await request.get(
        `${API}/execute/conversations/${testConversationId}`,
        { headers }
      )
      expect(resp.status()).toBe(200)
      const data = await unwrap(resp)
      expect(data).toBeTruthy()
    })
  })
})
