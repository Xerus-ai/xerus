import { defineConfig, devices } from '@playwright/test'
import path from 'path'
import dotenv from 'dotenv'

// Load env from existing config files (backend + frontend)
dotenv.config({ path: path.resolve(__dirname, '../xerus_backend/.env') })
dotenv.config({ path: path.resolve(__dirname, '../xerus_web/.env.local') })

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3005'
const API_URL = process.env.E2E_API_URL || 'http://localhost:5001/api/v1'

export default defineConfig({
  testDir: '.',
  testMatch: ['ui/journeys/**/*.spec.ts', 'api/**/*.api.test.ts'],
  fullyParallel: false, // journeys are ordered
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // serial for DB state consistency
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],
  timeout: 90_000,
  expect: {
    timeout: 10_000,
  },

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    // Global setup: authenticate once, save storageState
    {
      name: 'setup',
      testMatch: /global-setup\.ts/,
      teardown: 'cleanup',
    },
    {
      name: 'cleanup',
      testMatch: /global-cleanup\.ts/,
    },

    // Desktop (default)
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        // Auth is handled per-test in auth.fixture.ts via /e2e-auth page
      },
      testMatch: ['ui/journeys/**/*.spec.ts'],
    },

    // Mobile
    {
      name: 'mobile',
      use: {
        ...devices['iPhone 13'],
      },
      testMatch: ['ui/journeys/08-responsive.spec.ts'],
    },

    // Tablet
    {
      name: 'tablet',
      use: {
        ...devices['iPad (gen 7)'],
        // Auth is handled per-test in auth.fixture.ts via /e2e-auth page
      },
      dependencies: ['setup'],
      testMatch: ['ui/journeys/08-responsive.spec.ts'],
    },

    // API tests (no browser needed)
    {
      name: 'api',
      testMatch: ['api/**/*.api.test.ts'],
      use: {
        baseURL: API_URL,
      },
    },
  ],
})
