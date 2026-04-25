'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'
import { DeliverableChips } from './DeliverableChips'
import type { SandboxTab } from './SandboxPanel'

// Heavy panels loaded only when user opens them (bundle-dynamic-imports + bundle-conditional rules)
const ArtifactViewerPanel = dynamic(() =>
  import('./ArtifactViewerPanel').then((m) => ({ default: m.ArtifactViewerPanel })),
)
const SandboxPanel = dynamic(() =>
  import('./SandboxPanel').then((m) => ({ default: m.SandboxPanel })),
)
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels'
import { GuidanceInterventionCard } from './GuidanceInterventionCard'
import { ConversationSidebar } from './ConversationSidebar'
import { useSidebarSlotRegister } from '@/components/layout/SidebarSlotContext'
import { useLayout } from '@/components/layout/LayoutContext'
import { cn } from '@/lib/utils'
import type { WorkspacePayload } from './MessageBubble'
import type { ChatMessageExtended } from './chat-message.types'
import { mapStreamEventsToExecution } from './mapStreamToExecutionEvents'
import { useArtifactTabs } from '@/hooks/useArtifactTabs'

const ExecutionDetail = dynamic(() => import('@/components/execution').then((m) => ({ default: m.ExecutionDetail })))
import { toast } from '@/lib/toast'
import { XerusLoader } from '@/components/common/XerusLoader'
import { startBrowser, startTerminal } from '@/lib/api/workspace'
import { getSharedPipedreamClient } from '@/lib/pipedream-client'
import { respondToGuidance } from '@/lib/api/execute'
import { useChatState } from './useChatState'

