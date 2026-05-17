/**
 * chatReducer — central state machine for chat UI.
 *
 * Replaces ad-hoc setState calls in useChatState/useChatExecution. Per-conversation
 * execution state lives in execByConversation keyed by conversationId so loading
 * indicators, streaming turns, and queued messages don't bleed across conversations.
 */
import type { ChatState, ConversationExecutionState, ExecutionState, ExecutionStep, Message, Conversation, SelectedChannel, Agent } from './types'
import { EMPTY_EXEC_STATE } from './types'
import type { StreamingAssistantTurn } from './streaming-turn.types'
import type { ChatMessageExtended } from './chat-message.types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getExecState(state: ChatState, convId: string | null | undefined): ConversationExecutionState {
  if (!convId) return EMPTY_EXEC_STATE
  return state.execByConversation[convId] ?? EMPTY_EXEC_STATE
}

function patchExec(
  state: ChatState,
  convId: string,
  patch: Partial<ConversationExecutionState>,
): Record<string, ConversationExecutionState> {
  const current = state.execByConversation[convId] ?? EMPTY_EXEC_STATE
  return {
    ...state.execByConversation,
    [convId]: { ...current, ...patch },
  }
}

function updateExec(
  state: ChatState,
  convId: string,
  updater: (prev: ConversationExecutionState) => ConversationExecutionState,
): Record<string, ConversationExecutionState> {
  const current = state.execByConversation[convId] ?? EMPTY_EXEC_STATE
  return {
    ...state.execByConversation,
    [convId]: updater(current),
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type ChatAction =
  // Conversation lifecycle
  | { type: 'SET_CONVERSATION_ID'; convId: string | null }
  | { type: 'SET_CONVERSATIONS'; conversations: Conversation[]; hasMore: boolean }
  | { type: 'APPEND_CONVERSATIONS'; conversations: Conversation[]; hasMore: boolean }
  | { type: 'MERGE_CONVERSATIONS'; conversations: Conversation[] }
  | { type: 'DELETE_CONVERSATION'; convId: string }
  | { type: 'RENAME_CONVERSATION'; convId: string; title: string }
  | { type: 'LOAD_CONVERSATION_DETAIL'; convId: string; messages: ChatMessageExtended[]; agent: Agent | null }
  | { type: 'NEW_CONVERSATION' }
  | { type: 'SELECT_CONVERSATION'; convId: string; agent: Agent | null }

  // Agent / channel
  | { type: 'SET_AGENT'; agent: Agent | null }
  | { type: 'SET_CHANNEL'; channel: SelectedChannel | null }

  // Sending / messages
  | { type: 'SEND_MESSAGE_START'; convId: string; userMessage: Message }
  | { type: 'QUEUE_MESSAGE'; convId: string; content: string }
  | { type: 'CANCEL_QUEUED_MESSAGE'; convId: string; index: number }
  | { type: 'POP_QUEUED_MESSAGE'; convId: string }
  | { type: 'SET_ACTIVE_EXECUTION_ID'; convId: string; executionId: string | null }
  | { type: 'APPEND_ASSISTANT_MESSAGE'; convId: string; message: ChatMessageExtended }

  // Streaming turn lifecycle (per-conversation)
  | { type: 'RESET_STREAM'; convId: string }
  | { type: 'SET_STREAMING_TURN'; convId: string; turn: StreamingAssistantTurn | null }
  | { type: 'SET_EXECUTION_STATE'; convId: string; executionState: ExecutionState | null }
  | { type: 'PUSH_EXECUTION_STEP'; convId: string; step: ExecutionStep; mode?: ExecutionState['mode']; currentNode?: string; agents?: string[]; markPrevCompleted?: boolean }
  | { type: 'COMPLETE_EXECUTION_STEPS'; convId: string; matchName?: string; failed?: boolean }
  | { type: 'SET_TOKEN_USAGE'; convId: string; tokenUsage: { used: number; total: number } | null }
  | { type: 'SET_RESPONDING_AGENT'; convId: string; respondingAgent: { agentSlug?: string; agentName?: string } | null }
  | { type: 'EXECUTION_FINISHED'; convId: string; result: 'success' | 'cancelled' | 'error'; errorMessage?: string }

  // Errors
  | { type: 'SET_ERROR'; error: string | null }

  // Tool auth / guidance
  | { type: 'SET_PENDING_TOOL_AUTH'; pendingToolAuth: ChatState['pendingToolAuth'] }
  | { type: 'SET_PENDING_GUIDANCE'; pendingGuidance: ChatState['pendingGuidance'] }

  // Artifact / preview
  | { type: 'SET_PENDING_ARTIFACT_FILE'; file: ChatState['pendingArtifactFile'] }
  | { type: 'SET_PENDING_PREVIEW'; preview: ChatState['pendingPreview'] }

  // Background tasks
  | { type: 'ADD_BACKGROUND_TASK'; task: NonNullable<ChatState['backgroundTasks']>[number] }
  | { type: 'UPDATE_BACKGROUND_TASK'; taskId?: string; taskName?: string; status: 'running' | 'completed' | 'failed' }

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

export function createInitialState(conversationId: string | null): ChatState {
  return {
    currentAgent: null,
    messages: [],
    conversationId,
    conversations: [],
    hasMoreConversations: false,
    error: null,
    execByConversation: {},
    selectedChannel: null,
  }
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'SET_CONVERSATION_ID':
      return { ...state, conversationId: action.convId }

    case 'SET_CONVERSATIONS':
      return {
        ...state,
        conversations: action.conversations,
        hasMoreConversations: action.hasMore,
      }

    case 'APPEND_CONVERSATIONS': {
      const existing = new Map(state.conversations.map(c => [c.id, c]))
      for (const c of action.conversations) existing.set(c.id, c)
      return {
        ...state,
        conversations: Array.from(existing.values()).sort((a, b) => b.updatedAt - a.updatedAt),
        hasMoreConversations: action.hasMore,
      }
    }

    case 'MERGE_CONVERSATIONS': {
      const existing = new Map(state.conversations.map(c => [c.id, c]))
      for (const c of action.conversations) existing.set(c.id, c)
      return {
        ...state,
        conversations: Array.from(existing.values()).sort((a, b) => b.updatedAt - a.updatedAt),
      }
    }

    case 'DELETE_CONVERSATION': {
      const { [action.convId]: _removed, ...remainingExec } = state.execByConversation
      void _removed
      return {
        ...state,
        conversations: state.conversations.filter(c => c.id !== action.convId),
        conversationId: state.conversationId === action.convId ? null : state.conversationId,
        messages: state.conversationId === action.convId ? [] : state.messages,
        execByConversation: remainingExec,
      }
    }

    case 'RENAME_CONVERSATION': {
      return {
        ...state,
        conversations: state.conversations.map(c =>
          c.id === action.convId ? { ...c, title: action.title } : c
        ),
      }
    }

    case 'LOAD_CONVERSATION_DETAIL': {
      const exec = state.execByConversation[action.convId]
      const isActiveAndBusy = state.conversationId === action.convId && exec?.isLoading
      return {
        ...state,
        conversationId: action.convId,
        messages: isActiveAndBusy ? state.messages : action.messages,
        currentAgent: action.agent ?? state.currentAgent,
      }
    }

    case 'NEW_CONVERSATION':
      return {
        ...state,
        conversationId: null,
        messages: [],
        error: null,
        selectedChannel: null,
      }

    case 'SELECT_CONVERSATION':
      // Per-conversation exec state is preserved (NOT reset). The reducer simply
      // switches which conversation is active; loadConversationDetails will then
      // populate messages from the REST API.
      return {
        ...state,
        conversationId: action.convId,
        currentAgent: action.agent ?? state.currentAgent,
      }

    case 'SET_AGENT':
      return { ...state, currentAgent: action.agent }

    case 'SET_CHANNEL':
      return { ...state, selectedChannel: action.channel }

    case 'SEND_MESSAGE_START':
      return {
        ...state,
        messages: [...state.messages, action.userMessage],
        error: null,
        backgroundTasks: [],
        execByConversation: patchExec(state, action.convId, {
          isLoading: true,
          executionState: null,
          streamingTurn: null,
          lastExecutionResult: null,
        }),
      }

    case 'QUEUE_MESSAGE':
      return {
        ...state,
        execByConversation: updateExec(state, action.convId, prev => ({
          ...prev,
          pendingMessages: [...prev.pendingMessages, action.content],
        })),
      }

    case 'CANCEL_QUEUED_MESSAGE':
      return {
        ...state,
        execByConversation: updateExec(state, action.convId, prev => ({
          ...prev,
          pendingMessages: prev.pendingMessages.filter((_, i) => i !== action.index),
        })),
      }

    case 'POP_QUEUED_MESSAGE':
      return {
        ...state,
        execByConversation: updateExec(state, action.convId, prev => ({
          ...prev,
          pendingMessages: prev.pendingMessages.slice(1),
        })),
      }

    case 'SET_ACTIVE_EXECUTION_ID':
      return {
        ...state,
        execByConversation: patchExec(state, action.convId, {
          activeExecutionId: action.executionId,
        }),
      }

    case 'APPEND_ASSISTANT_MESSAGE':
      // Only append to visible messages if this conversation is currently active.
      // Otherwise the agent's response is preserved on the conversation record
      // and will be loaded via REST when the user navigates back.
      if (state.conversationId === action.convId) {
        return { ...state, messages: [...state.messages, action.message] }
      }
      return state

    case 'RESET_STREAM':
      return {
        ...state,
        execByConversation: patchExec(state, action.convId, {
          streamingTurn: null,
          executionState: null,
        }),
      }

    case 'SET_STREAMING_TURN':
      return {
        ...state,
        execByConversation: patchExec(state, action.convId, {
          streamingTurn: action.turn,
        }),
      }

    case 'SET_EXECUTION_STATE':
      return {
        ...state,
        execByConversation: patchExec(state, action.convId, {
          executionState: action.executionState,
        }),
      }

    case 'PUSH_EXECUTION_STEP':
      return {
        ...state,
        execByConversation: updateExec(state, action.convId, prev => {
          const existingSteps = prev.executionState?.steps ?? []
          const steps = action.markPrevCompleted
            ? existingSteps.map(s =>
                s.status === 'active' ? { ...s, status: 'completed' as const, endTime: Date.now() } : s,
              )
            : existingSteps
          return {
            ...prev,
            executionState: {
              mode: action.mode ?? prev.executionState?.mode ?? 'simple',
              currentNode: action.currentNode ?? prev.executionState?.currentNode,
              agents: action.agents ?? prev.executionState?.agents,
              steps: [...steps, action.step],
              completedSteps: (prev.executionState?.completedSteps ?? 0) + (action.markPrevCompleted ? 1 : 0),
            },
          }
        }),
      }

    case 'COMPLETE_EXECUTION_STEPS':
      return {
        ...state,
        execByConversation: updateExec(state, action.convId, prev => {
          if (!prev.executionState) return prev
          return {
            ...prev,
            executionState: {
              ...prev.executionState,
              steps: prev.executionState.steps.map(s => {
                if (action.matchName && !s.name?.includes(action.matchName)) return s
                if (s.status !== 'active') return s
                return {
                  ...s,
                  name: action.failed ? `${s.name} (failed)` : s.name,
                  status: 'completed',
                  endTime: Date.now(),
                }
              }),
              completedSteps: (prev.executionState.completedSteps ?? 0) + 1,
            },
          }
        }),
      }

    case 'SET_TOKEN_USAGE':
      return {
        ...state,
        execByConversation: patchExec(state, action.convId, {
          tokenUsage: action.tokenUsage,
        }),
      }

    case 'SET_RESPONDING_AGENT':
      return {
        ...state,
        execByConversation: patchExec(state, action.convId, {
          respondingAgent: action.respondingAgent,
        }),
      }

    case 'EXECUTION_FINISHED': {
      const patch: Partial<ConversationExecutionState> = {
        isLoading: false,
        streamingTurn: null,
        executionState: null,
        activeExecutionId: null,
        lastExecutionResult: action.result,
        respondingAgent: null,
      }
      if (action.result === 'cancelled') patch.pendingMessages = []
      return {
        ...state,
        error: action.result === 'error' && action.errorMessage ? action.errorMessage : state.error,
        execByConversation: patchExec(state, action.convId, patch),
        pendingToolAuth: null,
        pendingGuidance: null,
        backgroundTasks: [],
      }
    }

    case 'SET_ERROR':
      return { ...state, error: action.error }

    case 'SET_PENDING_TOOL_AUTH':
      return { ...state, pendingToolAuth: action.pendingToolAuth }

    case 'SET_PENDING_GUIDANCE':
      return { ...state, pendingGuidance: action.pendingGuidance }

    case 'SET_PENDING_ARTIFACT_FILE':
      return { ...state, pendingArtifactFile: action.file }

    case 'SET_PENDING_PREVIEW':
      return { ...state, pendingPreview: action.preview }

    case 'ADD_BACKGROUND_TASK':
      return {
        ...state,
        backgroundTasks: [...(state.backgroundTasks ?? []), action.task],
      }

    case 'UPDATE_BACKGROUND_TASK':
      return {
        ...state,
        backgroundTasks: (state.backgroundTasks ?? []).map(t => {
          if (action.taskId && t.id === action.taskId) return { ...t, status: action.status }
          if (action.taskName && t.status === 'running' && t.name.includes(action.taskName)) return { ...t, status: action.status }
          return t
        }),
      }

    default: {
      const _exhaustive: never = action
      void _exhaustive
      return state
    }
  }
}
