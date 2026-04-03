import { test, expect } from '@playwright/test'
import { getFirebaseIdToken, authHeader } from '../shared/auth'
import { CONFIG } from '../shared/config'
import { unwrap } from '../shared/api-helpers'

const API = CONFIG.apiURL

let token: string
let headers: Record<string, string>

test.beforeAll(async () => {
  token = await getFirebaseIdToken()
  headers = authHeader(token)
})

test.describe('Chat API', () => {
  test('POST /execute/conversations creates a conversation', async ({ request }) => {
    // Get before count via API
    const beforeResp = await request.get(`${API}/execute/conversations`, { headers })
    const beforeData = await unwrap<{ conversations: { id: string }[]; total: number }>(beforeResp)
    const beforeCount = beforeData.total

    const resp = await request.post(`${API}/execute/conversations`, {
      headers,
      data: { agent_slug: 'xerus-master', title: '[E2E] API Test Conversation' },
    })

    expect([200, 201]).toContain(resp.status())
    const data = await unwrap<{ id: string; agent_slug: string }>(resp)
    expect(data.id).toBeTruthy()
    expect(data.agent_slug).toBe('xerus-master')

    // Verify via API (conversations now in workspace.db, not Neon)
    const afterResp = await request.get(`${API}/execute/conversations`, { headers })
    const afterData = await unwrap<{ conversations: { id: string }[]; total: number }>(afterResp)
    expect(afterData.total).toBe(beforeCount + 1)
  })

  test('GET /execute/conversations lists conversations', async ({ request }) => {
    const resp = await request.get(`${API}/execute/conversations`, { headers })
    expect(resp.status()).toBe(200)

    const data = await unwrap<{ conversations: unknown[] }>(resp)
    expect(Array.isArray(data.conversations)).toBeTruthy()
  })

  test('GET /execute/conversations/:id returns conversation detail', async ({ request }) => {
    // Get conversations via API (workspace.db, not Neon)
    const listResp = await request.get(`${API}/execute/conversations`, { headers })
    const listData = await unwrap<{ conversations: { id: string }[] }>(listResp)

    if (listData.conversations.length === 0) {
      test.skip()
      return
    }

    const conv = listData.conversations[0]
    const resp = await request.get(`${API}/execute/conversations/${conv.id}`, { headers })
    expect(resp.status()).toBe(200)

    const data = await unwrap<{ conversation: { id: string } }>(resp)
    expect(data.conversation.id).toBe(conv.id)
  })

  test('POST /execute/conversations/:id/messages requires active stream', async ({
    request,
  }) => {
    // Create a conversation first
    const createResp = await request.post(`${API}/execute/conversations`, {
      headers,
      data: { agent_slug: 'xerus-master', title: '[E2E] Message Test' },
    })
    const conv = await unwrap<{ id: string }>(createResp)

    // The execution system requires an SSE stream connection first
    // (GET /conversations/:id/stream), then POST messages.
    // Without the stream, the API returns 400 "No active stream".
    const msgResp = await request.post(`${API}/execute/conversations/${conv.id}/messages`, {
      headers,
      data: { task: '[E2E] API test message', agent_slug: 'xerus-master' },
    })

    // Expect 400 (no active stream) or 404 (conversation in workspace.db, not Neon)
    expect([400, 404]).toContain(msgResp.status())
    const body = await msgResp.json()
    expect(body.success).toBe(false)
  })

  test('DELETE /execute/conversations/:id removes conversation', async ({ request }) => {
    // Create one
    const createResp = await request.post(`${API}/execute/conversations`, {
      headers,
      data: { agent_slug: 'xerus-master', title: '[E2E] Delete Test' },
    })
    const conv = await unwrap<{ id: string }>(createResp)

    // Delete it
    const deleteResp = await request.delete(`${API}/execute/conversations/${conv.id}`, {
      headers,
    })
    expect([200, 204]).toContain(deleteResp.status())

    // Verify gone via API (workspace.db, not Neon)
    const getResp = await request.get(`${API}/execute/conversations/${conv.id}`, { headers })
    expect(getResp.status()).toBe(404)
  })
})
