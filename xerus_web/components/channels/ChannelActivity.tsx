'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { XerusLoader } from '@/components/common/XerusLoader'
import { cn } from '@/lib/utils'
import { SystemEvent } from './SystemEvent'
import { CoordinationGroup } from './CoordinationGroup'
import { PostMessage, EscalationMessage, CoordinationMessage } from './activity-messages'
import { MentionInput } from './MentionInput'
import { ExecutionDetail } from './ExecutionDetail'
import { useChannelMessages } from '@/hooks/useChannelData'
import { getAssistants } from '@/lib/api/agents'
import type { Agent } from '@/components/common/PresenceAvatars'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChannelMessage {
  id: string
  channel_id: string
  sender_type: 'agent' | 'human' | 'system'
  sender_slug: string
  content: string
  message_type: 'post' | 'coordination' | 'system'
  metadata?: Record<string, unknown>
  created_at: string
}

interface ChannelActivityProps {
  channelId: string
  className?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateSeparator(dateString: string): string {
  const date = new Date(dateString)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  if (date.toDateString() === today.toDateString()) return 'Today'
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })
}

function getDateKey(dateString: string): string {
  return new Date(dateString).toDateString()
}

type MessageGroup =
  | { kind: 'post'; message: ChannelMessage }
  | { kind: 'coordination_single'; message: ChannelMessage }
  | { kind: 'coordination_group'; messages: ChannelMessage[] }
  | { kind: 'system'; message: ChannelMessage }
  | { kind: 'date_separator'; date: string }

function groupMessages(messages: ChannelMessage[]): MessageGroup[] {
  const groups: MessageGroup[] = []
  let prevDateKey = ''

  let i = 0
  while (i < messages.length) {
    const msg = messages[i]
    const dateKey = getDateKey(msg.created_at)

    if (dateKey !== prevDateKey) {
      groups.push({ kind: 'date_separator', date: msg.created_at })
      prevDateKey = dateKey
    }

    if (msg.message_type === 'system') {
      groups.push({ kind: 'system', message: msg })
      i++
      continue
    }

    if (msg.message_type === 'coordination') {
      const batch: ChannelMessage[] = [msg]
      let j = i + 1
      while (
        j < messages.length &&
        messages[j].message_type === 'coordination' &&
        getDateKey(messages[j].created_at) === dateKey
      ) {
        batch.push(messages[j])
        j++
      }

      if (batch.length >= 5) {
        groups.push({ kind: 'coordination_group', messages: batch })
      } else {
        for (const coordMsg of batch) {
          groups.push({ kind: 'coordination_single', message: coordMsg })
        }
      }
      i = j
      continue
    }

    groups.push({ kind: 'post', message: msg })
    i++
  }

  return groups
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ChannelActivity({ channelId, className }: ChannelActivityProps) {
  const { messages, isLoading, error, sendMessage } = useChannelMessages(channelId)
  const [viewingExecution, setViewingExecution] = useState<string | null>(null)
  const [channelAgents, setChannelAgents] = useState<Agent[]>([])

  const [agentError, setAgentError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setAgentError(null)
    getAssistants({ limit: 50 })
      .then((result) => {
        if (cancelled) return
        setChannelAgents(
          result.agents.map((a) => ({
            id: String(a.id),
            name: a.name,
            slug: a.slug ?? a.name.toLowerCase().replace(/\s+/g, '-'),
            avatar_url: a.avatarUrl ?? undefined,
            status: a.status === 'active' ? 'active' : 'idle',
          }))
        )
      })
      .catch((err) => {
        if (cancelled) return
        console.error('Failed to load channel agents:', err)
        setAgentError('Failed to load agents for this channel')
      })
    return () => { cancelled = true }
  }, [channelId])

  const grouped = useMemo(() => groupMessages(messages), [messages])

  const handleViewWork = useCallback((executionId: string) => {
    setViewingExecution(executionId)
  }, [])

  const handleSend = useCallback(
    (content: string) => {
      sendMessage(content)
    },
    [sendMessage]
  )

  if (isLoading) {
    return (
      <div className={cn('flex flex-col h-full', className)}>
        <XerusLoader variant="inline" />
      </div>
    )
  }

  if (error) {
    return (
      <div className={cn('flex flex-col h-full items-center justify-center', className)}>
        <p className="text-sm text-text-secondary">{error}</p>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {agentError && (
        <div className="px-4 py-2">
          <p className="text-xs text-red-500">{agentError}</p>
        </div>
      )}
      <ScrollArea className="flex-1">
        <div className="px-4 py-2 space-y-1">
          {grouped.map((group, index) => {
            switch (group.kind) {
              case 'date_separator':
                return (
                  <div
                    key={`sep-${index}`}
                    className="flex items-center gap-3 py-3"
                    role="separator"
                    aria-label={formatDateSeparator(group.date)}
                  >
                    <div className="flex-1 h-px bg-surface-active" />
                    <span className="text-xs font-medium text-text-muted">
                      {formatDateSeparator(group.date)}
                    </span>
                    <div className="flex-1 h-px bg-surface-active" />
                  </div>
                )

              case 'system':
                return (
                  <SystemEvent
                    key={group.message.id}
                    content={group.message.content}
                    timestamp={group.message.created_at}
                  />
                )

              case 'post': {
                const isEscalation =
                  group.message.metadata?.requires_approval === true
                if (isEscalation) {
                  return (
                    <EscalationMessage
                      key={group.message.id}
                      message={group.message}
                    />
                  )
                }
                return (
                  <PostMessage
                    key={group.message.id}
                    message={group.message}
                    onViewWork={handleViewWork}
                  />
                )
              }

              case 'coordination_single':
                return (
                  <CoordinationMessage
                    key={group.message.id}
                    message={group.message}
                  />
                )

              case 'coordination_group':
                return (
                  <CoordinationGroup
                    key={`cg-${group.messages[0].id}`}
                    messages={group.messages}
                  />
                )
            }
          })}
        </div>
      </ScrollArea>

      {/* Message input with @mention support */}
      <MentionInput
        agents={channelAgents}
        onSend={handleSend}
        placeholder="Message this channel..."
      />

      {/* Execution detail slide-over */}
      <ExecutionDetail
        executionId={viewingExecution}
        open={viewingExecution !== null}
        onClose={() => setViewingExecution(null)}
      />
    </div>
  )
}
