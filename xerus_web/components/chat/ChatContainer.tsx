'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'
import { ChatRightPanel } from './ChatRightPanel'
import type { ViewerContent, ViewerContentType } from './ArtifactViewerPanel'
import type { SandboxTab } from './SandboxPanel'

// Heavy panels loaded only when user opens them (bundle-dynamic-imports + bundle-conditional rules)
const ArtifactViewerPanel = dynamic(() => import('./ArtifactViewerPanel').then(m => ({ default: m.ArtifactViewerPanel })))
const SandboxPanel = dynamic(() => import('./SandboxPanel').then(m => ({ default: m.SandboxPanel })))
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels'
import { GuidanceInterventionCard } from './GuidanceInterventionCard'
import { ConversationSidebar } from './ConversationSidebar'
import { useSidebarSlotRegister } from '@/components/layout/SidebarSlotContext'
import { cn } from '@/lib/utils'
import type { WorkspaceFile } from './WorkspaceTree'
import type { WorkspacePayload } from './MessageBubble'
import type { ChatMessageExtended } from './chat-message.types'
import { mapStreamEventsToExecution } from './mapStreamToExecutionEvents'

const ExecutionDetail = dynamic(() => import('@/components/execution').then(m => ({ default: m.ExecutionDetail })))
import { toast } from '@/lib/toast'
import { XerusLoader } from '@/components/common/XerusLoader'
import { startBrowser, startTerminal } from '@/lib/api/workspace'
import { getSharedPipedreamClient } from '@/lib/pipedream-client'
import { respondToGuidance } from '@/lib/api/execute'
import { useChatState } from './useChatState'

// Map file extension to viewer content type (hoisted to module scope)
const EXT_TO_VIEWER: Record<string, ViewerContentType> = {
  html: 'html', htm: 'html',
  pdf: 'pdf',
  md: 'markdown', mdx: 'markdown',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', svg: 'image', webp: 'image',
  csv: 'csv',
  ts: 'code', tsx: 'code', js: 'code', jsx: 'code', py: 'code', rb: 'code',
  go: 'code', rs: 'code', java: 'code', css: 'code', scss: 'code',
  json: 'code', yaml: 'code', yml: 'code', sql: 'code', sh: 'code',
}
function extToViewerType(ext: string): ViewerContentType {
  return EXT_TO_VIEWER[ext] ?? 'text'
}

// Top-level component rendered inside AppSidebar via the slot system.
// Reads from a ref (latest data) and uses useState for forceUpdate.
// Defined at module scope so React treats it as a proper component (hooks are legal).
interface SidebarPropsRef {
  projects: import('./types').ProjectGroup[]
  conversationId: string | null
  selectedChannel?: import('./types').SelectedChannel | null
  isLoading: boolean
  handleSelectConversation: (id: string) => void
  handleNewConversation: () => void
  handleDeleteConversation: (id: string) => void
  handleSelectChannel: (ch: import('./types').SelectedChannel) => void
  handleClearChannel: () => void
}

