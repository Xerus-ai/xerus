'use client'

import { cn } from '@/lib/utils'
import type { OfficeAgent } from '@/hooks/useOfficeData'

const STATUS_COLORS: Record<OfficeAgent['status'], string> = {
  active: 'bg-green-500',
  idle: 'bg-yellow-500',
  sleeping: 'bg-gray-400',
  error: 'bg-red-500',
}

const STATUS_RING: Record<OfficeAgent['status'], string> = {
  active: 'ring-green-500/30',
  idle: 'ring-yellow-500/30',
  sleeping: 'ring-gray-400/30',
  error: 'ring-red-500/30',
}

interface AgentLabelProps {
  name: string
  status: OfficeAgent['status']
  isHidden: boolean
  isHovered: boolean
}

export function AgentLabel({ name, status, isHidden, isHovered }: AgentLabelProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-1 mt-0.5 transition-opacity duration-300',
        isHidden && !isHovered ? 'opacity-0' : 'opacity-100',
      )}
    >
      <span
        className={cn(
          'w-1.5 h-1.5 rounded-full ring-2',
          STATUS_COLORS[status],
          STATUS_RING[status],
          status === 'active' && 'animate-status-pulse',
        )}
      />
      <span className="text-[9px] font-medium text-text-secondary leading-none whitespace-nowrap max-w-[60px] truncate">
        {name}
      </span>
    </div>
  )
}
