/**
 * API Client with toast notifications
 * Base client for all API operations
 */
import { toast } from '@/lib/toast';
import { auth as firebaseAuth } from '@/utils/firebase';
import { getApiUrlAsync } from '@/utils/context-detection';

// Get API base URL - uses centralized URL resolution
export const getApiBaseUrl = getApiUrlAsync;

// Get authentication headers
export const getApiHeaders = async (excludeContentType: boolean = false): Promise<HeadersInit> => {
  const headers: HeadersInit = {};

  if (!excludeContentType) {
    headers['Content-Type'] = 'application/json';
  }

  // Firebase authenticated users
  const user = typeof window !== 'undefined' ? firebaseAuth?.currentUser : null;
  if (user) {
    try {
      const token = await user.getIdToken(false); // Use cached token
      headers['Authorization'] = `Bearer ${token}`;
    } catch (error) {
      console.error('Token refresh failed:', error);
    }
  }

  return headers;
};

// API error type
export interface ApiError extends Error {
  status?: number;
  code?: string;
}

// Base API call function with toast notifications
export const apiCall = async (
  endpoint: string,
  options: RequestInit = {},
  showErrorToast: boolean = true
): Promise<Response> => {
  const [baseUrl, apiHeaders] = await Promise.all([getApiBaseUrl(), getApiHeaders()]);
  const url = `${baseUrl}${endpoint}`;
  const defaultOptions: RequestInit = {
    headers: {
      ...apiHeaders,
      ...options.headers,
    },
  };

  try {
    const response = await fetch(url, { ...defaultOptions, ...options });

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
        // Keep default error message
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
};

// Helper for GET requests
export const apiGet = async <T>(endpoint: string): Promise<T> => {
  const response = await apiCall(endpoint, { method: 'GET' });
  return response.json();
};

// Helper for POST requests with success toast
export const apiPost = async <T>(
  endpoint: string,
  data: unknown,
  successMessage?: string
): Promise<T> => {
  const response = await apiCall(endpoint, {
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
): Promise<T> => {
  const response = await apiCall(endpoint, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  return response.json();
};

