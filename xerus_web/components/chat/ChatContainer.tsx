'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'
import { ChatRightPanel } from './ChatRightPanel'
import { ArtifactViewerPanel, type ViewerContent, type ViewerContentType } from './ArtifactViewerPanel'
import { SandboxPanel, type SandboxTab } from './SandboxPanel'
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels'
import { GuidanceInterventionCard } from './GuidanceInterventionCard'
import { ConversationSidebar } from './ConversationSidebar'
import { useSidebarSlotRegister } from '@/components/layout/SidebarSlotContext'
import { useAuth } from '@/utils/AuthContext'
import { getAssistants } from '@/lib/api'
import {
  getConversations,
  getConversationDetail,
  deleteConversationApi,
  updateConversationTitle,
  createConversationApi,
  respondToGuidance,
} from '@/lib/api/execute'
import type { Conversation as ApiConversation } from '@/lib/api/execute'
import { cn } from '@/lib/utils'
import { Agent, Conversation, ChatState, SelectedChannel, SessionEntry, ProjectGroup, SessionStatus, Message } from './types'
import { XERUS_MASTER_SLUG } from './AgentDropdown'
import type { WorkspaceFile } from './WorkspaceTree'
import type { WorkspacePayload } from './MessageBubble'
import { useChatExecution } from './useChatExecution'
import { mapStreamEventsToExecution } from './mapStreamToExecutionEvents'
import { ExecutionDetail } from '@/components/execution'
import { toast } from 'sonner'
import { XerusLoader } from '@/components/common/XerusLoader'
import { getTree, startBrowser, startTerminal, type FileNode } from '@/lib/api/workspace'
import { getSharedPipedreamClient } from '@/lib/pipedream-client'
import type { ChatMessageExtended } from './chat-message.types'

// Map workspace FileNode tree to WorkspaceFile[] for the right panel
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

// Map file extension to viewer content type
function extToViewerType(ext: string): ViewerContentType {
  const map: Record<string, ViewerContentType> = {
    html: 'html', htm: 'html',
    pdf: 'pdf',
    md: 'markdown', mdx: 'markdown',
    png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', svg: 'image', webp: 'image',
    csv: 'csv',
    ts: 'code', tsx: 'code', js: 'code', jsx: 'code', py: 'code', rb: 'code',
    go: 'code', rs: 'code', java: 'code', css: 'code', scss: 'code',
    json: 'code', yaml: 'code', yml: 'code', sql: 'code', sh: 'code',
  }
  return map[ext] ?? 'text'
}

// Group conversations by agent into project groups for sidebar
function groupConversationsByAgent(
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

    // Derive status from conversation state
    const msgCount = conv.messages?.length ?? 0
    let status: SessionStatus = 'idle'
    if (msgCount > 0) {
      status = 'finished'
    }

    const session: SessionEntry = {
      ...conv,
      status,
      statusText: undefined,
      projectId: groupKey,
    }
    groups.get(groupKey)!.sessions.push(session)
  }

  const result: ProjectGroup[] = []
  for (const [key, { agent, sessions }] of groups) {
    // Sort sessions by most recent first
    sessions.sort((a, b) => b.updatedAt - a.updatedAt)

    result.push({
      id: key,
      name: agent?.name ?? 'General',
      path: `/workspace/${agent?.domain?.toLowerCase().replace(/\s+/g, '-') ?? 'general'}`,
      sessions,
    })
  }

  // Sort groups by most recent session activity
  result.sort((a, b) => {
    const aLatest = a.sessions[0]?.updatedAt ?? 0
    const bLatest = b.sessions[0]?.updatedAt ?? 0
    return bLatest - aLatest
  })

  return result
}

// Map API conversation to frontend Conversation type
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

interface ChatContainerProps {
  initialAgentId?: string
  conversationId?: string
  initialMessage?: string
  className?: string
}

