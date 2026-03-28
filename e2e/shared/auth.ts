import * as admin from 'firebase-admin'
import { CONFIG } from './config'

let initialized = false

function initFirebaseAdmin(): void {
  if (initialized) return
  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.cert(CONFIG.firebase.serviceAccountPath),
    })
  }
  initialized = true
}

/**
 * Generate a Firebase custom token for the test user,
 * then exchange it for an ID token via the REST API.
 */
export async function getFirebaseIdToken(): Promise<string> {
  initFirebaseAdmin()

  const customToken = await admin.auth().createCustomToken(CONFIG.testUser.uid)

  const resp = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${CONFIG.firebase.webApiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    }
  )

  const data = await resp.json()
  if (!data.idToken) {
    throw new Error(`Failed to get Firebase ID token: ${JSON.stringify(data)}`)
  }
  return data.idToken
}

/**
 * Generate the custom token only (for browser-side signInWithCustomToken).
 */
export async function getFirebaseCustomToken(): Promise<string> {
  initFirebaseAdmin()
  return admin.auth().createCustomToken(CONFIG.testUser.uid)
}

/**
 * Build Authorization header for API tests.
 */
export function authHeader(idToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${idToken}`,
    'Content-Type': 'application/json',
  }
}
