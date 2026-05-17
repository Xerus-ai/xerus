/**
 * useChatExecution — bridges useExecutionStream events to the chat reducer.
 *
 * Per-conversation scoping: every handler reads getConvId so events from a
 * previous send never leak into a different conversation when the user has
 * switched away mid-stream.
 *
 * Token batching: high-frequency token events accumulate per-conv text and
 * flush via requestAnimationFrame so the reducer dispatches at most once/frame.
 */
import { useCallback, useRef, useEffect, useMemo } from 'react'
import { useExecutionStream } from '@/hooks/useExecutionStream'
import type { StreamEvent, DoneEventContent, StopEventContent } from '@/hooks/useExecutionStream'
import type { ChatMessageExtended } from './chat-message.types'
import { commitTurn, appendToken } from './streaming-turn-reducer'
import { extractTextFromParts } from './streaming-turn.utils'
import { toast } from '@/lib/toast'
import type { ChatAction } from './chatReducer'
import { type PerConvRefs, emptyRefs } from './useChatExecution.helpers'
import {
  type HandlerCtx,
  makeOnToken, makeOnProgress, makeOnToolCall, makeOnToolResult, makeOnMeta,
  makeOnReasoning, makeOnSubagentStart, makeOnSubagentStop, makeOnDelegation,
  makeOnNotification, makeOnAgentMessage,
} from './useChatExecution.handlers'
import {
  makeOnToolAuthRequired, makeOnGuidance, makeOnPreview,
  makeOnCreditWarning, makeOnInsufficientCredits, makeOnProviderUnavailable,
  makeOnTaskStarted, makeOnTaskUpdated, makeOnTaskProgress, makeOnTaskNotification,
  makeOnToolProgress, makeOnToolUseSummary,
} from './useChatExecution.task-handlers'

type Dispatch = React.Dispatch<ChatAction>

interface UseChatExecutionOptions {
  dispatch: Dispatch
}

