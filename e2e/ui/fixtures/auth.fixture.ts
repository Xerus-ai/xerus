import { test as base, expect, type BrowserContext, type Page } from '@playwright/test'
import { db } from '../../shared/db'
import { CONFIG } from '../../shared/config'
import { getFirebaseCustomToken } from '../../shared/auth'

/**
 * Worker-scoped authenticated browser context.
 *
 * Auth strategy:
 * 1. Navigate to /e2e-auth?token=<customToken> (dev-only page)
 * 2. Page calls signInWithCustomToken, Firebase persists to IndexedDB
 * 3. All tests in the worker share this context (IndexedDB persists)
 *
 * The /e2e-auth page is dev-only:
 * - AppLayout bypass gated by process.env.NODE_ENV !== 'production'
 * - Page excluded from production deploys via Vercel build config
 * - When merging to main, the page is gitignored
 */
type WorkerFixtures = {
  authContext: BrowserContext
}

type TestFixtures = {
  authenticatedPage: Page
  db: typeof db
  testUserId: string
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  authContext: [async ({ browser }, use) => {
    const context = await browser.newContext()
    const page = await context.newPage()

    // Auth once via /e2e-auth page (calls signInWithCustomToken)
    const customToken = await getFirebaseCustomToken()
    await page.goto(
      `${CONFIG.baseURL}/e2e-auth?token=${encodeURIComponent(customToken)}`,
      { waitUntil: 'commit', timeout: 30_000 }
    )
    await page.waitForFunction(
      () => document.body.innerText.includes('AUTH_SUCCESS'),
      { timeout: 30_000 }
    )
    // Wait for Firebase to persist to IndexedDB
    await page.waitForTimeout(2_000)
    await page.close()

    await use(context)
    await context.close()
  }, { scope: 'worker' }],

  authenticatedPage: async ({ authContext }, use) => {
    const page = await authContext.newPage()

    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text()
        if (
          text.includes('favicon.ico') ||
          text.includes('net::ERR_') ||
          text.includes('ResizeObserver') ||
          text.includes('hydration')
        ) {
          return
        }
        consoleErrors.push(text)
      }
    })

    await use(page)

    if (consoleErrors.length > 0) {
      console.warn(
        `[E2E] ${consoleErrors.length} console error(s):\n` +
          consoleErrors.map((e) => `  - ${e}`).join('\n')
      )
    }

    await page.close()
  },

  db: async ({}, use) => {
    await use(db)
  },

  testUserId: async ({}, use) => {
    await use(CONFIG.testUser.uid)
  },
})

export { expect }
