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
  await db.close()
})

test.describe('Part 12: Cleanup', () => {
  // 12.1.1
  test('delete test agents', async ({ request }) => {
    const agents = await db.findAll('agent_registry', { user_id: CONFIG.testUser.uid })
    const e2eAgents = agents.filter(
      (a) =>
        (typeof a.slug === 'string' && a.slug.startsWith('e2e-')) ||
        (typeof a.name === 'string' && a.name.startsWith('[E2E]'))
    )

    for (const agent of e2eAgents) {
      await new Promise((r) => setTimeout(r, 200))
      const resp = await request.delete(`${API}/agents/${agent.id}`, { headers })
      expect([200, 204, 404, 429]).toContain(resp.status())
    }
  })

  // 12.1.2
  test('delete test conversations', async ({ request }) => {
    const resp = await request.get(`${API}/execute/conversations`, { headers })
    if (resp.status() !== 200) return

    const data = await unwrap<{ conversations: Array<{ id: string; title: string }> }>(resp)
    const convs = data.conversations || []
    const e2eConvs = convs.filter(
      (c) => typeof c.title === 'string' && c.title.startsWith('[E2E]')
    )

    for (const conv of e2eConvs) {
      await new Promise((r) => setTimeout(r, 200))
      await request.delete(`${API}/execute/conversations/${conv.id}`, { headers }).catch(() => {})
    }
  })

  // 12.1.3 — domains live in workspace.db (sandbox), not Neon
  test('clean up test data in Neon', async () => {
    await db.query(
      `DELETE FROM "agent_registry" WHERE "user_id" = $1 AND "slug" LIKE 'e2e-%'`,
      [CONFIG.testUser.uid]
    ).catch(() => {})
  })

  // 12.1.4
  test('restore display name if changed', async ({ request }) => {
    const user = await db.findById('users', CONFIG.testUser.uid, 'user_id')
    if (
      user &&
      typeof user.display_name === 'string' &&
      user.display_name.startsWith('[E2E]')
    ) {
      await request.patch(`${API}/users/me`, {
        headers,
        data: { display_name: 'HealthCard 360' },
      })
    }
  })

  // 12.1.5
  test('verify clean state — no E2E agents', async () => {
    const agents = await db.findAll('agent_registry', { user_id: CONFIG.testUser.uid })
    const e2eAgents = agents.filter(
      (a) =>
        (typeof a.slug === 'string' && a.slug.startsWith('e2e-')) ||
        (typeof a.name === 'string' && a.name.startsWith('[E2E]'))
    )
    expect(e2eAgents.length).toBe(0)
  })
})
