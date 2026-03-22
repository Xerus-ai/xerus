// mapStreamToExecutionEvents Tests
// Verifies that subagent events are correctly mapped to ExecutionEvents.
//
// Bug: RELEVANT_TYPES only included tool_call, tool_result, reasoning.
// subagent_start and subagent_stop were filtered out, making subagent
// execution invisible to the user in the frontend.

import { describe, it, expect } from 'vitest'
import { mapStreamEventsToExecution } from '../mapStreamToExecutionEvents'
import type { StreamEvent } from '@/hooks/useExecutionStream'

function makeEvent(type: string, content: Record<string, unknown> = {}): StreamEvent {
  return {
    type,
    execution_id: 'test-exec-1',
    timestamp: '2026-03-14T10:00:00Z',
    content,
  } as unknown as StreamEvent
}

describe('mapStreamEventsToExecution', () => {
  it('should map standard event types (tool_call, tool_result, reasoning)', () => {
    const events: StreamEvent[] = [
      makeEvent('tool_call', { toolName: 'Read', arguments: { file_path: '/test' } }),
      makeEvent('tool_result', { result: 'file contents' }),
      makeEvent('reasoning', { thought: 'thinking about this...' }),
    ]

    const mapped = mapStreamEventsToExecution(events)

    expect(mapped).toHaveLength(3)
    expect(mapped[0].type).toBe('tool_call')
    expect(mapped[0].tool_name).toBe('Read')
    expect(mapped[1].type).toBe('tool_result')
    expect(mapped[1].output).toBe('file contents')
    expect(mapped[2].type).toBe('thinking')
    expect(mapped[2].content).toBe('thinking about this...')
  })

  it('should map subagent_start events', () => {
    const events: StreamEvent[] = [
      makeEvent('subagent_start', {
        subagentType: 'researcher',
        subagentName: 'Research Agent',
      }),
    ]

    const mapped = mapStreamEventsToExecution(events)

    expect(mapped).toHaveLength(1)
    expect(mapped[0].type).toBe('subagent_start')
    expect(mapped[0].subagent_type).toBe('researcher')
    expect(mapped[0].subagent_name).toBe('Research Agent')
  })

  it('should map subagent_stop events', () => {
    const events: StreamEvent[] = [
      makeEvent('subagent_stop', {
        subagentType: 'writer',
        subagentName: 'Content Writer',
      }),
    ]

    const mapped = mapStreamEventsToExecution(events)

    expect(mapped).toHaveLength(1)
    expect(mapped[0].type).toBe('subagent_stop')
    expect(mapped[0].subagent_type).toBe('writer')
    expect(mapped[0].subagent_name).toBe('Content Writer')
  })

  it('should filter out non-relevant event types', () => {
    const events: StreamEvent[] = [
      makeEvent('token', { text: 'hello' }),
      makeEvent('progress', { phase: 'setup' }),
      makeEvent('meta', { model: 'claude' }),
      makeEvent('tool_call', { toolName: 'Bash' }),
    ]

    const mapped = mapStreamEventsToExecution(events)

    // Only tool_call should pass through
    expect(mapped).toHaveLength(1)
    expect(mapped[0].type).toBe('tool_call')
  })

  it('should handle mixed agent and subagent events in order', () => {
    const events: StreamEvent[] = [
      makeEvent('reasoning', { thought: 'I need to delegate this' }),
      makeEvent('subagent_start', { subagentType: 'researcher', subagentName: 'Research Agent' }),
      makeEvent('tool_call', { toolName: 'Task', arguments: { prompt: 'Research AI trends' } }),
      makeEvent('tool_result', { result: 'Task created' }),
      makeEvent('subagent_stop', { subagentType: 'researcher', subagentName: 'Research Agent' }),
      makeEvent('reasoning', { thought: 'Research complete, summarizing' }),
    ]

    const mapped = mapStreamEventsToExecution(events)

    expect(mapped).toHaveLength(6)
    expect(mapped[0].type).toBe('thinking')
    expect(mapped[1].type).toBe('subagent_start')
    expect(mapped[2].type).toBe('tool_call')
    expect(mapped[3].type).toBe('tool_result')
    expect(mapped[4].type).toBe('subagent_stop')
    expect(mapped[5].type).toBe('thinking')
  })

  it('should handle empty events array', () => {
    const mapped = mapStreamEventsToExecution([])
    expect(mapped).toHaveLength(0)
  })

  it('should generate unique IDs for each mapped event', () => {
    const events: StreamEvent[] = [
      makeEvent('subagent_start', { subagentType: 'a' }),
      makeEvent('subagent_stop', { subagentType: 'a' }),
    ]

    const mapped = mapStreamEventsToExecution(events)

    expect(mapped[0].id).not.toBe(mapped[1].id)
    expect(mapped[0].id).toContain('subagent_start')
    expect(mapped[1].id).toContain('subagent_stop')
  })
})
