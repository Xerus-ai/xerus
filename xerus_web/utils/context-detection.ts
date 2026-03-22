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
 * Async version of getAPIUrl for backward compatibility.
 * Resolves from environment variables only.
 */
export async function getApiUrlAsync(): Promise<string> {
  return getAPIUrl();
}
