/**
 * Agents API Module
 * CRUD operations for AI agents/assistants
 */
import { toast } from 'sonner';
import { apiCall } from './client';
import { mapAgentToAssistant } from './mappers';
import type {
  Assistant,
  BackendAgent,
  AgentCreateInput,
  AgentUpdateInput,
} from './types';
import {
  isValidThinkingLevel,
  isValidAutonomyLevel,
  VALID_THINKING_LEVELS,
  VALID_AUTONOMY_LEVELS,
} from './types';

/**
 * Validate behaviour fields before sending to backend
 * Returns error message if invalid, null if valid
 */
function validateBehaviourFields(data: { thinking_level?: unknown; autonomy_level?: unknown }): string | null {
  if (data.thinking_level !== undefined && !isValidThinkingLevel(data.thinking_level)) {
    return `Invalid thinking level. Must be one of: ${VALID_THINKING_LEVELS.join(', ')}`;
  }
  if (data.autonomy_level !== undefined && !isValidAutonomyLevel(data.autonomy_level)) {
    return `Invalid autonomy level. Must be one of: ${VALID_AUTONOMY_LEVELS.join(', ')}`;
  }
  return null;
}

/**
 * Get all assistants/agents with optional pagination and filtering
 */
export const getAssistants = async (options?: {
  page?: number;
  limit?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  agent_type?: string;
  is_verified?: boolean;
  ai_model?: string;
  search?: string;
  tags?: string[];
}): Promise<{ agents: Assistant[]; pagination: { page: number; limit: number; total: number; total_pages: number } }> => {
  const params = new URLSearchParams();
  if (options?.page) params.set('page', options.page.toString());
  if (options?.limit) params.set('limit', options.limit.toString());
  if (options?.sort_by) params.set('sort_by', options.sort_by);
  if (options?.sort_order) params.set('sort_order', options.sort_order);
  if (options?.agent_type) params.set('agent_type', options.agent_type);
  if (options?.is_verified !== undefined) params.set('is_verified', options.is_verified.toString());
  if (options?.ai_model) params.set('ai_model', options.ai_model);
  if (options?.search) params.set('search', options.search);
  if (options?.tags) options.tags.forEach(tag => params.append('tags', tag));

  const queryString = params.toString();
  const endpoint = queryString ? `/agents?${queryString}` : '/agents';

  const response = await apiCall(endpoint, { method: 'GET' });
  const result = await response.json();
  const data = result.data || result;

  return {
    agents: (data.agents || []).map(mapAgentToAssistant),
    pagination: data.pagination || { page: 1, limit: 20, total: 0, total_pages: 0 }
  };
};

/**
 * Browse marketplace agents with optional filtering
 */
export const getMarketplaceAgents = async (options?: {
  page?: number;
  limit?: number;
  is_verified?: boolean;
  search?: string;
  tags?: string[];
}): Promise<{ agents: Assistant[]; pagination: { page: number; limit: number; total: number; total_pages: number } }> => {
  const params = new URLSearchParams();
  if (options?.page) params.set('page', options.page.toString());
  if (options?.limit) params.set('limit', options.limit.toString());
  if (options?.is_verified !== undefined) params.set('is_verified', options.is_verified.toString());
  if (options?.search) params.set('search', options.search);
  if (options?.tags) options.tags.forEach(tag => params.append('tags', tag));

  const queryString = params.toString();
  const endpoint = queryString ? `/agents/marketplace?${queryString}` : '/agents/marketplace';

  const response = await apiCall(endpoint, { method: 'GET' });
  const result = await response.json();
  const data = result.data || result;

  return {
    agents: (data.agents || []).map(mapAgentToAssistant),
    pagination: data.pagination || { page: 1, limit: 20, total: 0, total_pages: 0 }
  };
};

/**
 * Get user's own agents
 */
export const getUserAgents = async (): Promise<Assistant[]> => {
  const response = await apiCall('/agents/mine', { method: 'GET' });
  const result = await response.json();
  const data = result.data || result;
  return (data.agents || []).map(mapAgentToAssistant);
};

/**
 * Get single assistant by ID or slug.
 * Backend resolves both numeric IDs and slug strings via resolveAgentParam.
 */
