'use client'

import { Loader2, X } from 'lucide-react'

interface PendingMessagesQueueProps {
  messages: string[]
  onCancel: (index: number) => void
}

export function PendingMessagesQueue({ messages, onCancel }: PendingMessagesQueueProps) {
  if (messages.length === 0) return null

  return (
    <div className="w-full max-w-3xl mx-auto px-4 pb-2">
      <div className="flex items-center gap-2 px-3 py-2 bg-surface rounded-xl border border-surface-active">
        <Loader2 className="w-3.5 h-3.5 text-text-muted animate-spin shrink-0" />
        <span className="text-[11px] text-text-muted shrink-0">{messages.length} queued</span>
        <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
          {messages.map((msg, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-surface-hover text-text-secondary"
            >
              <span className="truncate max-w-[180px]">{msg}</span>
              <button
                type="button"
                onClick={() => onCancel(idx)}
                className="p-0.5 rounded-full hover:bg-surface-active text-text-muted hover:text-text transition-colors"
                aria-label="Cancel queued message"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
