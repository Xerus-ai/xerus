/**
 * History API - Execution session history for agents
 */
import { apiGet } from './client';

export interface RunEntry {
  id: string;
  status: 'success' | 'failed' | 'running';
  triggerType: string;
  task: string;
  description: string;
  tokensUsed: number;
  creditsUsed: number;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
  duration: string;
}

interface ExecutionSessionRow {
  id: string;
  status: string;
  trigger_type: string;
  user_prompt: string | null;
  agent_response: string | null;
  input_tokens: number;
  output_tokens: number;
  credits_used: number;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

function mapStatus(status: string): 'success' | 'failed' | 'running' {
  if (status === 'completed') return 'success';
  if (status === 'failed' || status === 'cancelled') return 'failed';
  return 'running';
}

function computeDuration(startedAt: string, completedAt: string | null): string {
  if (!completedAt) return 'In progress';
  const start = new Date(startedAt).getTime();
  const end = new Date(completedAt).getTime();
  const diffMs = end - start;
  if (diffMs < 1000) return '<1s';
  if (diffMs < 60_000) return `${Math.round(diffMs / 1000)}s`;
  if (diffMs < 3_600_000) return `${Math.round(diffMs / 60_000)}m`;
  return `${Math.round(diffMs / 3_600_000)}h`;
}

function truncate(text: string | null, maxLen: number): string {
  if (!text) return '';
  return text.length > maxLen ? text.slice(0, maxLen) + '...' : text;
}

function mapRow(row: ExecutionSessionRow): RunEntry {
  return {
    id: row.id,
    status: mapStatus(row.status),
    triggerType: row.trigger_type || 'manual',
    task: truncate(row.user_prompt, 100),
    description: truncate(row.agent_response, 200),
    tokensUsed: (row.input_tokens || 0) + (row.output_tokens || 0),
    creditsUsed: row.credits_used || 0,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    duration: computeDuration(row.started_at, row.completed_at),
  };
}

export async function getAgentHistory(agentSlug: string, status?: string): Promise<RunEntry[]> {
  const params = new URLSearchParams({ agentSlug });
  if (status) params.set('status', status);

  const response = await apiGet<{ data: ExecutionSessionRow[] }>(
    `/history?${params.toString()}`
  );
  return (response.data || []).map(mapRow);
}
