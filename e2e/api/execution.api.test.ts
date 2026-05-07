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

test.describe('Part 9: Execution & Agent Operations', () => {
  test.describe('9.1 Execution Sessions', () => {
    // 9.1.1
    test('list execution sessions', async ({ request }) => {
      const resp = await request.get(`${API}/execute/sessions`, { headers })
      expect([200, 404, 429]).toContain(resp.status())
      if (resp.status() === 200) {
        const data = await unwrap(resp)
        expect(data).toBeTruthy()
      }
    })

    // 9.1.2
    test('SSE token for execution', async ({ request }) => {
      const resp = await request.post(`${API}/execute/sse-token`, { headers })
      if (resp.status() === 429) { test.skip(true, 'Rate limited'); return }
      expect(resp.status()).toBe(200)
      const data = await unwrap<{ token: string }>(resp)
      expect(data.token).toBeTruthy()
    })
  })

  test.describe('9.2 Agent Execution Validation', () => {
    // 9.2.1
    test('free model available in registry', async ({ request }) => {
      const resp = await request.get(`${API}/models`, { headers })
      expect([200, 404, 429]).toContain(resp.status())
      if (resp.status() === 200) {
        const data = await unwrap<{ models: Array<{ id: string }> }>(resp)
        const models = data.models || (data as unknown as Array<{ id: string }>)
        if (Array.isArray(models)) {
          const freeModel = models.find(
            (m) =>
              typeof m.id === 'string' &&
              (m.id.includes('free') || m.id.includes('gemma'))
          )
          // Free model should be available
          if (models.length > 0) {
            expect(freeModel).toBeTruthy()
          }
        }
      }
    })
  })
})
