'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ChannelMessage } from './ChannelActivity'

interface CoordinationGroupProps {
  messages: ChannelMessage[]
  className?: string
}

function formatTime(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function CoordinationGroup({ messages, className }: CoordinationGroupProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={cn('py-1', className)}>
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        aria-label={`${messages.length} coordination messages. ${expanded ? 'Collapse' : 'Expand'} to view.`}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-xl w-full text-left',
          'hover:bg-surface-hover transition-all duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6600] focus-visible:ring-offset-2'
        )}
      >
        <ChevronDown
          className={cn(
            'w-3.5 h-3.5 text-text-muted transition-transform duration-200',
            expanded && 'rotate-180'
          )}
        />
        <span className="text-[13px] text-text-muted">
          {messages.length} coordination messages
        </span>
      </button>

      <div
        className={cn(
          'overflow-hidden transition-all duration-200',
          expanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
        )}
      >
        <div className="space-y-1 pl-6 pt-1">
          {messages.map((msg) => {
            const target = (msg.metadata?.target_agent as string) ?? ''
            return (
              <div
                key={msg.id}
                className="flex items-baseline gap-2 py-0.5 opacity-70"
              >
                <span className="text-[13px] text-text-secondary font-medium">
                  {msg.sender_slug}
                </span>
                {target && (
                  <>
                    <span className="text-[13px] text-text-muted" aria-hidden="true">
                      &rarr;
                    </span>
                    <span className="text-[13px] text-text-secondary font-medium">
                      {target}
                    </span>
                  </>
                )}
                <span className="text-[13px] text-text-muted flex-1 truncate">
                  {msg.content}
                </span>
                <span className="text-xs text-text-muted flex-shrink-0">
                  {formatTime(msg.created_at)}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
