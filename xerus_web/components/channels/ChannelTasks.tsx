'use client'

import { useCallback } from 'react'
import { Plus, Loader2 } from 'lucide-react'
import { KanbanBoard } from '@/components/common/KanbanBoard'
import type { KanbanTask } from '@/components/common/TaskCard'
import { cn } from '@/lib/utils'
import { useChannelTasks } from '@/hooks/useChannelData'

interface ChannelTasksProps {
  channelId: string
  className?: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChannelTasks({ channelId, className }: ChannelTasksProps) {
  const { tasks, isLoading, error, updateTaskStatus } = useChannelTasks(channelId)

  const handleDragEnd = useCallback((taskId: string, newStatus: string) => {
    updateTaskStatus(taskId, newStatus)
  }, [updateTaskStatus])

  const handleTaskClick = useCallback((_task: KanbanTask) => {
    // Will open task detail view
  }, [])

  if (isLoading) {
    return (
      <div className={cn('flex flex-col h-full items-center justify-center', className)}>
        <Loader2 className="w-5 h-5 text-text-muted animate-spin" />
        <p className="text-sm text-text-muted mt-2">Loading tasks...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className={cn('flex flex-col h-full items-center justify-center', className)}>
        <p className="text-sm text-text-secondary">{error}</p>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      <div className="flex items-center justify-between mb-4 px-1">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">
          Channel Tasks
        </p>
        <button
          type="button"
          aria-label={`Create new task in channel ${channelId}`}
          className={cn(
            'inline-flex items-center gap-1.5',
            'bg-[#FF6600] hover:bg-[#E65C00] text-white font-medium py-2 px-4 rounded-xl text-sm',
            'transition-colors active:scale-95',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6600] focus-visible:ring-offset-2'
          )}
        >
          <Plus className="w-4 h-4" />
          New Task
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <KanbanBoard
          tasks={tasks}
          onDragEnd={handleDragEnd}
          onTaskClick={handleTaskClick}
        />
      </div>
    </div>
  )
}
