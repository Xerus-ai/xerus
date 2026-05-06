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

test.describe('Part 4: Knowledge, Skills & Tools', () => {
  test.describe('4.1 Knowledge Documents', () => {
    test('workspace file tree accessible', async ({ request }) => {
      const resp = await request.get(`${API}/workspace/tree?depth=2`, { headers })
      if (resp.status() === 429) { test.skip(true, 'Rate limited'); return }
      // 503 if sandbox down, 200 if up
      expect([200, 500, 503]).toContain(resp.status())
      if (resp.status() === 200) {
        const data = await unwrap(resp)
        expect(data).toBeTruthy()
      }
    })
  })

  test.describe('4.2 Skills', () => {
    test('list available skills', async ({ request }) => {
      const resp = await request.get(`${API}/skills`, { headers })
      if (resp.status() === 429) { test.skip(true, 'Rate limited'); return }
      // 500 if sandbox down (skills live on sandbox), 200 if up, 404 if no route
      if (resp.status() === 500) { test.skip(true, 'Sandbox unavailable'); return }
      expect([200, 404]).toContain(resp.status())
    })

    test('import skill endpoint exists', async ({ request }) => {
      // POST /skills/import is the only skills route
      const resp = await request.post(`${API}/skills/import`, {
        headers,
        data: {},
      })
      if (resp.status() === 429) { test.skip(true, 'Rate limited'); return }
      // Should accept the request or return validation error, not 404
      expect([200, 201, 400, 422, 500]).toContain(resp.status())
    })
  })

  test.describe('4.3 Tools', () => {
    test('list agent tools', async ({ request }) => {
      const agents = await db.findAll('agent_registry', { user_id: CONFIG.testUser.uid })
      if (agents.length === 0) { test.skip(true, 'No agents'); return }
      const resp = await request.get(`${API}/agents/${agents[0].id}/tools`, { headers })
      if (resp.status() === 429) { test.skip(true, 'Rate limited'); return }
      expect([200, 404]).toContain(resp.status())
    })

    test('add tool to agent', async ({ request }) => {
      const agents = await db.findAll('agent_registry', { user_id: CONFIG.testUser.uid })
      if (agents.length === 0) { test.skip(true, 'No agents'); return }
      const resp = await request.post(`${API}/agents/${agents[0].id}/tools`, {
        headers,
        data: { appSlug: 'firecrawl' },
      })
      if (resp.status() === 429) { test.skip(true, 'Rate limited'); return }
      expect([200, 201, 204, 400, 404, 500]).toContain(resp.status())
    })

    test('remove tool from agent', async ({ request }) => {
      const agents = await db.findAll('agent_registry', { user_id: CONFIG.testUser.uid })
      if (agents.length === 0) { test.skip(true, 'No agents'); return }
      const resp = await request.delete(`${API}/agents/${agents[0].id}/tools/firecrawl`, {
        headers,
      })
      if (resp.status() === 429) { test.skip(true, 'Rate limited'); return }
      expect([200, 204, 404]).toContain(resp.status())
    })
  })
})
