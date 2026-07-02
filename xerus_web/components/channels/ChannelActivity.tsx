'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { XerusLoader } from '@/components/common/XerusLoader'
import { cn } from '@/lib/utils'
import { apiPost } from '@/lib/api/client'
import { toast } from '@/lib/toast'
import { SystemEvent } from './SystemEvent'
import { CoordinationGroup } from './CoordinationGroup'
import { PostMessage, EscalationMessage, CoordinationMessage } from './activity-messages'
import { MentionInput } from './MentionInput'
import { SkillsRibbon } from './SkillsRibbon'
import { ExecutionDetail } from './ExecutionDetail'
import { useChannelMessages, type ChannelExecutionContext } from '@/hooks/useChannelData'
import { getAssistants } from '@/lib/api/agents'
import type { Agent } from '@/components/common/PresenceAvatars'
import type { ChannelAgent } from '@/hooks/useChannelAgents'
import { Users, AlertCircle, RotateCcw } from 'lucide-react'
import { isMascotConfig } from '@/lib/mascot-config'
import { MascotAvatar } from '@/components/agents/MascotAvatar'
import { useExecutionStream } from '@/hooks/useExecutionStream'
import type { DoneEventContent } from '@/hooks/useExecutionStream'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChannelMessage {
  id: string
  channel_id: string
  sender_type: 'agent' | 'human' | 'system'
  sender_slug: string
  sender_name?: string
  content: string
  message_type: 'post' | 'coordination' | 'system'
  metadata?: Record<string, unknown>
  created_at: string
}

