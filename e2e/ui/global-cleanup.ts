import { test as teardown } from '@playwright/test'
import { cleanupTestData } from '../shared/cleanup'
import { db } from '../shared/db'

teardown('cleanup test data', async () => {
  console.log('[E2E Cleanup] Removing test data...')
  await cleanupTestData()
  await db.close()
  console.log('[E2E Cleanup] Done')
})
