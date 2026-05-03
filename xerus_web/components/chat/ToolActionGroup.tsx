'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
  ChevronRight, ChevronDown, Loader2,
  Terminal, FileText, Pencil, Search, Globe, Brain,
  Bot, Puzzle, ListChecks, HelpCircle,
} from 'lucide-react'
import type { TurnPart, ToolCallIcon } from './streaming-turn.types'
import { ToolCallCard, type ToolCallCardData } from './ToolCallCard'
import type { Agent } from './types'

const TOOL_ICON: Record<ToolCallIcon, typeof Terminal> = {
  bash: Terminal,
  read: FileText,
  write: Pencil,
  search: Search,
  web: Globe,
  think: Brain,
  agent: Bot,
  skill: Puzzle,
  task: ListChecks,
  question: HelpCircle,
}

const TOOL_COLOR: Record<ToolCallIcon, string> = {
  bash: 'bg-emerald-500/10 text-emerald-600',
  read: 'bg-blue-500/10 text-blue-600',
  write: 'bg-violet-500/10 text-violet-600',
  search: 'bg-amber-500/10 text-amber-600',
  web: 'bg-cyan-500/10 text-cyan-600',
  think: 'bg-slate-500/10 text-slate-600',
  agent: 'bg-secondary/10 text-secondary',
  skill: 'bg-purple-500/10 text-purple-600',
  task: 'bg-teal-500/10 text-teal-600',
  question: 'bg-rose-500/10 text-rose-600',
}

type ToolPart = Extract<TurnPart, { type: 'tool' }>

function partToToolCall(part: ToolPart, agents?: Agent[]): ToolCallCardData {
  let avatarUrl: string | undefined
  if (part.name === 'Agent' && part.args && agents) {
    const subagentSlug = (part.args.subagent_type || part.args.agent_type || '') as string
    const matched = subagentSlug
      ? agents.find(a => a.slug === subagentSlug || a.name === subagentSlug)
      : undefined
    avatarUrl = matched?.avatarUrl ?? undefined
  }

  return {
    id: part.id,
    name: part.name,
    icon: part.icon,
    target: part.target,
    output: part.result != null
      ? (typeof part.result === 'string' ? part.result : JSON.stringify(part.result))
      : undefined,
    status: part.state === 'running' ? 'running' : part.state === 'error' ? 'error' : 'success',
    duration_ms: part.state === 'running' ? undefined : part.durationMs,
    avatarUrl,
  }
}

interface ToolActionGroupProps {
  tools: ToolPart[]
  agents?: Agent[]
  defaultExpanded?: boolean
}

export function ToolActionGroup({ tools, agents, defaultExpanded = false }: ToolActionGroupProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const anyRunning = tools.some(t => t.state === 'running')
  const completedCount = tools.filter(t => t.state !== 'running').length
  const totalCount = tools.length

  const uniqueIcons = [...new Set(tools.map(t => t.icon))]

  return (
    <div className="flex flex-col items-start">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className={cn(
          'inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-surface-active bg-surface-alt/50',
          'hover:bg-surface-hover/80 transition-colors duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        )}
      >
        <div className="flex items-center gap-1">
          {uniqueIcons.map((icon) => {
            const Icon = TOOL_ICON[icon] ?? Terminal
            const colorClass = TOOL_COLOR[icon] ?? TOOL_COLOR.bash
            return (
              <div
                key={icon}
                className={cn(
                  'w-5 h-5 rounded-md flex items-center justify-center shrink-0',
                  colorClass,
                  anyRunning && 'animate-pulse',
                )}
              >
                <Icon className="w-2.5 h-2.5" />
              </div>
            )
          })}
        </div>

        {anyRunning ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-text-muted">
            <Loader2 className="w-3 h-3 animate-spin text-secondary" />
            {completedCount}/{totalCount} actions
          </span>
        ) : (
          <span className="text-xs text-text-muted">
            {totalCount} {totalCount === 1 ? 'action' : 'actions'}
          </span>
        )}

        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-text-muted shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-text-muted shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="flex flex-col items-start gap-1.5 mt-1.5 ml-1">
          {tools.map((part) => (
            <ToolCallCard key={part.id} tool={partToToolCall(part, agents)} />
          ))}
        </div>
      )}
    </div>
  )
}
