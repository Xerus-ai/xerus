/**
 * useChatState - Core chat state management extracted from ChatContainer.
 *
 * Owns: agents, conversations, messages, current agent, workspace files.
 * Does NOT own: sandbox state, viewer state (those stay local to ChatContainer).
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '@/utils/AuthContext'
import { getAssistants } from '@/lib/api/agents'
import {
  getConversations,
  getConversationDetail,
  deleteConversationApi,
  createConversationApi,
} from '@/lib/api/execute'
import type { Conversation as ApiConversation } from '@/lib/api/execute'
import { getTree, type FileNode } from '@/lib/api/workspace'
import { Agent, Conversation, ChatState, SelectedChannel, SessionEntry, ProjectGroup, SessionStatus } from './types'
import { XERUS_MASTER_SLUG } from './AgentDropdown'
import { useChatExecution } from './useChatExecution'
import { toast } from 'sonner'
import type { ChatMessageExtended } from './chat-message.types'
import type { WorkspaceFile } from './WorkspaceTree'

// ---------------------------------------------------------------------------
// Pure helpers (no hooks, no side-effects)
// ---------------------------------------------------------------------------

function mapFileNodes(nodes: FileNode[]): WorkspaceFile[] {
  return nodes.map((n) => ({
    name: n.name,
    path: n.path,
    type: n.type,
    extension: n.type === 'file' ? n.name.split('.').pop()?.toLowerCase() : undefined,
    size: n.size,
    children: n.children ? mapFileNodes(n.children) : undefined,
  }))
}

function mapConversation(c: ApiConversation): Conversation {
  return {
    id: c.id,
    title: c.title,
    agentSlug: c.agent_slug ?? undefined,
    messages: [],
    createdAt: new Date(c.created_at).getTime(),
    updatedAt: new Date(c.last_message_at).getTime(),
  }
}

export function groupConversationsByAgent(
  conversations: Conversation[],
  agents: Agent[],
): ProjectGroup[] {
  const agentMap = new Map<string, Agent>()
  for (const agent of agents) {
    if (agent.slug) agentMap.set(agent.slug, agent)
  }

  const groups = new Map<string, { agent: Agent | null; sessions: SessionEntry[] }>()

  for (const conv of conversations) {
    const agent = conv.agentSlug ? agentMap.get(conv.agentSlug) ?? null : null
    const groupKey = agent ? `agent-${agent.slug}` : 'general'

    if (!groups.has(groupKey)) {
      groups.set(groupKey, { agent, sessions: [] })
    }

    const msgCount = conv.messages?.length ?? 0
    const status: SessionStatus = msgCount > 0 ? 'finished' : 'idle'

    groups.get(groupKey)!.sessions.push({
      ...conv,
      status,
      statusText: undefined,
      projectId: groupKey,
    })
  }

  const result: ProjectGroup[] = []
  for (const [key, { agent, sessions }] of groups) {
    sessions.sort((a, b) => b.updatedAt - a.updatedAt)
    result.push({
      id: key,
      name: agent?.name ?? 'General',
      path: `/workspace/${agent?.domain?.toLowerCase().replace(/\s+/g, '-') ?? 'general'}`,
      sessions,
    })
  }

  result.sort((a, b) => {
    const aLatest = a.sessions[0]?.updatedAt ?? 0
    const bLatest = b.sessions[0]?.updatedAt ?? 0
    return bLatest - aLatest
  })

  return result
}

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

  const [state, setState] = useState<ChatState>(() => ({
    currentAgent: null,
    messages: [],
    isLoading: false,
    conversationId: conversationId || null,
    conversations: [],
    error: null,
    executionState: null,
    selectedChannel: null,
  }))

  const [agents, setAgents] = useState<Agent[]>([])
  const [isLoadingAgents, setIsLoadingAgents] = useState(true)
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFile[]>([])

  // Execution stream (v3: long-lived SSE + POST messages)
  const executionStream = useChatExecution({ setState })

  // ---- Load conversation details ----
  const loadConversationDetails = useCallback(async (convId: string) => {
    try {
      const detail = await getConversationDetail(convId)
      const resolvedAgent = detail.agent_slug
        ? agents.find((agent) => agent.slug === detail.agent_slug) ?? null
        : null
      const messages: ChatMessageExtended[] = detail.messages.map((msg, idx) => {
        const base: ChatMessageExtended = {
          id: `msg_${convId}_${idx}`,
          role: msg.role,
          content: msg.content,
          timestamp: new Date(msg.created_at).getTime(),
          metadata: {
            executionId: msg.execution_id,
            tokenCount: msg.input_tokens || msg.output_tokens
              ? (msg.input_tokens ?? 0) + (msg.output_tokens ?? 0)
              : undefined,
          },
        }
        if (msg.role === 'assistant' && msg.message_metadata?.parts && msg.message_metadata.parts.length > 0) {
          base.parts = msg.message_metadata.parts as ChatMessageExtended['parts']
        }
        return base
      })
      setState((prev) => ({
        ...prev,
        conversationId: convId,
        messages,
        currentAgent: resolvedAgent,
      }))
    } catch (error) {
      console.error('Failed to load conversation details:', error)
      toast.error("Couldn't load this conversation", { description: 'Try selecting it again.' })
    }
  }, [agents])

  // ---- Parallel initial load: agents + conversations + workspace (async-parallel rule) ----
  useEffect(() => {
    if (!isAuthReady) return
    let cancelled = false

    const loadAll = async () => {
      setIsLoadingAgents(true)

      const [agentResult, convResult, treeResult] = await Promise.allSettled([
        getAssistants(),
        getConversations(50),
        getTree(3),
      ])

      if (cancelled) return

      // Process agents
      if (agentResult.status === 'fulfilled') {
        const agentList: Agent[] = agentResult.value.agents.map((a) => ({
          id: a.id,
          slug: a.slug ?? null,
          name: a.name,
          description: a.description,
          avatar: a.avatar,
          avatarUrl: a.avatarUrl ?? null,
          model: a.model,
          status: a.status,
          capabilities: a.capabilities,
          personality_type: a.category,
          domain: a.category,
          tools: a.tools?.map((t) => ({ name_slug: t.name_slug, name: t.name, img_src: t.img_src })) ?? [],
        }))
        setAgents(agentList)

        if (initialAgentId) {
          const agent = agentList.find((a) => a.slug === initialAgentId || String(a.id) === initialAgentId)
          if (agent) setState((prev) => ({ ...prev, currentAgent: agent }))
        }
      } else {
        console.error('Failed to load agents:', agentResult.reason)
      }

      // Process conversations
      if (convResult.status === 'fulfilled') {
        const convs: Conversation[] = convResult.value.conversations.map(mapConversation)
        setState((prev) => ({ ...prev, conversations: convs }))
        if (conversationId) loadConversationDetails(conversationId)
      } else {
        console.error('Failed to load conversations:', convResult.reason)
      }

      // Process workspace tree
      if (treeResult.status === 'fulfilled') {
        if (treeResult.value.root?.children) {
          setWorkspaceFiles(mapFileNodes(treeResult.value.root.children))
        }
      } else {
        console.error('Failed to load workspace tree:', treeResult.reason)
      }

      setIsLoadingAgents(false)
    }

    loadAll()
    return () => { cancelled = true }
  }, [isAuthReady, initialAgentId, conversationId, loadConversationDetails])

  // ---- Sync current agent when conversation changes ----
  useEffect(() => {
    if (!state.conversationId || agents.length === 0) return

    const activeConversation = state.conversations.find((c) => c.id === state.conversationId)
    if (!activeConversation?.agentSlug) return

    const matchingAgent = agents.find((a) => a.slug === activeConversation.agentSlug) ?? null
    if (!matchingAgent) return

    setState((prev) =>
      prev.currentAgent?.slug === matchingAgent.slug
        ? prev
        : { ...prev, currentAgent: matchingAgent }
    )
  }, [agents, state.conversationId, state.conversations])

  // ---- Connect SSE stream when conversation changes ----
  useEffect(() => {
    if (state.conversationId && isAuthReady) {
      executionStream.connectStream(state.conversationId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- connectStream is stable via ref
  }, [state.conversationId, isAuthReady])

  // ---- Auto-send initial message ----
  const sendMessageRef = useCallback(
    async (content: string) => {
      if (!content.trim() || state.isLoading) return

      const userMessage = {
        id: `msg_${Date.now()}`,
        role: 'user' as const,
        content,
        timestamp: Date.now(),
      }

      executionStream.resetStreamContent()
      setState((prev) => ({
        ...prev,
        messages: [...prev.messages, userMessage],
        isLoading: true,
        error: null,
        executionState: null,
        streamingTurn: null,
      }))

      try {
        const agentSlug = state.currentAgent?.slug ?? XERUS_MASTER_SLUG

        let convId = state.conversationId
        if (!convId) {
          const title = content.length > 60 ? content.slice(0, 57) + '...' : content
          const conv = await createConversationApi(agentSlug, title)
          convId = conv.id
          setState((prev) => ({ ...prev, conversationId: convId }))
        }

        await executionStream.connectStream(convId)

        const channelContext: Record<string, unknown> | undefined = state.selectedChannel
          ? {
              channel_id: state.selectedChannel.id,
              channel_name: state.selectedChannel.name,
              domain_name: state.selectedChannel.domainName,
            }
          : undefined

        await executionStream.sendMessage(convId, content, channelContext)

        // Refresh conversation list (non-critical)
        try {
          const result = await getConversations(50)
          setState((prev) => ({
            ...prev,
            conversations: result.conversations.map(mapConversation),
          }))
        } catch {
          // sidebar will update on next load
        }
      } catch (error) {
        const err = error as Error
        if (err.name !== 'AbortError') {
          console.error('Failed to send message:', error)
          toast.error("Your message wasn't sent", { description: 'Please try again.' })
          setState((prev) => ({
            ...prev,
            isLoading: false,
            streamingTurn: null,
            error: err.message,
            executionState: null,
          }))
        }
      }
    },
    [state.currentAgent, state.conversationId, state.isLoading, state.selectedChannel, executionStream]
  )

  useEffect(() => {
    if (initialMessage && isAuthReady && !state.isLoading && state.messages.length === 0) {
      const timer = setTimeout(() => sendMessageRef(initialMessage), 500)
      return () => clearTimeout(timer)
    }
  }, [initialMessage, isAuthReady, sendMessageRef, state.isLoading, state.messages.length])

  // ---- Action handlers ----
  const handleNewConversation = useCallback(() => {
    executionStream.close()
    setState((prev) => ({
      ...prev,
      conversationId: null,
      messages: [],
      streamingTurn: null,
      error: null,
      executionState: null,
      selectedChannel: null,
    }))
  }, [executionStream])

  const handleDeleteConversation = useCallback(async (id: string) => {
    try {
      await deleteConversationApi(id)
      setState((prev) => ({
        ...prev,
        conversations: prev.conversations.filter((c) => c.id !== id),
        conversationId: prev.conversationId === id ? null : prev.conversationId,
        messages: prev.conversationId === id ? [] : prev.messages,
      }))
      toast.success('Conversation deleted')
    } catch (error) {
      console.error('Failed to delete conversation:', error)
      toast.error("Couldn't delete this conversation", { description: 'Please try again.' })
    }
  }, [])

  const handleSelectConversation = useCallback(
    (id: string) => {
      const conversation = state.conversations.find((item) => item.id === id)
      if (conversation?.agentSlug) {
        const matchingAgent = agents.find((a) => a.slug === conversation.agentSlug) ?? null
        if (matchingAgent) {
          setState((prev) => ({ ...prev, currentAgent: matchingAgent }))
        }
      }
      loadConversationDetails(id)
    },
    [agents, loadConversationDetails, state.conversations]
  )

  const handleSelectChannel = useCallback((channel: SelectedChannel) => {
    setState((prev) => ({ ...prev, selectedChannel: channel }))
  }, [])

  const handleClearChannel = useCallback(() => {
    setState((prev) => ({ ...prev, selectedChannel: null }))
  }, [])

  const handleAgentChange = useCallback((agent: Agent | null) => {
    setState((prev) => ({ ...prev, currentAgent: agent }))
  }, [])

  const handleDismissToolAuth = useCallback(() => {
    setState((prev) => ({ ...prev, pendingToolAuth: null }))
  }, [])

  const projects = useMemo(
    () => groupConversationsByAgent(state.conversations, agents),
    [state.conversations, agents]
  )

  return {
    // State
    state,
    setState,
    agents,
    isLoadingAgents,
    workspaceFiles,
    projects,
    user,
    isAuthReady,
    executionStream,

    // Actions
    sendMessage: sendMessageRef,
    handleNewConversation,
    handleDeleteConversation,
    handleSelectConversation,
    handleSelectChannel,
    handleClearChannel,
    handleAgentChange,
    handleDismissToolAuth,
  }
}
