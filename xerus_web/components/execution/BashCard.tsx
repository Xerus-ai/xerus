'use client'

import { useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Terminal, Loader2, Check, X, ChevronRight, Copy } from 'lucide-react'

export interface BashCardProps {
  command: string
  stdout?: string
  stderr?: string
  exitCode?: number
  duration_ms?: number
  status: 'running' | 'completed' | 'error'
  defaultExpanded?: boolean
  className?: string
}

function formatDurationShort(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function ExitCodeBadge({ code }: { code: number }) {
  const isSuccess = code === 0
  return (
    <span
      className={cn(
        'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium',
        isSuccess
          ? 'bg-green-900/50 text-green-400'
          : 'bg-red-900/50 text-red-400'
      )}
    >
      exit {code}
    </span>
  )
}

function StatusIcon({ status }: { status: 'running' | 'completed' | 'error' }) {
  if (status === 'running') {
    return <Loader2 className="h-4 w-4 animate-spin text-yellow-500" aria-label="Running" />
  }
  if (status === 'completed') {
    return <Check className="h-4 w-4 text-green-400" aria-label="Completed" />
  }
  return <X className="h-4 w-4 text-red-400" aria-label="Error" />
}

export function BashCard({
  command,
  stdout,
  stderr,
  exitCode,
  duration_ms,
  status,
  defaultExpanded = false,
  className,
}: BashCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)

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
        'bg-gray-900 rounded-[24px] overflow-hidden',
        className
      )}
    >
      {/* Collapsed header */}
      <button
        type="button"
        role="button"
        aria-expanded={expanded}
        aria-label={`Bash command: ${command}, status: ${status}`}
        className="flex items-center gap-2 w-full px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6600] focus-visible:ring-offset-2 active:scale-95 transition-all duration-200"
        onClick={toggleExpanded}
        onKeyDown={handleKeyDown}
      >
        <Terminal className="h-4 w-4 text-gray-400 flex-shrink-0" />
        <span className="font-mono text-sm text-green-400 flex-1 min-w-0 truncate">
          $ {command}
        </span>
        {exitCode !== undefined && <ExitCodeBadge code={exitCode} />}
        {duration_ms !== undefined && (
          <span className="text-xs text-gray-500 flex-shrink-0">
            {formatDurationShort(duration_ms)}
          </span>
        )}
        <StatusIcon status={status} />
        <ChevronRight
          className={cn(
            'h-4 w-4 text-gray-500 flex-shrink-0 transition-transform duration-200',
            expanded && 'rotate-90'
          )}
        />
      </button>

      {/* Expanded content */}
      <div
        className={cn(
          'transition-all duration-200 overflow-hidden',
          expanded ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'
        )}
      >
        {/* Command display */}
        <div className="bg-gray-900 px-4 py-3 border-t border-gray-700">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
              Command
            </span>
            <button
              type="button"
              aria-label="Copy command"
              className="p-1 rounded-lg hover:bg-gray-800 active:scale-95 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6600] focus-visible:ring-offset-2"
              onClick={(e) => handleCopy(command, e)}
            >
              <Copy className="h-3 w-3 text-gray-500" />
            </button>
          </div>
          <pre className="font-mono text-xs text-green-400 whitespace-pre-wrap break-words">
            <span className="text-gray-500">$ </span>
            {command}
          </pre>
        </div>

        {/* stdout */}
        {stdout && (
          <div className="border-t border-gray-700">
            <div className="px-4 py-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                  stdout
                </span>
                <button
                  type="button"
                  aria-label="Copy stdout"
                  className="p-1 rounded-lg hover:bg-gray-800 active:scale-95 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6600] focus-visible:ring-offset-2"
                  onClick={(e) => handleCopy(stdout, e)}
                >
                  <Copy className="h-3 w-3 text-gray-500" />
                </button>
              </div>
              <div
                className="max-h-[400px] overflow-y-auto"
                aria-label="Standard output"
              >
                <pre className="font-mono text-xs text-gray-100 whitespace-pre-wrap break-words">
                  {stdout}
                </pre>
              </div>
            </div>
          </div>
        )}

        {/* stderr */}
        {stderr && (
          <div className="border-t border-gray-700">
            <div className="px-4 py-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-medium text-red-400 uppercase tracking-wider">
                  stderr
                </span>
                <button
                  type="button"
                  aria-label="Copy stderr"
                  className="p-1 rounded-lg hover:bg-gray-800 active:scale-95 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6600] focus-visible:ring-offset-2"
                  onClick={(e) => handleCopy(stderr, e)}
                >
                  <Copy className="h-3 w-3 text-gray-500" />
                </button>
              </div>
              <div
                className="max-h-[400px] overflow-y-auto"
                aria-label="Standard error"
              >
                <pre className="font-mono text-xs text-red-400 whitespace-pre-wrap break-words">
                  {stderr}
                </pre>
              </div>
            </div>
          </div>
        )}

        {/* Bottom bar */}
        <div className="flex items-center gap-3 px-4 py-2 border-t border-gray-700 bg-gray-900/50">
          {exitCode !== undefined && <ExitCodeBadge code={exitCode} />}
          {duration_ms !== undefined && (
            <span className="text-xs text-gray-500">
              {formatDurationShort(duration_ms)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
