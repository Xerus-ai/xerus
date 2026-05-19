'use client'

import { useEffect, useRef, memo } from 'react'
import { MessageBubble } from './MessageBubble'
import { ChatWelcome } from './ChatWelcome'
import { RichThinkingIndicator } from './RichThinkingIndicator'
import { XERUS_AGENT } from './AgentDropdown'
import { cn } from '@/lib/utils'
import { Agent, ExecutionState } from './types'
import type { ChatMessageExtended } from './chat-message.types'
import type { StreamingAssistantTurn } from './streaming-turn.types'
import type { WorkspacePayload } from './MessageBubble'
import { isMascotConfig } from '@/lib/mascot-config'
import { MascotAvatar } from '@/components/agents/MascotAvatar'
import { InlineProgressChecklist } from './InlineProgressChecklist'

interface MessageListProps {
  messages: ChatMessageExtended[]
  currentAgent?: Agent | null
  isLoading?: boolean
  streamingTurn?: StreamingAssistantTurn | null
  executionState?: ExecutionState | null
  className?: string
  onViewExecution?: (messageId: string) => void
  onSuggestionClick?: (text: string) => void
  onOpenWorkspace?: (payload: WorkspacePayload) => void
  onStopAll?: () => void
  userName?: string
  agents?: Agent[]
}

// Render agent avatar inline: mascot config > letter fallback
function AgentAvatarIcon({ agent, size = 28 }: { agent: Agent; size?: number }) {
  const avatarUrl = agent.avatarUrl
  if (isMascotConfig(avatarUrl)) {
    return <MascotAvatar config={avatarUrl!} size={size} className="w-full h-full" alt={agent.name} />
  }
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatarUrl} alt={agent.name} className="w-full h-full object-cover rounded-full" loading="lazy" />
  }
  return (
    <span className="w-full h-full flex items-center justify-center bg-secondary/10 text-secondary text-[10px] font-semibold rounded-full">
      {agent.name.substring(0, 2).toUpperCase()}
    </span>
  )
}

function MessageListComponent({
  messages,
  currentAgent,
  isLoading = false,
  streamingTurn,
  executionState,
  className,
  onViewExecution,
  onSuggestionClick,
  onOpenWorkspace,
  onStopAll,
  userName,
  agents,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new messages or streaming updates
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingTurn])

  // Combine messages with streaming turn
  const allMessages: ChatMessageExtended[] = [...messages]
  if (streamingTurn) {
    allMessages.push({
      id: streamingTurn.id,
      role: 'assistant',
      content: '',
      agentSlug: streamingTurn.agentSlug,
      agentName: streamingTurn.agentName,
      timestamp: streamingTurn.timestamp,
      isStreaming: true,
      parts: streamingTurn.parts,
    })
  }

  // Empty state - welcome screen
  if (allMessages.length === 0 && !isLoading) {
    return (
      <div className={cn('flex-1 overflow-y-auto scrollbar-thin', className)}>
        <ChatWelcome
          currentAgent={currentAgent}
          userName={userName}
          onSuggestionClick={onSuggestionClick}
          agents={agents}
        />
      </div>
    )
  }

  return (
    <div data-testid="message-list" className={cn('flex-1 overflow-y-auto scrollbar-thin [contain:layout_style]', className)}>
      <div className="max-w-3xl mx-auto pb-4 animate-[fadeInUp_0.4s_ease-out]">
        {/* Messages — pass currentAgent only as hint for messages without their own
            agentSlug; MessageBubble prefers per-message agent resolution to preserve
            identity across delegation (Consistency is the UX). */}
        <div className="divide-y divide-surface-active/50">
          {allMessages.map((message) => {
            const messageHasIdentity = !!(message.agentSlug || message.agentName)
            return (
              <div
                key={message.id}
                style={{ contentVisibility: 'auto', containIntrinsicSize: '0 200px' }}
              >
                <MessageBubble
                  message={message}
                  agent={
                    message.role === 'assistant' && !messageHasIdentity && currentAgent
                      ? currentAgent
                      : null
                  }
                  agents={agents}
                  isStreaming={message.isStreaming}
                  onViewExecution={onViewExecution}
                  onOpenWorkspace={onOpenWorkspace}
                />
              </div>
            )
          })}
        </div>

        {/* Inline progress checklist — shows subagent tasks as a todo list below the streaming turn */}
        {executionState?.steps && executionState.steps.length > 0 && streamingTurn && (
          <InlineProgressChecklist
            steps={executionState.steps}
            onStopAll={onStopAll}
          />
        )}

        {/* Thinking indicator — show while waiting for first token.
            Always show the user's selected agent (currentAgent). Delegated
            subagents are visible in the TaskDock instead. */}
        {isLoading && !streamingTurn && (() => {
          const thinkingAgent = currentAgent || XERUS_AGENT
          return (
            <div className="px-6 py-4">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 shrink-0 rounded-lg overflow-hidden flex items-center justify-center">
                  <AgentAvatarIcon agent={thinkingAgent} size={28} />
                </div>
                <span className="text-sm font-medium text-secondary">
                  {thinkingAgent.name}
                </span>
                <RichThinkingIndicator executionState={executionState} />
              </div>
            </div>
          )
        })()}

        {/* Scroll anchor */}
        <div ref={bottomRef} className="h-px" />
      </div>
    </div>
  )
}

export const MessageList = memo(MessageListComponent)
