import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createStreamingTurn,
  appendToken,
  appendReasoning,
  startToolCall,
  completeToolCall,
  addStatus,
  commitTurn,
} from '../streaming-turn-reducer'
import type { StreamingAssistantTurn } from '../streaming-turn.types'

// Mock crypto.randomUUID for deterministic IDs
let uuidCounter = 0
beforeEach(() => {
  uuidCounter = 0
  vi.stubGlobal('crypto', {
    randomUUID: () => `uuid-${++uuidCounter}`,
  })
})

function makeTurn(overrides: Partial<StreamingAssistantTurn> = {}): StreamingAssistantTurn {
  return {
    id: 'turn-123',
    role: 'assistant',
    status: 'streaming',
    timestamp: 1000,
    parts: [],
    ...overrides,
  }
}

describe('streaming-turn-reducer', () => {
  describe('createStreamingTurn', () => {
    it('creates a turn with correct initial values', () => {
      const turn = createStreamingTurn('researcher', 'Research Agent')
      expect(turn.role).toBe('assistant')
      expect(turn.agentSlug).toBe('researcher')
      expect(turn.agentName).toBe('Research Agent')
      expect(turn.status).toBe('streaming')
      expect(turn.parts).toEqual([])
      expect(turn.id).toMatch(/^turn-\d+$/)
      expect(turn.timestamp).toBeGreaterThan(0)
    })

    it('creates a turn without agent info', () => {
      const turn = createStreamingTurn()
      expect(turn.agentSlug).toBeUndefined()
      expect(turn.agentName).toBeUndefined()
      expect(turn.status).toBe('streaming')
      expect(turn.parts).toEqual([])
    })
  })

  describe('appendToken', () => {
    it('adds a new text part when no parts exist', () => {
      const turn = makeTurn()
      const result = appendToken(turn, 'Hello')
      expect(result.parts).toHaveLength(1)
      expect(result.parts[0]).toMatchObject({ type: 'text', text: 'Hello' })
    })

    it('appends to existing text part', () => {
      const turn = makeTurn({
        parts: [{ id: 'p1', type: 'text', text: 'Hello' }],
      })
      const result = appendToken(turn, ' world')
      expect(result.parts).toHaveLength(1)
      expect(result.parts[0]).toMatchObject({ type: 'text', text: 'Hello world' })
    })

    it('creates a new text part after a tool part', () => {
      const turn = makeTurn({
        parts: [
          {
            id: 'p1',
            type: 'tool',
            callId: 'call-1',
            name: 'read',
            label: 'Read file',
            state: 'done',
            icon: 'read',
          },
        ],
      })
      const result = appendToken(turn, 'After tool')
      expect(result.parts).toHaveLength(2)
      expect(result.parts[1]).toMatchObject({ type: 'text', text: 'After tool' })
    })

    it('strips complete thinking tags from text', () => {
      const turn = makeTurn()
      const result = appendToken(turn, '<thinking>internal thought</thinking>visible text')
      expect(result.parts).toHaveLength(1)
      expect(result.parts[0]).toMatchObject({ type: 'text', text: 'visible text' })
    })

    it('strips antml:thinking tags', () => {
      const turn = makeTurn()
      const result = appendToken(turn, '<thinking>secret</thinking>public')
      expect(result.parts).toHaveLength(1)
      expect(result.parts[0]).toMatchObject({ type: 'text', text: 'public' })
    })

    it('strips partial (unclosed) thinking tags', () => {
      const turn = makeTurn()
      const result = appendToken(turn, 'visible<thinking>partial thought without close')
      expect(result.parts).toHaveLength(1)
      expect(result.parts[0]).toMatchObject({ type: 'text', text: 'visible' })
    })

    it('strips thinking tags that arrive in a single token', () => {
      let turn = makeTurn()
      turn = appendToken(turn, 'A')
      turn = appendToken(turn, '<thinking>hidden</thinking>B')
      // The thinking block arrives as one chunk and gets fully stripped
      const textParts = turn.parts.filter(p => p.type === 'text')
      expect(textParts).toHaveLength(1)
      expect((textParts[0] as { text: string }).text).toBe('AB')
    })

    it('strips partial thinking tag at end of accumulated text', () => {
      let turn = makeTurn()
      turn = appendToken(turn, 'before')
      turn = appendToken(turn, '<thinking>still thinking...')
      // Partial (unclosed) thinking tag stripped from end
      const textParts = turn.parts.filter(p => p.type === 'text')
      expect(textParts).toHaveLength(1)
      expect((textParts[0] as { text: string }).text).toBe('before')
    })

    it('does not add empty text part if stripped text is empty', () => {
      const turn = makeTurn({
        parts: [
          {
            id: 'p1',
            type: 'tool',
            callId: 'call-1',
            name: 'read',
            label: 'Read file',
            state: 'done',
            icon: 'read',
          },
        ],
      })
      const result = appendToken(turn, '<thinking>only thinking</thinking>')
      // Should not add a new text part since cleaned text is empty
      expect(result.parts).toHaveLength(1)
      expect(result.parts[0].type).toBe('tool')
    })

    it('returns a new object (immutable)', () => {
      const turn = makeTurn()
      const result = appendToken(turn, 'test')
      expect(result).not.toBe(turn)
      expect(result.parts).not.toBe(turn.parts)
    })
  })

  describe('appendReasoning', () => {
    it('adds a new reasoning part when no parts exist', () => {
      const turn = makeTurn()
      const result = appendReasoning(turn, 'Let me think...')
      expect(result.parts).toHaveLength(1)
      expect(result.parts[0]).toMatchObject({ type: 'reasoning', text: 'Let me think...' })
    })

    it('appends to existing reasoning part', () => {
      const turn = makeTurn({
        parts: [{ id: 'p1', type: 'reasoning', text: 'Step 1.' }],
      })
      const result = appendReasoning(turn, ' Step 2.')
      expect(result.parts).toHaveLength(1)
      expect(result.parts[0]).toMatchObject({ type: 'reasoning', text: 'Step 1. Step 2.' })
    })

    it('creates new reasoning part after non-reasoning part', () => {
      const turn = makeTurn({
        parts: [{ id: 'p1', type: 'text', text: 'Hello' }],
      })
      const result = appendReasoning(turn, 'Thinking...')
      expect(result.parts).toHaveLength(2)
      expect(result.parts[1]).toMatchObject({ type: 'reasoning', text: 'Thinking...' })
    })

    it('returns a new object (immutable)', () => {
      const turn = makeTurn()
      const result = appendReasoning(turn, 'test')
      expect(result).not.toBe(turn)
    })
  })

  describe('startToolCall', () => {
    it('adds a tool part in running state', () => {
      const turn = makeTurn()
      const result = startToolCall(turn, 'call-1', 'read', 'read', { file_path: '/src/index.ts' })
      expect(result.parts).toHaveLength(1)
      const part = result.parts[0]
      expect(part.type).toBe('tool')
      if (part.type === 'tool') {
        expect(part.callId).toBe('call-1')
        expect(part.name).toBe('read')
        expect(part.state).toBe('running')
        expect(part.icon).toBe('read')
        expect(part.args).toEqual({ file_path: '/src/index.ts' })
        expect(part.label).toBe('Read file')
        expect(part.target).toBe('index.ts')
      }
    })

    it('updates existing tool part when callId matches and new args provided', () => {
      const turn = makeTurn({
        parts: [
          {
            id: 'p1',
            type: 'tool',
            callId: 'call-1',
            name: 'bash',
            label: 'Executed action',
            state: 'running',
            icon: 'bash',
            args: undefined,
          },
        ],
      })
      const result = startToolCall(turn, 'call-1', 'bash', 'bash', { command: 'npm test' })
      expect(result.parts).toHaveLength(1)
      if (result.parts[0].type === 'tool') {
        expect(result.parts[0].label).toBe('Ran command')
        expect(result.parts[0].args).toEqual({ command: 'npm test' })
      }
    })

    it('does not update existing tool part when no new args', () => {
      const turn = makeTurn({
        parts: [
          {
            id: 'p1',
            type: 'tool',
            callId: 'call-1',
            name: 'read',
            label: 'Read file',
            state: 'running',
            icon: 'read',
            args: { file_path: '/src/index.ts' },
          },
        ],
      })
      const result = startToolCall(turn, 'call-1', 'read', 'read', {})
      // Should return the same turn since no new args
      expect(result).toBe(turn)
    })

    it('adds a new tool part for different callId', () => {
      const turn = makeTurn({
        parts: [
          {
            id: 'p1',
            type: 'tool',
            callId: 'call-1',
            name: 'read',
            label: 'Read file',
            state: 'done',
            icon: 'read',
          },
        ],
      })
      const result = startToolCall(turn, 'call-2', 'write', 'write', { file_path: '/out.ts' })
      expect(result.parts).toHaveLength(2)
      if (result.parts[1].type === 'tool') {
        expect(result.parts[1].callId).toBe('call-2')
        expect(result.parts[1].name).toBe('write')
        expect(result.parts[1].state).toBe('running')
      }
    })
  })

  describe('completeToolCall', () => {
    it('marks a tool part as done with result and duration', () => {
      const turn = makeTurn({
        parts: [
          {
            id: 'p1',
            type: 'tool',
            callId: 'call-1',
            name: 'read',
            label: 'Read file',
            state: 'running',
            icon: 'read',
          },
        ],
      })
      const result = completeToolCall(turn, 'call-1', 'file content here', true, 150)
      expect(result.parts).toHaveLength(1)
      if (result.parts[0].type === 'tool') {
        expect(result.parts[0].state).toBe('done')
        expect(result.parts[0].result).toBe('file content here')
        expect(result.parts[0].durationMs).toBe(150)
      }
    })

    it('marks a tool part as error on failure', () => {
      const turn = makeTurn({
        parts: [
          {
            id: 'p1',
            type: 'tool',
            callId: 'call-1',
            name: 'bash',
            label: 'Executed action',
            state: 'running',
            icon: 'bash',
          },
        ],
      })
      const result = completeToolCall(turn, 'call-1', 'exit code 1', false, 200)
      if (result.parts[0].type === 'tool') {
        expect(result.parts[0].state).toBe('error')
        expect(result.parts[0].result).toBe('exit code 1')
        expect(result.parts[0].durationMs).toBe(200)
      }
    })

    it('does not modify other tool parts', () => {
      const turn = makeTurn({
        parts: [
          {
            id: 'p1',
            type: 'tool',
            callId: 'call-1',
            name: 'read',
            label: 'Read',
            state: 'done',
            icon: 'read',
          },
          {
            id: 'p2',
            type: 'tool',
            callId: 'call-2',
            name: 'write',
            label: 'Write',
            state: 'running',
            icon: 'write',
          },
        ],
      })
      const result = completeToolCall(turn, 'call-2', 'written', true, 50)
      if (result.parts[0].type === 'tool') {
        expect(result.parts[0].state).toBe('done')
        expect(result.parts[0].callId).toBe('call-1')
      }
      if (result.parts[1].type === 'tool') {
        expect(result.parts[1].state).toBe('done')
        expect(result.parts[1].result).toBe('written')
      }
    })

    it('handles missing callId gracefully (no crash)', () => {
      const turn = makeTurn({
        parts: [
          {
            id: 'p1',
            type: 'tool',
            callId: 'call-1',
            name: 'read',
            label: 'Read',
            state: 'running',
            icon: 'read',
          },
        ],
      })
      // Should not throw when callId doesn't match
      const result = completeToolCall(turn, 'nonexistent', 'result', true, 100)
      // Original part should remain unchanged
      if (result.parts[0].type === 'tool') {
        expect(result.parts[0].state).toBe('running')
      }
    })
  })

  describe('addStatus', () => {
    it('appends a status part', () => {
      const turn = makeTurn()
      const result = addStatus(turn, 'Processing...')
      expect(result.parts).toHaveLength(1)
      expect(result.parts[0]).toMatchObject({ type: 'status', label: 'Processing...' })
    })

    it('adds status after existing parts', () => {
      const turn = makeTurn({
        parts: [{ id: 'p1', type: 'text', text: 'Hello' }],
      })
      const result = addStatus(turn, 'Thinking...')
      expect(result.parts).toHaveLength(2)
      expect(result.parts[0].type).toBe('text')
      expect(result.parts[1]).toMatchObject({ type: 'status', label: 'Thinking...' })
    })

    it('generates unique ids for each status part', () => {
      let turn = makeTurn()
      turn = addStatus(turn, 'Step 1')
      turn = addStatus(turn, 'Step 2')
      expect(turn.parts[0].id).not.toBe(turn.parts[1].id)
    })
  })

  describe('commitTurn', () => {
    it('sets status to completed', () => {
      const turn = makeTurn({ status: 'streaming' })
      const result = commitTurn(turn)
      expect(result.status).toBe('completed')
    })

    it('finalizes parts via finalizeTurnParts', () => {
      const turn = makeTurn({
        parts: [
          { id: 'p1', type: 'text', text: 'Hello world' },
          {
            id: 'p2',
            type: 'tool',
            callId: 'call-1',
            name: 'read',
            label: 'Read',
            state: 'running',
            icon: 'read',
          },
        ],
      })
      const result = commitTurn(turn)
      expect(result.status).toBe('completed')
      // finalizeTurnParts should mark running tools as done
      const toolPart = result.parts.find(p => p.type === 'tool')
      expect(toolPart).toBeDefined()
      if (toolPart && toolPart.type === 'tool') {
        expect(toolPart.state).toBe('done')
      }
    })

    it('uses finalText when provided', () => {
      const turn = makeTurn({
        parts: [{ id: 'p1', type: 'text', text: 'streamed partial' }],
      })
      const result = commitTurn(turn, 'Final complete text')
      const textParts = result.parts.filter(p => p.type === 'text')
      expect(textParts).toHaveLength(1)
      expect((textParts[0] as { text: string }).text).toBe('Final complete text')
    })

    it('preserves metadata when provided', () => {
      const turn = makeTurn()
      const meta = { executionId: 'exec-1', tokenCount: 500, processingTime: 2000 }
      const result = commitTurn(turn, undefined, meta)
      expect(result.metadata).toEqual(meta)
    })

    it('keeps existing metadata when no new metadata provided', () => {
      const turn = makeTurn({
        metadata: { executionId: 'old-exec' },
      } as Partial<StreamingAssistantTurn>)
      const result = commitTurn(turn)
      expect(result.metadata).toEqual({ executionId: 'old-exec' })
    })
  })
})
