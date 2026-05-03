'use client'

import { cn } from '@/lib/utils'
import { ChevronUp, ChevronDown, Loader2, Check, X as XIcon } from 'lucide-react'
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
    <div className="absolute bottom-full left-4 right-4 mb-2 z-20 pointer-events-none">
      <div className="max-w-sm pointer-events-auto rounded-xl bg-card border border-border shadow-lg overflow-hidden">
        {/* Header */}
        <button
          type="button"
          onClick={isCollapsed ? onExpand : onCollapse}
          className="flex items-center justify-between w-full px-3 py-2 hover:bg-surface-hover/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            {activeCount > 0 ? (
              <Loader2 className="w-3 h-3 animate-spin text-secondary" />
            ) : (
              <Check className="w-3 h-3 text-emerald-500" />
            )}
            <span className="text-xs font-semibold text-text">
              {activeCount > 0 ? `${activeCount} Working` : 'Done'}
            </span>
            {completedCount > 0 && activeCount > 0 && (
              <span className="text-[10px] text-text-muted">{completedCount} done</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {activeCount > 0 && onStopAll && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); onStopAll() }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onStopAll() } }}
                className="text-[10px] font-medium text-text-muted hover:text-red-500 px-1.5 py-0.5 rounded hover:bg-red-50 transition-colors"
              >
                Stop All
              </span>
            )}
            {activeCount === 0 && onDismiss && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); onDismiss() }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onDismiss() } }}
                className="p-0.5 rounded text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
              >
                <XIcon className="w-3 h-3" />
              </span>
            )}
            {isCollapsed ? (
              <ChevronUp className="w-3 h-3 text-text-muted" />
            ) : (
              <ChevronDown className="w-3 h-3 text-text-muted" />
            )}
          </div>
        </button>

        {/* Task list */}
        {!isCollapsed && (
          <div className="border-t border-border/50 px-2 py-1.5 space-y-0.5 max-h-[120px] overflow-y-auto">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="flex items-center gap-2 py-1 px-1.5 rounded-md"
              >
                {task.status === 'running' ? (
                  <Loader2 className="w-3 h-3 animate-spin text-secondary shrink-0" />
                ) : task.status === 'completed' ? (
                  <Check className="w-3 h-3 text-emerald-500 shrink-0" />
                ) : (
                  <XIcon className="w-3 h-3 text-red-400 shrink-0" />
                )}
                <span className={cn(
                  'text-xs truncate flex-1',
                  task.status === 'running' ? 'font-medium text-text' : 'text-text-muted',
                )}>
                  {task.name}
                </span>
                <span className="text-[10px] text-text-muted shrink-0 tabular-nums">
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
    </div>
  )
}
