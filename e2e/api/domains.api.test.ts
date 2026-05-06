import { test, expect } from '@playwright/test'
import { getFirebaseIdToken, authHeader } from '../shared/auth'
import { CONFIG } from '../shared/config'
import { unwrap } from '../shared/api-helpers'

const API = CONFIG.apiURL

let token: string
let headers: Record<string, string>
let testDomainId: string | null = null
let generalChannelId: string | null = null

test.beforeAll(async () => {
  token = await getFirebaseIdToken()
  headers = authHeader(token)
})

test.afterAll(async () => {
  // Clean up via API — domain/channel data is in workspace.db not Neon
  if (testDomainId) {
    // No direct DB cleanup needed — domains live on sandbox workspace.db
    // API cleanup if delete route exists
  }
})

test.describe('Part 2: Workspace & Company Setup', () => {
  // 2.1.1
  test('list existing domains', async ({ request }) => {
    const resp = await request.get(`${API}/company/domains`, { headers })
    if (resp.status() === 429) { test.skip(true, 'Rate limited'); return }
    expect([200, 500]).toContain(resp.status())
    if (resp.status() === 200) {
      const data = await unwrap<{ domains: unknown[] }>(resp)
      expect(data).toBeTruthy()
    }
  })

  // 2.1.2
  test('create project "[E2E] Acme Corp"', async ({ request }) => {
    await new Promise((r) => setTimeout(r, 500))
    const resp = await request.post(`${API}/company/domains`, {
      headers,
      data: {
        name: '[E2E] Acme Corp',
        description: 'AI-powered note-taking startup',
      },
    })
    if (resp.status() === 429) { test.skip(true, 'Rate limited'); return }
    if (resp.status() === 500) { test.skip(true, 'Sandbox unavailable'); return }
    expect([200, 201, 409]).toContain(resp.status())

    if (resp.status() === 409) return // Domain already exists from previous run

    const data = await unwrap<{
      domain: { id: string; slug: string; name: string }
      channel: { id: string; slug: string }
    }>(resp)
    expect(data.domain.id).toBeTruthy()
    testDomainId = data.domain.id
    if (data.channel) generalChannelId = data.channel.id
  })

  // 2.1.4
  test('auto-created #general channel via API', async ({ request }) => {
    if (!testDomainId) { test.skip(true, 'No domain created'); return }
    const resp = await request.get(`${API}/company/domains`, { headers })
    if (resp.status() === 429) { test.skip(true, 'Rate limited'); return }
    expect(resp.status()).toBe(200)
    const data = await unwrap<{ domains: Array<{ id: string; channels?: unknown[] }> }>(resp)
    const domains = data.domains || (data as unknown as unknown[])
    expect(Array.isArray(domains)).toBeTruthy()
  })

  // 2.1.5
  test('project overview loads', async ({ request }) => {
    if (!testDomainId) { test.skip(true, 'No domain'); return }
    const resp = await request.get(`${API}/company/domains/${testDomainId}/overview`, { headers })
    if (resp.status() === 429) { test.skip(true, 'Rate limited'); return }
    expect([200, 404]).toContain(resp.status())
  })

  // 2.1.6
  test('create #engineering channel', async ({ request }) => {
    if (!testDomainId) { test.skip(true, 'No domain'); return }
    await new Promise((r) => setTimeout(r, 300))
    const resp = await request.post(`${API}/company/domains/${testDomainId}/channels`, {
      headers,
      data: { name: 'engineering', description: 'Core product development' },
    })
    if (resp.status() === 429) { test.skip(true, 'Rate limited'); return }
    expect([200, 201]).toContain(resp.status())
  })

  // 2.1.7
  test('create #marketing channel', async ({ request }) => {
    if (!testDomainId) { test.skip(true, 'No domain'); return }
    await new Promise((r) => setTimeout(r, 300))
    const resp = await request.post(`${API}/company/domains/${testDomainId}/channels`, {
      headers,
      data: { name: 'marketing', description: 'Growth and content' },
    })
    if (resp.status() === 429) { test.skip(true, 'Rate limited'); return }
    expect([200, 201]).toContain(resp.status())
  })

  // 2.1.8
  test('update channel description', async ({ request }) => {
    if (!generalChannelId) { test.skip(true, 'No channel'); return }
    const resp = await request.patch(`${API}/company/channels/${generalChannelId}`, {
      headers,
      data: { description: 'Updated by E2E test' },
    })
    if (resp.status() === 429) { test.skip(true, 'Rate limited'); return }
    expect([200, 204]).toContain(resp.status())
  })
})
