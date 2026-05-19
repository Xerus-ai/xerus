'use client'

import { cn } from '@/lib/utils'
import { Bot, ArrowRight, Inbox } from 'lucide-react'
import type { Agent } from './types'
import { isMascotConfig } from '@/lib/mascot-config'
import { MascotAvatar } from '@/components/agents/MascotAvatar'

interface AgentMessageCardProps {
  fromAgent: string
  toChannel: string
  content: string
  messageType?: string
  agents?: Agent[]
  className?: string
}

function AgentIcon({ slug, agents }: { slug: string; agents?: Agent[] }) {
  const matched = agents?.find(a => a.slug === slug || a.name === slug)
  if (matched && isMascotConfig(matched.avatarUrl)) {
    return <MascotAvatar config={matched.avatarUrl!} size={16} />
  }
  return <Bot className="w-3 h-3 text-text-muted" />
}

export function AgentMessageCard({
  fromAgent,
  toChannel,
  content,
  agents,
  className,
}: AgentMessageCardProps) {
  return (
    <div className={cn(
      'inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg',
      'bg-surface-alt/50 border border-border/30 text-xs text-text-muted',
      className,
    )}>
      <AgentIcon slug={fromAgent} agents={agents} />
      <span className="font-medium text-text-secondary">{fromAgent}</span>
      <ArrowRight className="w-3 h-3 shrink-0" />
      <Inbox className="w-3 h-3 shrink-0" />
      <span className="font-medium text-text-secondary">{toChannel}</span>
      {content && (
        <span className="truncate max-w-[200px] text-text-muted">{content}</span>
      )}
    </div>
  )
}
