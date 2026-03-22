/**
 * URL Detection Utility
 * Centralized URL resolution for web application
 * All URLs are configured via environment variables
 */

// Default fallback values - should match backend port
const DEFAULT_API_URL = 'http://localhost:5001/api/v1';
const DEFAULT_WEB_URL = 'http://localhost:3002';
const DEFAULT_PRODUCTION_API_URL = 'https://api.xerus.ai/api/v1';
const DEFAULT_PRODUCTION_WEB_URL = 'https://app.xerus.ai';

/**
 * Check if running in development environment
 */
function isDevelopment(): boolean {
  if (process.env.NODE_ENV === 'development') {
    return true;
  }
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    return hostname === 'localhost' || hostname === '127.0.0.1';
  }
  return false;
}

/**
 * Get the API URL based on environment
 * Priority: NEXT_PUBLIC_API_URL env var > production URL > development fallback
 */
export function getAPIUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  return isDevelopment() ? DEFAULT_API_URL : DEFAULT_PRODUCTION_API_URL;
}

/**
 * Get the web URL based on environment
 * Priority: NEXT_PUBLIC_WEB_URL env var > production URL > development fallback
 */
export function getWebUrl(): string {
  if (process.env.NEXT_PUBLIC_WEB_URL) {
    return process.env.NEXT_PUBLIC_WEB_URL;
  }
  return isDevelopment() ? DEFAULT_WEB_URL : DEFAULT_PRODUCTION_WEB_URL;
}

/**
 * Get API URL with runtime config support (async version)
 * Attempts to load from runtime-config.json first, then falls back to getAPIUrl.
 * Caches the result to avoid repeated fetch attempts.
 */
let cachedApiUrl: string | null = null;
let fetchAttempted = false;

export async function getApiUrlAsync(): Promise<string> {
  if (cachedApiUrl) return cachedApiUrl;
  if (fetchAttempted) return getAPIUrl();
  fetchAttempted = true;
  try {
    const response = await fetch('/runtime-config.json');
    if (response.ok) {
      const config = await response.json();
      const url = (config.API_URL as string | undefined) || getAPIUrl();
      cachedApiUrl = url;
      return url;
    }
  } catch {
    // Runtime config not available, use environment-based URL
  }
  const fallback = getAPIUrl();
  cachedApiUrl = fallback;
  return fallback;
}
