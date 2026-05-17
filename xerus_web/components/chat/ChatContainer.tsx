'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'
import { DeliverableChips } from './DeliverableChips'
import { TaskDock } from './TaskDock'
import { useTaskDock } from './useTaskDock'
import { INFRA_NOISE } from './useChatExecution.helpers'
import { useSandboxPanel } from './useSandboxPanel'

// Heavy panels loaded only when user opens them (bundle-dynamic-imports + bundle-conditional rules)
const ArtifactViewerPanel = dynamic(() =>
  import('./ArtifactViewerPanel').then((m) => ({ default: m.ArtifactViewerPanel })),
)
const SandboxPanel = dynamic(() =>
  import('./SandboxPanel').then((m) => ({ default: m.SandboxPanel })),
)
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels'
import { GuidanceInterventionCard } from './GuidanceInterventionCard'
import { ChatSidebarSlotComponent, type SidebarPropsRef } from './ChatSidebarSlot'
import { useSidebarSlotRegister } from '@/components/layout/SidebarSlotContext'
import { useLayout } from '@/components/layout/LayoutContext'
import { cn } from '@/lib/utils'
import type { WorkspacePayload } from './MessageBubble'
import type { ChatMessageExtended } from './chat-message.types'
import { mapStreamEventsToExecution } from './mapStreamToExecutionEvents'
import { useArtifactTabs } from '@/hooks/useArtifactTabs'

