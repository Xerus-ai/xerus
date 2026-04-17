'use client'

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ArrowRight, Check, X, MessageSquare, Loader2 } from 'lucide-react'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import type { ChannelMessage } from './ChannelActivity'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

function getInitials(name: string): string {
  // For multi-word names like "Research Rachel", use first letter of each word
  const words = name.split(/[\s-]+/).filter(Boolean)
  if (words.length >= 2) {
    return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase()
  }
  return name.charAt(0).toUpperCase()
}

/** Resolve display name: prefer sender_name from backend, fall back to sender_slug */
function displayName(message: ChannelMessage): string {
  return message.sender_name || message.sender_slug
}

// ---------------------------------------------------------------------------
// PostMessage
// ---------------------------------------------------------------------------

export function PostMessage({
  message,
  onViewWork,
}: {
  message: ChannelMessage
  onViewWork: (executionId: string) => void
}) {
  const executionId = message.metadata?.execution_id as string | undefined
  const avatarUrl = message.metadata?.avatar_url as string | undefined

  const name = displayName(message)

  return (
    <div className="flex gap-3 py-3 px-2 group" role="article" aria-label={`Message from ${name}`}>
      <Avatar className="w-8 h-8 flex-shrink-0 ring-2 ring-card">
        {avatarUrl ? <AvatarImage src={avatarUrl} alt={name} /> : null}
        <AvatarFallback className="text-xs text-text-secondary bg-surface-hover">
          {getInitials(name)}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-sm font-medium text-text">
            {name}
          </span>
          <span className="text-xs text-text-muted tabular-nums">
            {formatRelativeTime(message.created_at)}
          </span>
        </div>

        <div className="prose prose-sm max-w-none text-sm text-text leading-relaxed max-w-[65ch] [&_p]:mb-2 [&_ul]:mb-2 [&_ol]:mb-2 [&_li]:text-sm [&_strong]:text-text">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {message.content}
          </ReactMarkdown>
        </div>

        <div className="flex items-center gap-3 mt-1.5 opacity-0 group-hover:opacity-100 transition-all duration-200">
          {executionId && (
            <button
              type="button"
              onClick={() => onViewWork(executionId)}
              className={cn(
                'inline-flex items-center gap-1 text-xs text-primary hover:text-primary/90 font-medium',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded'
              )}
            >
              View work
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// EscalationMessage
// ---------------------------------------------------------------------------

interface EscalationMessageProps {
  message: ChannelMessage
  onApprove?: (executionId: string) => Promise<void>
  onReject?: (executionId: string) => Promise<void>
  onDiscuss?: (executionId: string) => Promise<void>
}

type EscalationAction = 'approved' | 'rejected' | 'discussing' | null

export function EscalationMessage({
  message,
  onApprove,
  onReject,
  onDiscuss,
}: EscalationMessageProps) {
  const avatarUrl = message.metadata?.avatar_url as string | undefined
  const executionId = message.metadata?.execution_id as string | undefined

  // Track resolved action and in-flight state
  const existingResolution = message.metadata?.resolution as EscalationAction | undefined
  const [resolvedAction, setResolvedAction] = useState<EscalationAction>(existingResolution ?? null)
  const [pendingAction, setPendingAction] = useState<EscalationAction>(null)

  const isResolved = resolvedAction !== null
  const isActionInFlight = pendingAction !== null

  async function handleAction(
    action: EscalationAction,
    handler?: (executionId: string) => Promise<void>,
  ) {
    if (!executionId || !handler || isResolved || isActionInFlight) return
    setPendingAction(action)
    try {
      await handler(executionId)
      setResolvedAction(action)
    } finally {
      setPendingAction(null)
    }
  }

  function renderActionButton(
    action: EscalationAction,
    label: string,
    resolvedLabel: string,
    icon: React.ReactNode,
    handler: ((executionId: string) => Promise<void>) | undefined,
    baseClassName: string,
    resolvedClassName: string,
  ) {
    const isThisAction = resolvedAction === action
    const isThisPending = pendingAction === action
    const disabled = !executionId || isResolved || isActionInFlight

    if (isResolved && !isThisAction) return null

    return (
      <button
        type="button"
        aria-label={isThisAction ? resolvedLabel : `${label} this escalation`}
        disabled={disabled}
        onClick={() => handleAction(action, handler)}
        className={cn(
          'inline-flex items-center gap-1.5 font-medium py-1.5 px-3 rounded-xl text-xs transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          isThisAction ? resolvedClassName : baseClassName,
          disabled && !isThisAction && 'opacity-50 cursor-not-allowed',
        )}
      >
        {isThisPending ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          icon
        )}
        {isThisAction ? resolvedLabel : label}
      </button>
    )
  }

  return (
    <div
      className="flex gap-3 py-3 px-3 bg-primary/5 rounded-2xl"
      role="article"
      aria-label={`Escalation from ${displayName(message)}`}
    >
      <Avatar className="w-8 h-8 flex-shrink-0 ring-2 ring-card">
        {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName(message)} /> : null}
        <AvatarFallback className="text-xs text-text-secondary bg-surface-hover">
          {getInitials(displayName(message))}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-sm font-medium text-text">{displayName(message)}</span>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-primary">
            Needs Approval
          </span>
          <span className="text-xs text-text-muted tabular-nums">
            {formatRelativeTime(message.created_at)}
          </span>
        </div>

        <div className="prose prose-sm max-w-none text-sm text-text leading-relaxed max-w-[65ch] [&_p]:mb-2 [&_strong]:text-text">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {message.content}
          </ReactMarkdown>
        </div>

        <div className="flex items-center gap-2 mt-3">
          {renderActionButton(
            'approved',
            'Approve',
            'Approved',
            <Check className="w-3.5 h-3.5" />,
            onApprove,
            cn(
              'bg-primary hover:bg-primary/90 text-white',
              'active:scale-95',
            ),
            'bg-success/10 text-success cursor-default',
          )}
          {renderActionButton(
            'rejected',
            'Reject',
            'Rejected',
            <X className="w-3.5 h-3.5" />,
            onReject,
            cn(
              'bg-surface-hover hover:bg-surface-pressed text-text',
              'active:scale-95',
            ),
            'bg-destructive/10 text-destructive cursor-default',
          )}
          {renderActionButton(
            'discussing',
            'Discuss',
            'Discussion started',
            <MessageSquare className="w-3.5 h-3.5" />,
            onDiscuss,
            cn(
              'text-primary hover:bg-primary/8',
              'active:scale-95',
            ),
            'bg-primary/10 text-primary cursor-default',
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// CoordinationMessage
// ---------------------------------------------------------------------------

export function CoordinationMessage({ message }: { message: ChannelMessage }) {
  const target = (message.metadata?.target_agent as string) ?? ''

  return (
    <div className="flex items-baseline gap-2 py-1 px-2 opacity-70" role="article" aria-label={`Coordination: ${displayName(message)} to ${target}`}>
      <span className="text-[13px] text-text-secondary font-medium">
        {displayName(message)}
      </span>
      {target && (
        <>
          <span className="text-[13px] text-text-muted" aria-hidden="true">&rarr;</span>
          <span className="text-[13px] text-text-secondary font-medium">{target}</span>
        </>
      )}
      <span className="text-[13px] text-text-muted flex-1 truncate">
        {message.content}
      </span>
      <span className="text-xs text-text-muted tabular-nums flex-shrink-0">
        {formatRelativeTime(message.created_at)}
      </span>
    </div>
  )
}
