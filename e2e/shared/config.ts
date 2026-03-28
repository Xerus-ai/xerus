import path from 'path'

const BACKEND_DIR = path.resolve(__dirname, '../../xerus_backend')

export const CONFIG = {
  baseURL: process.env.E2E_BASE_URL || 'http://localhost:3005',
  apiURL: process.env.E2E_API_URL || 'http://localhost:5001/api/v1',

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