const ExecutionDetail = dynamic(() => import('@/components/execution').then((m) => ({ default: m.ExecutionDetail })))
import { Loader2, X } from 'lucide-react'
import { toast } from '@/lib/toast'
import { XerusLoader } from '@/components/common/XerusLoader'
import { getSharedPipedreamClient } from '@/lib/pipedream-client'
import { respondToGuidance } from '@/lib/api/execute'
import { useChatState } from './useChatState'

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
  const { state, activeExec, agents, user, isAuthReady, executionStream } = chat
  const { isMobile } = useLayout()

  // ---- Artifact tabs (multi-tab viewer) ----
  const artifacts = useArtifactTabs()

  const sandbox = useSandboxPanel()
  const [showExecution, setShowExecution] = useState<string | null>(null)

  // ---- Task dock (subagent progress) ----
  const taskDock = useTaskDock()

  // Sync delegation tasks to task dock (skip raw infra steps like sandbox/executing)
  useEffect(() => {
    const steps = activeExec.executionState?.steps ?? []
    for (const step of steps) {
      const rawName = step.name ?? ''
      const cleanName = rawName.replace(/^Spawning\s+/i, '').replace(/\s*\(failed\)\s*$/i, '')
      if (INFRA_NOISE.has(cleanName.toLowerCase())) continue
      if (!cleanName) continue
      const meta = step.metadata as Record<string, string> | undefined
      const subtitle = meta?.toAgent ? `@${meta.toAgent}` : ''
      if (step.status === 'active') {
        taskDock.addTask(step.id, cleanName, subtitle)
      } else if (step.status === 'completed') {
        const durationMs = step.endTime && step.startTime ? step.endTime - step.startTime : undefined
        const success = !rawName.includes('failed')
        taskDock.completeTask(step.id, success, durationMs)
      }
    }
  }, [activeExec.executionState?.steps, taskDock])

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
      chat.dispatch({ type: 'SET_PENDING_GUIDANCE', pendingGuidance: null })
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

  // ---- Auto-open artifact panel when agent writes a viewable file.
  const lastArtifactFileTsRef = useRef<number | null>(null)
  useEffect(() => {
    const file = state.pendingArtifactFile
    if (!file || file.ts === lastArtifactFileTsRef.current) return
    lastArtifactFileTsRef.current = file.ts
    void artifacts.openFile({ name: file.name, path: file.path, extension: file.extension })
  }, [state.pendingArtifactFile, artifacts])

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


  // ---- Sidebar slot registration ----
  const sidebarPropsRef = useRef<SidebarPropsRef>({
    projects: chat.projects,
    conversationId: state.conversationId,
    selectedChannel: state.selectedChannel,
    isLoading: chat.isLoadingAgents,
    hasMore: state.hasMoreConversations,
    isLoadingMore: chat.isLoadingMore,
    handleSelectConversation: chat.handleSelectConversation,
    handleNewConversation: chat.handleNewConversation,
    handleDeleteConversation: chat.handleDeleteConversation,
    handleRenameConversation: chat.handleRenameConversation,
    handleSelectChannel: chat.handleSelectChannel,
    handleClearChannel: chat.handleClearChannel,
    handleLoadMore: chat.loadMoreConversations,
  })
  sidebarPropsRef.current = {
    projects: chat.projects,
    conversationId: state.conversationId,
    selectedChannel: state.selectedChannel,
    isLoading: chat.isLoadingAgents,
    hasMore: state.hasMoreConversations,
    isLoadingMore: chat.isLoadingMore,
    handleSelectConversation: chat.handleSelectConversation,
    handleNewConversation: chat.handleNewConversation,
    handleDeleteConversation: chat.handleDeleteConversation,
    handleRenameConversation: chat.handleRenameConversation,
    handleSelectChannel: chat.handleSelectChannel,
    handleClearChannel: chat.handleClearChannel,
    handleLoadMore: chat.loadMoreConversations,
  }

  const sidebarForceUpdateRef = useRef<() => void>(() => {})
  const ChatSidebarSlot = useRef(() => (
    <ChatSidebarSlotComponent propsRef={sidebarPropsRef} forceUpdateRef={sidebarForceUpdateRef} />
  )).current

  useEffect(() => {
    sidebarForceUpdateRef.current()
  }, [chat.projects, state.conversationId, state.selectedChannel, chat.isLoadingAgents, state.hasMoreConversations, chat.isLoadingMore])

  useSidebarSlotRegister('chat-sidebar', ChatSidebarSlot)

  if (!isAuthReady) {
    return <XerusLoader variant="inline" className="h-full bg-surface" />
  }

  type RightPanelMode = 'sandbox' | 'artifact' | null
  const rightPanel: RightPanelMode = (sandbox.terminalUrl || sandbox.browserUrl)
    ? 'sandbox'
    : artifacts.tabs.length > 0
      ? 'artifact'
      : null

  return (
    <div className={cn('flex w-full relative h-screen overflow-hidden', className)}>
      <PanelGroup orientation="horizontal" className="flex-1 min-w-0">
        {/* Chat column */}
        <Panel defaultSize={rightPanel === 'sandbox' ? 50 : rightPanel === 'artifact' ? 55 : 100} minSize={30}>
          <div className="flex flex-col h-full relative overflow-hidden">
            <MessageList
              messages={state.messages as ChatMessageExtended[]}
              currentAgent={state.currentAgent}
              isLoading={activeExec.isLoading}
              streamingTurn={activeExec.streamingTurn}
              executionState={activeExec.executionState}
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

            {taskDock.isVisible && (
              <div className="w-full max-w-3xl mx-auto px-4">
                <TaskDock
                  tasks={taskDock.tasks}
                  activeCount={taskDock.activeCount}
                  isCollapsed={taskDock.isCollapsed}
                  onCollapse={taskDock.collapse}
                  onExpand={taskDock.expand}
                  onDismiss={taskDock.clearTasks}
                />
              </div>
            )}
            {activeExec.pendingMessages.length > 0 && (
              <div className="w-full max-w-3xl mx-auto px-4 pb-2">
                <div className="flex items-center gap-2 px-3 py-2 bg-surface rounded-xl border border-surface-active">
                  <Loader2 className="w-3.5 h-3.5 text-text-muted animate-spin shrink-0" />
                  <span className="text-[11px] text-text-muted shrink-0">{activeExec.pendingMessages.length} queued</span>
                  <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
                    {activeExec.pendingMessages.map((msg, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-surface-hover text-text-secondary"
                      >
                        <span className="truncate max-w-[180px]">{msg}</span>
                        <button
                          type="button"
                          onClick={() => chat.handleCancelQueuedMessage(idx)}
                          className="p-0.5 rounded-full hover:bg-surface-active text-text-muted hover:text-text transition-colors"
                          aria-label="Cancel queued message"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <ChatInput
              onSendMessage={chat.sendMessage}
              disabled={false}
              placeholder={
                state.currentAgent
                  ? `Ask ${state.currentAgent.name} anything...`
                  : 'Message Xerus...'
              }
              agents={agents}
              selectedAgent={state.currentAgent}
              onAgentChange={chat.handleAgentChange}
              onOpenTerminal={sandbox.openTerminal}
              isTerminalLoading={sandbox.isTerminalLoading}
              isTerminalOpen={!!sandbox.terminalUrl}
              onOpenBrowser={sandbox.openBrowser}
              isBrowserLoading={sandbox.isBrowserLoading}
              isBrowserOpen={!!sandbox.browserUrl}
              conversationId={conversationId}
              isExecuting={activeExec.isLoading}
              onStop={chat.handleStopExecution}
              tokenUsage={activeExec.tokenUsage}
            />
          </div>
        </Panel>

        {/* Sandbox panel — terminal/browser, side-by-side on md+ */}
        {rightPanel === 'sandbox' && !isMobile && (
          <>
            <PanelResizeHandle className="w-2 flex items-center justify-center cursor-col-resize group shrink-0">
              <div className="w-px h-8 rounded-full bg-[#E5E5E5] group-hover:bg-primary/50 group-hover:h-16 transition-all" />
            </PanelResizeHandle>
            <Panel defaultSize={50} minSize={25}>
              <SandboxPanel
                terminalUrl={sandbox.terminalUrl}
                browserUrl={state.pendingGuidance?.ui_hint === 'browser' && state.pendingGuidance.browser_url
                  ? state.pendingGuidance.browser_url
                  : sandbox.browserUrl}
                previewUrl={null}
                activeTab={sandbox.sandboxTab}
                onTabChange={sandbox.setSandboxTab}
                onClose={sandbox.closePanel}
                className="h-full"
              />
            </Panel>
          </>
        )}

        {/* Artifact viewer — multi-tab; hidden when sandbox is open */}
        {rightPanel === 'artifact' && !isMobile && (
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
      {isMobile && rightPanel === 'sandbox' && (
        <div className="fixed inset-0 z-50 bg-surface flex flex-col" role="dialog" aria-label="Sandbox">
          <SandboxPanel
            terminalUrl={sandbox.terminalUrl}
            browserUrl={state.pendingGuidance?.ui_hint === 'browser' && state.pendingGuidance.browser_url
              ? state.pendingGuidance.browser_url
              : sandbox.browserUrl}
            previewUrl={null}
            activeTab={sandbox.sandboxTab}
            onTabChange={sandbox.setSandboxTab}
            onClose={sandbox.closePanel}
            className="h-full"
          />
        </div>
      )}

      {isMobile && rightPanel === 'artifact' && (
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
