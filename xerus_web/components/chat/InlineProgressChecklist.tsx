'use client'

import { cn } from '@/lib/utils'
import { Loader2, Square, CheckSquare, XSquare } from 'lucide-react'
import type { ExecutionStep } from './types'

interface InlineProgressChecklistProps {
  steps: ExecutionStep[]
  onStopAll?: () => void
  className?: string
}

function isSubagentStep(step: ExecutionStep): boolean {
  return step.id.startsWith('subagent-') || step.id.startsWith('delegation-')
}

export function InlineProgressChecklist({ steps, onStopAll, className }: InlineProgressChecklistProps) {
  const subagentSteps = steps.filter(isSubagentStep)
  if (subagentSteps.length === 0) return null

  const completedCount = subagentSteps.filter(s => s.status === 'completed').length
  const failedCount = subagentSteps.filter(s => s.status === 'failed').length
  const doneCount = completedCount + failedCount
  const totalCount = subagentSteps.length
  const activeCount = subagentSteps.filter(s => s.status === 'active').length
  const progressPct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0

  return (
    <div className={cn('px-6 pb-3', className)}>
      <div className="ml-12 rounded-lg border border-border/40 bg-surface-alt/20 px-3 py-2">
        {/* Progress header */}
        <div className="flex items-center gap-2 mb-1.5">
          {activeCount > 0 && <Loader2 className="w-3 h-3 animate-spin text-secondary shrink-0" />}
          <span className="text-[11px] font-medium text-text-muted">
            {doneCount} of {totalCount} tasks done
          </span>
          {/* Slim progress bar */}
          <div className="flex-1 h-1 rounded-full bg-surface-hover overflow-hidden">
            <div
              className="h-full rounded-full bg-secondary transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          {activeCount > 0 && onStopAll && (
            <button
              type="button"
              onClick={onStopAll}
              className="text-[10px] font-medium text-text-muted hover:text-rose-500 transition-colors"
            >
              Stop All
            </button>
          )}
        </div>

        {/* Checklist */}
        <div className="space-y-0.5">
          {subagentSteps.map(step => (
            <div key={step.id} className="flex items-center gap-1.5">
              {step.status === 'active' && (
                <Square className="w-3.5 h-3.5 text-text-muted shrink-0" />
              )}
              {step.status === 'completed' && (
                <CheckSquare className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              )}
              {step.status === 'failed' && (
                <XSquare className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              )}
              {step.status === 'pending' && (
                <Square className="w-3.5 h-3.5 text-text-muted/40 shrink-0" />
              )}
              <span className={cn(
                'text-[11px] truncate',
                step.status === 'active' && 'text-text font-medium',
                step.status === 'completed' && 'text-text-muted line-through',
                step.status === 'failed' && 'text-rose-400',
                step.status === 'pending' && 'text-text-muted',
              )}>
                {step.name}
              </span>
              {step.status === 'active' && (
                <Loader2 className="w-2.5 h-2.5 animate-spin text-secondary shrink-0 ml-auto" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
