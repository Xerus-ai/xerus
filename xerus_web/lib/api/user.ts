/**
 * User API Module
 * User profile, credits, settings, API keys, and services
 */
import { auth as firebaseAuth } from '@/utils/firebase';
import { apiCall } from './client';
import type { UserProfile } from './types';

// ============================================================
// LOCAL STORAGE
// ============================================================

export const setUserInfo = (user: UserProfile): void => {
  localStorage.setItem('xerus_user', JSON.stringify(user));
};

export const getStoredUserInfo = (): UserProfile | null => {
  const stored = localStorage.getItem('xerus_user');
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored);
    if (typeof parsed.uid === 'string' && typeof parsed.email === 'string') {
      return { ...parsed, has_workspace: !!parsed.has_workspace };
    }
    return null;
  } catch {
    return null;
  }
};

// ============================================================
// USER ENDPOINTS (/api/v1/users)
// ============================================================

interface FindOrCreateResponse {
  user_id: string;
  email: string;
  display_name?: string;
  has_workspace?: boolean;
  invite_required?: boolean;
  is_new?: boolean;
  role?: string;
  plan_type?: string;
  credits_available?: number;
  created_at?: string;
}

export const findOrCreateUser = async (profile: UserProfile): Promise<UserProfile> => {
  const response = await apiCall('/users/find-or-create', {
    method: 'POST',
    body: JSON.stringify(profile),
  });
  const json = await response.json();
  const userData: FindOrCreateResponse = json.data || json;

  if (!userData.user_id || !userData.email) {
    throw new Error('Invalid response from backend: missing user_id or email');
  }

  return {
    uid: userData.user_id,
    display_name: userData.display_name || profile.display_name,
    email: userData.email,
    has_workspace: !!userData.has_workspace,
    invite_required: userData.invite_required || false,
  };
};

export const redeemInviteCode = async (code: string): Promise<void> => {
  // showErrorToast: false — we handle errors in the InviteCodeGate component
  await apiCall('/invite-codes/redeem', {
    method: 'POST',
    body: JSON.stringify({ code }),
  }, false);
};

export const getUserProfile = async (): Promise<{
  uid: string;
  display_name: string;
  email: string;
  has_workspace: boolean;
  plan_type?: string;
  created_at?: string;
}> => {
  const response = await apiCall('/users/me', { method: 'GET' });
  const json = await response.json();
  const userData = json.data || json;
  return {
    uid: userData.user_id,
    display_name: userData.display_name || userData.email?.split('@')[0] || 'User',
    email: userData.email || '',
    has_workspace: !!userData.has_workspace,
    plan_type: userData.plan_type,
    created_at: userData.created_at,
  };
};

export const updateUserProfile = async (updates: {
  display_name?: string;
  avatar_url?: string;
}): Promise<void> => {
  await apiCall('/users/me', {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });

  const stored = getStoredUserInfo();
  if (stored && updates.display_name) {
    setUserInfo({ ...stored, display_name: updates.display_name, has_workspace: stored.has_workspace ?? false });
  }
};

export const deleteAccount = async (): Promise<void> => {
  await apiCall('/users/me', { method: 'DELETE' });

  const { signOut } = await import('firebase/auth');
  await signOut(firebaseAuth);

  localStorage.removeItem('xerus_user');

  window.location.href = '/login';
};

export interface CreditBalance {
  plan_type: 'free' | 'starter' | 'advanced' | 'prodigy';
  credits_available: number;
  credits_used: number;
  credits_reset_date: string;
}

export const getCreditBalance = async (): Promise<CreditBalance> => {
  const response = await apiCall('/users/credits', { method: 'GET' });
  const json = await response.json();
  const data = json.data || json;

  if (!data.plan_type || typeof data.credits_available !== 'number') {
    throw new Error(`Invalid credit balance response: missing plan_type or credits_available`);
  }

  return data;
};

export const logout = async (): Promise<void> => {
  const { signOut } = await import('firebase/auth');
  await signOut(firebaseAuth);

  localStorage.removeItem('xerus_user');

  window.location.href = '/login';
};

// ============================================================
// API KEY ENDPOINTS (/api/v1/users/api-keys)
// ============================================================

export const saveApiKey = async (apiKey: string, provider: string): Promise<void> => {
  await apiCall('/users/api-keys', {
    method: 'POST',
    body: JSON.stringify({ provider, api_key: apiKey }),
  });
};

export const checkApiKeyStatus = async (): Promise<{ [provider: string]: boolean }> => {
  const response = await apiCall('/users/api-keys', { method: 'GET' });
  const json = await response.json();
  const data = json.data || json;

  // Transform status object to boolean map
  const result: { [provider: string]: boolean } = {};
  if (data.status) {
    Object.entries(data.status).forEach(([provider, info]) => {
      result[provider] = (info as { is_set: boolean }).is_set;
    });
  }
  return result;
};

export const deleteApiKey = async (provider: string): Promise<void> => {
  await apiCall(`/users/api-keys/${provider}`, {
    method: 'DELETE',
  });
};

export const getAllApiKeys = async (): Promise<{ [provider: string]: string | null }> => {
  const response = await apiCall('/users/api-keys', { method: 'GET' });
  const json = await response.json();
  const data = json.data || json;

  const result: { [provider: string]: string | null } = {};
  if (data.providers) {
    data.providers.forEach((p: { provider: string; is_set: boolean; key_hint?: string }) => {
      result[p.provider] = p.is_set ? (p.key_hint || '••••••••') : null;
    });
  }
  return result;
};

