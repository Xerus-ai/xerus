'use client'

import { useState, useCallback, useMemo } from 'react'
import { cn } from '@/lib/utils'
import {
  FileText,
  FileEdit,
  Loader2,
  Check,
  X,
  ChevronRight,
  Copy,
} from 'lucide-react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'

export interface FileCardProps {
  operation: 'read' | 'write' | 'edit'
  filePath: string
  content?: string
  lineRange?: { start: number; end: number }
  lineCount?: number
  duration_ms?: number
  status: 'running' | 'completed' | 'error'
  defaultExpanded?: boolean
  className?: string
}

const MAX_PREVIEW_LINES = 50

function formatDurationShort(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function truncateFilePath(filePath: string): string {
  const segments = filePath.replace(/\\/g, '/').split('/')
  if (segments.length <= 2) return filePath
  return '.../' + segments.slice(-2).join('/')
}

function getFileExtension(filePath: string): string {
  const match = filePath.match(/\.([^.]+)$/)
  return match ? match[1] : ''
}

/** Map file extensions to syntax highlighter language identifiers. */
function extensionToLanguage(ext: string): string {
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'tsx',
    js: 'javascript',
    jsx: 'jsx',
    py: 'python',
    rb: 'ruby',
    rs: 'rust',
    go: 'go',
    java: 'java',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    md: 'markdown',
    css: 'css',
    scss: 'scss',
    html: 'html',
    xml: 'xml',
    sql: 'sql',
    sh: 'bash',
    bash: 'bash',
    toml: 'toml',
    dockerfile: 'docker',
  }
  return map[ext.toLowerCase()] || 'text'
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

export function FileCard({
  operation,
  filePath,
  content,
  lineRange,
  lineCount,
  duration_ms,
  status,
  defaultExpanded = false,
  className,
}: FileCardProps) {
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

  const OperationIcon = operation === 'read' ? FileText : FileEdit
  const operationLabel =
    operation === 'read' ? 'Read' : operation === 'write' ? 'Write' : 'Edit'

  const truncatedPath = truncateFilePath(filePath)
  const lastSegment = filePath.replace(/\\/g, '/').split('/').pop() || filePath

  // Determine line info text
  const lineInfo = lineRange
    ? `L${lineRange.start}-${lineRange.end}`
    : lineCount
      ? `${lineCount} lines`
      : null

  // Parse content for preview
  const { previewContent, extraLineCount, language } = useMemo(() => {
    if (!content) return { previewContent: '', extraLineCount: 0, language: 'text' }

    const lines = content.split('\n')
    const ext = getFileExtension(filePath)
    const lang = extensionToLanguage(ext)

    if (lines.length <= MAX_PREVIEW_LINES) {
      return { previewContent: content, extraLineCount: 0, language: lang }
    }

    return {
      previewContent: lines.slice(0, MAX_PREVIEW_LINES).join('\n'),
      extraLineCount: lines.length - MAX_PREVIEW_LINES,
      language: lang,
    }
  }, [content, filePath])

  return (
    <div
      className={cn(
        'bg-white border border-surface-active rounded-[24px] overflow-hidden',
        className
      )}
    >
      {/* Collapsed header */}
      <button
        type="button"
        role="button"
        aria-expanded={expanded}
        aria-label={`${operationLabel} file: ${lastSegment}, status: ${status}`}
        className="flex items-center gap-2 w-full px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:scale-95 transition-all duration-200"
        onClick={toggleExpanded}
        onKeyDown={handleKeyDown}
      >
        <OperationIcon className="h-4 w-4 text-text-secondary flex-shrink-0" />
        <span className="font-mono text-sm text-text flex-1 min-w-0 truncate">
          <span className="text-text-muted">{truncatedPath.replace(lastSegment, '')}</span>
          <span className="font-semibold">{lastSegment}</span>
        </span>
        {lineInfo && (
          <span className="text-xs text-text-muted flex-shrink-0">{lineInfo}</span>
        )}
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
          expanded ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'
        )}
      >
        <div className="px-4 pb-4 space-y-3">
          {/* Full file path */}
          <div className="bg-surface rounded-xl p-2 flex items-center justify-between">
            <span className="text-xs font-mono text-text-secondary truncate flex-1">
              {filePath}
            </span>
            <button
              type="button"
              aria-label="Copy file path"
              className="p-1 rounded-lg hover:bg-surface-hover active:scale-95 transition-all duration-200 ml-2 flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              onClick={(e) => handleCopy(filePath, e)}
            >
              <Copy className="h-3 w-3 text-text-muted" />
            </button>
          </div>

          {/* Content preview */}
          {content && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-text-secondary">
                  Content
                </span>
                <button
                  type="button"
                  aria-label="Copy file content"
                  className="p-1 rounded-lg hover:bg-surface-hover active:scale-95 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                  onClick={(e) => handleCopy(content, e)}
                >
                  <Copy className="h-3 w-3 text-text-muted" />
                </button>
              </div>
              <div
                className="rounded-xl overflow-hidden max-h-[400px] overflow-y-auto"
                aria-label={`File content: ${lastSegment}`}
              >
                <SyntaxHighlighter
                  language={language}
                  style={oneDark}
                  showLineNumbers
                  startingLineNumber={lineRange?.start || 1}
                  customStyle={{
                    margin: 0,
                    borderRadius: 0,
                    fontSize: '12px',
                  }}
                  lineNumberStyle={{
                    color: '#999999',
                    minWidth: '2.5em',
                    paddingRight: '1em',
                  }}
                >
                  {previewContent}
                </SyntaxHighlighter>
                {extraLineCount > 0 && (
                  <div className="bg-[#282c34] px-4 py-2 text-xs text-gray-400 border-t border-gray-700">
                    ... {extraLineCount} more lines
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
