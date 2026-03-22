/**
 * Agent Knowledge Base API Module
 * CRUD operations for agent-knowledge base associations
 */
import { toast } from 'sonner';
import { apiCall } from './client';

/**
 * Get agent's knowledge bases
 */
export const getAgentKnowledgeBases = async (agentId: number): Promise<{
  knowledge_base_id: string;
  kb_name: string;
  access_mode: string;
  added_at: string;
}[]> => {
  const response = await apiCall(`/agents/${agentId}/knowledge-bases`, { method: 'GET' });
  const result = await response.json();
  const data = result.data || result;
  return data.knowledge_bases || [];
};

/**
 * Add knowledge base to agent
 */
export const addAgentKnowledgeBase = async (
  agentId: number,
  knowledgeBaseId: string,
  kbName?: string,
  accessMode: 'read' | 'write' = 'read'
): Promise<{
  knowledge_base_id: string;
  kb_name: string;
  access_mode: string;
  added_at: string;
}> => {
  const response = await apiCall(`/agents/${agentId}/knowledge-bases`, {
    method: 'POST',
    body: JSON.stringify({
      knowledge_base_id: knowledgeBaseId,
      kb_name: kbName,
      access_mode: accessMode,
    }),
  });
  const result = await response.json();
  const data = result.data || result;
  toast.success('Knowledge base added');
  return data.knowledge_base || data;
};

/**
 * Remove knowledge base from agent
 */
export const removeAgentKnowledgeBase = async (
  agentId: number,
  knowledgeBaseId: string
): Promise<void> => {
  await apiCall(`/agents/${agentId}/knowledge-bases/${knowledgeBaseId}`, { method: 'DELETE' });
  toast.success('Knowledge base removed');
};
