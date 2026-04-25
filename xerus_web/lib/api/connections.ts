/**
 * Workspace Connections API
 * Thin client over /workspace/connections for linking drive files to agents, channels, or other files.
 * This is the single source of truth for "file ↔ target" relations — the agent KB card is just a view
 * over connections filtered by target_type='agent'.
 */
import { toast } from '@/lib/toast'
import { apiCall } from './client'

export type ConnectionTargetType = 'agent' | 'channel' | 'file'

export interface FileConnection {
  id: number
  file_path: string
  target_type: ConnectionTargetType
  target_ref: string
  created_at: string
  created_by: string | null
}

function unwrap<T>(payload: any): T {
  return (payload?.data ?? payload) as T
}

export async function listConnectionsForFile(filePath: string): Promise<FileConnection[]> {
  const response = await apiCall(
    `/workspace/connections?file_path=${encodeURIComponent(filePath)}`,
    { method: 'GET' },
  )
  const data = unwrap<{ connections?: FileConnection[] }>(await response.json())
  return data.connections ?? []
}

export async function listConnectionsForTarget(
  targetType: ConnectionTargetType,
  targetRef: string,
): Promise<FileConnection[]> {
  const response = await apiCall(
    `/workspace/connections?target_type=${encodeURIComponent(targetType)}&target_ref=${encodeURIComponent(targetRef)}`,
    { method: 'GET' },
  )
  const data = unwrap<{ connections?: FileConnection[] }>(await response.json())
  return data.connections ?? []
}

export async function createConnection(
  filePath: string,
  targetType: ConnectionTargetType,
  targetRef: string,
): Promise<FileConnection> {
  const response = await apiCall('/workspace/connections', {
    method: 'POST',
    body: JSON.stringify({ file_path: filePath, target_type: targetType, target_ref: targetRef }),
  })
  const data = unwrap<{ connection: FileConnection }>(await response.json())
  return data.connection
}

export async function deleteConnection(id: number): Promise<void> {
  await apiCall(`/workspace/connections/${id}`, { method: 'DELETE' })
}

// Agent-scoped helpers — what the agent detail KB card actually uses.

export async function listAgentConnections(agentSlug: string): Promise<FileConnection[]> {
  return listConnectionsForTarget('agent', agentSlug)
}

export async function connectFileToAgent(
  filePath: string,
  agentSlug: string,
): Promise<FileConnection> {
  const connection = await createConnection(filePath, 'agent', agentSlug)
  toast.success('Knowledge source connected', {
    description: 'Your agent can now reference this file.',
  })
  return connection
}

export async function disconnectFileFromAgent(connectionId: number): Promise<void> {
  await deleteConnection(connectionId)
  toast.success('Knowledge source removed', {
    description: 'This file is no longer connected to the agent.',
  })
}
