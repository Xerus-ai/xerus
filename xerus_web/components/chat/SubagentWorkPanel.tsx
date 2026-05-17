'use client'

import { cn } from '@/lib/utils'
import { ChevronDown, ChevronUp, Loader2, Check, XCircle, Bot } from 'lucide-react'
import { useState } from 'react'
import type { ExecutionStep } from './types'
import type { Agent } from './types'
import { isMascotConfig } from '@/lib/mascot-config'
import { MascotAvatar } from '@/components/agents/MascotAvatar'

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`
}

interface SubagentWorkPanelProps {
  steps: ExecutionStep[]
  agents?: Agent[]
  className?: string
}

export function SubagentWorkPanel({ steps, agents, className }: SubagentWorkPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true)

  const subagentSteps = steps.filter(s => s.id.startsWith('subagent-') || s.id.startsWith('delegation-'))
  if (subagentSteps.length === 0) return null

  const activeCount = subagentSteps.filter(s => s.status === 'active').length
  const completedCount = subagentSteps.filter(s => s.status === 'completed' || s.status === 'failed').length

  return (
    <div className={cn('border border-border/50 rounded-xl bg-surface-alt/30 overflow-hidden', className)}>
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 w-full px-3 py-2 hover:bg-surface-hover/50 transition-colors"
      >
        {activeCount > 0 ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-secondary shrink-0" />
        ) : (
          <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
        )}
        <span className="text-xs font-semibold text-text">
          {activeCount > 0 ? `${activeCount} agent${activeCount > 1 ? 's' : ''} working` : 'Agents done'}
        </span>
        {completedCount > 0 && activeCount > 0 && (
          <span className="text-[10px] text-text-muted">{completedCount} completed</span>
        )}
        <span className="ml-auto">
          {isExpanded
            ? <ChevronUp className="w-3.5 h-3.5 text-text-muted" />
            : <ChevronDown className="w-3.5 h-3.5 text-text-muted" />
          }
        </span>
      </button>

      {isExpanded && (
        <div className="px-3 pb-2 space-y-1">
          {subagentSteps.map((step) => {
            const agentSlug = (step.metadata as Record<string, string> | undefined)?.toAgent
            const matched = agentSlug && agents?.find(a => a.slug === agentSlug || a.name === agentSlug)
            const duration = step.endTime && step.startTime ? step.endTime - step.startTime : null

            return (
              <div key={step.id} className="flex items-center gap-2 py-1">
                <div className="w-5 h-5 rounded-md overflow-hidden shrink-0 flex items-center justify-center bg-surface-hover">
                  {matched && isMascotConfig(matched.avatarUrl) ? (
                    <MascotAvatar config={matched.avatarUrl!} size={20} />
                  ) : (
                    <Bot className="w-3 h-3 text-text-muted" />
                  )}
                </div>
                <span className={cn(
                  'text-xs truncate flex-1',
                  step.status === 'active' ? 'font-medium text-text' : 'text-text-muted',
                )}>
                  {step.name}
                </span>
                {step.status === 'active' && (
                  <Loader2 className="w-3 h-3 animate-spin text-secondary shrink-0" />
                )}
                {step.status === 'completed' && (
                  <span className="text-[10px] text-text-muted tabular-nums shrink-0">
                    {duration ? formatDuration(duration) : 'done'}
                  </span>
                )}
                {step.status === 'failed' && (
                  <XCircle className="w-3 h-3 text-rose-400 shrink-0" />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
