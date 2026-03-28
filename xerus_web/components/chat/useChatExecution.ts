/**
 * useChatExecution - Bridges useExecutionStream with ChatContainer state.
 *
 * Handles token accumulation, progress tracking, tool call/result updates,
 * and final message assembly when the execution stream completes.
 *
 * v5: Removed deprecated parallel state (streamingMessage, activeTools,
 * streamingThinking). All streaming state lives in streamingTurn.parts.
 */
import { useCallback, useRef } from 'react'
import { useExecutionStream } from '@/hooks/useExecutionStream'
import type {
  StreamEvent,
  TokenEventContent,
  DoneEventContent,
  ToolCallEventContent,
  ToolResultEventContent,
  ProgressEventContent,
  MetaEventContent,
  ReasoningEventContent,
  SubagentStartEventContent,
  SubagentStopEventContent,
  DelegationEventContent,
  NotificationEventContent,
  ToolAuthRequiredEventContent,
  GuidanceEventContent,
  StopEventContent,
} from '@/hooks/useExecutionStream'
import type { ChatState } from './types'
import type { ChatMessageExtended } from './chat-message.types'
import { resolveToolIcon } from './tool-icon.utils'
import {
  createStreamingTurn,
  appendToken,
  appendReasoning,
  startToolCall,
  completeToolCall,
  addStatus,
  commitTurn,
} from './streaming-turn-reducer'
import { extractTextFromParts } from './streaming-turn.utils'
import { toast } from '@/lib/toast'

type SetState = React.Dispatch<React.SetStateAction<ChatState>>

interface UseChatExecutionOptions {
  setState: SetState
}

