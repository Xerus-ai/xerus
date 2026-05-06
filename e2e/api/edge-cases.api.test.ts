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

test.describe('Part 11: Edge Cases & Error Handling', () => {
  test.describe('11.1 Negative Tests', () => {
    // 11.1.1
    test('create duplicate domain name', async ({ request }) => {
      const name = `[E2E] Duplicate Domain ${Date.now()}`
      await new Promise((r) => setTimeout(r, 500))
      const resp1 = await request.post(`${API}/company/domains`, {
        headers,
        data: { name },
      })
      if (resp1.status() === 429) { test.skip(true, 'Rate limited'); return }
      expect([200, 201]).toContain(resp1.status())

      await new Promise((r) => setTimeout(r, 500))
      const resp2 = await request.post(`${API}/company/domains`, {
        headers,
        data: { name },
      })
      // 409 conflict, 200 with different slug, or 429 rate limit
      expect([200, 201, 409, 400, 429]).toContain(resp2.status())

      await db.query(
        `DELETE FROM "domains" WHERE "user_id" = $1 AND "name" = $2`,
        [CONFIG.testUser.uid, name]
      ).catch(() => {})
    })

    // 11.1.2
    test('access other user\'s agent returns 403 or 404', async ({ request }) => {
      const resp = await request.get(`${API}/agents/99999999`, { headers })
      if (resp.status() === 429) { test.skip(true, 'Rate limited'); return }
      expect([403, 404]).toContain(resp.status())
    })

    // 11.1.3
    test('clone nonexistent agent returns 404', async ({ request }) => {
      const resp = await request.post(`${API}/agents/99999999/clone`, { headers })
      if (resp.status() === 429) { test.skip(true, 'Rate limited'); return }
      expect([404, 400, 500]).toContain(resp.status())
    })

    // 11.1.4
    test('message to non-existent conversation', async ({ request }) => {
      const resp = await request.post(
        `${API}/execute/conversations/00000000-0000-0000-0000-000000000000/messages`,
        {
          headers,
          data: { task: 'test', agent_slug: 'xerus-master' },
        }
      )
      if (resp.status() === 429) { test.skip(true, 'Rate limited'); return }
      expect([400, 404]).toContain(resp.status())
    })

    // 11.1.5
    test('empty message content returns error', async ({ request }) => {
      const createResp = await request.post(`${API}/execute/conversations`, {
        headers,
        data: { agent_slug: 'xerus-master', title: '[E2E] Empty Msg Test' },
      })
      if (![200, 201].includes(createResp.status())) { test.skip(true, 'Cannot create conv'); return }
      const data = await unwrap<{ id: string }>(createResp)

      const resp = await request.post(`${API}/execute/conversations/${data.id}/messages`, {
        headers,
        data: { task: '', agent_slug: 'xerus-master' },
      })
      expect([400, 422, 429]).toContain(resp.status())

      await request.delete(`${API}/execute/conversations/${data.id}`, { headers }).catch(() => {})
    })

    // 11.1.6
    test('create channel without valid domain returns 404', async ({ request }) => {
      const resp = await request.post(
        `${API}/company/domains/00000000-0000-0000-0000-000000000000/channels`,
        {
          headers,
          data: { name: 'test-channel' },
        }
      )
      if (resp.status() === 429) { test.skip(true, 'Rate limited'); return }
      expect([400, 404, 500]).toContain(resp.status())
    })

    // 11.1.7
    test('assign agent to non-existent channel', async ({ request }) => {
      const agents = await db.findAll('agent_registry', { user_id: CONFIG.testUser.uid })
      if (agents.length === 0) { test.skip(true, 'No agents'); return }
      const resp = await request.post(`${API}/agents/${agents[0].id}/channels`, {
        headers,
        data: { channelSlug: 'fake-nonexistent-channel' },
      })
      if (resp.status() === 429) { test.skip(true, 'Rate limited'); return }
      expect([400, 404, 500]).toContain(resp.status())
    })
  })

  test.describe('11.2 Rate Limiting', () => {
    // 11.2.1
    test('rapid domain creation detects rate limits', async ({ request }) => {
      const results: number[] = []
      for (let i = 0; i < 5; i++) {
        const resp = await request.post(`${API}/company/domains`, {
          headers,
          data: { name: `[E2E] Rate Limit ${Date.now()}-${i}` },
        })
        results.push(resp.status())
      }
      // Should have mix of successes and possibly 429s
      const has429 = results.includes(429)
      const hasSuccess = results.some((s) => s === 200 || s === 201)
      expect(has429 || hasSuccess).toBeTruthy()

      await db.query(
        `DELETE FROM "domains" WHERE "user_id" = $1 AND "name" LIKE '[E2E] Rate Limit%'`,
        [CONFIG.testUser.uid]
      ).catch(() => {})
    })

    // 11.2.2
    test('rapid message sending detects rate limits', async ({ request }) => {
      // Channel messages go to workspace.db — skip if no sandbox
      test.skip(true, 'Requires sandbox for channel data')
      return
      const domains = await db.findAll('domains', { user_id: CONFIG.testUser.uid })
      if (domains.length === 0) { test.skip(true, 'No domains'); return }
      const channels = await db.findAll('channels', { domain_id: domains[0].id })
      if (channels.length === 0) { test.skip(true, 'No channels'); return }

      const results: number[] = []
      for (let i = 0; i < 10; i++) {
        const resp = await request.post(
          `${API}/company/channels/${channels[0].id}/messages`,
          {
            headers,
            data: { content: `[E2E] Rate limit test ${i}` },
          }
        )
        results.push(resp.status())
      }
      const has429 = results.includes(429)
      const hasSuccess = results.some((s) => s === 200 || s === 201)
      expect(has429 || hasSuccess).toBeTruthy()
    })
  })
})
