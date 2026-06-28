'use client'

import React from 'react'
import { Calendar, MessageSquare, Circle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getAgentColor, getLabelColor, formatShortDate } from '@/lib/task-utils'
import { isMascotConfig } from '@/lib/mascot-config'
import { MascotAvatar } from '@/components/agents/MascotAvatar'
import type { Agent } from './PresenceAvatars'

export interface SubtaskItem {
  text: string
  done: boolean
}

export interface AttachmentRef {
  name: string
  path: string
  type: string
}

export interface KanbanTask {
  id: string
  title: string
  description?: string
  status: string
  priority?: 'low' | 'medium' | 'high' | 'critical'
  assignedAgents?: Agent[]
  channelTag?: string
  labels?: { name: string; color: string }[]
  subtasks?: { total: number; completed: number }
  subtaskItems?: SubtaskItem[]
  attachments?: AttachmentRef[]
  commentCount?: number
  attachmentCount?: number
  startDate?: string
  dueDate?: string
  createdAt?: string
  metadata?: Record<string, unknown>
}

interface TaskCardProps {
  task: KanbanTask
  onStatusChange?: (taskId: string, newStatus: string) => void
  onAssign?: (taskId: string) => void
  onClick?: (task: KanbanTask) => void
  isDragging?: boolean
  className?: string
}

function getInitial(name: string): string {
  return name.charAt(0).toUpperCase()
}

export function TaskCard({
  task,
  onClick,
  isDragging = false,
  className,
}: TaskCardProps) {
  const displayDate = task.dueDate
    ? formatShortDate(task.dueDate)
    : task.startDate
      ? formatShortDate(task.startDate)
      : null

  const hasFooter = displayDate || task.commentCount || task.subtasks

  return (
    <div
      role="article"
      aria-label={task.title}
      className={cn(
        'bg-surface-alt hover:bg-surface-hover rounded-2xl p-4 shadow-sm',
        'transition-all duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        isDragging && 'opacity-50 shadow-lg scale-[1.02]',
        onClick && 'cursor-pointer hover:shadow-md',
        className
      )}
      onClick={onClick ? () => onClick(task) : undefined}
      tabIndex={0}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onClick(task)
        }
      }}
    >
      {/* Row 1: Checkbox circle + Title + Agent avatars */}
      <div className="flex items-start gap-2.5">
        <Circle className="w-[18px] h-[18px] text-surface-active mt-0.5 flex-shrink-0" strokeWidth={1.5} />
        <h4 className="text-[13px] font-semibold text-text leading-snug flex-1 line-clamp-2">
          {task.title}
        </h4>
        {task.assignedAgents && task.assignedAgents.length > 0 && (
          <div className="flex items-center flex-shrink-0 mt-px">
            {task.assignedAgents.slice(0, 3).map((agent, index) => {
              const color = getAgentColor(agent.name)
              const hasMascot = isMascotConfig(agent.avatar_url)
              const hasImageUrl = !!agent.avatar_url && !hasMascot
              return (
                <div
                  key={agent.id}
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold text-white ring-2 ring-surface overflow-hidden"
                  style={{
                    backgroundColor: hasMascot || hasImageUrl ? 'transparent' : color,
                    marginLeft: index === 0 ? 0 : -6,
                    zIndex: 3 - index,
                  }}
                  title={agent.name}
                >
                  {hasMascot ? (
                    <MascotAvatar config={agent.avatar_url!} size={24} className="w-full h-full" alt={agent.name} />
                  ) : hasImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={agent.avatar_url} alt={agent.name} className="w-full h-full object-cover" />
                  ) : (
                    getInitial(agent.name)
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Row 2: Description */}
      {task.description && (
        <p className="text-xs text-text-secondary leading-relaxed line-clamp-2 mt-2 pl-[30px]">
          {task.description}
        </p>
      )}

      {/* Row 3: Labels with colored dot prefix */}
      {task.labels && task.labels.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3 pl-[30px]">
          {task.labels.map((label) => {
            const color = getLabelColor(label)
            return (
              <span
                key={label.name}
                className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium leading-tight"
                style={{
                  backgroundColor: color + '12',
                  color: color,
                  border: `1px solid ${color}30`,
                }}
              >
                <svg width="6" height="6" viewBox="0 0 6 6" fill="none" className="flex-shrink-0">
                  <circle cx="3" cy="3" r="3" fill={color} />
                </svg>
                {label.name}
              </span>
            )
          })}
        </div>
      )}

      {/* Row 4: Metrics footer */}
      {hasFooter && (
        <div className="flex items-center gap-3 mt-3 pl-[30px]">
          {displayDate && (
            <span className="inline-flex items-center gap-1 text-[11px] text-text-muted">
              <Calendar className="w-3 h-3" />
              {displayDate}
            </span>
          )}
          {task.commentCount !== undefined && task.commentCount > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] text-text-muted">
              <MessageSquare className="w-3 h-3" />
              {task.commentCount}
            </span>
          )}
          {task.subtasks && (
            <span className="inline-flex items-center gap-1 text-[11px] text-text-muted">
              <Circle className="w-3 h-3" strokeWidth={1.5} />
              {task.subtasks.completed}/{task.subtasks.total}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
