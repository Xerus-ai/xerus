// Models API
// Fetches model registry data from backend

import { apiCall } from './client';

export interface ModelEntry {
  id: string;
  provider: string;
  modelName: string;
  displayName: string;
  description: string | null;
  contextLength: number | null;
  supportsVision: boolean;
  supportsTools: boolean;
  supportsThinking: boolean;
  tier: string | null;
  isFeatured: boolean;
  pricingInputCents: number | null;
  pricingOutputCents: number | null;
}

export const getFeaturedModels = async (): Promise<ModelEntry[]> => {
  const response = await apiCall('/models?featured=true', { method: 'GET' });
  const json = await response.json();
  if (!Array.isArray(json.data)) {
    throw new Error('Unexpected response from /models?featured=true: missing data array');
  }
  return json.data;
};

export const getAllModels = async (): Promise<ModelEntry[]> => {
  const response = await apiCall('/models', { method: 'GET' });
  const json = await response.json();
  if (!Array.isArray(json.data)) {
    throw new Error('Unexpected response from /models: missing data array');
  }
  return json.data;
};
