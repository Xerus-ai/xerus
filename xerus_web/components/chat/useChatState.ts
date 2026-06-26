/**
 * useChatState — central chat state via useReducer (see chatReducer.ts).
 * Per-conversation exec state in execByConversation keyed by conversationId
 * prevents loading/streaming state bleeding across sessions.
 */
import { useReducer, useEffect, useCallback, useMemo, useRef } from 'react'
import { useAuth } from '@/utils/AuthContext'
import { getAssistants } from '@/lib/api/agents'
import {
  getConversations,
  getConversationDetail,
  deleteConversationApi,
  createConversationApi,
  cancelExecution,
  updateConversationTitle,
} from '@/lib/api/execute'
import { Agent, Conversation, SelectedChannel } from './types'
import { XERUS_MASTER_SLUG } from './AgentDropdown'
import { useChatExecution } from './useChatExecution'
import { toast } from '@/lib/toast'
import { chatReducer, createInitialState, getExecState, type ChatAction } from './chatReducer'
import {
  PAGE_SIZE,
  mapConversation,
  mapDetailToMessages,
  mapApiAgent,
  groupConversationsByAgent,
} from './useChatState.helpers'

export { groupConversationsByAgent } from './useChatState.helpers'

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface UseChatStateOptions {
  initialAgentId?: string
  conversationId?: string
  initialMessage?: string
}