function ChatSidebarSlotComponent({ propsRef, forceUpdateRef }: {
  propsRef: React.RefObject<SidebarPropsRef>
  forceUpdateRef: React.MutableRefObject<() => void>
}) {
  const [, setTick] = useState(0)
  forceUpdateRef.current = () => setTick(t => t + 1)
  const p = propsRef.current!
  return (
    <ConversationSidebar
      projects={p.projects}
      currentConversationId={p.conversationId}
      onSelectConversation={p.handleSelectConversation}
      onNewConversation={p.handleNewConversation}
      onDeleteConversation={p.handleDeleteConversation}
      isCollapsed={false}
      isLoading={p.isLoading}
      selectedChannel={p.selectedChannel}
      onSelectChannel={p.handleSelectChannel}
      onClearChannel={p.handleClearChannel}
    />
  )
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
  const chat = useChatState({ initialAgentId, conversationId, initialMessage })
  const { state, agents, user, isAuthReady, executionStream, workspaceFiles } = chat

  // ---- Local UI state (sandbox, viewer, panels) ----
  const [viewerContent, setViewerContent] = useState<ViewerContent | null>(null)
  const [showExecution, setShowExecution] = useState<string | null>(null)
  const [browserUrl, setBrowserUrl] = useState<string | null>(null)
  const [isBrowserLoading, setIsBrowserLoading] = useState(false)
  const [terminalUrl, setTerminalUrl] = useState<string | null>(null)
  const [isTerminalLoading, setIsTerminalLoading] = useState(false)
  const [sandboxTab, setSandboxTab] = useState<SandboxTab>('terminal')
  const [isWorkspaceCollapsed, setIsWorkspaceCollapsed] = useState(true)

  // ---- Tool auth (Pipedream OAuth) ----
  const handleToolAuthConnect = useCallback((appSlug: string) => {
    try {
      const pipedreamClient = getSharedPipedreamClient()
      pipedreamClient.connectAccount({
        app: appSlug,
        onSuccess: () => {
          chat.handleDismissToolAuth()
          toast.success('App connected', { description: 'Your agent can now use this app.' })
          document.querySelectorAll('iframe[id^="pipedream-connect-iframe-"]').forEach(el => el.remove())
        },
        onError: (err) => {
          toast.error("Connection failed", { description: 'Please close and try again.' })
          document.querySelectorAll('iframe[id^="pipedream-connect-iframe-"]').forEach(el => el.remove())
        },
        onClose: () => {
          document.querySelectorAll('iframe[id^="pipedream-connect-iframe-"]').forEach(el => el.remove())
        },
      })
    } catch (err) {
      toast.error("Couldn't connect the app", { description: 'Please try again or check your permissions.' })
    }
  }, [chat])

  // ---- HITL guidance ----
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
      chat.setState((prev) => ({ ...prev, pendingGuidance: null }))
    } catch (err) {
      toast.error("Your response wasn't sent", { description: 'The agent may have moved on. Try sending a new message.' })
    } finally {
      guidanceSubmittingRef.current = false
    }
  }, [state.pendingGuidance, chat])

  // ---- Viewer / Workspace ----
  const handleOpenViewer = useCallback((payload: WorkspacePayload) => {
    if (payload.type === 'plan') {
      setViewerContent({ type: 'plan', title: payload.title, content: payload.content })
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

  // ---- Sandbox ----
  const handleOpenBrowser = useCallback(async () => {
    if (browserUrl || isBrowserLoading) return
    setSandboxTab('browser')
    setIsBrowserLoading(true)
    try {
      const result = await startBrowser()
      setBrowserUrl(result.novnc_url)
    } catch (err) {
      toast.error("Couldn't open the browser preview", { description: 'Your workspace may still be starting up.' })
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
      toast.error("Couldn't open the terminal", { description: 'Your workspace may still be starting up.' })
    } finally {
      setIsTerminalLoading(false)
    }
  }, [terminalUrl, isTerminalLoading])

  const handleCloseSandboxPanel = useCallback(() => {
    setBrowserUrl(null)
    setTerminalUrl(null)
  }, [])

  // ---- Sidebar slot ----
  // The slot system renders a stable component ref inside AppSidebar.
  // To avoid infinite re-render loops, the slot component is stable (useCallback []).
  // Data is passed via ref + a forceUpdate callback so the sidebar re-renders
  // when conversations load WITHOUT triggering context cascades.
  const sidebarPropsRef = useRef({
    projects: chat.projects,
    conversationId: state.conversationId,
    selectedChannel: state.selectedChannel,
    isLoading: chat.isLoadingAgents,
    handleSelectConversation: chat.handleSelectConversation,
    handleNewConversation: chat.handleNewConversation,
    handleDeleteConversation: chat.handleDeleteConversation,
    handleSelectChannel: chat.handleSelectChannel,
    handleClearChannel: chat.handleClearChannel,
  })
  sidebarPropsRef.current = {
    projects: chat.projects,
    conversationId: state.conversationId,
    selectedChannel: state.selectedChannel,
    isLoading: chat.isLoadingAgents,
    handleSelectConversation: chat.handleSelectConversation,
    handleNewConversation: chat.handleNewConversation,
    handleDeleteConversation: chat.handleDeleteConversation,
    handleSelectChannel: chat.handleSelectChannel,
    handleClearChannel: chat.handleClearChannel,
  }

  // forceUpdate ref: ChatSidebarSlotComponent stores its updater here on mount.
  // ChatContainer calls it when sidebar-relevant data changes.
  const sidebarForceUpdateRef = useRef<() => void>(() => {})

  // Stable slot component — registered once, re-renders via forceUpdate ref
  const ChatSidebarSlot = useRef(() => (
    <ChatSidebarSlotComponent propsRef={sidebarPropsRef} forceUpdateRef={sidebarForceUpdateRef} />
  )).current

  // Poke sidebar to re-render when data changes (ref was updated above)
  useEffect(() => {
    sidebarForceUpdateRef.current()
  }, [chat.projects, state.conversationId, state.selectedChannel, chat.isLoadingAgents])

  useSidebarSlotRegister('chat-sidebar', ChatSidebarSlot)

  // ---- Auth gate ----
  if (!isAuthReady) {
    return <XerusLoader variant="inline" className="h-full bg-surface" />
  }

  const isSandboxOpen = !!(terminalUrl || browserUrl)
  const agentSlug = state.currentAgent?.slug ?? null

  return (
    <div className={cn('flex w-full relative h-screen overflow-hidden', className)}>
      <PanelGroup orientation="horizontal" className="flex-1 min-w-0">
        {/* Chat column */}
        <Panel defaultSize={isSandboxOpen ? 50 : 100} minSize={30}>
          <div className="flex flex-col h-full relative overflow-hidden">
            <MessageList
              messages={state.messages as ChatMessageExtended[]}
              currentAgent={state.currentAgent}
              isLoading={state.isLoading}
              streamingTurn={state.streamingTurn}
              executionState={state.executionState}
              className="flex-1"
              onViewExecution={setShowExecution}
              onSuggestionClick={chat.sendMessage}
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
                  onClick={chat.handleDismissToolAuth}
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
              onSendMessage={chat.sendMessage}
              disabled={state.isLoading}
              placeholder={
                state.currentAgent
                  ? `Ask ${state.currentAgent.name} anything...`
                  : 'Message Xerus...'
              }
              agents={agents}
              selectedAgent={state.currentAgent}
              onAgentChange={chat.handleAgentChange}
              onOpenTerminal={handleOpenTerminal}
              isTerminalLoading={isTerminalLoading}
              isTerminalOpen={!!terminalUrl}
              onOpenBrowser={handleOpenBrowser}
              isBrowserLoading={isBrowserLoading}
              isBrowserOpen={!!browserUrl}
            />
          </div>
        </Panel>

        {/* Sandbox panel */}
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

        {/* Artifact viewer */}
        {!isSandboxOpen && viewerContent && (
          <>
            <PanelResizeHandle className="w-2 flex items-center justify-center cursor-col-resize group shrink-0">
              <div className="w-px h-8 rounded-full bg-[#E5E5E5] group-hover:bg-[#FF6600]/50 group-hover:h-16 transition-all" />
            </PanelResizeHandle>
            <Panel defaultSize={40} minSize={20}>
              <ArtifactViewerPanel
                content={viewerContent}
                onClose={() => setViewerContent(null)}
              />
            </Panel>
          </>
        )}

        {/* Right panel (workspace + agent info) */}
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

      {/* Execution detail slide-over */}
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
