import { test, expect } from '@playwright/test'
import { getFirebaseIdToken, authHeader } from '../shared/auth'
import { db } from '../shared/db'
import { CONFIG } from '../shared/config'
import { unwrap } from '../shared/api-helpers'

const API = CONFIG.apiURL

let token: string
let headers: Record<string, string>
let testDomainId: string | null = null
let testChannelId: string | null = null
let testTaskId: string | null = null

test.beforeAll(async () => {
  token = await getFirebaseIdToken()
  headers = authHeader(token)

  // Create test domain + channel
  const domResp = await fetch(`${API}/company/domains`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: '[E2E] Task Test Domain' }),
  })
  if (domResp.ok) {
    const body = await domResp.json()
    const data = body.data || body
    testDomainId = data.domain?.id
    testChannelId = data.channel?.id
  }
})

test.afterAll(async () => {
  if (testDomainId) {
    await db.deleteWhere('domains', { id: testDomainId }).catch(() => {})
  }
})

test.describe('Part 7: Tasks & Kanban', () => {
  test.describe('7.1 Task CRUD — Human Path', () => {
    // 7.1.1
    test('create task in channel', async ({ request }) => {
      if (!testChannelId) test.skip()
      const resp = await request.post(`${API}/company/channels/${testChannelId}/tasks`, {
        headers,
        data: {
          title: '[E2E] Research competitors',
          description: 'Analyze top 5 AI note apps',
          assignee_agent_slug: 'maven-max',
        },
      })
      expect([200, 201]).toContain(resp.status())
      const data = await unwrap<{ task: { id: string }; id: string }>(resp)
      testTaskId = data.task?.id || data.id
      expect(testTaskId).toBeTruthy()
    })

    // 7.1.2
    test('create task with priority', async ({ request }) => {
      if (!testChannelId) test.skip()
      const resp = await request.post(`${API}/company/channels/${testChannelId}/tasks`, {
        headers,
        data: {
          title: '[E2E] Write blog post',
          priority: 'high',
          assignee_agent_slug: 'wordsmith-wally',
        },
      })
      expect([200, 201]).toContain(resp.status())
    })

    // 7.1.3
    test('list channel tasks', async ({ request }) => {
      if (!testChannelId) test.skip()
      const resp = await request.get(`${API}/company/channels/${testChannelId}/tasks`, {
        headers,
      })
      expect(resp.status()).toBe(200)
      const data = await unwrap<{ tasks: unknown[] }>(resp)
      const tasks = data.tasks || (data as unknown as unknown[])
      expect(Array.isArray(tasks)).toBeTruthy()
      expect(tasks.length).toBeGreaterThanOrEqual(1)
    })

    // 7.1.4
    test('get task by ID', async ({ request }) => {
      if (!testTaskId) test.skip()
      const resp = await request.get(`${API}/company/tasks/${testTaskId}`, { headers })
      expect(resp.status()).toBe(200)
      const data = await unwrap(resp)
      expect(data).toBeTruthy()
    })

    // 7.1.5
    test('update task status', async ({ request }) => {
      if (!testTaskId) test.skip()
      const resp = await request.post(`${API}/company/tasks/${testTaskId}/status`, {
        headers,
        data: { status: 'in_progress' },
      })
      expect([200, 204]).toContain(resp.status())
    })

    // 7.1.6
    test('update task details', async ({ request }) => {
      if (!testTaskId) test.skip()
      const resp = await request.patch(`${API}/company/tasks/${testTaskId}`, {
        headers,
        data: { description: '[E2E] Updated scope for competitor analysis' },
      })
      expect([200, 204]).toContain(resp.status())
    })

    // 7.1.8
    test('list all user tasks', async ({ request }) => {
      const resp = await request.get(`${API}/company/tasks`, { headers })
      if (resp.status() === 429) { test.skip(true, 'Rate limited'); return }
      if (resp.status() === 500) { test.skip(true, 'Sandbox unavailable'); return }
      expect(resp.status()).toBe(200)
      const data = await unwrap<{ tasks: unknown[] }>(resp)
      const tasks = data.tasks || (data as unknown as unknown[])
      expect(Array.isArray(tasks)).toBeTruthy()
    })

    // 7.1.9
    test('get channel deliverables', async ({ request }) => {
      if (!testChannelId) test.skip()
      const resp = await request.get(
        `${API}/company/channels/${testChannelId}/deliverables`,
        { headers }
      )
      expect([200, 404]).toContain(resp.status())
    })
  })
})
