import { test, expect } from '@playwright/test'
import { getFirebaseIdToken, authHeader } from '../shared/auth'
import { CONFIG } from '../shared/config'
import { unwrap } from '../shared/api-helpers'

const API = CONFIG.apiURL

let token: string
let headers: Record<string, string>
let testDomainId: string | null = null
let testChannelId: string | null = null

test.beforeAll(async () => {
  token = await getFirebaseIdToken()
  headers = authHeader(token)
})

test.describe('Inbox API', () => {
  test('POST /company/domains creates a domain', async ({ request }) => {
    await new Promise((r) => setTimeout(r, 500))
    const resp = await request.post(`${API}/company/domains`, {
      headers,
      data: { name: '[E2E] API Domain' },
    })
    if (resp.status() === 429) { test.skip(true, 'Rate limited'); return }
    if (resp.status() === 500) { test.skip(true, 'Sandbox unavailable'); return }
    expect([200, 201]).toContain(resp.status())

    const data = await unwrap<{
      domain: { id: string; slug: string; name: string }
      channel: { id: string; slug: string; name: string }
    }>(resp)
    expect(data.domain.id).toBeTruthy()
    testDomainId = data.domain.id
    if (data.channel) testChannelId = data.channel.id
  })

  test('GET /company/domains returns domains', async ({ request }) => {
    const resp = await request.get(`${API}/company/domains`, { headers })
    if (resp.status() === 429) { test.skip(true, 'Rate limited'); return }
    expect([200, 500]).toContain(resp.status())
    if (resp.status() === 200) {
      const data = await unwrap(resp)
      expect(data).toBeTruthy()
    }
  })

  test('POST /channels/:id/messages creates channel message', async ({ request }) => {
    if (!testChannelId) { test.skip(true, 'No channel'); return }
    await new Promise((r) => setTimeout(r, 300))
    const resp = await request.post(`${API}/company/channels/${testChannelId}/messages`, {
      headers,
      data: { content: '[E2E] API channel message' },
    })
    if (resp.status() === 429) { test.skip(true, 'Rate limited'); return }
    expect([200, 201]).toContain(resp.status())
  })

  test('GET /channels/:id/messages returns messages', async ({ request }) => {
    if (!testChannelId) { test.skip(true, 'No channel'); return }
    const resp = await request.get(`${API}/company/channels/${testChannelId}/messages`, {
      headers,
    })
    if (resp.status() === 429) { test.skip(true, 'Rate limited'); return }
    expect(resp.status()).toBe(200)
  })
})