export function useChatExecution({ dispatch }: UseChatExecutionOptions) {
  const dispatchRef = useRef(dispatch)
  dispatchRef.current = dispatch

  const refsByConv = useRef<Map<string, PerConvRefs>>(new Map())
  const getRefs = useCallback((convId: string): PerConvRefs => {
    let r = refsByConv.current.get(convId)
    if (!r) { r = emptyRefs(); refsByConv.current.set(convId, r) }
    return r
  }, [])

  const disconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const getConvIdRef = useRef<() => string | null>(() => null)

  const flushTokens = useCallback((convId: string) => {
    const refs = getRefs(convId)
    refs.pendingTokenFrame = null
    if (!refs.turn || !refs.pendingTokenText) return
    refs.turn = appendToken(refs.turn, refs.pendingTokenText)
    refs.pendingTokenText = ''
    dispatchRef.current({ type: 'SET_STREAMING_TURN', convId, turn: refs.turn })
    dispatchRef.current({
      type: 'SET_TOKEN_USAGE',
      convId,
      tokenUsage: { used: refs.tokenCount, total: refs.modelContextSize },
    })
  }, [getRefs])

  const resetStreamContent = useCallback((convId: string, agentHint?: { agentSlug?: string; agentName?: string }) => {
    const refs = getRefs(convId)
    if (refs.pendingTokenFrame !== null) cancelAnimationFrame(refs.pendingTokenFrame)
    const fresh = emptyRefs()
    if (agentHint) fresh.respondingAgent = agentHint
    refsByConv.current.set(convId, fresh)
    if (disconnectTimerRef.current) {
      clearTimeout(disconnectTimerRef.current)
      disconnectTimerRef.current = null
    }
  }, [getRefs])

  // Build the handler context once. dispatchRef and getConvIdRef carry live values.
  const ctx: HandlerCtx = useMemo(() => ({
    getRefs,
    getConvId: () => getConvIdRef.current(),
    dispatch: (action) => dispatchRef.current(action),
    scheduleTokenFlush: flushTokens,
  }), [getRefs, flushTokens])

  // Drain any pending tokens before committing/finalizing the turn.
  const drainTokens = useCallback((refs: PerConvRefs) => {
    if (refs.pendingTokenFrame !== null) {
      cancelAnimationFrame(refs.pendingTokenFrame)
      refs.pendingTokenFrame = null
      if (refs.turn && refs.pendingTokenText) {
        refs.turn = appendToken(refs.turn, refs.pendingTokenText)
        refs.pendingTokenText = ''
      }
    }
  }, [])

  // ---- Terminal handlers (kept here because they coordinate finalization) ----

  const onDone = useCallback((event: StreamEvent<'done'>) => {
    const convId = getConvIdRef.current()
    if (!convId) return
    const refs = getRefs(convId)
    if (refs.doneReceived) return
    refs.doneReceived = true
    drainTokens(refs)

    const content = event.content as DoneEventContent
    const isError = event.success === false || !!content.error

    let finalText = content.finalResponse ?? refs.rawText
    if (finalText) {
      finalText = finalText.replace(/\{"type"\s*:\s*"error"[^}]*\{[^}]*\}\s*\}/g, '').trim()
    }
    if (isError) {
      toast.error('Response interrupted', {
        description: content.error?.message ?? 'The AI provider encountered an error',
      })
    }

    const metadata = {
      executionId: event.execution_id,
      tokenCount: content.summary?.totalTokens ?? 0,
      processingTime: content.summary?.durationMs ?? 0,
    }
    const committedTurn = refs.turn ? commitTurn(refs.turn, finalText, metadata) : null
    const message: ChatMessageExtended = {
      id: committedTurn?.id ?? `msg_${Date.now()}_assistant`,
      role: 'assistant',
      content: committedTurn ? extractTextFromParts(committedTurn.parts) : finalText,
      agentSlug: refs.respondingAgent.agentSlug,
      agentName: refs.respondingAgent.agentName,
      timestamp: committedTurn?.timestamp ?? Date.now(),
      parts: committedTurn?.parts,
      writtenFiles: committedTurn?.writtenFiles,
      metadata,
    }

    dispatchRef.current({ type: 'APPEND_ASSISTANT_MESSAGE', convId, message })
    dispatchRef.current({
      type: 'EXECUTION_FINISHED',
      convId,
      result: isError ? 'error' : 'success',
      errorMessage: isError ? content.error?.message : undefined,
    })
    if (content.conversationId && convId !== content.conversationId) {
      dispatchRef.current({ type: 'SET_CONVERSATION_ID', convId: content.conversationId })
    }
    refsByConv.current.delete(convId)
  }, [drainTokens, getRefs])

  const onStop = useCallback((event: StreamEvent<'stop'>) => {
    const convId = getConvIdRef.current()
    if (!convId) return
    const refs = getRefs(convId)
    drainTokens(refs)

    const content = event.content as StopEventContent
    const finalText = refs.rawText || undefined
    const committedTurn = refs.turn ? commitTurn(refs.turn, finalText) : null
    if (committedTurn && committedTurn.parts.length > 0) {
      dispatchRef.current({
        type: 'APPEND_ASSISTANT_MESSAGE',
        convId,
        message: {
          id: committedTurn.id,
          role: 'assistant',
          content: extractTextFromParts(committedTurn.parts),
          agentSlug: refs.respondingAgent.agentSlug,
          agentName: refs.respondingAgent.agentName,
          timestamp: committedTurn.timestamp,
          parts: committedTurn.parts,
          writtenFiles: committedTurn.writtenFiles,
        },
      })
    }

    const result: 'success' | 'cancelled' | 'error' =
      content.reason === 'complete' ? 'success'
        : content.reason === 'user_cancel' ? 'cancelled'
          : 'error'
    const errorMessage = content.reason === 'timeout' ? 'Agent timed out. Please try again.'
      : content.reason === 'user_cancel' ? 'Execution cancelled.'
        : content.reason === 'error' ? 'Execution stopped unexpectedly.'
          : undefined

    dispatchRef.current({ type: 'EXECUTION_FINISHED', convId, result, errorMessage })
    refsByConv.current.delete(convId)
  }, [drainTokens, getRefs])

  const onError = useCallback((error: Error) => {
    console.error('Execution stream error:', error)
    const convId = getConvIdRef.current()
    toast.error("Something went wrong", { description: 'Please try sending your message again.' })
    if (!convId) return
    refsByConv.current.delete(convId)
    dispatchRef.current({ type: 'EXECUTION_FINISHED', convId, result: 'error', errorMessage: error.message })
  }, [])

  const onConnectionChange = useCallback((connected: boolean) => {
    if (connected) {
      if (disconnectTimerRef.current) {
        clearTimeout(disconnectTimerRef.current)
        disconnectTimerRef.current = null
      }
      return
    }
    if (disconnectTimerRef.current) return
    disconnectTimerRef.current = setTimeout(() => {
      disconnectTimerRef.current = null
      const convId = getConvIdRef.current()
      if (!convId) return
      refsByConv.current.delete(convId)
      dispatchRef.current({
        type: 'EXECUTION_FINISHED',
        convId,
        result: 'error',
        errorMessage: 'Connection lost. Please resend your message.',
      })
    }, 5000)
  }, [])

  // Memoize handler factories so the callbacks identity is stable.
  const handlers = useMemo(() => ({
    onToken: makeOnToken(ctx),
    onProgress: makeOnProgress(ctx),
    onToolCall: makeOnToolCall(ctx),
    onToolResult: makeOnToolResult(ctx),
    onMeta: makeOnMeta(ctx),
    onReasoning: makeOnReasoning(ctx),
    onSubagentStart: makeOnSubagentStart(ctx),
    onSubagentStop: makeOnSubagentStop(ctx),
    onDelegation: makeOnDelegation(ctx),
    onNotification: makeOnNotification(ctx),
    onAgentMessage: makeOnAgentMessage(ctx),
    onToolAuthRequired: makeOnToolAuthRequired(ctx),
    onGuidance: makeOnGuidance(ctx),
    onPreview: makeOnPreview(ctx),
    onCreditWarning: makeOnCreditWarning(),
    onInsufficientCredits: makeOnInsufficientCredits(),
    onProviderUnavailable: makeOnProviderUnavailable(),
    onTaskStarted: makeOnTaskStarted(ctx),
    onTaskUpdated: makeOnTaskUpdated(ctx),
    onTaskProgress: makeOnTaskProgress(ctx),
    onTaskNotification: makeOnTaskNotification(ctx),
    onToolProgress: makeOnToolProgress(ctx),
    onToolUseSummary: makeOnToolUseSummary(ctx),
  }), [ctx])

  const stream = useExecutionStream({
    ...handlers,
    onDone,
    onStop,
    onError,
    onConnectionChange,
  })

  getConvIdRef.current = stream.getConnectedConversationId

  useEffect(() => {
    const refs = refsByConv.current
    const disconnectTimer = disconnectTimerRef
    return () => {
      for (const r of refs.values()) {
        if (r.pendingTokenFrame !== null) cancelAnimationFrame(r.pendingTokenFrame)
      }
      if (disconnectTimer.current) clearTimeout(disconnectTimer.current)
    }
  }, [])

  return { ...stream, resetStreamContent }
}