interface ChannelActivityProps {
  channelId: string
  className?: string
  assignedAgents?: ChannelAgent[]
  onManageAgents?: () => void
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

interface ExecutionState {
  agentSlug: string
  status: 'connecting' | 'thinking' | 'streaming' | 'tool_call' | 'done' | 'error'
  currentLine: string
  errorMessage?: string
}

export function ChannelActivity({ channelId, className, assignedAgents, onManageAgents }: ChannelActivityProps) {
  const { messages, isLoading, error, sendMessage, refetch } = useChannelMessages(channelId)
  const [viewingExecution, setViewingExecution] = useState<string | null>(null)
  const [channelAgents, setChannelAgents] = useState<Agent[]>([])
  const insertRef = useRef<((text: string) => void) | null>(null)
  const hasAssignedAgents = (assignedAgents?.length ?? 0) > 0

  const [agentError, setAgentError] = useState<string | null>(null)

  // Execution streaming state
  const [execution, setExecution] = useState<ExecutionState | null>(null)
  const executionContextRef = useRef<ChannelExecutionContext | null>(null)
  const lastLineRef = useRef('')

  const { connectStream, close: closeStream } = useExecutionStream({
    onMeta: () => {
      setExecution(prev => prev ? { ...prev, status: 'thinking', currentLine: 'thinking...' } : prev)
    },
    onToken: (evt) => {
      const text = (evt.content as { text?: string })?.text ?? ''
      for (const ch of text) {
        if (ch === '\n') {
          lastLineRef.current = ''
        } else {
          lastLineRef.current += ch
        }
      }
      const line = lastLineRef.current.trim()
      if (line) {
        setExecution(prev => prev ? { ...prev, status: 'streaming', currentLine: line } : prev)
      }
    },
    onToolCall: (evt) => {
      const toolName = (evt.content as { tool_name?: string })?.tool_name ?? 'tool'
      const shortName = toolName.replace(/^mcp__platform__/, '').replace(/^mcp__/, '')
      setExecution(prev => prev ? { ...prev, status: 'tool_call', currentLine: `using ${shortName}` } : prev)
    },
    onDone: (evt) => {
      // A `done` event with success:false (or an error payload) is a failed run,
      // not a completion. Surface it as the error card instead of clearing —
      // otherwise the failure vanishes silently.
      const content = evt.content as DoneEventContent
      if (evt.success === false || content?.error) {
        setExecution(prev => prev ? {
          ...prev,
          status: 'error',
          currentLine: '',
          errorMessage: content?.error?.message ?? 'The agent run failed',
        } : prev)
        lastLineRef.current = ''
        return
      }
      setExecution(null)
      lastLineRef.current = ''
      executionContextRef.current = null
      refetch()
    },
    onError: (err) => {
      setExecution(prev => prev ? {
        ...prev,
        status: 'error',
        currentLine: '',
        errorMessage: err.message || 'Execution failed',
      } : prev)
      lastLineRef.current = ''
    },
  })

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
        setAgentError('Failed to load agents for this channel')
      })
    return () => { cancelled = true }
  }, [channelId])

  const grouped = useMemo(() => groupMessages(messages), [messages])

  const handleViewWork = useCallback((executionId: string) => {
    setViewingExecution(executionId)
  }, [])

  // -----------------------------------------------------------------------
  // Escalation HITL handlers
  // -----------------------------------------------------------------------

  const respondToExecution = useCallback(
    async (executionId: string, response: 'approved' | 'rejected' | 'discuss', feedback?: string) => {
      await apiPost(`/execute/${executionId}/respond`, { response, feedback })
      // Silently refetch messages so the UI picks up any backend-side resolution metadata
      refetch()
    },
    [refetch],
  )

  const handleApprove = useCallback(
    async (executionId: string) => {
      try {
        await respondToExecution(executionId, 'approved')
        toast.success('Escalation approved')
      } catch {
        toast.error('Failed to approve escalation', { description: 'Please try again.' })
      }
    },
    [respondToExecution],
  )

  const handleReject = useCallback(
    async (executionId: string) => {
      try {
        await respondToExecution(executionId, 'rejected')
        toast.info('Escalation rejected')
      } catch {
        toast.error('Failed to reject escalation', { description: 'Please try again.' })
      }
    },
    [respondToExecution],
  )

  const handleDiscuss = useCallback(
    async (executionId: string) => {
      try {
        await respondToExecution(executionId, 'discuss')
        toast.info('Discussion started')
      } catch {
        toast.error('Failed to start discussion', { description: 'Please try again.' })
      }
    },
    [respondToExecution],
  )

  const handleSend = useCallback(
    async (content: string) => {
      let execCtx: ChannelExecutionContext | null = null
      try {
        execCtx = await sendMessage(content)
      } catch {
        return
      }

      if (execCtx?.conversationId && execCtx?.targetAgent) {
        executionContextRef.current = execCtx
        lastLineRef.current = ''
        setExecution({
          agentSlug: execCtx.targetAgent,
          status: 'connecting',
          currentLine: 'connecting...',
        })
        connectStream(execCtx.conversationId).catch(() => {
          setExecution(prev => prev ? {
            ...prev,
            status: 'error',
            errorMessage: 'Failed to connect to agent stream',
          } : prev)
        })
      } else if (hasAssignedAgents) {
        // Backend couldn't resolve execution context (conversation creation
        // failed or message dispatched to running session). Show a minimal
        // indicator — execution may still happen in the background.
        setExecution({
          agentSlug: assignedAgents?.[0]?.slug ?? 'agent',
          status: 'thinking',
          currentLine: 'working on it...',
        })
      }
    },
    [sendMessage, connectStream, hasAssignedAgents, assignedAgents],
  )

  const handleRetry = useCallback(() => {
    setExecution(null)
    lastLineRef.current = ''
    closeStream()
  }, [closeStream])

  // Clear execution when agent response arrives via polling (fallback for no-SSE case).
  // Only clear on actual agent responses, not system events (which may arrive
  // mid-execution from error logging without meaning the agent is done).
  useEffect(() => {
    if (!execution) return
    // A surfaced error stays until the user dismisses it — don't let a
    // coincidental agent message clear the failure silently.
    if (execution.status === 'error') return
    const latest = messages[messages.length - 1]
    if (!latest) return
    if (latest.sender_type === 'agent') {
      setExecution(null)
      lastLineRef.current = ''
      closeStream()
    }
  }, [messages, execution, closeStream])

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
          <p className="text-xs text-destructive">{agentError}</p>
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
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-xs font-medium text-text-muted tabular-nums">
                      {formatDateSeparator(group.date)}
                    </span>
                    <div className="flex-1 h-px bg-border" />
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
                      onApprove={handleApprove}
                      onReject={handleReject}
                      onDiscuss={handleDiscuss}
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

          {/* Execution progress indicator — shows which agent is working and what it's doing */}
          {execution && (() => {
            const agentData = assignedAgents?.find(a => a.slug === execution.agentSlug)
            const agentName = agentData?.name ?? execution.agentSlug
            const avatarUrl = agentData?.avatar_url

            if (execution.status === 'error') {
              return (
                <div className="flex items-center gap-3 py-3 px-2 rounded-xl bg-red-50/50 dark:bg-red-950/20" data-testid="channel-execution-error" role="alert">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-red-600 dark:text-red-400">
                      {agentName} couldn&apos;t respond
                    </p>
                    <p className="text-xs text-text-muted truncate">{execution.errorMessage}</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleRetry}
                    className="text-xs font-medium text-primary hover:text-primary/80 flex items-center gap-1 shrink-0"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Dismiss
                  </button>
                </div>
              )
            }

            return (
              <div className="flex items-start gap-3 py-3 px-1" data-testid="channel-execution-indicator" aria-live="polite">
                <div className="w-7 h-7 rounded-lg overflow-hidden bg-surface-hover border border-surface ring-2 ring-card shrink-0 mt-0.5">
                  {isMascotConfig(avatarUrl) ? (
                    <MascotAvatar config={avatarUrl!} size={28} className="w-full h-full" alt={agentName} />
                  ) : avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarUrl} alt={agentName} className="w-full h-full object-cover" />
                  ) : (
                    <span className="w-full h-full flex items-center justify-center bg-secondary/10 text-secondary text-[10px] font-semibold">
                      {agentName.substring(0, 2).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <p className="text-xs font-medium text-secondary mb-0.5">{agentName}</p>
                  <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                    {execution.status !== 'streaming' && (
                      <span className="inline-flex gap-0.5">
                        <span className="w-1 h-1 rounded-full bg-secondary/60 animate-[pulse_1.4s_ease-in-out_infinite]" />
                        <span className="w-1 h-1 rounded-full bg-secondary/60 animate-[pulse_1.4s_ease-in-out_0.2s_infinite]" />
                        <span className="w-1 h-1 rounded-full bg-secondary/60 animate-[pulse_1.4s_ease-in-out_0.4s_infinite]" />
                      </span>
                    )}
                    <span
                      key={execution.currentLine}
                      className="truncate max-w-[400px] animate-[fadeIn_0.2s_ease-in-out]"
                    >
                      {execution.status === 'streaming'
                        ? `"${execution.currentLine}"`
                        : execution.currentLine}
                    </span>
                  </div>
                </div>
              </div>
            )
          })()}
        </div>
      </ScrollArea>

      {/* Empty-agent guidance — prevents silent sends into channels with no agents */}
      {!hasAssignedAgents && !isLoading && (
        <div
          className="mx-4 mb-2 flex items-start gap-2.5 rounded-xl border border-amber-400/30 dark:border-amber-500/30 bg-amber-50/40 dark:bg-amber-950/40 px-3.5 py-2.5"
          role="status"
          data-testid="channel-no-agents-banner"
        >
          <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-text">No agents in this channel yet</p>
            <p className="text-[11px] text-text-secondary dark:text-text mt-0.5">
              Assign an agent so they can see and respond to messages you post here.
            </p>
          </div>
          {onManageAgents && (
            <button
              onClick={onManageAgents}
              className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium text-secondary bg-secondary/10 hover:bg-secondary/15 dark:bg-secondary/20 dark:hover:bg-secondary/25 transition-colors"
            >
              <Users className="w-3 h-3" />
              Add agent
            </button>
          )}
        </div>
      )}

      {/* Skills ribbon above message input */}
      <SkillsRibbon
        channelSlug={channelId}
        onSkillClick={(slug) => insertRef.current?.(`/${slug} `)}
      />

      {/* Message input with @mention support */}
      <MentionInput
        agents={channelAgents}
        onSend={handleSend}
        placeholder="Message your agents..."
        insertRef={insertRef}
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