export const getAssistant = async (id: number | string): Promise<Assistant | null> => {
  const isMarketplaceId = typeof id === 'string' && isNaN(Number(id));

  // Marketplace agents don't have DB records for KB/tools sub-routes.
  // Only fetch the main agent; use resolved-null sentinels to keep array length stable.
  const [agentResponse, kbResponse, toolsResponse] = await Promise.allSettled([
    apiCall(`/agents/${id}`, { method: 'GET' }, false),
    isMarketplaceId ? Promise.resolve(null) : apiCall(`/agents/${id}/knowledge-bases`, { method: 'GET' }, false),
    isMarketplaceId ? Promise.resolve(null) : apiCall(`/agents/${id}/tools`, { method: 'GET' }, false),
  ]);

  // apiCall throws on non-ok (including 404), so rejections carry the status
  if (agentResponse.status === 'rejected') {
    const err = agentResponse.reason as { status?: number };
    if (err?.status === 404) return null;
    throw new Error('Failed to fetch assistant');
  }

  const agentResult = await agentResponse.value.json();
  const agentData = agentResult.data || agentResult;
  const rawAgent = agentData.agent || agentData;
  const agent: BackendAgent = rawAgent;

  // Determine knowledgeBase
  let knowledgeBase: string[] = [];
  if (agent.search_all_knowledge) {
    knowledgeBase = ['all'];
  } else if (kbResponse.status === 'fulfilled' && kbResponse.value && kbResponse.value.ok) {
    try {
      const kbResult = await kbResponse.value.json();
      const kbData = kbResult.data || kbResult;
      const kbs = kbData.knowledge_bases || [];
      knowledgeBase = kbs.map((kb: { knowledge_base_id: string }) => kb.knowledge_base_id);
    } catch (err) {
      console.error('Failed to parse knowledge bases:', err);
    }
  }

  // Get assigned tools — from sub-call for user agents, from main response for marketplace
  type ToolEntry = { name_slug: string; name: string; description: string | null; img_src: string | null; auth_type: string | null; categories: string[] | null };
  let assignedTools: ToolEntry[] = [];
  if (toolsResponse.status === 'fulfilled' && toolsResponse.value && toolsResponse.value.ok) {
    try {
      const toolsResult = await toolsResponse.value.json();
      const toolsData = toolsResult.data || toolsResult;
      assignedTools = toolsData.tools || [];
    } catch (err) {
      console.error('Failed to parse tools:', err);
    }
  } else if (rawAgent.tools && Array.isArray(rawAgent.tools)) {
    // Marketplace agents: tools come as slugs in the main response
    assignedTools = rawAgent.tools.map((t: any) => {
      if (typeof t === 'string') {
        return { name_slug: t, name: t, description: null, img_src: null, auth_type: null, categories: null };
      }
      return t;
    });
  }

  // Add web_search if enabled (legacy flag)
  if (agent.web_search_enabled && !assignedTools.some(t => t.name_slug === 'web_search')) {
    assignedTools.push({
      name_slug: 'web_search',
      name: 'Web Search',
      description: 'Search the web for information',
      img_src: null,
      auth_type: null,
      categories: null,
    });
  }

  const assistant = mapAgentToAssistant(agent);
  return {
    ...assistant,
    knowledgeBase,
    tools: assignedTools,
  };
};

/**
 * Create a new agent
 */
export const createAgent = async (data: AgentCreateInput): Promise<Assistant> => {
  // Validate behaviour fields before sending to backend
  const validationError = validateBehaviourFields(data);
  if (validationError) {
    toast.error(validationError);
    throw new Error(validationError);
  }

  const response = await apiCall('/agents', {
    method: 'POST',
    body: JSON.stringify(data),
  });

  const result = await response.json();
  const agentData = result.data || result;
  const agent: BackendAgent = agentData.agent || agentData;
  toast.success('Agent created');
  return mapAgentToAssistant(agent);
};

/**
 * Update an existing agent
 */
