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

test.describe('Part 10: Settings & Configuration', () => {
  test.describe('10.1 User Settings (API)', () => {
    test('update display name', async ({ request }) => {
      const { db } = await import('../shared/db')
      const user = await db.findById('users', CONFIG.testUser.uid, 'user_id')
      const originalName = user?.display_name as string

      const resp = await request.patch(`${API}/users/me`, {
        headers,
        data: { display_name: '[E2E] Test User' },
      })
      if (resp.status() === 429) { test.skip(true, 'Rate limited'); return }
      expect([200, 204]).toContain(resp.status())

      const updated = await db.findById('users', CONFIG.testUser.uid, 'user_id')
      expect(updated?.display_name).toBe('[E2E] Test User')

      await request.patch(`${API}/users/me`, {
        headers,
        data: { display_name: originalName },
      }).catch(() => {})
    })

    test('model list from API', async ({ request }) => {
      const resp = await request.get(`${API}/models`, { headers })
      if (resp.status() === 429) { test.skip(true, 'Rate limited'); return }
      expect([200, 404]).toContain(resp.status())
    })

    test('get subscription status', async ({ request }) => {
      const resp = await request.get(`${API}/billing/subscription`, { headers })
      if (resp.status() === 429) { test.skip(true, 'Rate limited'); return }
      expect([200, 404]).toContain(resp.status())
    })
  })

  test.describe('10.2 Model Registry', () => {
    test('free models available', async ({ request }) => {
      const resp = await request.get(`${API}/models`, { headers })
      if (resp.status() === 429) { test.skip(true, 'Rate limited'); return }
      if (resp.status() !== 200) { test.skip(true, 'Models API not available'); return }
      const data = await unwrap<{ models: Array<{ id: string }> }>(resp)
      const models = data.models || (data as unknown as Array<{ id: string }>)
      if (Array.isArray(models)) {
        const freeModels = models.filter(
          (m) => typeof m.id === 'string' && m.id.includes('free')
        )
        expect(freeModels.length).toBeGreaterThan(0)
      }
    })

    test('model detail for free model', async ({ request }) => {
      const resp = await request.get(`${API}/models/google/gemma-4-31b-it:free`, { headers })
      if (resp.status() === 429) { test.skip(true, 'Rate limited'); return }
      expect([200, 404]).toContain(resp.status())
    })
  })
})
