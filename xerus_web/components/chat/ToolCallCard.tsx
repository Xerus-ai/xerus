'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
  ChevronRight, ChevronDown, Terminal, Loader2,
} from 'lucide-react'
import type { ToolCallIcon } from './streaming-turn.types'
import { TOOL_ICON_MAP, TOOL_COLOR_MAP } from './tool-icon.utils'

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export interface ToolCallCardData {
  id: string
  name: string
  icon: ToolCallIcon
  target?: string
  detail?: string
  output?: string
  status: 'success' | 'error' | 'running'
  duration_ms?: number
  avatarUrl?: string
}

interface ToolCallCardProps {
  tool: ToolCallCardData
}

export function ToolCallCard({ tool }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false)
  const Icon = TOOL_ICON_MAP[tool.icon] ?? Terminal
  const colorClass = TOOL_COLOR_MAP[tool.icon] ?? TOOL_COLOR_MAP.bash
  const isRunning = tool.status === 'running'
  const isQuestion = tool.icon === 'question'
  const isAwaitingResponse = isQuestion && isRunning

  return (
    <button
      type="button"
      onClick={() => !isRunning && setExpanded(!expanded)}
      className={cn(
        'inline-flex flex-col items-start max-w-full text-left rounded-xl border overflow-hidden',
        'hover:bg-surface-hover/80 transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        isAwaitingResponse
          ? 'border-rose-200 bg-rose-50/50'
          : 'border-surface-active bg-surface-alt/50',
      )}
    >
      {/* Header row */}
      <div className="flex items-center gap-2.5 px-3 py-2 min-w-0">
        <div className={cn('w-6 h-6 rounded-lg flex items-center justify-center shrink-0 overflow-hidden', colorClass)}>
          {isRunning && !isQuestion ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : tool.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tool.avatarUrl} alt={tool.name} className="w-6 h-6 object-cover" />
          ) : (
            <Icon className="w-3 h-3" />
          )}
        </div>
        <span className="text-xs font-medium text-text shrink-0">{tool.name}</span>
        {tool.target && (
          <span className="text-xs text-secondary font-mono truncate min-w-0 flex-1 px-1.5 py-0.5 rounded-md border border-secondary/15 bg-secondary/5">
            {tool.target}
          </span>
        )}
        {tool.detail && (
          <span className="text-[11px] text-text-muted shrink-0 hidden sm:inline">
            ({tool.detail})
          </span>
        )}
        {isAwaitingResponse ? (
          <span className="text-[10px] font-medium text-rose-500 shrink-0 animate-pulse">Awaiting response</span>
        ) : isRunning ? (
          <Loader2 className="w-3 h-3 animate-spin text-text-muted shrink-0" />
        ) : tool.duration_ms != null ? (
          <span className="text-[10px] text-text-muted tabular-nums shrink-0">
            {formatDuration(tool.duration_ms)}
          </span>
        ) : null}
        {!isRunning && tool.output && (
          expanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-text-muted shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-text-muted shrink-0" />
          )
        )}
      </div>

      {/* Expanded output */}
      {expanded && tool.output && (
        <div className="px-3 pb-2.5 pt-0">
          <pre className="text-[11px] leading-relaxed text-foreground/80 bg-surface rounded-lg px-3 py-2 overflow-x-auto whitespace-pre-wrap font-mono border border-surface-active">
            {tool.output}
          </pre>
        </div>
      )}
    </button>
  )
}
