'use client'

import { cn } from '@/lib/utils'
import { ChevronUp, ChevronDown, Loader2, Check, X, Square } from 'lucide-react'
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
}

export function TaskDock({
  tasks,
  activeCount,
  isCollapsed,
  onCollapse,
  onExpand,
  onStopAll,
}: TaskDockProps) {
  if (tasks.length === 0) return null

  return (
    <div className="shrink-0 border-t border-border bg-surface transition-all duration-200">
      {/* Header row */}
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-2">
          {activeCount > 0 && (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-secondary" />
          )}
          <span className="text-xs font-medium text-text-secondary">
            {activeCount > 0
              ? `${activeCount} Working`
              : `${tasks.length} Completed`
            }
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {activeCount > 0 && onStopAll && (
            <button
              type="button"
              onClick={onStopAll}
              className="text-[11px] text-red-500 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded-md transition-colors"
            >
              Stop All
            </button>
          )}
          <button
            type="button"
            onClick={isCollapsed ? onExpand : onCollapse}
            className="p-1 rounded-md text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
            aria-label={isCollapsed ? 'Expand task dock' : 'Collapse task dock'}
          >
            {isCollapsed ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Expanded task list */}
      {!isCollapsed && (
        <div className="px-4 pb-2 space-y-1 max-h-[160px] overflow-y-auto">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-2.5 py-1 px-2 rounded-md bg-surface-alt/50"
            >
              {task.status === 'running' ? (
                <Loader2 className="w-3 h-3 animate-spin text-secondary shrink-0" />
              ) : task.status === 'completed' ? (
                <Check className="w-3 h-3 text-emerald-500 shrink-0" />
              ) : (
                <X className="w-3 h-3 text-red-500 shrink-0" />
              )}
              <span className="text-xs font-medium text-text truncate flex-1">
                {task.name}
              </span>
              <span className="text-[11px] text-text-muted truncate max-w-[180px]">
                {task.status === 'running'
                  ? task.description
                  : task.durationMs != null
                    ? `Done (${formatDuration(task.durationMs)})`
                    : task.error ?? 'Done'
                }
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
