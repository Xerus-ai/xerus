'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Square, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface BackgroundTask {
  id: string
  name: string
  description?: string
  status: 'running' | 'completed' | 'failed'
  startedAt: number
}

interface BackgroundAgentPanelProps {
  tasks: BackgroundTask[]
  onStopTask?: (taskId: string) => void
  className?: string
}

export function BackgroundAgentPanel({ tasks, onStopTask, className }: BackgroundAgentPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true)

  const activeTasks = tasks.filter(t => t.status === 'running')
  const completedTasks = tasks.filter(t => t.status !== 'running')

  if (tasks.length === 0) return null

  return (
    <div className={cn('border-t border-border bg-surface', className)}>
      <button
        type="button"
        onClick={() => setIsExpanded(prev => !prev)}
        className="flex items-center justify-between w-full px-4 py-2 text-xs text-text-secondary hover:bg-surface-hover"
      >
        <span className="font-medium">
          Background Tasks ({activeTasks.length} active)
        </span>
        {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
      </button>

      {isExpanded && (
        <div className="px-4 pb-3 space-y-1.5 max-h-[200px] overflow-y-auto">
          {activeTasks.map(task => (
            <div key={task.id} className="flex items-center gap-2 text-xs">
              <Loader2 className="w-3.5 h-3.5 text-primary animate-spin shrink-0" />
              <span className="truncate flex-1 text-text-secondary">{task.name}</span>
              <span className="text-text-muted tabular-nums">
                {formatElapsed(task.startedAt)}
              </span>
              {onStopTask && (
                <button
                  type="button"
                  onClick={() => onStopTask(task.id)}
                  className="p-0.5 rounded hover:bg-red-500/10 text-text-muted hover:text-red-500"
                  aria-label={`Stop ${task.name}`}
                >
                  <Square className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
          {completedTasks.slice(-5).map(task => (
            <div key={task.id} className="flex items-center gap-2 text-xs opacity-60">
              {task.status === 'completed' ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
              ) : (
                <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
              )}
              <span className="truncate flex-1 text-text-muted">{task.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function formatElapsed(startedAt: number): string {
  const seconds = Math.floor((Date.now() - startedAt) / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ${seconds % 60}s`
}
