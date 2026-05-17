/**
 * Per-conversation tracking refs and constants for useChatExecution.
 * Extracted to keep useChatExecution.ts under the 400-line limit.
 */
import type { StreamingAssistantTurn } from './streaming-turn.types'

export interface PerConvRefs {
  rawText: string
  respondingAgent: { agentSlug?: string; agentName?: string }
  toolStartTimes: Map<string, number>
  toolMeta: Map<string, { toolName: string; filePath?: string }>
  pendingStatusLabels: string[]
  doneReceived: boolean
  tokenCount: number
  modelContextSize: number
  pendingTokenText: string
  pendingTokenFrame: number | null
  // Authoritative streaming turn so tool/progress events can update it without
  // a round-trip through React state (state would lag at high event frequency).
  turn: StreamingAssistantTurn | null
}

export function emptyRefs(): PerConvRefs {
  return {
    rawText: '',
    respondingAgent: {},
    toolStartTimes: new Map(),
    toolMeta: new Map(),
    pendingStatusLabels: [],
    doneReceived: false,
    tokenCount: 0,
    modelContextSize: 200000,
    pendingTokenText: '',
    pendingTokenFrame: null,
    turn: null,
  }
}

export const MODEL_CONTEXT: Record<string, number> = {
  'claude-opus-4': 200000,
  'claude-sonnet-4': 200000,
  'claude-3.5-sonnet': 200000,
  'claude-3-opus': 200000,
  'claude-3-haiku': 200000,
  'gpt-4o': 128000,
  'gpt-4-turbo': 128000,
  'gpt-4': 8192,
  'gemini-pro': 1000000,
  'gemini-1.5-pro': 2000000,
  'deepseek-chat': 128000,
}

export const INFRA_NOISE = new Set(['sandbox', 'executing', 'provisioning', 'connecting'])
export const VIEWABLE_EXTS = new Set([
  '.md', '.mdx', '.html', '.htm', '.svg', '.json', '.txt', '.css', '.scss', '.csv',
  '.ts', '.tsx', '.js', '.jsx', '.py', '.rb', '.go', '.rs', '.java',
  '.yaml', '.yml', '.sql', '.sh', '.xml',
])
export const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'write_file', 'edit_file'])

export function modelContextSize(model?: string): number {
  if (!model) return 200000
  const lower = model.toLowerCase()
  const key = Object.keys(MODEL_CONTEXT).find(k => lower.includes(k))
  return key ? MODEL_CONTEXT[key] : 200000
}

export function fileExtension(filePath: string): string {
  if (!filePath.includes('.')) return ''
  return '.' + filePath.split('.').pop()!.toLowerCase()
}
