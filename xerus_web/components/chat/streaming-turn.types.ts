// Streaming Turn Types
// Unified model for building assistant messages from SSE events.
// Each TurnPart preserves the order events arrived, enabling
// interleaved rendering of text, reasoning, and tool calls.

export type ToolCallIcon = 'read' | 'write' | 'search' | 'bash' | 'web' | 'think' | 'agent' | 'skill' | 'task' | 'question'

export type TurnPart =
  | { id: string; type: 'text'; text: string }
  | { id: string; type: 'reasoning'; text: string }
  | {
      id: string
      type: 'tool'
      callId: string
      name: string
      state: 'running' | 'done' | 'error'
      icon: ToolCallIcon
      args?: Record<string, unknown>
      result?: unknown
      target?: string
      durationMs?: number
    }
  | { id: string; type: 'status'; label: string }

export interface StreamingAssistantTurn {
  id: string
  role: 'assistant'
  agentSlug?: string
  agentName?: string
  status: 'streaming' | 'completed' | 'error'
  timestamp: number
  parts: TurnPart[]
  metadata?: {
    executionId?: string
    tokenCount?: number
    processingTime?: number
  }
}
