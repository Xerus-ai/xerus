'use client'

import React from 'react'
import { Calendar, MessageSquare, Circle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PresenceAvatars, type Agent } from './PresenceAvatars'

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

function formatShortDate(dateString: string): string {
  const d = new Date(dateString)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
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
        'bg-surface hover:bg-surface-hover rounded-2xl p-4 shadow-sm',
        'transition-all duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6600] focus-visible:ring-offset-2',
        isDragging && 'opacity-40 shadow-lg scale-[1.02]',
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
      {/* Row 1: Title + Agent avatars */}
      <div className="flex items-start gap-2.5">
        <Circle className="w-[18px] h-[18px] text-surface-active mt-0.5 flex-shrink-0" strokeWidth={1.5} />
        <h4 className="text-[13px] font-semibold text-text leading-snug flex-1 line-clamp-2">
          {task.title}
        </h4>
        {task.assignedAgents && task.assignedAgents.length > 0 && (
          <div className="flex-shrink-0 mt-px">
            <PresenceAvatars
              agents={task.assignedAgents}
              size="sm"
              maxVisible={2}
              showStatus={false}
            />
          </div>
        )}
      </div>

      {/* Row 2: Description */}
      {task.description && (
        <p className="text-xs text-text-secondary leading-relaxed line-clamp-2 mt-2 pl-[30px]">
          {task.description}
        </p>
      )}

      {/* Row 3: Labels */}
      {task.labels && task.labels.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3 pl-[30px]">
          {task.labels.map((label) => (
            <span
              key={label.name}
              className="inline-block rounded-md px-2 py-0.5 text-[11px] font-medium leading-tight"
              style={{ backgroundColor: label.color + '15', color: label.color, border: `1px solid ${label.color}30` }}
            >
              {label.name}
            </span>
          ))}
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
