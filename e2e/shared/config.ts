import path from 'path'

const BACKEND_DIR = path.resolve(__dirname, '../../xerus_backend')

const API_URL = process.env.E2E_API_URL || 'http://localhost:5001/api/v1'

export const CONFIG = {
  baseURL: process.env.E2E_BASE_URL || 'http://localhost:3002',
  apiURL: API_URL,

  // Internal (sandbox-to-backend) API. The 9to5 schedule daemon POSTs
  // /internal/v1/schedules/fire here with the shared internal token.
  // Derived from apiURL by stripping the /api/v1 suffix unless overridden.
  internal: {
    url:
      process.env.E2E_INTERNAL_URL ||
      API_URL.replace(/\/api\/v1\/?$/, '') + '/internal/v1',
    token: process.env.XERUS_INTERNAL_API_TOKEN || '',
  },

  testUser: {
    email: process.env.E2E_TEST_USER_EMAIL || '',
    uid: process.env.E2E_TEST_USER_UID || '',
  },

  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    webApiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
    // Resolve relative path from backend dir (where the .env defines it)
    serviceAccountPath: path.resolve(
      BACKEND_DIR,
      process.env.GOOGLE_APPLICATION_CREDENTIALS || ''
    ),
  },

  neon: {
    connectionString: process.env.DATABASE_URL || '',
  },

  timeouts: {
    agentResponse: 60_000,
    navigation: 15_000,
    dbQuery: 10_000,
  },
}
