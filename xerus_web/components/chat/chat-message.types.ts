import type { Message } from './types'
import type { TurnPart, WrittenFile } from './streaming-turn.types'

// ---------------------------------------------------------------------------
// Tool call types for rich visualization
// ---------------------------------------------------------------------------

export interface ToolCall {
  id: string
  name: string
  icon: 'read' | 'write' | 'search' | 'bash' | 'web' | 'think' | 'agent' | 'skill' | 'task' | 'question'
  target?: string
  detail?: string
  output?: string
  status: 'success' | 'error' | 'running'
  duration_ms: number
}

export interface TodoItem {
  id: string
  label: string
  done: boolean
}

export interface WorkspaceArtifact {
  id: string
  filename: string
  path: string
  lineCount: number
  description: string
  preview?: string
}

export interface ChatMessageExtended extends Message {
  toolCalls?: ToolCall[]
  thinking?: string
  todoProgress?: { done: number; total: number; items?: TodoItem[] }
  planTitle?: string
  artifacts?: WorkspaceArtifact[]
  parts?: TurnPart[]
  writtenFiles?: WrittenFile[]
}

// Re-export session types from the canonical location
export type { SessionStatus, SessionEntry, ProjectGroup } from './types'