export function ChatContainer({
  initialAgentId,
  conversationId,
  initialMessage,
  className,
}: ChatContainerProps) {
  const { user, isAuthReady } = useAuth()

  const [state, setState] = useState<ChatState>({
    currentAgent: null,
    messages: [],
    isLoading: false,
    conversationId: conversationId || null,
    conversations: [],
    error: null,
    executionState: null,
    selectedChannel: null,
  })

  const [agents, setAgents] = useState<Agent[]>([])
  const [isLoadingAgents, setIsLoadingAgents] = useState(true)
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFile[]>([])
  const [isWorkspaceCollapsed, setIsWorkspaceCollapsed] = useState(true)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  // Sidebar slot — register a component that renders the ConversationSidebar
  const [viewerContent, setViewerContent] = useState<ViewerContent | null>(null)
  const [showExecution, setShowExecution] = useState<string | null>(null)
  const [browserUrl, setBrowserUrl] = useState<string | null>(null)
  const [isBrowserLoading, setIsBrowserLoading] = useState(false)
  const [terminalUrl, setTerminalUrl] = useState<string | null>(null)
  const [isTerminalLoading, setIsTerminalLoading] = useState(false)
  const [sandboxTab, setSandboxTab] = useState<SandboxTab>('terminal')

  // Execution stream (v3: long-lived SSE + POST messages)
  const executionStream = useChatExecution({ setState })

  // Load agents
  useEffect(() => {
    const loadAgents = async () => {
      try {
        setIsLoadingAgents(true)
        const result = await getAssistants()
        const agentList = result.agents.map(
          (a) =>
            ({
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
            }) as Agent
        )
        setAgents(agentList)

        if (initialAgentId) {
          const agent = agentList.find((a) => a.slug === initialAgentId || String(a.id) === initialAgentId)
          if (agent) setState((prev) => ({ ...prev, currentAgent: agent }))
        }
      } catch (error) {
        console.error('Failed to load agents:', error)
      } finally {
        setIsLoadingAgents(false)
      }
    }
    if (isAuthReady) loadAgents()
  }, [isAuthReady, initialAgentId])

  // Load conversation details from backend
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
    }
  }, [agents])

  // Load conversations list from backend
  useEffect(() => {
    const loadConversations = async () => {
      try {
        const result = await getConversations(50)
        const convs: Conversation[] = result.conversations.map(mapConversation)
        setState((prev) => ({ ...prev, conversations: convs }))
        if (conversationId) loadConversationDetails(conversationId)
      } catch (error) {
        console.error('Failed to load conversations:', error)
      }
    }
    if (isAuthReady) loadConversations()
  }, [isAuthReady, conversationId, loadConversationDetails])

  useEffect(() => {
    if (!state.conversationId || agents.length === 0) return

    const activeConversation = state.conversations.find((conversation) => conversation.id === state.conversationId)
    if (!activeConversation?.agentSlug) return

    const matchingAgent = agents.find((agent) => agent.slug === activeConversation.agentSlug) ?? null
    if (!matchingAgent) return

    setState((prev) => (
      prev.currentAgent?.slug === matchingAgent.slug
        ? prev
        : { ...prev, currentAgent: matchingAgent }
    ))
  }, [agents, state.conversationId, state.conversations])

  // Load workspace tree
  useEffect(() => {
    const loadWorkspace = async () => {
      try {
        const tree = await getTree(3)
        if (tree.root?.children) {
          setWorkspaceFiles(mapFileNodes(tree.root.children))
        }
      } catch (error) {
        console.error('Failed to load workspace tree:', error)
      }
    }
    if (isAuthReady) loadWorkspace()
  }, [isAuthReady])

  // Connect SSE stream when conversationId changes (pre-warm for faster first message)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- connectStream is stable (useCallback), executionStream object changes every render
  useEffect(() => {
    if (state.conversationId && isAuthReady) {
      executionStream.connectStream(state.conversationId)
    }
  }, [state.conversationId, isAuthReady])

  // Send message (v3: POST to /conversations/:id/messages, events arrive on SSE stream)
  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || state.isLoading) return

      const userMessage: Message = {
        id: `msg_${Date.now()}`,
        role: 'user',
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
        // Resolve agent slug: use selected agent, or default to Xerus master
        const agentSlug = state.currentAgent?.slug ?? XERUS_MASTER_SLUG

        // Ensure we have a conversation — create one if needed
        let convId = state.conversationId
        if (!convId) {
          const title = content.length > 60 ? content.slice(0, 57) + '...' : content
          const conv = await createConversationApi(agentSlug, title)
          convId = conv.id
          setState((prev) => ({ ...prev, conversationId: convId }))
        }

        // Always ensure SSE stream is connected before sending.
        // For new conversations: stream doesn't exist yet.
        // For existing conversations: stream may have disconnected (expired token, network).
        // connectStream is a no-op if already connected to this conversation.
        await executionStream.connectStream(convId)

        // Build channel context if a channel is selected
        const channelContext: Record<string, unknown> | undefined = state.selectedChannel
          ? {
              channel_id: state.selectedChannel.id,
              channel_name: state.selectedChannel.name,
              domain_name: state.selectedChannel.domainName,
            }
          : undefined

        // POST message — returns 202 immediately, events arrive on SSE stream
        await executionStream.sendMessage(convId, content, channelContext)

        // Refresh conversation list after sending
        try {
          const result = await getConversations(50)
          setState((prev) => ({
            ...prev,
            conversations: result.conversations.map(mapConversation),
          }))
        } catch {
          // Non-critical — sidebar will update on next load
        }
      } catch (error) {
        const err = error as Error
        if (err.name !== 'AbortError') {
          console.error('Failed to send message:', error)
          toast.error("Couldn't send message. Try again.")
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

  // Auto-send initial message
  useEffect(() => {
    if (initialMessage && isAuthReady && !state.isLoading && state.messages.length === 0) {
      const timer = setTimeout(() => {
        sendMessage(initialMessage)
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [initialMessage, isAuthReady, sendMessage, state.isLoading, state.messages.length])

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
    }
  }, [])

  const handleSelectConversation = useCallback(
    (id: string) => {
      const conversation = state.conversations.find((item) => item.id === id)
      if (conversation?.agentSlug) {
        const matchingAgent = agents.find((agent) => agent.slug === conversation.agentSlug) ?? null
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

  const handleToolAuthConnect = useCallback((appSlug: string) => {
    try {
      const pipedreamClient = getSharedPipedreamClient()
      pipedreamClient.connectAccount({
        app: appSlug,
        onSuccess: () => {
          setState((prev) => ({ ...prev, pendingToolAuth: null }))
          toast.success(`Connected to ${appSlug}`)
          const iframes = document.querySelectorAll('iframe[id^="pipedream-connect-iframe-"]')
          iframes.forEach(iframe => iframe.remove())
        },
        onError: (err) => {
          toast.error(`Connection failed: ${err.message || 'Unknown error'}`)
          const iframes = document.querySelectorAll('iframe[id^="pipedream-connect-iframe-"]')
          iframes.forEach(iframe => iframe.remove())
        },
        onClose: () => {
          const iframes = document.querySelectorAll('iframe[id^="pipedream-connect-iframe-"]')
          iframes.forEach(iframe => iframe.remove())
        },
      })
    } catch (err) {
      toast.error(`OAuth failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }, [])

  const guidanceSubmittingRef = useRef(false)
  const handleGuidanceRespond = useCallback(async (accepted: boolean, feedback?: string) => {
    if (guidanceSubmittingRef.current) return
    const guidance = state.pendingGuidance
    if (!guidance) return
    guidanceSubmittingRef.current = true
    try {
      await respondToGuidance(guidance.execution_id, {
        guidance_id: guidance.pause_id,
        accepted,
        response_value: feedback,
      })
      setState((prev) => ({ ...prev, pendingGuidance: null }))
    } catch (err) {
      toast.error(`Failed to respond: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      guidanceSubmittingRef.current = false
    }
  }, [state.pendingGuidance])

  // Open artifact viewer — from message plan/artifact cards
  const handleOpenViewer = useCallback((payload: WorkspacePayload) => {
    if (payload.type === 'plan') {
      setViewerContent({
        type: 'plan',
        title: payload.title,
        content: payload.content,
      })
    } else {
      const ext = payload.artifact.filename.split('.').pop()?.toLowerCase() ?? ''
      setViewerContent({
        type: extToViewerType(ext),
        title: payload.artifact.filename,
        subtitle: `${payload.artifact.lineCount} lines \u00b7 ${payload.artifact.description}`,
        content: payload.artifact.preview,
        language: ext,
      })
    }
  }, [])

  // Open artifact viewer — from workspace file tree clicks
  const handleFileSelect = useCallback((file: WorkspaceFile) => {
    if (file.type === 'directory') return
    const ext = file.extension ?? file.name.split('.').pop()?.toLowerCase() ?? ''
    setViewerContent({
      type: extToViewerType(ext),
      title: file.name,
      subtitle: ext.toUpperCase(),
      language: ext,
    })
  }, [])

  const handleCloseViewer = useCallback(() => {
    setViewerContent(null)
  }, [])

  const handleOpenBrowser = useCallback(async () => {
    if (browserUrl || isBrowserLoading) return
    setSandboxTab('browser')
    setIsBrowserLoading(true)
    try {
      const result = await startBrowser()
      setBrowserUrl(result.novnc_url)
    } catch (err) {
      toast.error('Failed to start browser: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setIsBrowserLoading(false)
    }
  }, [browserUrl, isBrowserLoading])

  const handleOpenTerminal = useCallback(async () => {
    if (terminalUrl || isTerminalLoading) return
    setSandboxTab('terminal')
    setIsTerminalLoading(true)
    try {
      const result = await startTerminal()
      setTerminalUrl(result.terminal_url)
    } catch (err) {
      toast.error('Failed to start terminal: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setIsTerminalLoading(false)
    }
  }, [terminalUrl, isTerminalLoading])

  const handleCloseSandboxPanel = useCallback(() => {
    setBrowserUrl(null)
    setTerminalUrl(null)
  }, [])

  const handleViewExecution = useCallback((messageId: string) => {
    setShowExecution(messageId)
  }, [])

  const projects = useMemo(
    () => groupConversationsByAgent(state.conversations, agents),
    [state.conversations, agents]
  )

  // Stable component that closes over current state via refs (rule: advanced-event-handler-refs)
  const sidebarPropsRef = useRef({ projects, conversationId: state.conversationId, selectedChannel: state.selectedChannel, handleSelectConversation, handleNewConversation, handleDeleteConversation, handleSelectChannel, handleClearChannel })
  sidebarPropsRef.current = { projects, conversationId: state.conversationId, selectedChannel: state.selectedChannel, handleSelectConversation, handleNewConversation, handleDeleteConversation, handleSelectChannel, handleClearChannel }

  const ChatSidebarSlot = useCallback(() => {
    const p = sidebarPropsRef.current
    return (
      <ConversationSidebar
        projects={p.projects}
        currentConversationId={p.conversationId}
        onSelectConversation={p.handleSelectConversation}
        onNewConversation={p.handleNewConversation}
        onDeleteConversation={p.handleDeleteConversation}
        isCollapsed={false}
        selectedChannel={p.selectedChannel}
        onSelectChannel={p.handleSelectChannel}
        onClearChannel={p.handleClearChannel}
      />
    )
  }, [])

  useSidebarSlotRegister('chat-sidebar', ChatSidebarSlot)

  // Loading state
  if (!isAuthReady) {
    return <XerusLoader variant="inline" className="h-full bg-surface" />
  }

  const isSandboxOpen = !!(terminalUrl || browserUrl)
  const agentSlug = state.currentAgent?.slug ?? null

  return (
    <div className={cn('flex w-full bg-surface relative h-screen overflow-hidden', className)}>
      {/* Conversation sidebar is now rendered inside the AppSidebar (Chat tab body) */}

      {/* Main content — resizable split when sandbox is open */}
      <PanelGroup orientation="horizontal" className="flex-1 min-w-0">
        {/* Chat column */}
        <Panel defaultSize={isSandboxOpen ? 50 : 100} minSize={30}>
          <div className="flex flex-col h-full bg-surface relative overflow-hidden">
            <MessageList
              messages={state.messages as ChatMessageExtended[]}
              currentAgent={state.currentAgent}
              isLoading={state.isLoading}
              streamingTurn={state.streamingTurn}
              executionState={state.executionState}
              className="flex-1"
              onViewExecution={handleViewExecution}
              onSuggestionClick={sendMessage}
              onOpenWorkspace={handleOpenViewer}
              userName={user?.display_name}
              agents={agents}
            />

            {state.pendingToolAuth && (
              <div className="mx-4 mb-2 flex items-center gap-3 rounded-lg border border-yellow-500/30 bg-yellow-950/20 px-4 py-3">
                <span className="text-sm text-yellow-200">
                  Agent needs access to <strong>{state.pendingToolAuth.app_slug}</strong>
                </span>
                <button
                  onClick={() => handleToolAuthConnect(state.pendingToolAuth!.app_slug)}
                  className="ml-auto px-3 py-1.5 text-xs font-medium rounded bg-yellow-700 hover:bg-yellow-600 text-white transition-colors"
                >
                  Connect
                </button>
                <button
                  onClick={() => setState((prev) => ({ ...prev, pendingToolAuth: null }))}
                  className="px-3 py-1.5 text-xs rounded text-yellow-400/70 hover:text-yellow-300 transition-colors"
                >
                  Dismiss
                </button>
              </div>
            )}

            {state.pendingGuidance && (
              <GuidanceInterventionCard
                question={state.pendingGuidance.question}
                options={state.pendingGuidance.options}
                timeout_seconds={state.pendingGuidance.timeout_seconds}
                scenario={state.pendingGuidance.scenario}
                tool_name={state.pendingGuidance.tool_name}
                agent_slug={state.pendingGuidance.agent_slug}
                ui_hint={state.pendingGuidance.ui_hint}
                browser_url={state.pendingGuidance.browser_url}
                preview_url={state.pendingGuidance.preview_url}
                onRespond={handleGuidanceRespond}
              />
            )}

            <ChatInput
              onSendMessage={sendMessage}
              disabled={state.isLoading}
              placeholder={
                state.currentAgent
                  ? `Ask ${state.currentAgent.name} anything...`
                  : 'Message Xerus...'
              }
              agents={agents}
              selectedAgent={state.currentAgent}
              onAgentChange={(agent) => setState((prev) => ({ ...prev, currentAgent: agent }))}
              onOpenTerminal={handleOpenTerminal}
              isTerminalLoading={isTerminalLoading}
              isTerminalOpen={!!terminalUrl}
              onOpenBrowser={handleOpenBrowser}
              isBrowserLoading={isBrowserLoading}
              isBrowserOpen={!!browserUrl}
            />
          </div>
        </Panel>

        {/* Sandbox panel — draggable resize when open */}
        {isSandboxOpen && (
          <>
            <PanelResizeHandle className="w-2 flex items-center justify-center cursor-col-resize group shrink-0">
              <div className="w-px h-8 rounded-full bg-[#E5E5E5] group-hover:bg-[#FF6600]/50 group-hover:h-16 transition-all" />
            </PanelResizeHandle>
            <Panel defaultSize={50} minSize={25}>
              <SandboxPanel
                terminalUrl={terminalUrl}
                browserUrl={state.pendingGuidance?.ui_hint === 'browser' && state.pendingGuidance.browser_url
                  ? state.pendingGuidance.browser_url
                  : browserUrl}
                previewUrl={null}
                activeTab={sandboxTab}
                onTabChange={setSandboxTab}
                onClose={handleCloseSandboxPanel}
                className="h-full"
              />
            </Panel>
          </>
        )}

        {/* Right panels — only when sandbox is closed */}
        {!isSandboxOpen && viewerContent && (
          <>
            <PanelResizeHandle className="w-2 flex items-center justify-center cursor-col-resize group shrink-0">
              <div className="w-px h-8 rounded-full bg-[#E5E5E5] group-hover:bg-[#FF6600]/50 group-hover:h-16 transition-all" />
            </PanelResizeHandle>
            <Panel defaultSize={40} minSize={20}>
              <ArtifactViewerPanel
                content={viewerContent}
                onClose={handleCloseViewer}
              />
            </Panel>
          </>
        )}

        {!isSandboxOpen && !viewerContent && (
          <ChatRightPanel
            agentSlug={agentSlug}
            workspaceFiles={workspaceFiles}
            onFileSelect={handleFileSelect}
            isWorkspaceCollapsed={isWorkspaceCollapsed}
            onToggleWorkspace={() => setIsWorkspaceCollapsed((prev) => !prev)}
          />
        )}
      </PanelGroup>

      {/* Execution Detail slide-over */}
      {showExecution && (
        <ExecutionDetail
          sessionId={showExecution}
          events={mapStreamEventsToExecution(executionStream.events)}
          isLive={executionStream.isConnected}
          onClose={() => setShowExecution(null)}
          display="slide-over"
        />
      )}
    </div>
  )
}

