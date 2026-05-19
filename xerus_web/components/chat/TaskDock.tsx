'use client'

import { cn } from '@/lib/utils'
import { ChevronDown, ChevronUp, Loader2, Check, X as XIcon } from 'lucide-react'
import type { DockTask } from './useTaskDock'

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

interface TaskDockProps {
  tasks: DockTask[]
  activeCount: number
  isCollapsed: boolean
  onCollapse: () => void
  onExpand: () => void
  onStopAll?: () => void
  onDismiss?: () => void
}

export function TaskDock({
  tasks,
  activeCount,
  isCollapsed,
  onCollapse,
  onExpand,
  onStopAll,
  onDismiss,
}: TaskDockProps) {
  if (tasks.length === 0) return null

  const completedCount = tasks.filter((t) => t.status !== 'running').length

  return (
    <div className="border-b border-border/50 px-3 py-2">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={isCollapsed ? onExpand : onCollapse}
          className="flex items-center gap-2 text-xs hover:text-text transition-colors"
        >
          {activeCount > 0 ? (
            <Loader2 className="w-3 h-3 animate-spin text-secondary" />
          ) : (
            <Check className="w-3 h-3 text-emerald-500" />
          )}
          <span className="font-semibold text-text">
            {activeCount > 0 ? `${activeCount} Working` : 'Done'}
          </span>
          {completedCount > 0 && activeCount > 0 && (
            <span className="text-text-muted">{completedCount} done</span>
          )}
          {isCollapsed ? (
            <ChevronDown className="w-3 h-3 text-text-muted" />
          ) : (
            <ChevronUp className="w-3 h-3 text-text-muted" />
          )}
        </button>
        <div className="flex items-center gap-1">
          {activeCount > 0 && onStopAll && (
            <button
              type="button"
              onClick={onStopAll}
              className="text-[10px] font-medium text-text-muted hover:text-red-500 px-1.5 py-0.5 rounded hover:bg-red-50 transition-colors"
            >
              Stop All
            </button>
          )}
          {activeCount === 0 && onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="p-0.5 rounded text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
              aria-label="Dismiss"
            >
              <XIcon className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {!isCollapsed && (
        <div className="mt-1.5 space-y-0.5 max-h-[100px] overflow-y-auto">
          {tasks.map((task) => (
            <div key={task.id} className="flex items-center gap-2 py-0.5">
              {task.status === 'running' ? (
                <Loader2 className="w-3 h-3 animate-spin text-secondary shrink-0" />
              ) : task.status === 'completed' ? (
                <Check className="w-3 h-3 text-emerald-500 shrink-0" />
              ) : (
                <XIcon className="w-3 h-3 text-red-400 shrink-0" />
              )}
              <span className={cn(
                'text-xs truncate flex-1 min-w-0',
                task.status === 'running' ? 'font-medium text-text' : 'text-text-muted',
              )}>
                {task.name}
              </span>
              <span className="text-[10px] text-text-muted shrink-0 tabular-nums hidden sm:inline">
                {task.status === 'running'
                  ? task.description
                  : task.durationMs != null
                    ? formatDuration(task.durationMs)
                    : 'Done'
                }
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
