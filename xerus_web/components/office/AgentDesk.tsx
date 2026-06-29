'use client'

import React from 'react'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { isMascotConfig } from '@/lib/mascot-config'
import { MascotAvatar } from '@/components/agents/MascotAvatar'

interface AgentDeskProps {
  agent: {
    id: string
    name: string
    slug: string
    avatar_url?: string
    status: 'active' | 'idle' | 'sleeping' | 'error'
    current_task?: string
    next_wake?: string
    domain: string
  }
  onClick?: (agentId: string) => void
}

const STATUS_COLORS: Record<AgentDeskProps['agent']['status'], string> = {
  active: 'bg-green-500',
  idle: 'bg-yellow-500',
  sleeping: 'bg-gray-400',
  error: 'bg-red-500',
}

function getStatusText(agent: AgentDeskProps['agent']): string {
  switch (agent.status) {
    case 'active':
      return agent.current_task
        ? `Working on ${agent.current_task}`
        : 'Active'
    case 'idle':
      return 'Idle'
    case 'sleeping':
      return agent.next_wake
        ? `Sleeping - wakes at ${agent.next_wake}`
        : 'Sleeping'
    case 'error':
      return 'Error'
  }
}

function getInitial(name: string): string {
  return name.charAt(0).toUpperCase()
}

export function AgentDesk({ agent, onClick }: AgentDeskProps) {
  const isActive = agent.status === 'active'
  const isSleeping = agent.status === 'sleeping'

  return (
    <button
      type="button"
      onClick={() => onClick?.(agent.id)}
      aria-label={`${agent.name}: ${getStatusText(agent)}`}
      className={cn(
        'flex items-center gap-3 w-full rounded-2xl px-3 py-2.5',
        'transition-all duration-200 text-left',
        'hover:bg-surface-alt',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        'active:scale-95',
        isActive && 'border border-primary/20',
        isSleeping && 'opacity-60'
      )}
    >
      {/* Avatar with status dot */}
      <div className="relative flex-shrink-0">
        <Avatar className="w-10 h-10">
          {isMascotConfig(agent.avatar_url) ? (
            <MascotAvatar config={agent.avatar_url!} size={40} className="w-full h-full" alt={agent.name} />
          ) : agent.avatar_url ? (
            <AvatarImage src={agent.avatar_url} alt={agent.name} />
          ) : null}
          <AvatarFallback className="text-sm text-text-secondary bg-surface-hover">
            {getInitial(agent.name)}
          </AvatarFallback>
        </Avatar>
        <span
          className={cn(
            'absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-white',
            STATUS_COLORS[agent.status],
            isActive && 'animate-status-pulse'
          )}
          aria-hidden="true"
        />
      </div>

      {/* Name and status */}
      <div className="flex-1 min-w-0">
        <p className="font-sans font-medium text-sm text-text truncate">
          {agent.name}
        </p>
        <p className="font-sans text-xs text-text-secondary truncate">
          {getStatusText(agent)}
        </p>
      </div>
    </button>
  )
}
