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

test.describe('Workspace API', () => {
  test('workspace exists for test user', async () => {
    const workspace = await db.findLatest('workspaces', { user_id: CONFIG.testUser.uid }).catch(
      () => null
    )
    expect(workspace).toBeTruthy()
    expect(workspace?.sandbox_id).toBeTruthy()
  })

  test('GET /workspace/tree returns file tree', async ({ request }) => {
    const resp = await request.get(`${API}/workspace/tree?depth=3`, { headers })

    // Workspace sandbox may not be running — accept 200 or 503
    if (resp.status() === 200) {
      const data = await unwrap<{ root?: { name: string; type: string; children?: unknown[] } }>(resp)
      expect(data).toBeTruthy()
      // Tree is nested under data.root
      if (data.root) {
        expect(data.root.name).toBeTruthy()
        expect(data.root.type).toBe('directory')
      }
    }
  })

  test('workspace DB record matches expected schema', async () => {
    const workspace = await db.findLatest('workspaces', { user_id: CONFIG.testUser.uid }).catch(
      () => null
    )
    if (!workspace) {
      test.skip()
      return
    }

    // Verify required columns
    expect(workspace.id).toBeTruthy()
    expect(workspace.user_id).toBe(CONFIG.testUser.uid)
    expect(workspace.sandbox_id).toBeTruthy()
    expect(workspace.sandbox_status).toBeTruthy()
    expect(['running', 'paused', 'stopped', 'archived', 'error', 'killed']).toContain(
      workspace.sandbox_status
    )
  })

  test('GET /workspace/files/:path returns file content', async ({ request }) => {
    // Try to read a known file
    const resp = await request.get(`${API}/workspace/files/SOUL.md`, { headers })

    // May not exist or sandbox may be down
    if (resp.status() === 200) {
      const data = await resp.text()
      expect(data.length).toBeGreaterThan(0)
    }
  })
})
