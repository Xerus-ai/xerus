'use client'

import { useEffect, useRef, useMemo } from 'react'
import { cn } from '@/lib/utils'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { ExecutionSummary } from './ExecutionSummary'
import { EventCard, groupEvents } from './EventCard'
import type { ExecutionEvent } from './EventCard'

// Re-export the event type for consumers
export type { ExecutionEvent }

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ExecutionDetailProps {
  sessionId: string
  events: ExecutionEvent[]
  isLive?: boolean
  summary?: {
    duration_ms: number
    tool_count: number
    token_usage: number
    estimated_cost: number
  }
  onClose: () => void
  display?: 'slide-over' | 'inline'
  className?: string
}

// ---------------------------------------------------------------------------
// Timeline content (shared between slide-over and inline modes)
// ---------------------------------------------------------------------------

function TimelineContent({
  events,
  isLive,
  summary,
}: {
  events: ExecutionEvent[]
  isLive?: boolean
  summary?: ExecutionDetailProps['summary']
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const grouped = useMemo(() => groupEvents(events), [events])

  // Auto-scroll to bottom when live and new events arrive
  useEffect(() => {
    if (isLive && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [isLive, events.length])

  const currentStatus = isLive
    ? ('running' as const)
    : events.length > 0 && events[events.length - 1]?.status === 'error'
      ? ('error' as const)
      : ('completed' as const)

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Summary bar */}
      {summary && (
        <div className="flex-shrink-0 px-4 pb-3">
          <ExecutionSummary
            duration_ms={summary.duration_ms}
            tool_count={summary.tool_count}
            token_usage={summary.token_usage}
            estimated_cost={summary.estimated_cost}
            status={currentStatus}
          />
        </div>
      )}

      {/* Event timeline */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="space-y-2">
          {grouped.map((g) => (
            <EventCard
              key={g.kind === 'message' ? g.event.id : g.call.id}
              grouped={g}
            />
          ))}

          {/* Live streaming indicator */}
          {isLive && (
            <div className="flex items-center gap-2 py-2 px-3">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-pulse rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              <span className="text-xs text-text-muted">
                Streaming events...
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ExecutionDetail({
  sessionId,
  events,
  isLive,
  summary,
  onClose,
  display = 'slide-over',
  className,
}: ExecutionDetailProps) {
  if (display === 'slide-over') {
    return (
      <Sheet open onOpenChange={(open) => !open && onClose()}>
        <SheetContent
          side="right"
          className={cn(
            'w-[480px] sm:max-w-[480px] p-0 flex flex-col',
            className
          )}
        >
          <SheetHeader className="px-4 pt-4 pb-2 flex-shrink-0">
            <SheetTitle className="text-sm font-medium text-text">
              Execution Detail
            </SheetTitle>
            <SheetDescription className="text-xs text-text-muted font-mono">
              {sessionId}
            </SheetDescription>
          </SheetHeader>

          <TimelineContent
            events={events}
            isLive={isLive}
            summary={summary}
          />
        </SheetContent>
      </Sheet>
    )
  }

  // Inline mode
  return (
    <div
      className={cn(
        'border border-surface-active rounded-[24px] bg-white overflow-hidden',
        className
      )}
    >
      {/* Inline header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-active">
        <div>
          <h3 className="text-sm font-medium text-text">Execution Detail</h3>
          <p className="text-xs text-text-muted font-mono">{sessionId}</p>
        </div>
        <button
          type="button"
          aria-label="Close execution detail"
          className="p-1.5 rounded-xl hover:bg-surface-hover active:scale-95 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          onClick={onClose}
        >
          <svg
            className="h-4 w-4 text-text-secondary"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <div className="max-h-[600px]">
        <TimelineContent
          events={events}
          isLive={isLive}
          summary={summary}
        />
      </div>
    </div>
  )
}
