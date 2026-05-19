'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'
import { DeliverableChips } from './DeliverableChips'
import { TaskDock } from './TaskDock'
import { useSandboxPanel } from './useSandboxPanel'
import { SubagentWorkPanel } from './SubagentWorkPanel'
const ArtifactViewerPanel = dynamic(() =>
  import('./ArtifactViewerPanel').then((m) => ({ default: m.ArtifactViewerPanel })),
)
const SandboxPanel = dynamic(() =>
  import('./SandboxPanel').then((m) => ({ default: m.SandboxPanel })),
)
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels'
import { GuidanceInterventionCard } from './GuidanceInterventionCard'
import { useChatSidebar } from './ChatSidebarSlot'
import { useLayout } from '@/components/layout/LayoutContext'
import { cn } from '@/lib/utils'
import type { WorkspacePayload } from './MessageBubble'
import type { ChatMessageExtended } from './chat-message.types'
import { mapStreamEventsToExecution } from './mapStreamToExecutionEvents'
import { useArtifactTabs } from '@/hooks/useArtifactTabs'

const ExecutionDetail = dynamic(() => import('@/components/execution').then((m) => ({ default: m.ExecutionDetail })))
import { PendingMessagesQueue } from './PendingMessagesQueue'
import { toast } from '@/lib/toast'
import { XerusLoader } from '@/components/common/XerusLoader'
import { useChatState } from './useChatState'
import { useChatHandlers } from './useChatHandlers'
import { useArtifactAutoOpen } from './useArtifactAutoOpen'

