'use client'

import { cn } from '@/lib/utils'

interface SystemEventProps {
  content: string
  timestamp: string
  className?: string
}

function formatTime(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function SystemEvent({ content, timestamp, className }: SystemEventProps) {
  return (
    <div
      role="status"
      aria-label={`System event: ${content}`}
      className={cn(
        'flex items-center gap-3 py-2',
        className
      )}
    >
      <div className="flex-1 h-px bg-surface-active" aria-hidden="true" />
      <span className="text-xs text-text-muted whitespace-nowrap flex-shrink-0">
        {content}
      </span>
      <span className="text-xs text-text-muted whitespace-nowrap flex-shrink-0">
        {formatTime(timestamp)}
      </span>
      <div className="flex-1 h-px bg-surface-active" aria-hidden="true" />
    </div>
  )
}
