import { describe, it, expect } from 'vitest'
import { chatReducer, getExecState } from '../chatReducer'
import type { ChatState } from '../types'
import { EMPTY_EXEC_STATE } from '../types'

function makeState(overrides: Partial<ChatState> = {}): ChatState {
  return {
    currentAgent: null,
    messages: [],
    conversationId: 'conv-1',
    conversations: [],
    hasMoreConversations: false,
    error: null,
    execByConversation: {},
    ...overrides,
  }
}

describe('chatReducer', () => {
  describe('EXECUTION_FINISHED', () => {
    it('clears backgroundTasks', () => {
      const state = makeState({
        backgroundTasks: [
          { id: 'task-1', name: 'Test', status: 'running', startedAt: Date.now() },
        ],
      })
      const result = chatReducer(state, {
        type: 'EXECUTION_FINISHED',
        convId: 'conv-1',
        result: 'success',
      })
      expect(result.backgroundTasks).toEqual([])
    })

    it('clears loading and streaming state', () => {
      const state = makeState({
        execByConversation: {
          'conv-1': { ...EMPTY_EXEC_STATE, isLoading: true },
        },
      })
      const result = chatReducer(state, {
        type: 'EXECUTION_FINISHED',
        convId: 'conv-1',
        result: 'success',
      })
      const exec = getExecState(result, 'conv-1')
      expect(exec.isLoading).toBe(false)
      expect(exec.streamingTurn).toBeNull()
      expect(exec.executionState).toBeNull()
    })

    it('clears pending queue on cancellation', () => {
      const state = makeState({
        execByConversation: {
          'conv-1': { ...EMPTY_EXEC_STATE, pendingMessages: ['msg1', 'msg2'] },
        },
      })
      const result = chatReducer(state, {
        type: 'EXECUTION_FINISHED',
        convId: 'conv-1',
        result: 'cancelled',
      })
      const exec = getExecState(result, 'conv-1')
      expect(exec.pendingMessages).toEqual([])
    })

    it('sets error message on error result', () => {
      const state = makeState()
      const result = chatReducer(state, {
        type: 'EXECUTION_FINISHED',
        convId: 'conv-1',
        result: 'error',
        errorMessage: 'Something failed',
      })
      expect(result.error).toBe('Something failed')
    })
  })

  describe('SEND_MESSAGE_START', () => {
    it('clears backgroundTasks for fresh execution', () => {
      const state = makeState({
        backgroundTasks: [
          { id: 'old-task', name: 'Stale', status: 'completed', startedAt: Date.now() },
        ],
      })
      const result = chatReducer(state, {
        type: 'SEND_MESSAGE_START',
        convId: 'conv-1',
        userMessage: { id: 'msg-1', role: 'user', content: 'hello', timestamp: Date.now() },
      })
      expect(result.backgroundTasks).toEqual([])
    })

    it('sets loading state for the conversation', () => {
      const state = makeState()
      const result = chatReducer(state, {
        type: 'SEND_MESSAGE_START',
        convId: 'conv-1',
        userMessage: { id: 'msg-1', role: 'user', content: 'test', timestamp: Date.now() },
      })
      const exec = getExecState(result, 'conv-1')
      expect(exec.isLoading).toBe(true)
    })
  })

  describe('ADD_BACKGROUND_TASK', () => {
    it('adds a task to backgroundTasks', () => {
      const state = makeState()
      const result = chatReducer(state, {
        type: 'ADD_BACKGROUND_TASK',
        task: { id: 'task-1', name: 'Analyzing', status: 'running', startedAt: Date.now() },
      })
      expect(result.backgroundTasks).toHaveLength(1)
      expect(result.backgroundTasks![0].name).toBe('Analyzing')
    })
  })

  describe('UPDATE_BACKGROUND_TASK', () => {
    it('updates task status by taskId', () => {
      const state = makeState({
        backgroundTasks: [
          { id: 'task-1', name: 'Working', status: 'running', startedAt: Date.now() },
        ],
      })
      const result = chatReducer(state, {
        type: 'UPDATE_BACKGROUND_TASK',
        taskId: 'task-1',
        status: 'completed',
      })
      expect(result.backgroundTasks![0].status).toBe('completed')
    })

    it('updates task status by taskName matching', () => {
      const state = makeState({
        backgroundTasks: [
          { id: 'subagent-123', name: 'code-reviewer analysis', status: 'running', startedAt: Date.now() },
        ],
      })
      const result = chatReducer(state, {
        type: 'UPDATE_BACKGROUND_TASK',
        taskName: 'code-reviewer',
        status: 'completed',
      })
      expect(result.backgroundTasks![0].status).toBe('completed')
    })
  })
})