const RESIZE_HANDLE_CLASS = 'w-2 flex items-center justify-center cursor-col-resize group shrink-0'
function ResizeDivider() {
  return (
    <PanelResizeHandle className={RESIZE_HANDLE_CLASS}>
      <div className="w-px h-8 rounded-full bg-[#E5E5E5] group-hover:bg-primary/50 group-hover:h-16 transition-all" />
    </PanelResizeHandle>
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
  const { state, activeExec, agents, user, isAuthReady, executionStream } = chat
  const { isMobile } = useLayout()
  const artifacts = useArtifactTabs()
  const sandbox = useSandboxPanel()
  const [showExecution, setShowExecution] = useState<string | null>(null)
  const [timelinePinned, setTimelinePinned] = useState(false)
  const timelineAutoCloseRef = useRef<ReturnType<typeof setTimeout>>()

  const taskDockTasks = useMemo(() =>
    (state.backgroundTasks ?? []).map(t => ({
      id: t.id,
      name: t.name,
      description: t.description ?? '',
      status: t.status,
      startTime: t.startedAt,
      durationMs: undefined as number | undefined,
    })),
    [state.backgroundTasks],
  )
  const taskDockActiveCount = taskDockTasks.filter(t => t.status === 'running').length
  const [taskDockCollapsed, setTaskDockCollapsed] = useState(false)
  const taskDockVisible = taskDockTasks.length > 0
  const taskDockHideTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const [taskDockHidden, setTaskDockHidden] = useState(false)
  const [taskDockFading, setTaskDockFading] = useState(false)

  useEffect(() => {
    if (taskDockActiveCount > 0) {
      setTaskDockHidden(false)
      setTaskDockFading(false)
      if (taskDockHideTimerRef.current) clearTimeout(taskDockHideTimerRef.current)
    } else if (taskDockTasks.length > 0) {
      taskDockHideTimerRef.current = setTimeout(() => {
        setTaskDockFading(true)
        setTimeout(() => setTaskDockHidden(true), 300)
      }, 3000)
    }
    return () => { if (taskDockHideTimerRef.current) clearTimeout(taskDockHideTimerRef.current) }
  }, [taskDockActiveCount, taskDockTasks.length])

  const subagentSteps = useMemo(() =>
    (activeExec.executionState?.steps ?? []).filter(
      s => s.id.startsWith('subagent-') || s.id.startsWith('delegation-'),
    ),
    [activeExec.executionState?.steps],
  )
  const hasActiveSubagents = subagentSteps.some(s => s.status === 'active')

  useEffect(() => {
    if (subagentSteps.length > 0 && hasActiveSubagents) {
      if (timelineAutoCloseRef.current) clearTimeout(timelineAutoCloseRef.current)
    }
    if (subagentSteps.length > 0 && !hasActiveSubagents && !timelinePinned) {
      timelineAutoCloseRef.current = setTimeout(() => setTimelinePinned(false), 3000)
    }
    return () => { if (timelineAutoCloseRef.current) clearTimeout(timelineAutoCloseRef.current) }
  }, [subagentSteps.length, hasActiveSubagents, timelinePinned])
  const { handleToolAuthConnect, handleGuidanceRespond } = useChatHandlers({
    state,
    dispatch: chat.dispatch,
    handleDismissToolAuth: chat.handleDismissToolAuth,
  })

  useArtifactAutoOpen({
    pendingArtifactFile: state.pendingArtifactFile,
    pendingPreview: state.pendingPreview,
    pendingGuidancePreviewUrl: state.pendingGuidance?.preview_url,
    artifacts,
  })

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

  useChatSidebar(
    {
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
    },
    [chat.projects, state.conversationId, state.selectedChannel, chat.isLoadingAgents, state.hasMoreConversations, chat.isLoadingMore],
  )

  if (!isAuthReady) {
    return <XerusLoader variant="inline" className="h-full bg-surface" />
  }

  type RightPanelMode = 'sandbox' | 'artifact' | 'timeline' | null
  const showTimeline = subagentSteps.length > 0 && (hasActiveSubagents || timelinePinned)
  const rightPanel: RightPanelMode = (sandbox.terminalUrl || sandbox.browserUrl)
    ? 'sandbox'
    : artifacts.tabs.length > 0
      ? 'artifact'
      : showTimeline
        ? 'timeline'
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
              onStopAll={chat.handleStopExecution}
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
                onSendMessage={chat.sendMessage}
              />
            )}

            <DeliverableChips
              currentAgent={state.currentAgent}
              onSelect={handleOpenDeliverable}
            />

            {taskDockVisible && !taskDockHidden && (
              <div className={cn('w-full max-w-3xl mx-auto px-4 transition-opacity duration-300', taskDockFading && 'opacity-0')}>
                <TaskDock
                  tasks={taskDockTasks}
                  activeCount={taskDockActiveCount}
                  isCollapsed={taskDockCollapsed}
                  onCollapse={() => setTaskDockCollapsed(true)}
                  onExpand={() => setTaskDockCollapsed(false)}
                  onDismiss={() => setTaskDockHidden(true)}
                />
              </div>
            )}
            <PendingMessagesQueue
              messages={activeExec.pendingMessages}
              onCancel={chat.handleCancelQueuedMessage}
            />
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

        {rightPanel === 'sandbox' && !isMobile && (
          <>
            <ResizeDivider />
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
        {rightPanel === 'artifact' && !isMobile && (
          <>
            <ResizeDivider />
            <Panel defaultSize={45} minSize={20}>
              <ArtifactViewerPanel
                tabs={artifacts.tabs}
                activeTabId={artifacts.activeTabId}
                onSelectTab={artifacts.setActiveTabId}
                onCloseTab={artifacts.closeTab}
                onClosePanel={artifacts.closeAll}
                onPublish={handlePublish}
                onOpenInWorkspace={(path) => window.open(`/workspace?file=${encodeURIComponent(path)}`, '_blank')}
                onSendMessage={chat.sendMessage}
              />
            </Panel>
          </>
        )}
        {rightPanel === 'timeline' && !isMobile && (
          <>
            <ResizeDivider />
            <Panel defaultSize={35} minSize={20}>
              <SubagentWorkPanel
                steps={activeExec.executionState?.steps ?? []}
                agents={agents}
                variant="panel"
                onClose={() => setTimelinePinned(false)}
                className="h-full"
              />
            </Panel>
          </>
        )}
      </PanelGroup>
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
            onOpenInWorkspace={(path) => window.open(`/workspace?file=${encodeURIComponent(path)}`, '_blank')}
            onSendMessage={chat.sendMessage}
          />
        </div>
      )}
      {isMobile && rightPanel === 'timeline' && (
        <div className="fixed inset-0 z-50 bg-surface flex flex-col" role="dialog" aria-label="Agent work">
          <SubagentWorkPanel
            steps={activeExec.executionState?.steps ?? []}
            agents={agents}
            variant="panel"
            onClose={() => setTimelinePinned(false)}
            className="h-full"
          />
        </div>
      )}
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
