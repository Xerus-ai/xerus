'use client'

import React from 'react'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { isMascotConfig } from '@/lib/mascot-config'
import { MascotAvatar } from '@/components/agents/MascotAvatar'

export interface Agent {
  id: string
  name: string
  slug: string
  avatar_url?: string
  status: 'active' | 'idle' | 'sleeping' | 'error'
}

interface PresenceAvatarsProps {
  agents: Agent[]
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  maxVisible?: number
  showStatus?: boolean
  className?: string
}

const SIZE_MAP = {
  xs: 16,
  sm: 20,
  md: 28,
  lg: 32,
  xl: 40,
} as const

const STATUS_DOT_SIZE_MAP = {
  xs: 6,
  sm: 6,
  md: 8,
  lg: 8,
  xl: 10,
} as const

const STATUS_COLORS: Record<Agent['status'], string> = {
  active: 'bg-green-500',
  idle: 'bg-yellow-500',
  sleeping: 'bg-gray-400',
  error: 'bg-red-500',
}

function getInitials(name: string): string {
  return name.charAt(0).toUpperCase()
}

export function PresenceAvatars({
  agents,
  size = 'md',
  maxVisible = 5,
  showStatus = true,
  className,
}: PresenceAvatarsProps) {
  const avatarSize = SIZE_MAP[size]
  const dotSize = STATUS_DOT_SIZE_MAP[size]
  const overlapOffset = Math.round(avatarSize * 0.25)

  const visibleAgents = agents.slice(0, maxVisible)
  const overflowCount = agents.length - maxVisible

  const agentNames = agents
    .map((a) => `${a.name} (${a.status})`)
    .join(', ')

  return (
    <div
      className={cn('flex items-center', className)}
      aria-label={`Agents: ${agentNames}`}
      role="group"
    >
      {visibleAgents.map((agent, index) => (
        <div
          key={agent.id}
          className="relative"
          style={{
            marginLeft: index === 0 ? 0 : -overlapOffset,
            zIndex: visibleAgents.length - index,
          }}
        >
          <Avatar
            className="ring-2 ring-white"
            style={{
              width: avatarSize,
              height: avatarSize,
            }}
          >
            {isMascotConfig(agent.avatar_url) ? (
              <MascotAvatar config={agent.avatar_url!} size={avatarSize} className="w-full h-full" alt={agent.name} />
            ) : agent.avatar_url ? (
              <AvatarImage src={agent.avatar_url} alt={agent.name} />
            ) : null}
            <AvatarFallback
              className="text-text-secondary bg-surface-hover"
              style={{
                fontSize: Math.max(avatarSize * 0.4, 8),
              }}
            >
              {getInitials(agent.name)}
            </AvatarFallback>
          </Avatar>

          {showStatus && (
            <span
              className={cn(
                'absolute bottom-0 right-0 rounded-full ring-2 ring-white',
                STATUS_COLORS[agent.status],
                agent.status === 'active' && 'animate-pulse'
              )}
              style={{
                width: dotSize,
                height: dotSize,
              }}
              aria-label={`${agent.name}: ${agent.status}`}
            />
          )}
        </div>
      ))}

      {overflowCount > 0 && (
        <div
          className="flex items-center justify-center rounded-full bg-surface-hover text-text-secondary ring-2 ring-white"
          style={{
            width: avatarSize,
            height: avatarSize,
            marginLeft: -overlapOffset,
            zIndex: 0,
            fontSize: Math.max(avatarSize * 0.35, 8),
          }}
        >
          <span className="font-medium leading-none">+{overflowCount}</span>
        </div>
      )}
    </div>
  )
}
