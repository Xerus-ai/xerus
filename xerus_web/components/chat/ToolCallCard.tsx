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
  const seconds = Math.round(ms / 1000)
  if (seconds === 1) return '1 second'
  if (seconds < 60) return `${seconds} seconds`
  const minutes = Math.round(seconds / 60)
  return `${minutes} min`
}

function isEditTool(name: string): boolean {
  const n = name.toLowerCase()
  return n === 'edit' || n === 'multiedit'
}

export interface ToolCallCardData {
  id: string
  name: string
  label: string
  icon: ToolCallIcon
  target?: string
  detail?: string
  progressMessage?: string
  output?: string
  args?: Record<string, unknown>
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
  const hasExpandableContent = !isRunning && (tool.output || (isEditTool(tool.name) && tool.args))

  const durationText = tool.duration_ms != null ? formatDuration(tool.duration_ms) : null

  return (
    <div className={cn(
      'inline-flex flex-col items-start max-w-full rounded-xl border overflow-hidden',
      'transition-colors duration-150',
      isAwaitingResponse
        ? 'border-rose-200 bg-rose-50/50'
        : 'border-surface-active bg-surface-alt/50',
    )}>
      {/* Header row */}
      <button
        type="button"
        onClick={() => hasExpandableContent && setExpanded(!expanded)}
        className={cn(
          'flex items-center gap-2 px-3 py-2 min-w-0 w-full text-left',
          hasExpandableContent && 'hover:bg-surface-hover/80 cursor-pointer',
          !hasExpandableContent && 'cursor-default',
        )}
      >
        <div className={cn('w-5 h-5 rounded-md flex items-center justify-center shrink-0 overflow-hidden', colorClass)}>
          {isRunning && !isQuestion ? (
            <Loader2 className="w-2.5 h-2.5 animate-spin" />
          ) : tool.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tool.avatarUrl} alt={tool.name} className="w-5 h-5 object-cover" />
          ) : (
            <Icon className="w-2.5 h-2.5" />
          )}
        </div>

        {/* Label + duration inline */}
        <span className="text-xs text-text min-w-0 flex-1 truncate">
          <span className="font-medium">{tool.label}</span>
          {tool.target && (
            <span className="text-secondary ml-1.5 font-mono">{tool.target}</span>
          )}
          {tool.detail && (
            <span className="text-text-muted ml-1 hidden sm:inline">({tool.detail})</span>
          )}
          {isRunning && tool.progressMessage && (
            <span className="text-text-muted ml-1.5 italic">{tool.progressMessage}</span>
          )}
          {!isRunning && durationText && (
            <span className="text-text-muted ml-1.5">({durationText})</span>
          )}
        </span>

        {isAwaitingResponse ? (
          <span className="text-[10px] font-medium text-rose-500 shrink-0 animate-pulse">Awaiting response</span>
        ) : isRunning ? (
          <Loader2 className="w-3 h-3 animate-spin text-text-muted shrink-0" />
        ) : null}

        {hasExpandableContent && (
          expanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-text-muted shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-text-muted shrink-0" />
          )
        )}
      </button>

      {/* Expanded output */}
      {expanded && (
        <div className="px-3 pb-2.5 pt-0 w-full">
          {/* Diff view for Edit/MultiEdit */}
          {isEditTool(tool.name) && tool.args?.old_string && tool.args?.new_string ? (
            <DiffBlock
              oldStr={tool.args.old_string as string}
              newStr={tool.args.new_string as string}
              filePath={tool.target}
            />
          ) : tool.output ? (
            <pre className={cn(
              'text-[11px] leading-relaxed text-foreground/80 rounded-lg px-3 py-2 overflow-x-auto whitespace-pre-wrap font-mono border border-surface-active max-h-[300px] overflow-y-auto',
              tool.status === 'error' ? 'bg-red-50/50 border-red-200/50' : 'bg-surface',
            )}>
              {tool.output}
            </pre>
          ) : null}
        </div>
      )}
    </div>
  )
}

function DiffBlock({ oldStr, newStr, filePath }: { oldStr: string; newStr: string; filePath?: string }) {
  const oldLines = oldStr.split('\n')
  const newLines = newStr.split('\n')

  return (
    <div className="rounded-lg border border-surface-active overflow-hidden text-[11px] font-mono">
      {filePath && (
        <div className="px-3 py-1.5 bg-surface-alt border-b border-surface-active text-text-muted text-[10px]">
          {filePath}
        </div>
      )}
      <div className="max-h-[250px] overflow-y-auto">
        {oldLines.map((line, i) => (
          <div key={`old-${i}`} className="flex bg-red-50/60">
            <span className="w-8 text-right pr-2 text-red-400/70 select-none shrink-0 border-r border-red-200/30">-</span>
            <span className="px-2 text-red-700/80 whitespace-pre-wrap break-all flex-1">{line}</span>
          </div>
        ))}
        {newLines.map((line, i) => (
          <div key={`new-${i}`} className="flex bg-emerald-50/60">
            <span className="w-8 text-right pr-2 text-emerald-400/70 select-none shrink-0 border-r border-emerald-200/30">+</span>
            <span className="px-2 text-emerald-700/80 whitespace-pre-wrap break-all flex-1">{line}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
