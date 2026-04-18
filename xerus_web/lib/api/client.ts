/**
 * API Client with toast notifications
 * Base client for all API operations
 */
import { toast } from '@/lib/toast';
import { auth as firebaseAuth } from '@/utils/firebase';
import { getApiUrlAsync } from '@/utils/context-detection';

// Get API base URL - uses centralized URL resolution
export const getApiBaseUrl = getApiUrlAsync;

// API error type
export interface ApiError extends Error {
  status?: number;
  code?: string;
}

// Get authentication headers
export const getApiHeaders = async (excludeContentType: boolean = false): Promise<HeadersInit> => {
  const headers: HeadersInit = {};

  if (!excludeContentType) {
    headers['Content-Type'] = 'application/json';
  }

  // Firebase authenticated users
  const user = typeof window !== 'undefined' ? firebaseAuth?.currentUser : null;
  if (user) {
    // Fail-fast on token refresh — proceeding without auth would just yield a confusing 401.
    const token = await user.getIdToken(false);
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
};

// Defaults that prevent request floods and stuck connections
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RATE_LIMIT_RETRIES = 2;
const RATE_LIMIT_BASE_DELAY_MS = 1000;
const MAX_RATE_LIMIT_DELAY_MS = 8000;

// Allow callers to opt out of the default timeout for long-lived requests (SSE token, uploads).
export interface ApiCallOptions extends RequestInit {
  timeoutMs?: number; // overrides DEFAULT_TIMEOUT_MS; pass 0 to disable
}

// Compose caller's signal with a timeout signal using web-standard AbortSignal helpers.
const composeSignal = (callerSignal: AbortSignal | null | undefined, timeoutMs: number): AbortSignal | undefined => {
  const signals: AbortSignal[] = [];
  if (callerSignal) signals.push(callerSignal);
  if (timeoutMs > 0 && typeof AbortSignal.timeout === 'function') {
    signals.push(AbortSignal.timeout(timeoutMs));
  }
  if (signals.length === 0) return undefined;
  if (signals.length === 1) return signals[0];
  return AbortSignal.any(signals);
};

const sleepAbortable = (delayMs: number, signal: AbortSignal | undefined): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });

// Base API call function with toast notifications
export const apiCall = async (
  endpoint: string,
  options: ApiCallOptions = {},
  showErrorToast: boolean = true
): Promise<Response> => {
  const [baseUrl, apiHeaders] = await Promise.all([getApiBaseUrl(), getApiHeaders()]);
  const url = `${baseUrl}${endpoint}`;
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal: callerSignal, ...restOptions } = options;

  let attempt = 0;
  while (true) {
    const signal = composeSignal(callerSignal, timeoutMs);

    try {
      const response = await fetch(url, {
        ...restOptions,
        headers: {
          ...apiHeaders,
          ...restOptions.headers,
        },
        signal,
      });

      // Server-side throttling: respect Retry-After or use exponential backoff.
      if ((response.status === 429 || response.status === 503) && attempt < MAX_RATE_LIMIT_RETRIES) {
        const retryAfterHeader = response.headers.get('Retry-After');
        const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : NaN;
        const backoffDelay = Math.min(MAX_RATE_LIMIT_DELAY_MS, RATE_LIMIT_BASE_DELAY_MS * 2 ** attempt);
        const delay = Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0
          ? Math.min(retryAfterSeconds * 1000, MAX_RATE_LIMIT_DELAY_MS)
          : backoffDelay;
        attempt += 1;
        await sleepAbortable(delay, callerSignal ?? undefined);
        continue;
      }

      if (!response.ok) {
        let errorMessage = `Request failed: ${response.status}`;

        try {
          const errorData = await response.clone().json();
          // Backend returns { error: { code, message } } - extract the string message
          if (errorData.error?.message) {
            errorMessage = errorData.error.message;
          } else if (typeof errorData.error === 'string') {
            errorMessage = errorData.error;
          } else if (typeof errorData.message === 'string') {
            errorMessage = errorData.message;
          }
        } catch {
          // Body wasn't JSON — keep the status-code-based message.
        }

        if (showErrorToast) {
          toast.error(errorMessage);
        }

        const error: ApiError = new Error(errorMessage);
        error.status = response.status;
        throw error;
      }

      return response;
    } catch (error) {
      if (error instanceof Error) {
        // Caller cancelled — don't toast, don't retry, just rethrow.
        if (error.name === 'AbortError' && callerSignal?.aborted) {
          throw error;
        }

        // Timeout (AbortSignal.timeout) surfaces as TimeoutError; pure abort with no
        // caller signal aborted means our composed timeout signal fired.
        if (error.name === 'TimeoutError' || (error.name === 'AbortError' && !callerSignal?.aborted)) {
          const timeoutMessage = 'Request timed out';
          if (showErrorToast) {
            toast.error(timeoutMessage, {
              description: 'The server took too long to respond. Try again in a moment.',
            });
          }
          const timeoutError: ApiError = new Error(timeoutMessage);
          timeoutError.status = 408;
          throw timeoutError;
        }

        if (error.message === 'Failed to fetch') {
          const networkError = "Can't connect";
          if (showErrorToast) {
            toast.error(networkError, {
              description: 'Check your internet and try again.',
            });
          }
          error.message = networkError;
        }
      }
      throw error;
    }
  }
};

// Helper for GET requests
export const apiGet = async <T>(endpoint: string, options: ApiCallOptions = {}): Promise<T> => {
  const response = await apiCall(endpoint, { ...options, method: 'GET' });
  return response.json();
};

// Helper for POST requests with success toast
export const apiPost = async <T>(
  endpoint: string,
  data: unknown,
  successMessage?: string,
  options: ApiCallOptions = {},
): Promise<T> => {
  const response = await apiCall(endpoint, {
    ...options,
    method: 'POST',
    body: JSON.stringify(data),
  });

  if (successMessage) {
    toast.success(successMessage);
  }

  return response.json();
};

// Helper for PATCH requests
export const apiPatch = async <T>(
  endpoint: string,
  data: unknown,
  options: ApiCallOptions = {},
): Promise<T> => {
  const response = await apiCall(endpoint, {
    ...options,
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  return response.json();
};
