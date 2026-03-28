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
  // Clean up E2E conversations with a single query
  await db.query(
    `DELETE FROM "conversations" WHERE "user_id" = $1 AND "title" LIKE '[E2E]%'`,
    [CONFIG.testUser.uid]
  )
})

test.describe('Chat API', () => {
  test('POST /execute/conversations creates a conversation', async ({ request }) => {
    const beforeCount = await db.count('conversations', { user_id: CONFIG.testUser.uid })

    const resp = await request.post(`${API}/execute/conversations`, {
      headers,
      data: { title: '[E2E] API Test Conversation' },
    })

    expect([200, 201]).toContain(resp.status())
    const data = await unwrap<{ id: string }>(resp)
    expect(data.id).toBeTruthy()

    // Verify in DB
    const afterCount = await db.count('conversations', { user_id: CONFIG.testUser.uid })
    expect(afterCount).toBe(beforeCount + 1)

    const conversation = await db.findById('conversations', data.id)
    expect(conversation).toBeTruthy()
    expect(conversation?.user_id).toBe(CONFIG.testUser.uid)
  })

  test('GET /execute/conversations lists conversations', async ({ request }) => {
    const resp = await request.get(`${API}/execute/conversations`, { headers })
    expect(resp.status()).toBe(200)

    const data = await unwrap<{ conversations: unknown[] }>(resp)
    expect(Array.isArray(data.conversations)).toBeTruthy()
  })

  test('GET /execute/conversations/:id returns conversation detail', async ({ request }) => {
    const conversations = await db.findAll('conversations', { user_id: CONFIG.testUser.uid })
    if (conversations.length === 0) {
      test.skip()
      return
    }

    const conv = conversations[0]
    const resp = await request.get(`${API}/execute/conversations/${conv.id}`, { headers })
    expect(resp.status()).toBe(200)

    const data = await unwrap<{ id: string }>(resp)
    expect(data.id).toBe(conv.id)
  })

  test('POST /execute/conversations/:id/messages requires active stream', async ({
    request,
  }) => {
    // Create a conversation first
    const createResp = await request.post(`${API}/execute/conversations`, {
      headers,
      data: { title: '[E2E] Message Test' },
    })
    const conv = await unwrap<{ id: string }>(createResp)

    // The execution system requires an SSE stream connection first
    // (GET /conversations/:id/stream), then POST messages.
    // Without the stream, the API returns 400 "No active stream".
    // Full message + execution flow is tested in UI tests (02-chat.spec.ts).
    const msgResp = await request.post(`${API}/execute/conversations/${conv.id}/messages`, {
      headers,
      data: { task: '[E2E] API test message', agent_slug: 'xerus-master' },
    })

    // Expect 400 (no agent assigned or no active stream) — validates endpoint exists and auth works
    expect(msgResp.status()).toBe(400)
    const body = await msgResp.json()
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('BAD_REQUEST')
  })

  test('DELETE /execute/conversations/:id removes conversation', async ({ request }) => {
    // Create one
    const createResp = await request.post(`${API}/execute/conversations`, {
      headers,
      data: { title: '[E2E] Delete Test' },
    })
    const conv = await unwrap<{ id: string }>(createResp)

    // Delete it
    const deleteResp = await request.delete(`${API}/execute/conversations/${conv.id}`, {
      headers,
    })
    expect([200, 204]).toContain(deleteResp.status())

    // Verify gone
    const exists = await db.exists('conversations', { id: conv.id })
    expect(exists).toBe(false)
  })
})
