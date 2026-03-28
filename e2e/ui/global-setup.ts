import { test as setup } from '@playwright/test'

/**
 * Global setup — auth is handled per-worker in auth.fixture.ts.
 * This file is kept for Playwright config compatibility.
 */
setup('global setup', async () => {
  // No-op: auth is worker-scoped via auth.fixture.ts
})