export const updateAgent = async (id: number, updates: AgentUpdateInput): Promise<Assistant> => {
  // Validate behaviour fields before sending to backend
  const validationError = validateBehaviourFields(updates);
  if (validationError) {
    toast.error(validationError);
    throw new Error(validationError);
  }

  // Fetch current agent to get knowledge base status
  let knowledgeBase: string[] = [];

  try {
    const currentAgent = await getAssistant(id);
    if (currentAgent?.knowledgeBase) {
      knowledgeBase = currentAgent.knowledgeBase;
    }
  } catch (err) {
    // KB fetch is non-critical for the update operation itself.
    // The update will succeed without it; we just lose the ability to
    // return the current KB state in the response object.
    console.warn('Failed to fetch current KB for agent update, proceeding without:', err);
  }

  const response = await apiCall(`/agents/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });

  const result = await response.json();
  const agentData = result.data || result;
  const agent: BackendAgent = agentData.agent || agentData;
  toast.success('Changes saved');

  const assistant = mapAgentToAssistant(agent);
  return {
    ...assistant,
    knowledgeBase,
  };
};

/**
 * Delete an agent
 */
export const deleteAssistant = async (id: number): Promise<void> => {
  await apiCall(`/agents/${id}`, { method: 'DELETE' });
  toast.success('Agent deleted');
};

/**
 * Clone an agent to create private customizable copy.
 * Accepts numeric ID (registered agents) or slug string (marketplace agents).
 */
export const cloneAgent = async (
  agentIdOrSlug: number | string,
  options?: { customName?: string }
): Promise<{ success: boolean; agent: Assistant; message: string }> => {
  const response = await apiCall(`/agents/${agentIdOrSlug}/clone`, {
    method: 'POST',
    body: JSON.stringify({ name: options?.customName }),
  });

  const result = await response.json();
  const data = result.data || result;
  toast.success('Agent cloned', {
    description: 'You can now customize it.',
  });

  return {
    success: true,
    agent: mapAgentToAssistant(data.agent || data),
    message: 'Agent cloned',
  };
};

/**
 * Publish agent to marketplace
 */
export const publishAgent = async (agentId: number): Promise<Assistant> => {
  const response = await apiCall(`/agents/${agentId}/publish`, { method: 'POST' }, false);
  const result = await response.json();
  const data = result.data || result;
  return mapAgentToAssistant(data.agent || data);
};

/**
 * Unpublish agent from marketplace
 */
export const unpublishAgent = async (agentId: number): Promise<Assistant> => {
  const response = await apiCall(`/agents/${agentId}/unpublish`, { method: 'POST' }, false);
  const result = await response.json();
  const data = result.data || result;
  return mapAgentToAssistant(data.agent || data);
};

/**
 * Set agent as user's default
 */
export const setDefaultAgent = async (agentId: number): Promise<Assistant> => {
  const response = await apiCall(`/agents/${agentId}/set-default`, { method: 'POST' });
  const result = await response.json();
  const data = result.data || result;
  toast.success('Set as default agent');
  return mapAgentToAssistant(data.agent || data);
};

/**
 * Create assistant (frontend format wrapper)
 * Maps frontend Assistant format to backend AgentCreateInput
 */
export const createAssistant = async (
  assistant: Omit<Assistant, 'id' | 'createdAt' | 'usageCount' | 'lastUsed'>
): Promise<Assistant> => {
  const agentData = {
    name: assistant.name,
    description: assistant.description,
    personality_type: assistant.category,
    web_search_enabled: assistant.tools.some(t => t.name_slug === 'web_search'),
    search_all_knowledge: assistant.knowledgeBase.includes('all'),
    ai_model: assistant.model || 'anthropic/claude-sonnet-4-6',
  };

  return createAgent(agentData);
};

// ===== PROMPT FORMATTING =====

export interface FormattedPromptResult {
  system_prompt: string;
  personality_type: string;
  tags: string[];
}

/**
 * Format raw prompt using AI into structured 6-section format
 */
export const formatPrompt = async (rawPrompt: string): Promise<FormattedPromptResult> => {
  const response = await apiCall('/agents/format-prompt', {
    method: 'POST',
    body: JSON.stringify({ raw_prompt: rawPrompt }),
  });

  const result = await response.json();
  const data = result.data || result;
  return {
    system_prompt: data.system_prompt || rawPrompt,
    personality_type: data.personality_type || 'assistant',
    tags: data.tags || [],
  };
};
