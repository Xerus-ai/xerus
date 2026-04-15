'use client'

import { useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import {
  Wrench,
  Search,
  Globe,
  Database,
  Code,
  Mail,
  Calendar,
  FileText,
  Loader2,
  Check,
  X,
  ChevronRight,
  Copy,
} from 'lucide-react'

export interface ToolCallCardProps {
  toolName: string
  input?: Record<string, unknown>
  output?: string
  duration_ms?: number
  status: 'running' | 'completed' | 'error'
  error?: string
  defaultExpanded?: boolean
  className?: string
}

const TOOL_ICON_MAP: Record<string, typeof Wrench> = {
  search: Search,
  perplexity: Search,
  web: Globe,
  browse: Globe,
  database: Database,
  sql: Database,
  code: Code,
  execute: Code,
  email: Mail,
  mail: Mail,
  calendar: Calendar,
  schedule: Calendar,
  file: FileText,
  doc: FileText,
  text: FileText,
  write: FileText,
}

function getToolIcon(toolName: string): typeof Wrench {
  const lower = toolName.toLowerCase()
  for (const [key, icon] of Object.entries(TOOL_ICON_MAP)) {
    if (lower.includes(key)) return icon
  }
  return Wrench
}

function formatDurationShort(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function StatusIcon({ status }: { status: 'running' | 'completed' | 'error' }) {
  if (status === 'running') {
    return <Loader2 className="h-4 w-4 animate-spin text-yellow-500" aria-label="Running" />
  }
  if (status === 'completed') {
    return <Check className="h-4 w-4 text-green-500" aria-label="Completed" />
  }
  return <X className="h-4 w-4 text-red-500" aria-label="Error" />
}

export function ToolCallCard({
  toolName,
  input,
  output,
  duration_ms,
  status,
  error,
  defaultExpanded = false,
  className,
}: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const Icon = getToolIcon(toolName)

  const toggleExpanded = useCallback(() => {
    setExpanded((prev) => !prev)
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        toggleExpanded()
      }
    },
    [toggleExpanded]
  )

  const handleCopy = useCallback(
    (text: string, e: React.MouseEvent) => {
      e.stopPropagation()
      navigator.clipboard.writeText(text)
    },
    []
  )

  return (
    <div
      className={cn(
        'bg-card border border-surface-active rounded-xl overflow-hidden',
        className
      )}
    >
      {/* Collapsed header - always visible */}
      <button
        type="button"
        role="button"
        aria-expanded={expanded}
        aria-label={`${toolName} tool call, status: ${status}`}
        className="flex items-center gap-2 w-full px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:scale-95 transition-all duration-200"
        onClick={toggleExpanded}
        onKeyDown={handleKeyDown}
      >
        <Icon className="h-4 w-4 text-text-secondary flex-shrink-0" />
        <span className="font-mono text-sm text-text flex-1 min-w-0 truncate">
          {toolName}
        </span>
        {duration_ms !== undefined && (
          <span className="text-xs text-text-muted flex-shrink-0">
            {formatDurationShort(duration_ms)}
          </span>
        )}
        <StatusIcon status={status} />
        <ChevronRight
          className={cn(
            'h-4 w-4 text-text-muted flex-shrink-0 transition-transform duration-200',
            expanded && 'rotate-90'
          )}
        />
      </button>

      {/* Expanded content */}
      <div
        className={cn(
          'transition-all duration-200 overflow-hidden',
          expanded ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'
        )}
      >
        <div className="px-4 pb-4 space-y-3">
          {/* Input section */}
          {input && Object.keys(input).length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-text-secondary">
                  Input
                </span>
                <button
                  type="button"
                  aria-label="Copy input"
                  className="p-1 rounded-lg hover:bg-surface-hover active:scale-95 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                  onClick={(e) =>
                    handleCopy(JSON.stringify(input, null, 2), e)
                  }
                >
                  <Copy className="h-3 w-3 text-text-muted" />
                </button>
              </div>
              <div
                className="bg-surface-alt rounded-xl p-3 max-h-[300px] overflow-y-auto"
                aria-label="Tool call input"
              >
                <pre className="font-mono text-xs text-text whitespace-pre-wrap break-words">
                  {JSON.stringify(input, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {/* Output section */}
          {output && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-text-secondary">
                  Output
                </span>
                <button
                  type="button"
                  aria-label="Copy output"
                  className="p-1 rounded-lg hover:bg-surface-hover active:scale-95 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                  onClick={(e) => handleCopy(output, e)}
                >
                  <Copy className="h-3 w-3 text-text-muted" />
                </button>
              </div>
              <div
                className="bg-surface-alt rounded-xl p-3 max-h-[300px] overflow-y-auto"
                aria-label="Tool call output"
              >
                <pre className="font-mono text-xs text-text whitespace-pre-wrap break-words">
                  {output}
                </pre>
              </div>
            </div>
          )}

          {/* Error section */}
          {error && (
            <div
              className="bg-red-50 border border-red-200 rounded-xl p-3"
              role="alert"
            >
              <span className="text-xs font-medium text-red-700">{error}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
