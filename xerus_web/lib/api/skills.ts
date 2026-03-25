/**
 * Skills API Module
 * CRUD operations for skills marketplace, install/uninstall, and file operations
 */
import { toast } from '@/lib/toast';
import { apiCall, getApiHeaders } from './client';
import { mapSkillToFrontend, mapSkillDetailToFrontend } from './mappers';
import type {
  Skill,
  SkillDetail,
  SkillCreateInput,
  SkillUpdateInput,
  SkillInstallInput,
  SkillFilters,
  SkillFile,
  SkillSecretStatus,
} from './types';

// ============================================================
// UNIFIED LIST - All skills with is_installed flag + categories
// ============================================================

export const getSkills = async (options?: {
  page?: number;
  limit?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  category?: string;
  search?: string;
  tags?: string[];
}): Promise<{ skills: Skill[]; categories: string[]; pagination: { page: number; limit: number; total: number; total_pages: number } }> => {
  const params = new URLSearchParams();
  if (options?.page) params.set('page', options.page.toString());
  if (options?.limit) params.set('limit', options.limit.toString());
  if (options?.sort_by) params.set('sort_by', options.sort_by);
  if (options?.sort_order) params.set('sort_order', options.sort_order);
  if (options?.category) params.set('category', options.category);
  if (options?.search) params.set('search', options.search);
  if (options?.tags) options.tags.forEach(tag => params.append('tags', tag));

  const queryString = params.toString();
  const endpoint = queryString ? `/skills?${queryString}` : '/skills';

  const response = await apiCall(endpoint, { method: 'GET' });
  const result = await response.json();
  const data = result.data || result;

  return {
    skills: (data.skills || []).map(mapSkillToFrontend),
    categories: (data.categories || []).map((c: { category: string }) => c.category),
    pagination: data.pagination || { page: 1, limit: 20, total: 0, total_pages: 0 },
  };
};

// ============================================================
// DETAIL
// ============================================================

export const getSkill = async (idOrSlug: string): Promise<SkillDetail | null> => {
  try {
    const response = await apiCall(`/skills/${idOrSlug}`, { method: 'GET' }, false);
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error('Failed to fetch skill');
    }
    const result = await response.json();
    const data = result.data || result;
    return mapSkillDetailToFrontend(data.skill || data);
  } catch (err) {
    console.error('Error fetching skill:', err);
    return null;
  }
};

// ============================================================
// CRUD
// ============================================================

export const createSkill = async (input: SkillCreateInput): Promise<Skill> => {
  const response = await apiCall('/skills', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  const result = await response.json();
  const data = result.data || result;
  toast.success('Skill created', { description: 'Your new skill is ready to use.' });
  return mapSkillToFrontend(data.skill || data);
};

export const updateSkill = async (slug: string, updates: SkillUpdateInput): Promise<Skill> => {
  const response = await apiCall(`/skills/${slug}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  const result = await response.json();
  const data = result.data || result;
  toast.success('Skill updated', { description: 'Your changes have been applied.' });
  return mapSkillToFrontend(data.skill || data);
};

export const deleteSkill = async (slug: string): Promise<void> => {
  await apiCall(`/skills/${slug}`, { method: 'DELETE' });
  toast.success('Skill deleted', { description: 'This skill has been permanently removed.' });
};

// ============================================================
// INSTALL / UNINSTALL
// ============================================================

export const installSkill = async (skillSlug: string, input: SkillInstallInput): Promise<void> => {
  await apiCall(`/skills/${skillSlug}/install`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  toast.success('Skill installed', { description: 'This skill is now available to your agents.' });
};

export const uninstallSkill = async (skillSlug: string, scope: 'channel' | 'global' = 'global', channelPath?: string): Promise<void> => {
  await apiCall(`/skills/${skillSlug}/install`, {
    method: 'DELETE',
    body: JSON.stringify({ scope, channel_id: channelPath }),
  });
  toast.success('Skill uninstalled', { description: 'This skill has been removed from your workspace.' });
};


// ============================================================
// FILE OPERATIONS
// ============================================================

export const getSkillFiles = async (idOrSlug: string): Promise<SkillFile[]> => {
  const response = await apiCall(`/skills/${idOrSlug}/files`, { method: 'GET' });
  const result = await response.json();
  const data = result.data || result;
  return data.files || [];
};

export const readSkillFile = async (idOrSlug: string, filePath: string): Promise<string> => {
  const response = await apiCall(`/skills/${idOrSlug}/files/${filePath}`, { method: 'GET' });
  const result = await response.json();
  const data = result.data || result;
  return data.content || '';
};

export const writeSkillFile = async (idOrSlug: string, filePath: string, content: string): Promise<void> => {
  await apiCall(`/skills/${idOrSlug}/files/${filePath}`, {
    method: 'PUT',
    body: JSON.stringify({ content }),
  });
  toast.success('File saved', { description: 'Your changes have been written to disk.' });
};

export const deleteSkillFile = async (idOrSlug: string, filePath: string): Promise<void> => {
  await apiCall(`/skills/${idOrSlug}/files/${filePath}`, { method: 'DELETE' });
  toast.success('File deleted', { description: 'This file has been permanently removed.' });
};

// ============================================================
// SECRETS
// ============================================================

export const getSkillSecrets = async (skillSlug: string): Promise<SkillSecretStatus[]> => {
  const response = await apiCall(`/skills/${skillSlug}/secrets`, { method: 'GET' });
  const result = await response.json();
  const data = result.data || result;
  return (data.secrets || []).map((s: Record<string, unknown>) => ({
    envKey: s.env_key as string,
    hasValue: s.has_value as boolean,
    hint: s.hint as string,
    updatedAt: s.updated_at as string,
  }));
};

export const setSkillSecret = async (skillSlug: string, envKey: string, value: string): Promise<void> => {
  await apiCall(`/skills/${skillSlug}/secrets/${envKey}`, {
    method: 'PUT',
    body: JSON.stringify({ value }),
  });
  toast.success('Secret saved', { description: 'Your secret is securely stored.' });
};

export const deleteSkillSecret = async (skillSlug: string, envKey: string): Promise<void> => {
  await apiCall(`/skills/${skillSlug}/secrets/${envKey}`, { method: 'DELETE' });
  toast.success('Secret removed', { description: 'This secret has been deleted.' });
};

/**
 * Import a skill from uploaded files (SKILL.md + optional xerushub.json + supporting files)
 */
export const importSkill = async (files: File[]): Promise<Skill> => {
  const formData = new FormData();
  for (const file of files) {
    formData.append('files', file);
  }

  const headers = await getApiHeaders(true); // Exclude Content-Type for FormData

  const response = await apiCall('/skills/import', {
    method: 'POST',
    headers,
    body: formData,
  });

  const result = await response.json();
  const skillData = result.data || result;
  const skill = skillData.skill || skillData;
  return mapSkillToFrontend(skill);
};