export function useChatState({ initialAgentId, conversationId, initialMessage }: UseChatStateOptions) {
  const { user, isAuthReady } = useAuth()

  const [state, dispatch] = useReducer(chatReducer, conversationId ?? null, createInitialState)

  const [agentsState, setAgentsState] = useReducer(
    (_: { agents: Agent[]; isLoading: boolean }, next: { agents: Agent[]; isLoading: boolean }) => next,
    { agents: [], isLoading: true },
  )
  const { agents, isLoading: isLoadingAgents } = agentsState

  // Execution stream (v3: long-lived SSE + POST messages)
  const executionStream = useChatExecution({ dispatch })

  // Track whether the user manually selected an agent (prevents auto-sync overwriting it)
  const manualAgentSelectionRef = useRef(false)

  const [isLoadingMore, setIsLoadingMore] = useReducer((_: boolean, next: boolean) => next, false)

  // ---- Load conversation details ----
  const loadConversationDetails = useCallback(async (convId: string) => {
    try {
      const detail = await getConversationDetail(convId)
      const resolvedAgent = detail.agent_slug
        ? agents.find((agent) => agent.slug === detail.agent_slug) ?? null
        : null
      const messages = mapDetailToMessages(convId, detail)
      dispatch({ type: 'LOAD_CONVERSATION_DETAIL', convId, messages, agent: resolvedAgent })
    } catch (error) {
      console.error('Failed to load conversation details:', error)
      toast.error("Couldn't load this conversation", { description: 'Try selecting it again.' })
    }
  }, [agents])

  // ---- Parallel initial load: agents + conversations ----
  // Ref prevents double-fire in React Strict Mode and on dependency changes
  const hasLoadedRef = useRef(false)
  const hasAutoSentRef = useRef(false)
  const loadConversationDetailsRef = useRef(loadConversationDetails)
  loadConversationDetailsRef.current = loadConversationDetails

  useEffect(() => {
    if (!isAuthReady || hasLoadedRef.current) return
    hasLoadedRef.current = true
    let cancelled = false

    const loadAll = async () => {
      const [agentResult, convResult] = await Promise.allSettled([
        getAssistants({ limit: 100 }),
        getConversations(PAGE_SIZE, 0),
      ])

      if (cancelled) return

      // Process agents
      let loadedAgents: Agent[] = []
      if (agentResult.status === 'fulfilled') {
        loadedAgents = agentResult.value.agents.map(mapApiAgent)

        if (initialAgentId) {
          const agent = loadedAgents.find((a) => a.slug === initialAgentId || String(a.id) === initialAgentId)
          if (agent) dispatch({ type: 'SET_AGENT', agent })
        }
      } else {
        console.error('Failed to load agents:', agentResult.reason)
      }

      setAgentsState({ agents: loadedAgents, isLoading: false })

      // Process conversations
      if (convResult.status === 'fulfilled') {
        const convs: Conversation[] = convResult.value.conversations.map(mapConversation)
        const total = convResult.value.total ?? convs.length
        dispatch({ type: 'SET_CONVERSATIONS', conversations: convs, hasMore: convs.length < total })
        // Auto-select: if no conversation was specified, load the most recent one
        const targetConvId = conversationId || convs[0]?.id
        if (targetConvId) loadConversationDetailsRef.current(targetConvId)
      } else {
        console.error('Failed to load conversations:', convResult.reason)
      }
    }

    loadAll()
    return () => {
      cancelled = true
      hasLoadedRef.current = false // Reset so Strict Mode remount can re-load
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once when auth is ready, refs handle changing deps
  }, [isAuthReady])

  // ---- Sync current agent when conversation changes ----
  // Skip if user manually selected an agent (prevents overwriting their choice)
  useEffect(() => {
    if (!state.conversationId || agents.length === 0) return
    if (manualAgentSelectionRef.current) return

    const activeConversation = state.conversations.find((c) => c.id === state.conversationId)
    if (!activeConversation?.agentSlug) return

    const matchingAgent = agents.find((a) => a.slug === activeConversation.agentSlug) ?? null
    if (!matchingAgent) return

    if (state.currentAgent?.slug !== matchingAgent.slug) {
      dispatch({ type: 'SET_AGENT', agent: matchingAgent })
    }
  }, [agents, state.conversationId, state.conversations, state.currentAgent?.slug])

  // ---- Sync conversationId to URL so reloads preserve the conversation ----
  useEffect(() => {
    const url = new URL(window.location.href)
    if (state.conversationId) {
      if (url.searchParams.get('c') !== state.conversationId) {
        url.searchParams.set('c', state.conversationId)
        window.history.replaceState({}, '', url.toString())
      }
    } else if (url.searchParams.has('c')) {
      url.searchParams.delete('c')
      window.history.replaceState({}, '', url.toString())
    }
  }, [state.conversationId])

  // ---- Connect SSE stream when conversation changes ----
  useEffect(() => {
    if (state.conversationId && isAuthReady) {
      executionStream.connectStream(state.conversationId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- connectStream is stable via ref
  }, [state.conversationId, isAuthReady])

  // ---- Reconnect + reload on tab return (visibility change) ----
  const loadConversationDetailsRef2 = useRef(loadConversationDetails)
  loadConversationDetailsRef2.current = loadConversationDetails
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState !== 'visible') return
      const convId = state.conversationId
      if (!convId || !isAuthReady) return
      executionStream.connectStream(convId)
      loadConversationDetailsRef2.current(convId)
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs carry live values
  }, [state.conversationId, isAuthReady, executionStream])

  // ---- Send message ----
  const sendMessageRef = useCallback(
    async (content: string, metadata?: { attachedFiles?: string[] }) => {
      if (!content.trim()) return

      const activeConvId = state.conversationId
      const execState = getExecState(state, activeConvId)

      // Queue for after — the auto-drain effect sends it once the current run finishes.
      // The backend doesn't support mid-execution user injection yet (each POST starts
      // a new execution). True mid-run guidance requires SDK-level changes.
      if (activeConvId && execState.isLoading) {
        dispatch({ type: 'QUEUE_MESSAGE', convId: activeConvId, content })
        return
      }

      const userMessage = {
        id: `msg_${Date.now()}`,
        role: 'user' as const,
        content,
        timestamp: Date.now(),
      }

      // Hoist convId so the catch block can reference it even when
      // activeConvId was null but a new conversation was created.
      let convId: string | null = activeConvId

      try {
        const agentSlug = state.currentAgent?.slug ?? XERUS_MASTER_SLUG

        if (!convId) {
          const title = content.length > 60 ? content.slice(0, 57) + '...' : content
          const conv = await createConversationApi(agentSlug, title)
          convId = conv.id
          dispatch({ type: 'SET_CONVERSATION_ID', convId })
        }

        // Reset stream tracking refs for the new send, seeding the responding agent
        // so the first streaming turn renders the correct avatar immediately.
        executionStream.resetStreamContent(convId, {
          agentSlug: agentSlug,
          agentName: state.currentAgent?.name,
        })
        dispatch({ type: 'SEND_MESSAGE_START', convId, userMessage })

        await executionStream.connectStream(convId)

        const messageContext: Record<string, unknown> = {}
        if (state.selectedChannel) {
          messageContext.channel_id = state.selectedChannel.id
          messageContext.channel_name = state.selectedChannel.name
          messageContext.domain_name = state.selectedChannel.domainName
        }
        if (metadata?.attachedFiles && metadata.attachedFiles.length > 0) {
          messageContext.attached_files = metadata.attachedFiles
        }
        const contextArg = Object.keys(messageContext).length > 0 ? messageContext : undefined

        // Pass agent_slug override when sending to an existing conversation
        // so the backend uses the user's current agent selection, not the conversation default
        const agentSlugOverride = activeConvId ? (state.currentAgent?.slug ?? undefined) : undefined
        const sendResult = await executionStream.sendMessage(convId, content, contextArg, agentSlugOverride)
        dispatch({ type: 'SET_ACTIVE_EXECUTION_ID', convId, executionId: sendResult.execution_id })

        // Refresh conversation list (non-critical) — merge to preserve existing entries
        try {
          const result = await getConversations(PAGE_SIZE, 0)
          const incoming = result.conversations.map(mapConversation)
          dispatch({ type: 'MERGE_CONVERSATIONS', conversations: incoming })
        } catch {
          // sidebar will update on next load
        }
      } catch (error) {
        const err = error as Error
        if (err.name !== 'AbortError') {
          console.error('Failed to send message:', error)
          toast.error("Your message wasn't sent", { description: 'Please try again.' })
          if (convId) {
            dispatch({
              type: 'EXECUTION_FINISHED',
              convId,
              result: 'error',
              errorMessage: err.message,
            })
          } else {
            dispatch({ type: 'SET_ERROR', error: err.message })
          }
        }
      }
    },
    [state, executionStream],
  )

  useEffect(() => {
    if (!initialMessage || !isAuthReady || hasAutoSentRef.current) return
    const exec = getExecState(state, state.conversationId)
    if (exec.isLoading || state.messages.length > 0) return
    hasAutoSentRef.current = true
    const timer = setTimeout(() => sendMessageRef(initialMessage), 500)
    return () => clearTimeout(timer)
  }, [initialMessage, isAuthReady, sendMessageRef, state])

  // ---- Auto-send queued messages when execution completes successfully.
  // Cancellation clears queue in reducer; errors skip auto-send.
  const prevExecRef = useRef<{ convId: string | null; isLoading: boolean }>({ convId: null, isLoading: false })
  useEffect(() => {
    const convId = state.conversationId
    if (!convId) return
    const exec = getExecState(state, convId)
    const prev = prevExecRef.current
    prevExecRef.current = { convId, isLoading: exec.isLoading }

    const justFinished =
      prev.convId === convId &&
      prev.isLoading &&
      !exec.isLoading

    if (justFinished && exec.pendingMessages.length > 0) {
      const next = exec.pendingMessages[0]
      dispatch({ type: 'POP_QUEUED_MESSAGE', convId })
      const delay = exec.lastExecutionResult === 'error' ? 1000 : 300
      const timer = setTimeout(() => sendMessageRef(next), delay)
      return () => clearTimeout(timer)
    }
  }, [state, sendMessageRef])

  // ---- Action handlers ----
  const handleNewConversation = useCallback(() => {
    manualAgentSelectionRef.current = false
    executionStream.close()
    dispatch({ type: 'NEW_CONVERSATION' })
  }, [executionStream])

  const handleDeleteConversation = useCallback(async (id: string) => {
    try {
      await deleteConversationApi(id)
      dispatch({ type: 'DELETE_CONVERSATION', convId: id })
      toast.success('Conversation deleted', { description: 'This conversation has been permanently removed.' })
    } catch (error) {
      console.error('Failed to delete conversation:', error)
      toast.error("Couldn't delete this conversation", { description: 'Please try again.' })
    }
  }, [])

  const handleRenameConversation = useCallback(async (id: string, newTitle: string) => {
    try {
      await updateConversationTitle(id, newTitle)
      dispatch({ type: 'RENAME_CONVERSATION', convId: id, title: newTitle })
    } catch (error) {
      console.error('Failed to rename conversation:', error)
      toast.error("Couldn't rename this conversation", { description: 'Please try again.' })
    }
  }, [])

  const handleSelectConversation = useCallback(
    (id: string) => {
      manualAgentSelectionRef.current = false
      const conversation = state.conversations.find((item) => item.id === id)
      const matchingAgent = conversation?.agentSlug
        ? agents.find((a) => a.slug === conversation.agentSlug) ?? null
        : null
      dispatch({ type: 'SELECT_CONVERSATION', convId: id, agent: matchingAgent })
      loadConversationDetails(id)
    },
    [agents, loadConversationDetails, state.conversations],
  )

  const handleSelectChannel = useCallback((channel: SelectedChannel) => {
    dispatch({ type: 'SET_CHANNEL', channel })
  }, [])

  const handleClearChannel = useCallback(() => {
    dispatch({ type: 'SET_CHANNEL', channel: null })
  }, [])

  const handleAgentChange = useCallback((agent: Agent | null) => {
    manualAgentSelectionRef.current = true
    dispatch({ type: 'SET_AGENT', agent })
  }, [])

  const handleDismissToolAuth = useCallback(() => {
    dispatch({ type: 'SET_PENDING_TOOL_AUTH', pendingToolAuth: null })
  }, [])

  const handleCancelQueuedMessage = useCallback((index: number) => {
    if (!state.conversationId) return
    dispatch({ type: 'CANCEL_QUEUED_MESSAGE', convId: state.conversationId, index })
  }, [state.conversationId])

  const handleStopExecution = useCallback(async () => {
    const convId = state.conversationId
    if (!convId) return
    const exec = getExecState(state, convId)
    const execId = exec.activeExecutionId
    if (!execId) return
    try {
      await cancelExecution(execId)
    } catch (err) {
      console.error('Failed to cancel execution', err)
      // Don't block UI reset — cancel is best-effort but log the failure
    }
    dispatch({ type: 'EXECUTION_FINISHED', convId, result: 'cancelled' })
  }, [state])

  // ---- Pagination: load more conversations on scroll ----
  const loadMoreConversations = useCallback(async () => {
    if (!state.hasMoreConversations || isLoadingMore) return
    setIsLoadingMore(true)
    try {
      const offset = state.conversations.length
      const result = await getConversations(PAGE_SIZE, offset)
      const incoming = result.conversations.map(mapConversation)
      const total = result.total ?? offset + incoming.length
      dispatch({
        type: 'APPEND_CONVERSATIONS',
        conversations: incoming,
        hasMore: offset + incoming.length < total,
      })
    } catch (error) {
      console.error('Failed to load more conversations:', error)
    } finally {
      setIsLoadingMore(false)
    }
  }, [state.conversations.length, state.hasMoreConversations, isLoadingMore])

  const projects = useMemo(
    () => groupConversationsByAgent(state.conversations, agents, state.execByConversation),
    [state.conversations, agents, state.execByConversation],
  )

  // Active conversation's exec state — derived during render.
  const activeExec = getExecState(state, state.conversationId)

  return {
    state, dispatch, activeExec,
    agents, isLoadingAgents, isLoadingMore,
    projects, user, isAuthReady, executionStream,
    sendMessage: sendMessageRef,
    handleNewConversation, handleDeleteConversation, handleRenameConversation, handleSelectConversation,
    handleSelectChannel, handleClearChannel, handleAgentChange,
    handleDismissToolAuth, handleStopExecution, handleCancelQueuedMessage,
    loadMoreConversations,
  }
}

// Re-export for consumers
export { getExecState }
export type { ChatAction }
