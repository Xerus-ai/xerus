import type { APIResponse, APIRequestContext } from '@playwright/test'
import { test } from '@playwright/test'

/**
 * Xerus API responses are wrapped in { success, data, meta }.
 * This unwraps to return just the data payload.
 */
export async function unwrap<T = Record<string, unknown>>(resp: APIResponse): Promise<T> {
  const body = await resp.json()
  // Handle both wrapped { success, data } and raw responses
  if (body && typeof body === 'object' && 'data' in body) {
    return body.data as T
  }
  return body as T
}

/**
 * Skip the current test if response is 429 (rate limited).
 * Returns true if the test was skipped (caller should return).
 */
export function skipIfRateLimited(status: number): boolean {
  if (status === 429) {
    test.skip(true, 'Rate limited (429)')
    return true
  }
  return false
}

/**
 * Make a request with a small delay to avoid rate limiting.
 */
export async function withDelay<T>(fn: () => Promise<T>, ms = 200): Promise<T> {
  await new Promise((r) => setTimeout(r, ms))
  return fn()
}
