// Streaming Turn Reducer
// Pure functions that build a StreamingAssistantTurn from SSE events.
// Each function returns a new turn (immutable updates for React state).

import type { StreamingAssistantTurn, TurnPart, ToolCallIcon } from './streaming-turn.types'
import { finalizeTurnParts } from './streaming-turn.utils'
import { formatToolDisplay } from './format-tool-display'

function nextPartId(): string {
  return `part-${crypto.randomUUID()}`
}

export function createStreamingTurn(
  agentSlug?: string,
  agentName?: string,
): StreamingAssistantTurn {
  return {
    id: `turn-${Date.now()}`,
    role: 'assistant',
    agentSlug,
    agentName,
    status: 'streaming',
    timestamp: Date.now(),
    parts: [],
  }
}

export function appendToken(
  turn: StreamingAssistantTurn,
  text: string,
): StreamingAssistantTurn {
  const parts = [...turn.parts]
  const last = parts[parts.length - 1]

  if (last && last.type === 'text') {
    // Append to existing text part
    parts[parts.length - 1] = { ...last, text: last.text + text }
  } else {
    // New text part (after a tool/reasoning/status part)
    parts.push({ id: nextPartId(), type: 'text', text })
  }

  return { ...turn, parts }
}

export function appendReasoning(
  turn: StreamingAssistantTurn,
  thought: string,
): StreamingAssistantTurn {
  const parts = [...turn.parts]
  const last = parts[parts.length - 1]

  if (last && last.type === 'reasoning') {
    parts[parts.length - 1] = { ...last, text: last.text + thought }
  } else {
    parts.push({ id: nextPartId(), type: 'reasoning', text: thought })
  }

  return { ...turn, parts }
}

export function startToolCall(
  turn: StreamingAssistantTurn,
  callId: string,
  name: string,
  icon: ToolCallIcon,
  args?: Record<string, unknown>,
): StreamingAssistantTurn {
  const display = formatToolDisplay(name, args)

  // If a part with this callId already exists, update it with richer data
  // (content_block_start sends empty args; assistant message sends complete args)
  const existingIndex = turn.parts.findIndex(
    (p) => p.type === 'tool' && p.callId === callId,
  )

  if (existingIndex >= 0) {
    const existing = turn.parts[existingIndex] as TurnPart & { type: 'tool' }
    const hasNewArgs = args && Object.keys(args).length > 0
    if (!hasNewArgs) return turn

    const updated: TurnPart = {
      ...existing,
      label: display.label ?? existing.label,
      icon: icon ?? existing.icon,
      args: args ?? existing.args,
      target: display.target ?? existing.target,
      detail: display.detail ?? existing.detail,
    }
    const parts = [...turn.parts]
    parts[existingIndex] = updated
    return { ...turn, parts }
  }

  const part: TurnPart = {
    id: nextPartId(),
    type: 'tool',
    callId,
    name,
    label: display.label,
    state: 'running',
    icon,
    args,
    target: display.target,
    detail: display.detail,
  }
  return { ...turn, parts: [...turn.parts, part] }
}

export function completeToolCall(
  turn: StreamingAssistantTurn,
  callId: string,
  result: unknown,
  success: boolean,
  durationMs?: number,
): StreamingAssistantTurn {
  if (process.env.NODE_ENV === 'development') {
    const found = turn.parts.some((p) => p.type === 'tool' && p.callId === callId)
    if (!found) {
      console.warn(
        `[streaming-turn] completeToolCall: no matching callId="${callId}"`,
      )
    }
  }
  const parts = turn.parts.map((part) => {
    if (part.type === 'tool' && part.callId === callId) {
      return {
        ...part,
        state: success ? 'done' as const : 'error' as const,
        result,
        durationMs,
      }
    }
    return part
  })
  return { ...turn, parts }
}

export function updateToolProgress(
  turn: StreamingAssistantTurn,
  toolUseId: string,
  message: string,
): StreamingAssistantTurn {
  const parts = turn.parts.map((part) => {
    if (part.type === 'tool' && part.callId === toolUseId && part.state === 'running') {
      return { ...part, progressMessage: message }
    }
    return part
  })
  return { ...turn, parts }
}

export function enrichToolSummary(
  turn: StreamingAssistantTurn,
  toolUseId: string,
  durationMs: number,
  output: unknown,
  status: 'success' | 'error',
): StreamingAssistantTurn {
  const parts = turn.parts.map((part) => {
    if (part.type === 'tool' && part.callId === toolUseId) {
      return {
        ...part,
        state: status === 'success' ? 'done' as const : 'error' as const,
        result: output ?? part.result,
        durationMs: durationMs ?? part.durationMs,
        progressMessage: undefined,
      }
    }
    return part
  })
  return { ...turn, parts }
}

export function addStatus(
  turn: StreamingAssistantTurn,
  label: string,
): StreamingAssistantTurn {
  return {
    ...turn,
    parts: [...turn.parts, { id: nextPartId(), type: 'status', label }],
  }
}

export function commitTurn(
  turn: StreamingAssistantTurn,
  finalText?: string,
  metadata?: StreamingAssistantTurn['metadata'],
): StreamingAssistantTurn {
  return {
    ...turn,
    status: 'completed',
    parts: finalizeTurnParts(turn.parts, finalText),
    metadata: metadata ?? turn.metadata,
  }
}
