/**
 * SSE Token Exchange
 *
 * Exchanges a Firebase JWT (sent in Authorization header) for a short-lived,
 * single-use token safe to pass as a query parameter to EventSource.
 *
 * Each SSE-capable domain exposes POST /<domain>/sse-token. This module
 * provides a typed helper per domain.
 */
import { getApiBaseUrl, getApiHeaders } from './client';

async function exchangeSseToken(endpoint: string): Promise<string> {
  const baseUrl = await getApiBaseUrl();
  const headers = await getApiHeaders();

  const response = await fetch(`${baseUrl}${endpoint}`, {
    method: 'POST',
    headers,
  });

  if (!response.ok) {
    throw new Error(`Failed to obtain SSE token from ${endpoint}: ${response.status}`);
  }

  const json = await response.json();
  const token: string | undefined = json.data?.token ?? json.token;
  if (!token) {
    throw new Error('SSE token response missing token field');
  }
  return token;
}

/** SSE token for inbox stream (POST /inbox/sse-token) */
export function fetchInboxSseToken(): Promise<string> {
  return exchangeSseToken('/inbox/sse-token');
}

/** SSE token for workspace stream (POST /workspace/sse-token) */
export function fetchWorkspaceSseToken(): Promise<string> {
  return exchangeSseToken('/workspace/sse-token');
}
