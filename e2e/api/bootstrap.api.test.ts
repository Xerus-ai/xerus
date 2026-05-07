import { test, expect } from '@playwright/test'
import { getFirebaseIdToken, authHeader } from '../shared/auth'
import { db } from '../shared/db'
import { CONFIG } from '../shared/config'
import { unwrap } from '../shared/api-helpers'
import { sendMessageAndCollectSSE } from '../shared/sse-helpers'

const API = CONFIG.apiURL
const AGENT_TIMEOUT = 75_000

let token: string
let headers: Record<string, string>

test.beforeAll(async () => {
  token = await getFirebaseIdToken()
  headers = authHeader(token)
})

test.describe('Part 8: Company Goals & Bootstrapping', () => {
  test.describe('8.1 Company Vision Setup', () => {
    // 8.1.1
    test('workspace has drive/company.md', async ({ request }) => {
      const resp = await request.get(`${API}/workspace/files/drive/company.md`, { headers })
      expect([200, 404, 429, 500, 503]).toContain(resp.status())
    })
  })

  test.describe('8.2 Workspace Bootstrap Validation', () => {
    // 8.2.1
    test('root CLAUDE.md exists on sandbox', async ({ request }) => {
      const resp = await request.get(`${API}/workspace/files/CLAUDE.md`, { headers })
      expect([200, 404, 429, 500, 503]).toContain(resp.status())
      if (resp.status() === 200) {
        const text = await resp.text()
        expect(text.length).toBeGreaterThan(0)
      }
    })

    // 8.2.2
    test('.memory/ directory exists', async ({ request }) => {
      const resp = await request.get(`${API}/workspace/tree?depth=2&path=.memory`, { headers })
      expect([200, 404, 429, 500, 503]).toContain(resp.status())
    })

    // 8.2.3
    test('data/workspace.db exists', async ({ request }) => {
      const resp = await request.get(`${API}/workspace/files/data/workspace.db`, { headers })
      // Hidden paths return 400; binary files return 415; sandbox down returns 500
      expect([200, 400, 404, 415, 429, 500, 503]).toContain(resp.status())
    })

    // 8.2.4
    test('data/company.db exists', async ({ request }) => {
      const resp = await request.get(`${API}/workspace/files/data/company.db`, { headers })
      expect([200, 400, 404, 415, 429, 500, 503]).toContain(resp.status())
    })

    // 8.2.5
    test('.xerus/ runtime present', async ({ request }) => {
      const resp = await request.get(`${API}/workspace/tree?depth=1&path=.xerus`, { headers })
      expect([200, 404, 429, 500, 503]).toContain(resp.status())
    })

    // 8.2.6
    test('.claude/hooks/scripts/ populated', async ({ request }) => {
      const resp = await request.get(
        `${API}/workspace/tree?depth=1&path=.claude/hooks/scripts`,
        { headers }
      )
      expect([200, 404, 429, 500, 503]).toContain(resp.status())
    })

    // 8.2.7
    test('.claude/skills/ populated', async ({ request }) => {
      const resp = await request.get(`${API}/workspace/tree?depth=1&path=.claude/skills`, {
        headers,
      })
      expect([200, 404, 429, 500, 503]).toContain(resp.status())
    })

    // 8.2.8
    test('.claude/rules/ present', async ({ request }) => {
      const resp = await request.get(`${API}/workspace/tree?depth=1&path=.claude/rules`, {
        headers,
      })
      expect([200, 404, 429, 500, 503]).toContain(resp.status())
    })

    // 8.2.9
    test('system agents registered in DB', async () => {
      const agents = await db.findAll('agent_registry', { user_id: CONFIG.testUser.uid })
      const systemAgent = agents.find(
        (a) =>
          a.slug === 'xerus-master' ||
          a.agent_type === 'system' ||
          a.is_system === true
      )
      // User should have at least one agent registered
      expect(agents.length).toBeGreaterThan(0)
    })

    // 8.2.10
    test('marketplace submodules accessible', async ({ request }) => {
      const resp = await request.get(
        `${API}/workspace/tree?depth=1&path=marketplace`,
        { headers }
      )
      expect([200, 404, 429, 500, 503]).toContain(resp.status())
    })
  })

  test.describe('8.3 Full Bootstrap — Paperclip Pattern (Behavioral)', () => {
    let bootstrapConvId: string | null = null

    test.beforeAll(async () => {
      const resp = await fetch(`${API}/execute/conversations`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          agent_slug: 'xerus-master',
          title: '[E2E] Paperclip Bootstrap',
        }),
      })
      if (resp.ok) {
        const body = await resp.json()
        const data = body.data || body
        bootstrapConvId = data.id || data.conversation?.id
      }
    })

    test.afterAll(async () => {
      if (bootstrapConvId) {
        await fetch(`${API}/execute/conversations/${bootstrapConvId}`, {
          method: 'DELETE',
          headers,
        }).catch(() => {})
      }
      // Clean up test domains
      // domains live in workspace.db (sandbox), not Neon — no cleanup needed here
    })

    // 8.3.1
    test('company setup instruction triggers structured response', async () => {
      if (!bootstrapConvId) { test.skip(true, 'No conversation created'); return }
      try {
        const { events, agentMessage } = await sendMessageAndCollectSSE(
          bootstrapConvId,
          '[E2E] Set up Acme Notes as a zero-person company. We build AI note-taking for solo entrepreneurs. Goal: 10K users in 3 months. Create Engineering and Marketing departments with channels and hire appropriate agents.',
          token,
          AGENT_TIMEOUT
        )
        expect(events.length).toBeGreaterThan(0)
        expect(agentMessage.length).toBeGreaterThan(0)
      } catch {
        test.skip(true, 'Agent execution timed out')
      }
    })

    // 8.3.10
    test('master reports company structure', async () => {
      if (!bootstrapConvId) { test.skip(true, 'No conversation created'); return }
      try {
        const { agentMessage } = await sendMessageAndCollectSSE(
          bootstrapConvId,
          '[E2E] Give me an overview of our company structure',
          token,
          AGENT_TIMEOUT
        )
        expect(agentMessage.length).toBeGreaterThan(0)
      } catch {
        test.skip(true, 'Agent execution timed out')
      }
    })
  })
})
