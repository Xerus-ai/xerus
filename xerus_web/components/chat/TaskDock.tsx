'use client'

import { cn } from '@/lib/utils'
import { ChevronUp, ChevronDown, Loader2, Check, X } from 'lucide-react'
import type { DockTask } from './useTaskDock'

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

const TASK_COLORS = [
  'text-blue-600',
  'text-violet-600',
  'text-amber-600',
  'text-emerald-600',
  'text-cyan-600',
  'text-rose-600',
  'text-purple-600',
  'text-teal-600',
]

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

  const completedCount = tasks.filter((t) => t.status !== 'running').length

  return (
    <div className="shrink-0 mx-4 mb-2 max-w-md">
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        {/* Header */}
        <button
          type="button"
          onClick={isCollapsed ? onExpand : onCollapse}
          className="flex items-center justify-between w-full px-4 py-2.5 hover:bg-surface-hover/50 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            {activeCount > 0 ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-secondary" />
            ) : (
              <Check className="w-3.5 h-3.5 text-emerald-500" />
            )}
            <span className="text-[13px] font-medium text-text">
              {activeCount > 0 ? `${activeCount} Working` : 'All tasks completed'}
            </span>
            {activeCount > 0 && completedCount > 0 && (
              <span className="text-[11px] text-text-muted">
                {completedCount} done
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {activeCount > 0 && onStopAll && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); onStopAll() }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onStopAll() } }}
                className="text-[11px] font-medium text-text-muted hover:text-red-500 px-2 py-0.5 rounded-md hover:bg-red-50 transition-colors"
              >
                Stop All
              </span>
            )}
            {isCollapsed ? (
              <ChevronUp className="w-3.5 h-3.5 text-text-muted" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-text-muted" />
            )}
          </div>
        </button>

        {/* Task list */}
        {!isCollapsed && (
          <div className="border-t border-border/50 px-3 py-2 space-y-1 max-h-[140px] overflow-y-auto">
            {tasks.map((task, idx) => {
              const color = TASK_COLORS[idx % TASK_COLORS.length]
              return (
                <div
                  key={task.id}
                  className={cn(
                    'flex items-center gap-2.5 py-1.5 px-2 rounded-lg transition-colors',
                    task.status === 'running' && 'bg-surface-alt/30',
                  )}
                >
                  {task.status === 'running' ? (
                    <span className={cn('flex items-center justify-center w-4 h-4 shrink-0', color)}>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    </span>
                  ) : task.status === 'completed' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  ) : (
                    <X className="w-3.5 h-3.5 text-red-400 shrink-0" />
                  )}
                  <span className={cn(
                    'text-[13px] font-medium truncate flex-1',
                    task.status === 'running' ? color : 'text-text-muted',
                  )}>
                    {task.name}
                  </span>
                  <span className="text-[11px] text-text-muted shrink-0 tabular-nums">
                    {task.status === 'running'
                      ? task.description
                      : task.durationMs != null
                        ? formatDuration(task.durationMs)
                        : task.error ?? 'Done'
                    }
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
