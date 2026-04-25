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
  headers = { ...authHeader(token), 'Content-Type': 'application/json' }
})

interface ScheduleEntry {
  id: string
  agent_slug: string
  name: string
  prompt: string
  rrule: string | null
  status: string
  config: string | null
}

test.describe('Schedules API — cron-to-RRULE normalization', () => {
  test('POST accepts cron expressions and stores them as RRULE', async ({ request }) => {
    const agents = await db.findAll('agent_registry', { user_id: CONFIG.testUser.uid })
    if (agents.length === 0) {
      test.skip()
      return
    }
    const agentSlug = agents[0].slug as string

    // 15-minute cron — previously rejected with "Invalid rrule '*/15 * * * *'".
    const cases: { input: string; expected: string }[] = [
      { input: '*/15 * * * *', expected: 'FREQ=MINUTELY;INTERVAL=15' },
      { input: '0 */2 * * *', expected: 'FREQ=HOURLY;INTERVAL=2' },
      { input: '0 9 * * *', expected: 'FREQ=DAILY;BYHOUR=9;BYMINUTE=0;BYSECOND=0' },
      // RRULE pass-through
      { input: 'FREQ=DAILY;BYHOUR=14;BYMINUTE=30;BYSECOND=0', expected: 'FREQ=DAILY;BYHOUR=14;BYMINUTE=30;BYSECOND=0' },
    ]

    for (const { input, expected } of cases) {
      const name = `e2e-cron-norm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const createResp = await request.post(`${API}/execute/schedules`, {
        headers,
        data: { agent_slug: agentSlug, name, prompt: 'cron normalization test', rrule: input },
      })
      expect(createResp.status(), `create failed for input ${input}`).toBe(201)
      const created = await unwrap<{ schedule: { id: string; rrule: string | null; next_run_at: number | null } }>(createResp)
      expect(created.schedule.rrule, `normalized rrule for input ${input}`).toBe(expected)
      // next_run_at must be computed (non-null) — if cronToRrule returned an unparseable string,
      // computeNextRunAt would throw before reaching here.
      expect(created.schedule.next_run_at, `next_run_at computed for input ${input}`).not.toBeNull()
      // Cleanup
      await request.delete(`${API}/execute/schedules/${created.schedule.id}`, { headers })
    }
  })
})

test.describe('Schedules API — config column round-trip (Option A)', () => {
  test('POST /execute/schedules persists config JSON and GET returns it', async ({ request }) => {
    // Find any agent owned by the test user to attach the schedule to.
    const agents = await db.findAll('agent_registry', { user_id: CONFIG.testUser.uid })
    if (agents.length === 0) {
      test.skip()
      return
    }
    const agentSlug = agents[0].slug as string
    // Unique name so the test is idempotent against schedules.name UNIQUE constraint.
    const name = `e2e-config-roundtrip-${Date.now()}`
    const configPayload = {
      timezone: 'Asia/Kolkata',
      activeHoursStart: '09:00',
      activeHoursEnd: '18:00',
      weekdaysOnly: true,
      tokenBudget: 5000,
    }

    // Create
    const createResp = await request.post(`${API}/execute/schedules`, {
      headers,
      data: {
        agent_slug: agentSlug,
        name,
        prompt: 'e2e test — heartbeat round-trip',
        rrule: 'FREQ=DAILY;BYHOUR=9;BYMINUTE=0;BYSECOND=0',
        config: JSON.stringify(configPayload),
      },
    })
    expect(createResp.status()).toBe(201)
    const created = await unwrap<{ schedule: ScheduleEntry }>(createResp)
    expect(created.schedule.id).toBeTruthy()
    // Capture ID immediately so the finally-block cleanup runs even if later assertions fail.
    const scheduleId = created.schedule.id

    try {
      expect(created.schedule.config).toBe(JSON.stringify(configPayload))

      // List — make sure the config survives a round-trip on read too
      const listResp = await request.get(
        `${API}/execute/schedules?agent_slug=${encodeURIComponent(agentSlug)}`,
        { headers },
      )
      expect(listResp.status()).toBe(200)
      const list = await unwrap<{ schedules: ScheduleEntry[] }>(listResp)
      const ours = list.schedules.find(s => s.id === scheduleId)
      expect(ours).toBeTruthy()
      expect(ours?.config).toBe(JSON.stringify(configPayload))

      // Update with new config
      const newConfig = { ...configPayload, timezone: 'Europe/London', weekdaysOnly: false }
      const updateResp = await request.patch(`${API}/execute/schedules/${scheduleId}`, {
        headers,
        data: { config: JSON.stringify(newConfig) },
      })
      expect(updateResp.status()).toBe(200)
      const updated = await unwrap<{ schedule: ScheduleEntry }>(updateResp)
      expect(updated.schedule.config).toBe(JSON.stringify(newConfig))
    } finally {
      // Best-effort cleanup
      await request.delete(`${API}/execute/schedules/${scheduleId}`, { headers })
    }
  })
})
