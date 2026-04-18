'use client'

import { useEffect, useRef } from 'react'
import { MessageBubble } from './MessageBubble'
import { ChatWelcome } from './ChatWelcome'
import { ThinkingIndicator } from './ThinkingIndicator'
import { XERUS_AGENT } from './AgentDropdown'
import { cn } from '@/lib/utils'
import { Agent, ExecutionState } from './types'
import type { ChatMessageExtended } from './chat-message.types'
import type { StreamingAssistantTurn } from './streaming-turn.types'
import type { WorkspacePayload } from './MessageBubble'
import { isMascotConfig } from '@/lib/mascot-config'
import { MascotAvatar } from '@/components/agents/MascotAvatar'

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

export function MessageList({
  messages,
  currentAgent,
  isLoading = false,
  streamingTurn,
  executionState,
  className,
  onViewExecution,
  onSuggestionClick,
  onOpenWorkspace,
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
              <MessageBubble
                key={message.id}
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
            )
          })}
        </div>

        {/* Thinking indicator — show while waiting for first token. Prefer the
            delegated subagent (from executionState) over currentAgent so the avatar
            matches the agent actually working. */}
        {isLoading && !streamingTurn && (() => {
          const delegatedSlug = executionState?.agents?.[executionState.agents.length - 1]
          const thinkingAgent =
            (delegatedSlug && agents?.find((a) => a.slug === delegatedSlug || a.name === delegatedSlug)) ||
            currentAgent ||
            XERUS_AGENT
          return (
            <div className="px-6 py-5">
              <div className="flex items-start gap-3">
                {/* Agent avatar */}
                <div className="h-9 w-9 shrink-0 mt-0.5 rounded-full overflow-hidden flex items-center justify-center">
                  <AgentAvatarIcon agent={thinkingAgent} size={36} />
                </div>

                <div className="flex-1 min-w-0">
                  <span className="text-base font-semibold text-secondary block">
                    {thinkingAgent.name}
                  </span>
                  <ThinkingIndicator executionState={executionState} />
                </div>
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
