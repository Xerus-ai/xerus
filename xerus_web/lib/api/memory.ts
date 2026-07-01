/**
 * Memory API - Agent memory search index entries
 */
import { apiGet } from './client';

export interface MemoryEntry {
  id: string;
  content: string;
  filePath: string;
  memoryType: string;
  scope: string;
  createdAt: string;
}

interface MemoryRow {
  id: string;
  content: string;
  file_path: string;
  memory_type: string;
  scope: string;
  created_at: string;
}

function mapRow(row: MemoryRow): MemoryEntry {
  return {
    id: row.id,
    content: row.content,
    filePath: row.file_path || '',
    memoryType: row.memory_type || 'working',
    scope: row.scope || 'agent',
    createdAt: row.created_at,
  };
}

export async function getAgentMemories(agentSlug: string): Promise<MemoryEntry[]> {
  const response = await apiGet<{ data: MemoryRow[] }>(
    `/memory?agentSlug=${encodeURIComponent(agentSlug)}`
  );
  return (response.data || []).map(mapRow);
}
