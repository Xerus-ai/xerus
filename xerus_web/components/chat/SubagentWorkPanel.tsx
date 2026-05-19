'use client'

import { cn } from '@/lib/utils'
import {
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Loader2,
  Check,
  XCircle,
  Bot,
  X as XIcon,
  Copy,
  ChevronsUpDown,
} from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import type { ExecutionStep } from './types'
import type { Agent } from './types'
import { isMascotConfig } from '@/lib/mascot-config'
import { MascotAvatar } from '@/components/agents/MascotAvatar'

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`
}

function isSubagentStep(step: ExecutionStep): boolean {
  return step.id.startsWith('subagent-') || step.id.startsWith('delegation-')
}

interface SubagentGroup {
  parent: ExecutionStep
  children: ExecutionStep[]
}

function groupSubagentSteps(steps: ExecutionStep[]): SubagentGroup[] {
  const subagentSteps = steps.filter(isSubagentStep)
  const regularSteps = steps.filter(s => !isSubagentStep(s))

  return subagentSteps.map(parent => {
    const agentName = parent.name.split(':')[0]?.trim()
    const children = regularSteps.filter(s => {
      const meta = s.metadata as Record<string, string> | undefined
      return meta?.parentAgent === agentName || meta?.toAgent === agentName
    })
    return { parent, children }
  })
}

function copySummary(groups: SubagentGroup[]): string {
  return groups.map(g => {
    const status = g.parent.status === 'completed' ? 'done' : g.parent.status === 'failed' ? 'failed' : 'working'
    const duration = g.parent.endTime && g.parent.startTime
      ? ` (${formatDuration(g.parent.endTime - g.parent.startTime)})`
      : ''
    const childLines = g.children.map(c => `  - ${c.name}: ${c.status}`).join('\n')
    return `${g.parent.name}: ${status}${duration}${childLines ? '\n' + childLines : ''}`
  }).join('\n')
}

interface SubagentStepRowProps {
  step: ExecutionStep
  agents?: Agent[]
  children?: ExecutionStep[]
  isChildExpanded: boolean
  onToggleChildren: () => void
}

function SubagentStepRow({ step, agents, children, isChildExpanded, onToggleChildren }: SubagentStepRowProps) {
  const agentSlug = (step.metadata as Record<string, string> | undefined)?.toAgent
  const matched = agentSlug && agents?.find(a => a.slug === agentSlug || a.name === agentSlug)
  const duration = step.endTime && step.startTime ? step.endTime - step.startTime : null
  const hasChildren = children && children.length > 0

  return (
    <div>
      <div className="flex items-center gap-2 py-1">
        {hasChildren ? (
          <button
            type="button"
            onClick={onToggleChildren}
            className="w-5 h-5 shrink-0 flex items-center justify-center rounded hover:bg-surface-hover transition-colors"
          >
            <ChevronRight className={cn(
              'w-3 h-3 text-text-muted transition-transform',
              isChildExpanded && 'rotate-90',
            )} />
          </button>
        ) : (
          <div className="w-5 h-5 rounded-md overflow-hidden shrink-0 flex items-center justify-center bg-surface-hover">
            {matched && isMascotConfig(matched.avatarUrl) ? (
              <MascotAvatar config={matched.avatarUrl!} size={20} />
            ) : (
              <Bot className="w-3 h-3 text-text-muted" />
            )}
          </div>
        )}
        <span className={cn(
          'text-xs truncate flex-1',
          step.status === 'active' ? 'font-medium text-text' : 'text-text-muted',
          step.status === 'failed' && 'text-rose-400',
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

      {hasChildren && isChildExpanded && (
        <div className="ml-5 pl-2 border-l border-border/30 space-y-0.5">
          {children.map(child => {
            const childDuration = child.endTime && child.startTime ? child.endTime - child.startTime : null
            return (
              <div key={child.id} className="flex items-center gap-2 py-0.5">
                {child.status === 'active' && <Loader2 className="w-2.5 h-2.5 animate-spin text-secondary shrink-0" />}
                {child.status === 'completed' && <Check className="w-2.5 h-2.5 text-emerald-500 shrink-0" />}
                {child.status === 'failed' && <XCircle className="w-2.5 h-2.5 text-rose-400 shrink-0" />}
                {child.status === 'pending' && <span className="w-2.5 h-2.5 rounded-full border border-text-muted/40 shrink-0" />}
                <span className={cn(
                  'text-[11px] truncate flex-1',
                  child.status === 'active' ? 'text-text' : 'text-text-muted',
                )}>
                  {child.name}
                </span>
                {child.status === 'completed' && childDuration && (
                  <span className="text-[9px] text-text-muted tabular-nums shrink-0">
                    {formatDuration(childDuration)}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export interface SubagentWorkPanelProps {
  steps: ExecutionStep[]
  agents?: Agent[]
  className?: string
  onClose?: () => void
  variant?: 'inline' | 'panel'
}

export function SubagentWorkPanel({ steps, agents, className, onClose, variant = 'inline' }: SubagentWorkPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const [expandedChildren, setExpandedChildren] = useState<Set<string>>(new Set())
  const scrollRef = useRef<HTMLDivElement>(null)

  const groups = groupSubagentSteps(steps)
  const subagentSteps = steps.filter(isSubagentStep)

  // Auto-scroll to latest activity
  useEffect(() => {
    if (isExpanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [subagentSteps.length, isExpanded])

  if (subagentSteps.length === 0) return null

  const activeCount = subagentSteps.filter(s => s.status === 'active').length
  const completedCount = subagentSteps.filter(s => s.status === 'completed' || s.status === 'failed').length
  const totalCount = subagentSteps.length
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  const toggleChildExpanded = (stepId: string) => {
    setExpandedChildren(prev => {
      const next = new Set(prev)
      if (next.has(stepId)) next.delete(stepId)
      else next.add(stepId)
      return next
    })
  }

  const toggleAllChildren = () => {
    if (expandedChildren.size > 0) {
      setExpandedChildren(new Set())
    } else {
      setExpandedChildren(new Set(groups.filter(g => g.children.length > 0).map(g => g.parent.id)))
    }
  }

  const isPanel = variant === 'panel'

  return (
    <div className={cn(
      'border border-border/50 rounded-xl bg-surface-alt/30 overflow-hidden',
      isPanel && 'h-full flex flex-col',
      className,
    )}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 min-h-[36px]">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 flex-1 min-w-0 hover:bg-surface-hover/50 rounded -mx-1 px-1 transition-colors"
        >
          {activeCount > 0 ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-secondary shrink-0" />
          ) : (
            <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          )}
          <span className="text-xs font-semibold text-text shrink-0">
            {activeCount > 0 ? `${activeCount} agent${activeCount > 1 ? 's' : ''} working` : 'Agents done'}
          </span>
          {completedCount > 0 && activeCount > 0 && (
            <span className="text-[10px] text-text-muted shrink-0">{completedCount}/{totalCount} done</span>
          )}
          {isExpanded
            ? <ChevronUp className="w-3 h-3 text-text-muted shrink-0" />
            : <ChevronDown className="w-3 h-3 text-text-muted shrink-0" />
          }
        </button>

        {/* Action buttons */}
        <div className="flex items-center gap-0.5 shrink-0">
          {groups.some(g => g.children.length > 0) && (
            <button
              type="button"
              onClick={toggleAllChildren}
              className="p-1 rounded text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
              aria-label={expandedChildren.size > 0 ? 'Collapse all' : 'Expand all'}
              title={expandedChildren.size > 0 ? 'Collapse all' : 'Expand all'}
            >
              <ChevronsUpDown className="w-3 h-3" />
            </button>
          )}
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(copySummary(groups))}
            className="p-1 rounded text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
            aria-label="Copy summary"
            title="Copy summary"
          >
            <Copy className="w-3 h-3" />
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
              aria-label="Close"
            >
              <XIcon className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {activeCount > 0 && totalCount > 1 && (
        <div className="px-3 pb-1">
          <div className="h-1 rounded-full bg-surface-hover overflow-hidden">
            <div
              className="h-full rounded-full bg-secondary transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      <div
        ref={scrollRef}
        className={cn(
          'overflow-hidden transition-all duration-200',
          isExpanded ? 'px-3 pb-2 space-y-0.5 overflow-y-auto opacity-100' : 'max-h-0 opacity-0',
          isPanel && isExpanded ? 'flex-1' : isExpanded ? 'max-h-[200px]' : '',
        )}
      >
          {groups.map(({ parent, children }) => (
            <SubagentStepRow
              key={parent.id}
              step={parent}
              agents={agents}
              children={children}
              isChildExpanded={expandedChildren.has(parent.id)}
              onToggleChildren={() => toggleChildExpanded(parent.id)}
            />
          ))}
      </div>
    </div>
  )
}
