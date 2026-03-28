import type { APIResponse } from '@playwright/test'

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
