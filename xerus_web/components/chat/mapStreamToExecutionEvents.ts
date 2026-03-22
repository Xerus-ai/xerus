/**
 * Maps useExecutionStream events to the ExecutionEvent format
 * expected by ExecutionDetail / EventCard components.
 */
import type { StreamEvent } from '@/hooks/useExecutionStream'
import type { ExecutionEvent } from '@/components/execution'

const RELEVANT_TYPES = new Set([
  'tool_call', 'tool_result', 'reasoning',
  'subagent_start', 'subagent_stop',
])

type MappedType = 'tool_call' | 'tool_result' | 'thinking' | 'subagent_start' | 'subagent_stop'

const TYPE_MAP: Record<string, MappedType> = {
  tool_call: 'tool_call',
  tool_result: 'tool_result',
  reasoning: 'thinking',
  subagent_start: 'subagent_start',
  subagent_stop: 'subagent_stop',
}

export function mapStreamEventsToExecution(events: StreamEvent[]): ExecutionEvent[] {
  return events
    .filter(e => RELEVANT_TYPES.has(e.type))
    .map(e => {
      const c = e.content as Record<string, unknown> | undefined
      return {
        id: `${e.type}-${e.timestamp ?? Date.now()}`,
        type: TYPE_MAP[e.type] ?? 'thinking',
        timestamp: e.timestamp ?? new Date().toISOString(),
        content: c && 'thought' in c ? String(c.thought) : undefined,
        tool_name: c && 'toolName' in c ? String(c.toolName) : undefined,
        input: c && 'arguments' in c ? (c.arguments as Record<string, unknown>) : undefined,
        output: c && 'result' in c ? String(c.result) : undefined,
        status: 'completed' as const,
        subagent_type: c && 'subagentType' in c ? String(c.subagentType) : undefined,
        subagent_name: c && 'subagentName' in c ? String(c.subagentName) : undefined,
      }
    })
}
