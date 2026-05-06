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

test.describe('Part 1: Auth & User State', () => {
  // 1.1.3
  test('Firebase token exchange works via find-or-create', async ({ request }) => {
    const resp = await request.post(`${API}/users/find-or-create`, { headers })
    expect([200, 201, 429]).toContain(resp.status())
    if (resp.status() === 429) {
      test.skip(true, 'Rate limited')
      return
    }
    const data = await unwrap(resp)
    expect(data).toBeTruthy()
  })

  // 1.1.5
  test('expired/bad token returns 401', async ({ request }) => {
    const resp = await request.get(`${API}/users/me`, {
      headers: {
        Authorization: 'Bearer invalid.token.here',
        'Content-Type': 'application/json',
      },
    })
    // 429 if rate limited, otherwise 401
    if (resp.status() === 429) {
      test.skip(true, 'Rate limited')
      return
    }
    expect(resp.status()).toBe(401)
  })

  // 1.1.6
  test('user profile loads correctly', async ({ request }) => {
    const resp = await request.get(`${API}/users/me`, { headers })
    if (resp.status() === 429) {
      test.skip(true, 'Rate limited')
      return
    }
    expect(resp.status()).toBe(200)
    const data = await unwrap(resp)
    expect(data.email).toBe(CONFIG.testUser.email)
  })

  // 1.2.1
  test('credits available', async ({ request }) => {
    const resp = await request.get(`${API}/users/credits`, { headers })
    if (resp.status() === 429) {
      test.skip(true, 'Rate limited')
      return
    }
    expect(resp.status()).toBe(200)
    const data = await unwrap(resp)
    expect(typeof data.credits_available).toBe('number')
    expect(data.credits_available).toBeGreaterThanOrEqual(0)
  })

  // 1.2.2
  test('workspace exists for user', async () => {
    const workspace = await db.findLatest('workspaces', { user_id: CONFIG.testUser.uid })
    expect(workspace).toBeTruthy()
    expect(workspace.sandbox_id).toBeTruthy()
    expect(workspace.sandbox_status).toBeTruthy()
  })

  // 1.2.3
  test('plan type matches expected', async () => {
    const user = await db.findById('users', CONFIG.testUser.uid, 'user_id')
    expect(user).toBeTruthy()
    expect(user?.plan_type).toBe('pro')
  })
})
