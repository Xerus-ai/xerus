'use client'

import { MessageSquare } from 'lucide-react'

export default function InboxPage() {
  return (
    <div className="flex-1 h-full flex flex-col items-center justify-center text-center px-6">
      <div className="w-14 h-14 rounded-2xl bg-surface-hover flex items-center justify-center mb-4">
        <MessageSquare className="w-7 h-7 text-text-muted" />
      </div>
      <h2 className="font-serif text-xl text-text mb-1">Select a channel</h2>
      <p className="text-sm text-text-muted max-w-xs">
        Pick a channel from the sidebar to view tasks and conversations with your agents.
      </p>
    </div>
  )
}
