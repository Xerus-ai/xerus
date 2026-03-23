'use client'

import { useState, useCallback } from 'react'
import { Plus, Loader2 } from 'lucide-react'
import { KanbanBoard } from '@/components/common/KanbanBoard'
import type { KanbanTask } from '@/components/common/TaskCard'
import { cn } from '@/lib/utils'
import { apiCall } from '@/lib/api/client'
import { useChannelTasks } from '@/hooks/useChannelData'

interface ChannelTasksProps {
  channelId: string
  className?: string
}

export function ChannelTasks({ channelId, className }: ChannelTasksProps) {
  const { tasks, isLoading, error, updateTaskStatus, refetch } = useChannelTasks(channelId)
  const [isCreating, setIsCreating] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)

  const handleDragEnd = useCallback((taskId: string, newStatus: string) => {
    updateTaskStatus(taskId, newStatus)
  }, [updateTaskStatus])

  const handleTaskClick = useCallback((_task: KanbanTask) => {}, [])

  const handleCreateTask = async () => {
    const title = newTaskTitle.trim()
    if (!title) return
    setIsCreating(true)
    try {
      await apiCall(`/channels/${channelId}/tasks`, {
        method: 'POST',
        body: JSON.stringify({ title }),
      })
      setNewTaskTitle('')
      setShowCreateForm(false)
      await refetch()
    } catch {
      // apiCall shows toast on error
    } finally {
      setIsCreating(false)
    }
  }

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
        {showCreateForm ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateTask(); if (e.key === 'Escape') setShowCreateForm(false) }}
              placeholder="Task title"
              disabled={isCreating}
              className="px-3 py-1.5 rounded-xl bg-surface border border-surface-active text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-[#FF6600]/40 w-48"
            />
            <button onClick={handleCreateTask} disabled={isCreating || !newTaskTitle.trim()} className="px-3 py-1.5 rounded-xl text-sm font-medium text-white bg-[#FF6600] hover:bg-[#E65C00] disabled:opacity-50 transition-colors">
              {isCreating ? '...' : 'Add'}
            </button>
            <button onClick={() => { setShowCreateForm(false); setNewTaskTitle('') }} className="px-2 py-1.5 rounded-xl text-sm text-text-muted hover:bg-surface-hover transition-colors">
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowCreateForm(true)}
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
        )}
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