// Top-level component rendered inside AppSidebar via the slot system.
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
  forceUpdateRef.current = () => setTick((t) => t + 1)
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
  const { state, agents, user, isAuthReady, executionStream } = chat
  const { isMobile } = useLayout()

  // ---- Artifact tabs (multi-tab viewer) ----
  const artifacts = useArtifactTabs()

  // ---- Sandbox panel (terminal + browser) ----
  const [showExecution, setShowExecution] = useState<string | null>(null)
  const [browserUrl, setBrowserUrl] = useState<string | null>(null)
  const [isBrowserLoading, setIsBrowserLoading] = useState(false)
  const [terminalUrl, setTerminalUrl] = useState<string | null>(null)
  const [isTerminalLoading, setIsTerminalLoading] = useState(false)
  const [sandboxTab, setSandboxTab] = useState<SandboxTab>('terminal')

  // ---- Tool auth (Pipedream OAuth) ----
  const handleToolAuthConnect = useCallback((appSlug: string) => {
    try {
      const pipedreamClient = getSharedPipedreamClient()
      pipedreamClient.connectAccount({
        app: appSlug,
        onSuccess: () => {
          chat.handleDismissToolAuth()
          toast.success('App connected', { description: 'Your agent can now use this app.' })
          document.querySelectorAll('iframe[id^="pipedream-connect-iframe-"]').forEach((el) => el.remove())
        },
        onError: () => {
          toast.error("Connection failed", { description: 'Please close and try again.' })
          document.querySelectorAll('iframe[id^="pipedream-connect-iframe-"]').forEach((el) => el.remove())
        },
        onClose: () => {
          document.querySelectorAll('iframe[id^="pipedream-connect-iframe-"]').forEach((el) => el.remove())
        },
      })
    } catch {
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
    } catch {
      toast.error("Your response wasn't sent", { description: 'The agent may have moved on. Try sending a new message.' })
    } finally {
      guidanceSubmittingRef.current = false
    }
  }, [state.pendingGuidance, chat])

  // ---- Promote agent-emitted preview URLs into a Preview artifact tab.
  // Two channels feed this:
  //   - HITL guidance with preview_url (transient, only while paused).
  //   - Standalone 'preview' SSE events from the runner (persistent dev server signal).
  // Either path opens or refreshes the relevant tab without disturbing other artifacts.
  const lastHitlPreviewRef = useRef<string | null>(null)
  useEffect(() => {
    const url = state.pendingGuidance?.preview_url
    if (!url || url === lastHitlPreviewRef.current) return
    lastHitlPreviewRef.current = url
    artifacts.openPreview(url)
  }, [state.pendingGuidance?.preview_url, artifacts])

  const lastSsePreviewTsRef = useRef<number | null>(null)
  useEffect(() => {
    const preview = state.pendingPreview
    if (!preview || preview.ts === lastSsePreviewTsRef.current) return
    lastSsePreviewTsRef.current = preview.ts
    artifacts.openPreview(preview.url, preview.label, preview.port)
  }, [state.pendingPreview, artifacts])

  // ---- Artifact open handlers ----
  const handleOpenWorkspacePayload = useCallback(
    (payload: WorkspacePayload) => {
      if (payload.type === 'plan') {
        artifacts.openPlan({ title: payload.title, content: payload.content })
      } else {
        artifacts.openArtifact(payload.artifact)
      }
    },
    [artifacts],
  )

  const handleOpenDeliverable = useCallback(
    (input: { name: string; path: string; extension?: string }) => {
      void artifacts.openFile(input)
    },
    [artifacts],
  )

  const handlePublish = useCallback(() => {
    toast.success('Publish coming soon', {
      description: 'Sharing artifacts externally will be available in a future release.',
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
    } catch {
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
    } catch {
      toast.error("Couldn't open the terminal", { description: 'Your workspace may still be starting up.' })
    } finally {
      setIsTerminalLoading(false)
    }
  }, [terminalUrl, isTerminalLoading])

  const handleCloseSandboxPanel = useCallback(() => {
    setBrowserUrl(null)
    setTerminalUrl(null)
  }, [])

  // ---- Sidebar slot registration ----
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

  const sidebarForceUpdateRef = useRef<() => void>(() => {})
  const ChatSidebarSlot = useRef(() => (
    <ChatSidebarSlotComponent propsRef={sidebarPropsRef} forceUpdateRef={sidebarForceUpdateRef} />
  )).current

  useEffect(() => {
    sidebarForceUpdateRef.current()
  }, [chat.projects, state.conversationId, state.selectedChannel, chat.isLoadingAgents])

  useSidebarSlotRegister('chat-sidebar', ChatSidebarSlot)

  if (!isAuthReady) {
    return <XerusLoader variant="inline" className="h-full bg-surface" />
  }

  const isSandboxOpen = !!(terminalUrl || browserUrl)
  const hasArtifacts = artifacts.tabs.length > 0
  const showArtifactPanel = hasArtifacts && !isSandboxOpen

  return (
    <div className={cn('flex w-full relative h-screen overflow-hidden', className)}>
      <PanelGroup orientation="horizontal" className="flex-1 min-w-0">
        {/* Chat column */}
        <Panel defaultSize={isSandboxOpen ? 50 : showArtifactPanel ? 55 : 100} minSize={30}>
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
              onOpenWorkspace={handleOpenWorkspacePayload}
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

            <DeliverableChips
              currentAgent={state.currentAgent}
              onSelect={handleOpenDeliverable}
            />

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

        {/* Sandbox panel — terminal/browser, side-by-side on md+ */}
        {isSandboxOpen && !isMobile && (
          <>
            <PanelResizeHandle className="w-2 flex items-center justify-center cursor-col-resize group shrink-0">
              <div className="w-px h-8 rounded-full bg-[#E5E5E5] group-hover:bg-primary/50 group-hover:h-16 transition-all" />
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

        {/* Artifact viewer — multi-tab; hidden when sandbox is open */}
        {showArtifactPanel && !isMobile && (
          <>
            <PanelResizeHandle className="w-2 flex items-center justify-center cursor-col-resize group shrink-0">
              <div className="w-px h-8 rounded-full bg-[#E5E5E5] group-hover:bg-primary/50 group-hover:h-16 transition-all" />
            </PanelResizeHandle>
            <Panel defaultSize={45} minSize={20}>
              <ArtifactViewerPanel
                tabs={artifacts.tabs}
                activeTabId={artifacts.activeTabId}
                onSelectTab={artifacts.setActiveTabId}
                onCloseTab={artifacts.closeTab}
                onClosePanel={artifacts.closeAll}
                onPublish={handlePublish}
              />
            </Panel>
          </>
        )}
      </PanelGroup>

      {/* Mobile full-screen overlays */}
      {isMobile && isSandboxOpen && (
        <div className="fixed inset-0 z-50 bg-surface flex flex-col" role="dialog" aria-label="Sandbox">
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
        </div>
      )}

      {isMobile && !isSandboxOpen && hasArtifacts && (
        <div className="fixed inset-0 z-50 bg-surface flex flex-col" role="dialog" aria-label="Artifact viewer">
          <ArtifactViewerPanel
            tabs={artifacts.tabs}
            activeTabId={artifacts.activeTabId}
            onSelectTab={artifacts.setActiveTabId}
            onCloseTab={artifacts.closeTab}
            onClosePanel={artifacts.closeAll}
            onPublish={handlePublish}
          />
        </div>
      )}

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
