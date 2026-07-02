// Seam E2E test — the platform release gate (plan Task 1.3).
//
// Walks the landing-page sentence end-to-end:
//   schedule fires -> POST /internal/v1/schedules/fire -> executionService.startExecution
//     -> execution_sessions row (Neon)         (e)
//     -> channel_messages row from the agent   (a)
//     -> task board mutation                   (b)
//     -> deliverable file in the workspace     (c)
//     -> workspace.db inbox_items row          (d)
//
// Two layers, both real services / no mocks (CLAUDE.md):
//
//   1. "Fire endpoint contract" — deterministic. Exercises Task S.1's internal
//      endpoint directly: auth (timing-safe token compare), field validation,
//      and (schedule_id, scheduled_for) idempotency. Runs in CI without a
//      Daytona sandbox because the endpoint returns 200 synchronously and the
//      async startExecution rejection is swallowed by the handler. This is the
//      gate that always runs.
//
//   2. "Full seam chain" — opt-in via E2E_RUN_SEAM=1, requires a real running
//      sandbox + a real agent (staging Daytona). Fires the endpoint for a real
//      agent and asserts all five artifacts land. Skips cleanly when the
//      sandbox is unavailable so local `test:api` runs stay green.

import { test, expect, type APIRequestContext } from '@playwright/test'
import { getFirebaseIdToken, authHeader } from '../shared/auth'
import { db } from '../shared/db'
import { CONFIG } from '../shared/config'
import { unwrap } from '../shared/api-helpers'

const API = CONFIG.apiURL
const FIRE_URL = `${CONFIG.internal.url}/schedules/fire`
const INTERNAL_TOKEN = CONFIG.internal.token

// A slug that intentionally matches no agent. The endpoint fires
// startExecution asynchronously; with a non-existent agent it fails fast at
// loadAgent (no LLM run, no cost) while the HTTP contract stays deterministic.
const SENTINEL_AGENT = '__e2e_seam_probe_agent__'

interface FireResponse {
  success: boolean
  execution_id?: string
  duplicate?: boolean
  error?: string
}

function validFireBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const now = new Date().toISOString()
  return {
    schedule_id: `e2e-sched-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    agent_slug: SENTINEL_AGENT,
    prompt: '[E2E seam probe] no-op — agent does not exist',
    scheduled_for: now,
    user_id: CONFIG.testUser.uid,
    ...overrides,
  }
}

async function fire(
  request: APIRequestContext,
  body: Record<string, unknown>,
  token: string | null = INTERNAL_TOKEN,
): Promise<{ status: number; body: FireResponse }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token !== null) headers.Authorization = `Bearer ${token}`
  const resp = await request.post(FIRE_URL, { headers, data: body })
  return { status: resp.status(), body: (await resp.json()) as FireResponse }
}

// -----------------------------------------------------------------------------
// Layer 1 — Fire endpoint contract (Task S.1). Deterministic, no sandbox needed.
// -----------------------------------------------------------------------------

test.describe('Seam: internal schedule-fire endpoint contract', () => {
  test('rejects a request with no bearer token → 401', async ({ request }) => {
    const { status, body } = await fire(request, validFireBody(), null)
    expect(status).toBe(401)
    expect(body.success).toBe(false)
  })

  test('rejects a request with a wrong token → 401', async ({ request }) => {
    const { status, body } = await fire(request, validFireBody(), 'not-the-real-token')
    expect(status).toBe(401)
    expect(body.success).toBe(false)
  })

  test('rejects missing required fields → 400', async ({ request }) => {
    if (!INTERNAL_TOKEN) {
      test.skip(true, 'XERUS_INTERNAL_API_TOKEN not set — cannot pass auth to reach validation')
      return
    }
    const requiredFields = ['schedule_id', 'agent_slug', 'prompt', 'user_id', 'scheduled_for']
    for (const field of requiredFields) {
      const body = validFireBody()
      delete body[field]
      const { status, body: resBody } = await fire(request, body)
      expect(status, `omitting ${field} should be rejected`).toBe(400)
      expect(resBody.success).toBe(false)
      expect(resBody.error, `error should name ${field}`).toContain(field)
    }
  })

  test('accepts a valid fire → 200 with a fresh execution_id', async ({ request }) => {
    if (!INTERNAL_TOKEN) {
      test.skip(true, 'XERUS_INTERNAL_API_TOKEN not set')
      return
    }
    const { status, body } = await fire(request, validFireBody())
    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.execution_id).toBeTruthy()
    expect(body.duplicate).toBe(false)
  })

  test('is idempotent on (schedule_id, scheduled_for) → duplicate returns the same execution', async ({ request }) => {
    if (!INTERNAL_TOKEN) {
      test.skip(true, 'XERUS_INTERNAL_API_TOKEN not set')
      return
    }
    const body = validFireBody()

    const first = await fire(request, body)
    expect(first.status).toBe(200)
    expect(first.body.duplicate).toBe(false)
    const executionId = first.body.execution_id
    expect(executionId).toBeTruthy()

    // Same (schedule_id, scheduled_for) → must NOT start a second execution.
    const second = await fire(request, body)
    expect(second.status).toBe(200)
    expect(second.body.duplicate).toBe(true)
    expect(second.body.execution_id).toBe(executionId)

    // A different scheduled_for is a distinct occurrence → new execution id.
    const nextOccurrence = await fire(request, {
      ...body,
      scheduled_for: new Date(Date.now() + 60_000).toISOString(),
    })
    expect(nextOccurrence.status).toBe(200)
    expect(nextOccurrence.body.duplicate).toBe(false)
    expect(nextOccurrence.body.execution_id).not.toBe(executionId)
  })
})

// -----------------------------------------------------------------------------
// Layer 2 — Full seam chain. Opt-in (E2E_RUN_SEAM=1) + real sandbox required.
// -----------------------------------------------------------------------------

const RUN_SEAM = process.env.E2E_RUN_SEAM === '1'

// The scheduled run's prompt: instruct the agent to touch every seam so the
// five artifacts are produced. Todos are authoritative — the agent must not
// stop until all four outputs exist.
const SEAM_PROMPT = [
  '[E2E seam gate] Perform ALL of the following now, in order, then stop:',
  '1. Post a short status message to your primary channel announcing you have started this scheduled run.',
  '2. Create one task on the company board titled "E2E seam gate deliverable".',
  '3. Produce a deliverable file named "e2e-seam-report.md" with a one-paragraph summary of this run.',
  '4. Send an inbox notification to the user confirming the run is complete.',
  'Do not ask the user for anything. Complete every step before ending.',
].join('\n')

const SEAM_TIMEOUT_MS = 8 * 60_000

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

interface ScheduleSessionRow {
  id: string
  status: string
  trigger_type: string
  agent_slug: string
  [key: string]: unknown
}

test.describe('Seam: full chain (schedule → channel message + task + deliverable + inbox + session)', () => {
  test.skip(!RUN_SEAM, 'Set E2E_RUN_SEAM=1 with a staging Daytona sandbox to run the full seam gate')

  test.setTimeout(SEAM_TIMEOUT_MS + 60_000)

  let token: string
  let headers: Record<string, string>

  test.beforeAll(async () => {
    if (!INTERNAL_TOKEN) throw new Error('XERUS_INTERNAL_API_TOKEN required for the full seam gate')
    token = await getFirebaseIdToken()
    headers = authHeader(token)
  })

  test('a scheduled fire produces all five seam artifacts', async ({ request }) => {
    const uid = CONFIG.testUser.uid

    // Pick a real, non-system agent to run the schedule.
    const agents = await db.findAll<{ slug: string; agent_type?: string; is_system?: boolean }>(
      'agent_registry',
      { user_id: uid },
    )
    const agent = agents.find((a) => a.slug !== 'xerus-master' && a.agent_type !== 'system' && a.is_system !== true)
      ?? agents[0]
    if (!agent) {
      test.skip(true, 'Test user has no agents — cannot run the seam gate')
      return
    }
    const agentSlug = agent.slug

    // Create the schedule via the platform tool route. A 503 here means no
    // running sandbox is available — skip rather than fail a local run.
    const scheduledFor = new Date(Date.now() + 60_000)
    const createResp = await request.post(`${API}/execute/schedules`, {
      headers,
      data: {
        agent_slug: agentSlug,
        name: `e2e-seam-gate-${Date.now()}`,
        prompt: SEAM_PROMPT,
        rrule: 'FREQ=MINUTELY;INTERVAL=1',
      },
    })
    if (createResp.status() === 503) {
      test.skip(true, 'Sandbox unavailable (503) — full seam gate needs a running staging sandbox')
      return
    }
    expect(createResp.status(), 'schedule create').toBe(201)
    const created = await unwrap<{ schedule: { id: string } }>(createResp)
    const scheduleId = created.schedule.id

    // Baselines so we assert deltas rather than absolute counts (the workspace
    // may already contain items from earlier runs).
    const baseline = await captureBaseline(request, headers, agentSlug)
    const fireStartIso = new Date(Date.now() - 2_000).toISOString()

    try {
      // Fire the schedule directly through the internal endpoint — exactly what
      // the in-sandbox 9to5 daemon does when an occurrence comes due.
      const { status, body } = await fire(request, {
        schedule_id: scheduleId,
        agent_slug: agentSlug,
        prompt: SEAM_PROMPT,
        scheduled_for: scheduledFor.toISOString(),
        user_id: uid,
      })
      expect(status, 'fire accepted').toBe(200)
      expect(body.success).toBe(true)
      const executionId = body.execution_id
      expect(executionId).toBeTruthy()

      // (e) obs / execution_sessions row — the schedule-triggered session in Neon.
      const session = await pollScheduleSession(uid, agentSlug, fireStartIso, SEAM_TIMEOUT_MS)
      expect(session, 'schedule-triggered execution_sessions row').toBeTruthy()
      expect(session!.trigger_type).toBe('schedule')
      expect(['completed', 'running', 'failed']).toContain(session!.status)
      // A failed run cannot have produced downstream artifacts — surface it loudly.
      expect(session!.status, 'scheduled run must not fail').not.toBe('failed')

      // Give post-execution workspace.db syncs a moment to land.
      await sleep(5_000)

      // (b) task board mutation.
      const tasksAfter = await countTasks(request, headers)
      expect(tasksAfter, 'task board grew').toBeGreaterThan(baseline.tasks)

      // (d) workspace.db inbox_items row.
      const inboxAfter = await countInbox(request, headers)
      expect(inboxAfter, 'inbox item written').toBeGreaterThan(baseline.inbox)

      // (a) channel_messages row from the agent + (c) deliverable file.
      const { agentMessages, deliverables } = await scanChannels(request, headers, agentSlug)
      expect(agentMessages, 'channel message from the agent').toBeGreaterThan(baseline.agentMessages)
      expect(deliverables, 'deliverable produced').toBeGreaterThan(baseline.deliverables)
    } finally {
      await request.delete(`${API}/execute/schedules/${scheduleId}`, { headers }).catch(() => {})
    }
  })
})

// -----------------------------------------------------------------------------
// Full-seam helpers
// -----------------------------------------------------------------------------

interface Baseline {
  tasks: number
  inbox: number
  agentMessages: number
  deliverables: number
}

async function captureBaseline(
  request: APIRequestContext,
  headers: Record<string, string>,
  agentSlug: string,
): Promise<Baseline> {
  const [tasks, inbox, channels] = await Promise.all([
    countTasks(request, headers),
    countInbox(request, headers),
    scanChannels(request, headers, agentSlug),
  ])
  return { tasks, inbox, agentMessages: channels.agentMessages, deliverables: channels.deliverables }
}

async function countTasks(request: APIRequestContext, headers: Record<string, string>): Promise<number> {
  const resp = await request.get(`${API}/tasks?limit=100`, { headers })
  if (resp.status() !== 200) return 0
  const data = await unwrap<{ tasks: unknown[] }>(resp)
  return data.tasks?.length ?? 0
}

async function countInbox(request: APIRequestContext, headers: Record<string, string>): Promise<number> {
  const resp = await request.get(`${API}/inbox?limit=100`, { headers })
  if (resp.status() !== 200) return 0
  const data = await unwrap<{ items: unknown[]; total: number }>(resp)
  return data.total ?? data.items?.length ?? 0
}

// Walk every domain/channel and count (a) messages authored by the agent and
// (c) deliverables. Channel discovery mirrors what the Inbox/Channels UI does.
async function scanChannels(
  request: APIRequestContext,
  headers: Record<string, string>,
  agentSlug: string,
): Promise<{ agentMessages: number; deliverables: number }> {
  const domainsResp = await request.get(`${API}/company/domains`, { headers })
  if (domainsResp.status() !== 200) return { agentMessages: 0, deliverables: 0 }
  const { domains } = await unwrap<{ domains: Array<{ channels: Array<{ id: string }> }> }>(domainsResp)

  const channelIds = domains.flatMap((d) => d.channels.map((c) => c.id))
  let agentMessages = 0
  let deliverables = 0

  for (const channelId of channelIds) {
    const encoded = encodeURIComponent(channelId)

    const msgResp = await request.get(`${API}/company/channels/${encoded}/messages?limit=100`, { headers })
    if (msgResp.status() === 200) {
      const { messages } = await unwrap<{ messages: Array<{ sender_slug: string; sender_type: string }> }>(msgResp)
      agentMessages += messages.filter((m) => m.sender_type !== 'human' && m.sender_slug === agentSlug).length
    }

    const delResp = await request.get(`${API}/company/channels/${encoded}/deliverables?limit=100`, { headers })
    if (delResp.status() === 200) {
      const { deliverables: rows } = await unwrap<{ deliverables: unknown[] }>(delResp)
      deliverables += rows?.length ?? 0
    }
  }

  return { agentMessages, deliverables }
}

// Poll Neon for the schedule-triggered execution_sessions row created by this fire.
async function pollScheduleSession(
  userId: string,
  agentSlug: string,
  sinceIso: string,
  timeoutMs: number,
): Promise<ScheduleSessionRow | null> {
  const deadline = Date.now() + timeoutMs
  let latest: ScheduleSessionRow | null = null

  while (Date.now() < deadline) {
    const rows = await db.query<ScheduleSessionRow>(
      `SELECT es.id, es.status, es.trigger_type, es.agent_slug
       FROM execution_sessions es
       JOIN workspaces w ON es.workspace_id::text = w.id::text
       WHERE w.user_id = $1
         AND es.agent_slug = $2
         AND es.trigger_type = 'schedule'
         AND es.created_at >= $3
       ORDER BY es.created_at DESC
       LIMIT 1`,
      [userId, agentSlug, sinceIso],
    )
    if (rows.length > 0) {
      latest = rows[0]
      // Terminal states end the poll; a 'running' row keeps polling until it settles.
      if (latest.status === 'completed' || latest.status === 'failed') return latest
    }
    await sleep(5_000)
  }
  return latest
}
