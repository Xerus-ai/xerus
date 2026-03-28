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

test.afterAll(async () => {
  // Global cleanup handles db.close()
})

test.describe('Settings API', () => {
  test('GET /users/me returns user profile', async ({ request }) => {
    const resp = await request.get(`${API}/users/me`, { headers })
    expect(resp.status()).toBe(200)

    const data = await unwrap(resp)
    expect(data.user_id).toBe(CONFIG.testUser.uid)
    expect(data.email).toBe(CONFIG.testUser.email)

    // Cross-check with DB
    const dbUser = await db.findById('users', CONFIG.testUser.uid, 'user_id')
    expect(dbUser).toBeTruthy()
    expect(dbUser?.email).toBe(data.email)
  })

  test('PATCH /users/me updates display name', async ({ request }) => {
    // Get original
    const dbUser = await db.findById('users', CONFIG.testUser.uid, 'user_id')
    const originalName = dbUser?.display_name as string

    // Update
    const testName = `E2E API User ${Date.now()}`
    const resp = await request.patch(`${API}/users/me`, {
      headers,
      data: { display_name: testName },
    })
    expect([200, 204]).toContain(resp.status())

    // Verify in DB
    const updated = await db.findById('users', CONFIG.testUser.uid, 'user_id')
    expect(updated?.display_name).toBe(testName)

    // Restore
    await request.patch(`${API}/users/me`, {
      headers,
      data: { display_name: originalName },
    })

    const restored = await db.findById('users', CONFIG.testUser.uid, 'user_id')
    expect(restored?.display_name).toBe(originalName)
  })

  test('GET /users/credits returns credit info', async ({ request }) => {
    const resp = await request.get(`${API}/users/credits`, { headers })
    expect(resp.status()).toBe(200)

    const data = await unwrap(resp)
    expect(data.credits_available).toBeDefined()
    expect(typeof data.credits_available).toBe('number')
  })

  test('POST /users/api-keys saves API key', async ({ request }) => {
    const resp = await request.post(`${API}/users/api-keys`, {
      headers,
      data: { provider: 'openrouter', api_key: 'e2e-test-key-000' },
    })

    // Accept various success codes
    expect([200, 201, 204]).toContain(resp.status())

    // Verify in DB (key is encrypted, just check row exists)
    const exists = await db.exists('user_api_keys', {
      user_id: CONFIG.testUser.uid,
      provider: 'openrouter',
    })
    expect(exists).toBe(true)

    // Clean up: remove test key
    await request.delete(`${API}/users/api-keys/openrouter`, { headers })
  })

  test('DELETE /users/api-keys/:provider removes key', async ({ request }) => {
    // Create first
    await request.post(`${API}/users/api-keys`, {
      headers,
      data: { provider: 'openrouter', api_key: 'e2e-delete-test-key' },
    })

    // Delete
    const resp = await request.delete(`${API}/users/api-keys/openrouter`, { headers })
    expect([200, 204]).toContain(resp.status())

    // Verify gone
    const exists = await db.exists('user_api_keys', {
      user_id: CONFIG.testUser.uid,
      provider: 'openrouter',
    })
    expect(exists).toBe(false)
  })
})
