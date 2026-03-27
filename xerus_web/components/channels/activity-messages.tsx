'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ArrowRight, Check, X, MessageSquare } from 'lucide-react'
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
  return name.charAt(0).toUpperCase()
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

  return (
    <div className="flex gap-3 py-3 px-2 group" role="article" aria-label={`Message from ${message.sender_slug}`}>
      <Avatar className="w-8 h-8 flex-shrink-0 ring-2 ring-white">
        {avatarUrl ? <AvatarImage src={avatarUrl} alt={message.sender_slug} /> : null}
        <AvatarFallback className="text-xs text-text-secondary bg-surface-hover">
          {getInitials(message.sender_slug)}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-sm font-medium text-text">
            {message.sender_slug}
          </span>
          <span className="text-xs text-text-muted">
            {formatRelativeTime(message.created_at)}
          </span>
        </div>

        <div className="prose prose-sm max-w-none text-sm text-text leading-relaxed [&_p]:mb-2 [&_ul]:mb-2 [&_ol]:mb-2 [&_li]:text-sm [&_strong]:text-text">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {message.content}
          </ReactMarkdown>
        </div>

        <div className="flex items-center gap-3 mt-2 opacity-0 group-hover:opacity-100 transition-all duration-200">
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
          <button
            type="button"
            className={cn(
              'inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary font-medium',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded'
            )}
          >
            <MessageSquare className="w-3 h-3" />
            Reply in thread
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// EscalationMessage
// ---------------------------------------------------------------------------

export function EscalationMessage({ message }: { message: ChannelMessage }) {
  const avatarUrl = message.metadata?.avatar_url as string | undefined

  return (
    <div
      className="flex gap-3 py-3 px-2 border-l-4 border-l-orange-400 bg-orange-50/50 rounded-r-2xl"
      role="article"
      aria-label={`Escalation from ${message.sender_slug}`}
    >
      <Avatar className="w-8 h-8 flex-shrink-0 ring-2 ring-white">
        {avatarUrl ? <AvatarImage src={avatarUrl} alt={message.sender_slug} /> : null}
        <AvatarFallback className="text-xs text-text-secondary bg-surface-hover">
          {getInitials(message.sender_slug)}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-sm font-medium text-text">{message.sender_slug}</span>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-orange-600">
            Needs Approval
          </span>
          <span className="text-xs text-text-muted">
            {formatRelativeTime(message.created_at)}
          </span>
        </div>

        <div className="prose prose-sm max-w-none text-sm text-text leading-relaxed [&_p]:mb-2 [&_strong]:text-text">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {message.content}
          </ReactMarkdown>
        </div>

        <div className="flex items-center gap-2 mt-3">
          <button
            type="button"
            aria-label="Approve this escalation"
            className={cn(
              'inline-flex items-center gap-1.5',
              'bg-primary hover:bg-primary/90 text-white font-medium py-1.5 px-3 rounded-xl text-xs',
              'transition-colors active:scale-95',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2'
            )}
          >
            <Check className="w-3.5 h-3.5" />
            Approve
          </button>
          <button
            type="button"
            aria-label="Reject this escalation"
            className={cn(
              'inline-flex items-center gap-1.5',
              'bg-surface-hover hover:bg-surface-pressed text-text font-medium py-1.5 px-3 rounded-xl text-xs',
              'transition-colors active:scale-95',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2'
            )}
          >
            <X className="w-3.5 h-3.5" />
            Reject
          </button>
          <button
            type="button"
            aria-label="Discuss this escalation"
            className={cn(
              'inline-flex items-center gap-1.5',
              'text-primary hover:bg-[#FFF4E6] font-medium py-1.5 px-3 rounded-xl text-xs',
              'transition-colors active:scale-95',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2'
            )}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Discuss
          </button>
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
    <div className="flex items-baseline gap-2 py-1 px-2 opacity-70" role="article" aria-label={`Coordination: ${message.sender_slug} to ${target}`}>
      <span className="text-[13px] text-text-secondary font-medium">
        {message.sender_slug}
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
      <span className="text-xs text-text-muted flex-shrink-0">
        {formatRelativeTime(message.created_at)}
      </span>
    </div>
  )
}
