/**
 * Tools API Module
 * Operations for connector catalog and agent tool assignments.
 */
import { toast } from '@/lib/toast';
import { apiCall } from './client';

export interface ToolCatalogResponse {
  apps: Record<string, unknown>[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    total_pages: number;
    has_more: boolean;
  };
  available_categories: string[];
}

export interface ToolCatalogParams {
  page?: number;
  limit?: number;
  search?: string;
  categories?: string[];
}

export const getToolsCatalog = async (params: ToolCatalogParams = {}): Promise<ToolCatalogResponse> => {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set('page', String(params.page));
  if (params.limit) searchParams.set('limit', String(params.limit));
  if (params.search?.trim()) searchParams.set('search', params.search.trim());
  if (params.categories && params.categories.length > 0) {
    searchParams.set('category', params.categories.join(','));
  }

  const query = searchParams.toString();
  const response = await apiCall(`/tools${query ? `?${query}` : ''}`, { method: 'GET' });
  const result = await response.json();
  const data = result.data || result;
  return {
    apps: data.apps || [],
    pagination: data.pagination,
    available_categories: data.available_categories || [],
  };
};

export const getTool = async (toolSlug: string): Promise<Record<string, unknown> | null> => {
  const response = await apiCall(`/tools/${encodeURIComponent(toolSlug)}`, { method: 'GET' });
  const result = await response.json();
  return result.data || result;
};

/**
 * Add a single tool to an agent
 */
export const addToolToAgent = async (
  agentId: number,
  toolName: string,
  toolConfig: Record<string, unknown> = {}
): Promise<{ tools: string[]; added: string }> => {
  const response = await apiCall(`/agents/${agentId}/tools`, {
    method: 'POST',
    body: JSON.stringify({ tool_name: toolName, tool_config: toolConfig }),
  });
  const result = await response.json();
  const data = result.data ?? result;
  return { tools: data.tools ?? [], added: data.added ?? toolName };
};

/**
 * Assign multiple tools to an agent (adds each one)
 */
export const assignToolsToAgent = async (
  agentId: number,
  toolNames: string[]
): Promise<void> => {
  if (toolNames.length === 0) return;

  await Promise.all(toolNames.map(name =>
    apiCall(`/agents/${agentId}/tools`, {
      method: 'POST',
      body: JSON.stringify({ tool_name: name, tool_config: {} }),
    })
  ));
  toast.success(toolNames.length === 1 ? 'Tool added' : 'Tools added', {
    description: toolNames.length === 1 ? 'Your agent can now use this tool.' : 'Your agent can now use these tools.',
  });
};

/**
 * Remove a single tool from an agent
 */
export const removeToolFromAgent = async (
  agentId: number,
  toolName: string
): Promise<void> => {
  await apiCall(`/agents/${agentId}/tools/${encodeURIComponent(toolName)}`, { method: 'DELETE' });
};

/**
 * Remove multiple tools from an agent
 */
export const removeToolsFromAgent = async (
  agentId: number,
  toolNames: string[]
): Promise<void> => {
  if (toolNames.length === 0) return;

  await Promise.all(toolNames.map(name =>
    apiCall(`/agents/${agentId}/tools/${encodeURIComponent(name)}`, { method: 'DELETE' })
  ));
  toast.success(toolNames.length === 1 ? 'Tool removed' : 'Tools removed', {
    description: toolNames.length === 1 ? 'This tool has been disconnected from your agent.' : 'These tools have been disconnected from your agent.',
  });
};

/**
 * Get tools assigned to an agent
 */
export const getAgentTools = async (agentId: number): Promise<string[]> => {
  const response = await apiCall(`/agents/${agentId}/tools`, { method: 'GET' });
  const result = await response.json();
  const data = result.data || result;
  const tools = data.tools || [];
  return tools.map((t: { tool_name: string } | string) =>
    typeof t === 'string' ? t : t.tool_name
  );
};