export function useChatExecution({ setState }: UseChatExecutionOptions) {
  // Accumulate raw text for onDone fallback (if finalResponse is absent)
  const rawTextRef = useRef('')
  const respondingAgentRef = useRef<{ agentSlug?: string; agentName?: string }>({})
  // Track tool start times for duration computation
  const toolStartTimesRef = useRef<Map<string, number>>(new Map())
  // Buffer status labels that arrive before streamingTurn is created (e.g., plan mode, skills)
  const pendingStatusLabelsRef = useRef<string[]>([])
  // Debounce disconnect reset to allow EventSource auto-reconnect
  const disconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Prevent duplicate onDone processing from SSE reconnect replays
  const doneReceivedRef = useRef(false)

  const resetStreamContent = useCallback(() => {
    rawTextRef.current = ''
    respondingAgentRef.current = {}
    toolStartTimesRef.current.clear()
    pendingStatusLabelsRef.current = []
    doneReceivedRef.current = false
    if (disconnectTimerRef.current) {
      clearTimeout(disconnectTimerRef.current)
      disconnectTimerRef.current = null
    }
  }, [])

  const stream = useExecutionStream({
    onToken: useCallback((event: StreamEvent<'token'>) => {
      const content = event.content as TokenEventContent
      rawTextRef.current += content.text
      setState(prev => {
        const turn = prev.streamingTurn
        if (!turn) return prev
        return { ...prev, streamingTurn: appendToken(turn, content.text) }
      })
    }, [setState]),
    onProgress: useCallback((event: StreamEvent<'progress'>) => {
      const content = event.content as ProgressEventContent
      setState(prev => {
        let streamingTurn = prev.streamingTurn
        if (streamingTurn) {
          streamingTurn = addStatus(streamingTurn, content.phase)
        } else {
          // Buffer status labels until streamingTurn is created by onMeta
          pendingStatusLabelsRef.current.push(content.phase)
        }
        return {
          ...prev,
          streamingTurn,
          executionState: {
            mode: prev.executionState?.mode ?? 'simple',
            currentNode: content.phase,
            steps: [
              ...(prev.executionState?.steps ?? []).map(s =>
                s.status === 'active' ? { ...s, status: 'completed' as const, endTime: Date.now() } : s
              ),
              {
                id: `step-${Date.now()}`,
                name: content.phase,
                status: 'active' as const,
                startTime: Date.now(),
              },
            ],
            completedSteps: (prev.executionState?.completedSteps ?? 0) + 1,
          },
        }
      })
    }, [setState]),
    onToolCall: useCallback((event: StreamEvent<'tool_call'>) => {
      const content = event.content as ToolCallEventContent
      toolStartTimesRef.current.set(content.callId, Date.now())
      setState(prev => {
        const turn = prev.streamingTurn
        return {
          ...prev,
          streamingTurn: turn
            ? startToolCall(turn, content.callId, content.toolName, resolveToolIcon(content.toolName), content.arguments)
            : turn,
        }
      })
    }, [setState]),
    onToolResult: useCallback((event: StreamEvent<'tool_result'>) => {
      const content = event.content as ToolResultEventContent
      const now = Date.now()
      const startTime = toolStartTimesRef.current.get(content.callId)
      const durationMs = startTime ? now - startTime : undefined
      toolStartTimesRef.current.delete(content.callId)
      setState(prev => {
        const turn = prev.streamingTurn
        return {
          ...prev,
          streamingTurn: turn
            ? completeToolCall(turn, content.callId, content.result, content.success, durationMs)
            : turn,
        }
      })
    }, [setState]),
    onMeta: useCallback((event: StreamEvent<'meta'>) => {
      const content = event.content as MetaEventContent & { conversationId?: string }
      if (content.agentSlug || content.agentName) {
        respondingAgentRef.current = {
          agentSlug: content.agentSlug ?? respondingAgentRef.current.agentSlug,
          agentName: content.agentName ?? respondingAgentRef.current.agentName,
        }
      }
      setState(prev => {
        const updates: Partial<ChatState> = {}
        if (content.agentName) {
          updates.executionState = {
            mode: 'simple',
            steps: [],
            completedSteps: 0,
            currentNode: `Running ${content.agentName}`,
          }
          let turn = createStreamingTurn(
            content.agentSlug ?? respondingAgentRef.current.agentSlug,
            content.agentName ?? respondingAgentRef.current.agentName,
          )
          // Flush any status labels buffered before the turn was created (plan mode, skills)
          for (const label of pendingStatusLabelsRef.current) {
            turn = addStatus(turn, label)
          }
          pendingStatusLabelsRef.current = []
          updates.streamingTurn = turn
        }
        if (content.conversationId && !prev.conversationId) {
          updates.conversationId = content.conversationId
        }
        return { ...prev, ...updates }
      })
    }, [setState]),
    onReasoning: useCallback((event: StreamEvent<'reasoning'>) => {
      const content = event.content as ReasoningEventContent
      setState(prev => {
        const turn = prev.streamingTurn
        return {
          ...prev,
          streamingTurn: turn ? appendReasoning(turn, content.thought + '\n') : turn,
        }
      })
    }, [setState]),
    onSubagentStart: useCallback((event: StreamEvent<'subagent_start'>) => {
      const content = event.content as SubagentStartEventContent
      if (content) {
        setState(prev => {
          // Add to executionState for progress tracking
          const executionState = prev.executionState ? {
            ...prev.executionState,
            steps: [
              ...(prev.executionState.steps ?? []),
              {
                id: `subagent-${Date.now()}`,
                name: `Spawning ${content.subagentType}`,
                status: 'active' as const,
                startTime: Date.now(),
              },
            ],
          } : prev.executionState

          // Also add to streamingTurn as a status part so it's visible during streaming
          const streamingTurn = prev.streamingTurn
            ? addStatus(prev.streamingTurn, `${content.subagentType}: ${content.taskDescription || 'working...'}`)
            : prev.streamingTurn

          return { ...prev, executionState, streamingTurn }
        })
      }
    }, [setState]),
    onSubagentStop: useCallback((event: StreamEvent<'subagent_stop'>) => {
      const content = event.content as SubagentStopEventContent
      if (content) {
        setState(prev => {
          const executionState = prev.executionState ? {
            ...prev.executionState,
            steps: (prev.executionState.steps ?? []).map(s =>
              s.name?.includes(content.subagentType)
                ? {
                    ...s,
                    name: content.success ? s.name : `${s.name} (failed)`,
                    status: 'completed' as const,
                    endTime: Date.now(),
                  }
                : s
            ),
            completedSteps: (prev.executionState.completedSteps ?? 0) + 1,
          } : prev.executionState

          const label = content.success
            ? `${content.subagentType} completed`
            : `${content.subagentType} failed${content.error ? `: ${content.error}` : ''}`
          const streamingTurn = prev.streamingTurn
            ? addStatus(prev.streamingTurn, label)
            : prev.streamingTurn

          return { ...prev, executionState, streamingTurn }
        })
      }
    }, [setState]),
    onDelegation: useCallback((event: StreamEvent<'delegation'>) => {
      const content = event.content as DelegationEventContent
      if (content) {
        setState(prev => ({
          ...prev,
          executionState: prev.executionState ? {
            ...prev.executionState,
            currentNode: `Delegating to ${content.toAgent}`,
          } : prev.executionState,
        }))
      }
    }, [setState]),
    onNotification: useCallback((event: StreamEvent<'notification'>) => {
      const content = event.content as NotificationEventContent
      if (content) {
        setState(prev => ({
          ...prev,
          executionState: {
            ...prev.executionState,
            mode: prev.executionState?.mode ?? 'simple',
            steps: [...(prev.executionState?.steps ?? []), {
              id: `notification-${Date.now()}`,
              name: `Notification: ${content.message}`,
              status: 'completed' as const,
              startTime: Date.now(),
              endTime: Date.now(),
            }],
          },
        }))
      }
    }, [setState]),
    onToolAuthRequired: useCallback((event: StreamEvent<'tool_auth_required'>) => {
      const content = event.content as ToolAuthRequiredEventContent
      if (content) {
        setState(prev => ({
          ...prev,
          pendingToolAuth: { app_slug: content.app_slug, agent_slug: content.agent_slug },
        }))
      }
    }, [setState]),
    onGuidance: useCallback((event: StreamEvent<'guidance'>) => {
      const content = event.content as GuidanceEventContent
      if (content) {
        setState(prev => ({
          ...prev,
          pendingGuidance: {
            question: content.question,
            options: content.options,
            timeout_seconds: content.timeout_seconds,
            pause_id: content.pause_id,
            scenario: content.scenario,
            tool_name: content.tool_name,
            agent_slug: content.agent_slug,
            requires_auth: content.requires_auth,
            execution_id: content.execution_id || event.execution_id,
            ui_hint: content.ui_hint,
            browser_url: content.browser_url,
            preview_url: content.preview_url,
            artifact_path: content.artifact_path,
          },
        }))
      }
    }, [setState]),
    onDone: useCallback((event: StreamEvent<'done'>) => {
      if (doneReceivedRef.current) return
      doneReceivedRef.current = true
      const content = event.content as DoneEventContent
      const finalText = content.finalResponse ?? rawTextRef.current

      // Clear refs immediately after capturing finalText to prevent stale late-arriving tokens
      rawTextRef.current = ''
      respondingAgentRef.current = {}
      toolStartTimesRef.current.clear()
      pendingStatusLabelsRef.current = []

      setState(prev => {
        const turn = prev.streamingTurn
        const metadata = {
          executionId: event.execution_id,
          tokenCount: content.summary.totalTokens,
          processingTime: content.summary.durationMs,
        }

        const committedTurn = turn ? commitTurn(turn, finalText, metadata) : null

        const assistantMessage: ChatMessageExtended = {
          id: committedTurn?.id ?? `msg_${Date.now()}_assistant`,
          role: 'assistant',
          content: committedTurn ? extractTextFromParts(committedTurn.parts) : finalText,
          agentSlug: prev.streamingTurn?.agentSlug,
          agentName: prev.streamingTurn?.agentName,
          timestamp: committedTurn?.timestamp ?? Date.now(),
          parts: committedTurn?.parts,
          metadata,
        }

        const updates: Partial<ChatState> = {
          messages: [...prev.messages, assistantMessage],
          isLoading: false,
          executionState: null,
          streamingTurn: null,
          pendingToolAuth: null,
          pendingGuidance: null,
        }
        if (content.conversationId && !prev.conversationId) {
          updates.conversationId = content.conversationId
        }
        return { ...prev, ...updates }
      })
    }, [setState]),
    onStop: useCallback((event: StreamEvent<'stop'>) => {
      const content = event.content as StopEventContent
      const finalText = rawTextRef.current || undefined

      rawTextRef.current = ''
      respondingAgentRef.current = {}
      toolStartTimesRef.current.clear()
      pendingStatusLabelsRef.current = []

      setState(prev => {
        const turn = prev.streamingTurn
        const committedTurn = turn ? commitTurn(turn, finalText) : null
        const updates: Partial<ChatState> = {
          isLoading: false,
          executionState: null,
          streamingTurn: null,
          pendingToolAuth: null,
          pendingGuidance: null,
        }
        // Preserve any partial response the agent sent before stopping
        if (committedTurn && committedTurn.parts.length > 0) {
          const msg: ChatMessageExtended = {
            id: committedTurn.id,
            role: 'assistant',
            content: extractTextFromParts(committedTurn.parts),
            agentSlug: prev.streamingTurn?.agentSlug,
            agentName: prev.streamingTurn?.agentName,
            timestamp: committedTurn.timestamp,
            parts: committedTurn.parts,
          }
          updates.messages = [...prev.messages, msg]
        }
        if (content.reason !== 'complete') {
          updates.error = content.reason === 'timeout'
            ? 'Agent timed out. Please try again.'
            : content.reason === 'user_cancel'
              ? 'Execution cancelled.'
              : 'Execution stopped unexpectedly.'
        }
        return { ...prev, ...updates }
      })
    }, [setState]),
    onError: useCallback((error: Error) => {
      console.error('Execution stream error:', error)
      rawTextRef.current = ''
      respondingAgentRef.current = {}
      toolStartTimesRef.current.clear()
      pendingStatusLabelsRef.current = []
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error.message,
        executionState: null,
        pendingToolAuth: null,
        pendingGuidance: null,
        streamingTurn: null,
      }))
      toast.error("Something went wrong", { description: 'Please try sending your message again.' })
    }, [setState]),
    onConnectionChange: useCallback((connected: boolean) => {
      if (connected) {
        // Reconnected — cancel any pending disconnect reset
        if (disconnectTimerRef.current) {
          clearTimeout(disconnectTimerRef.current)
          disconnectTimerRef.current = null
        }
        return
      }
      // Delay reset to allow EventSource auto-reconnect (avoids false "Connection lost"
      // on transient network hiccups). If reconnected within 5s, the timer is cancelled above.
      if (!disconnectTimerRef.current) {
        disconnectTimerRef.current = setTimeout(() => {
          disconnectTimerRef.current = null
          rawTextRef.current = ''
          respondingAgentRef.current = {}
          toolStartTimesRef.current.clear()
          pendingStatusLabelsRef.current = []
          setState(prev => {
            if (!prev.isLoading) return prev
            return {
              ...prev,
              isLoading: false,
              error: 'Connection lost. Please resend your message.',
              executionState: null,
              streamingTurn: null,
            }
          })
        }, 5000)
      }
    }, [setState]),
  })

  return {
    ...stream,
    resetStreamContent,
  }
}
