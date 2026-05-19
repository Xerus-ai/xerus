'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
  Check, Copy, Eye, ChevronRight, ChevronDown,
  FileText, ListChecks, Sparkles, Maximize2, ExternalLink,
  Square, CheckSquare,
} from 'lucide-react'
import type { TodoItem, WorkspaceArtifact } from './chat-message.types'
import { MarkdownContent } from './MarkdownContent'

export function TodoProgress({ done, total, items }: { done: number; total: number; items?: TodoItem[] }) {
  const [expanded, setExpanded] = useState(false)
  const isComplete = done === total
  const hasItems = items && items.length > 0

  return (
    <div className="inline-flex flex-col items-start max-w-full">
      <button
        type="button"
        onClick={() => hasItems && setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-label="Toggle task details"
        className={cn(
          'inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-surface-active bg-surface-alt/50 transition-colors duration-150',
          hasItems && 'hover:bg-surface-hover/80',
          !hasItems && 'cursor-default'
        )}
      >
        <div className={cn(
          'w-6 h-6 rounded-lg flex items-center justify-center shrink-0',
          isComplete ? 'bg-emerald-500/10 text-emerald-600' : 'bg-surface text-text-secondary'
        )}>
          <ListChecks className="w-3 h-3" />
        </div>
        <span className={cn(
          'text-xs font-medium',
          isComplete ? 'text-emerald-600' : 'text-text-secondary'
        )}>
          {done}/{total} todos done
        </span>
        {isComplete && <Check className="w-3 h-3 text-emerald-600 shrink-0" />}
        {hasItems && (
          expanded
            ? <ChevronDown className="w-3.5 h-3.5 text-text-muted shrink-0" />
            : <ChevronRight className="w-3.5 h-3.5 text-text-muted shrink-0" />
        )}
      </button>

      {expanded && items && (
        <div className="mt-1.5 ml-3 space-y-1">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-2.5 py-1 pl-1">
              {item.done ? (
                <CheckSquare className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              ) : (
                <Square className="w-3.5 h-3.5 text-text-muted shrink-0" />
              )}
              <span className={cn(
                'text-[13px] leading-tight',
                item.done ? 'text-text-muted line-through' : 'text-text-secondary'
              )}>
                {item.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function PlanCard({
  title,
  content,
  onOpenInWorkspace,
}: {
  title: string
  content: string
  onOpenInWorkspace?: (payload: { type: 'plan'; title: string; content: string }) => void
}) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div className="rounded-2xl border border-secondary/20 bg-secondary/5 overflow-hidden mb-3">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2.5 px-4 py-3 w-full text-left hover:bg-secondary/8 transition-colors"
      >
        <div className="w-7 h-7 rounded-xl flex items-center justify-center bg-secondary/15 text-secondary shrink-0">
          <Sparkles className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">
            Proposed Plan
          </span>
          <h3 className="text-sm font-semibold text-text truncate">{title}</h3>
        </div>
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {onOpenInWorkspace && (
            <button
              type="button"
              onClick={() => onOpenInWorkspace({ type: 'plan', title, content })}
              className="p-1.5 rounded-lg text-text-muted hover:text-secondary hover:bg-secondary/8 transition-colors"
              aria-label="Open in workspace"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(content)}
            className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
            aria-label="Copy plan"
          >
            <Copy className="w-3 h-3" />
          </button>
          <button
            type="button"
            className="p-1.5 rounded-lg text-text-muted hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
            aria-label="Accept plan"
          >
            <Check className="w-3 h-3" />
          </button>
        </div>
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-text-muted shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-text-muted shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 max-h-[400px] overflow-y-auto border-t border-secondary/10 bg-surface-alt pt-3">
          <MarkdownContent content={content} />
        </div>
      )}
    </div>
  )
}

export function ArtifactCard({
  artifact,
  onOpenInWorkspace,
}: {
  artifact: WorkspaceArtifact
  onOpenInWorkspace?: (payload: { type: 'artifact'; artifact: WorkspaceArtifact }) => void
}) {
  const [showPreview, setShowPreview] = useState(false)

  return (
    <div className="rounded-xl border border-surface-active bg-surface-alt/50 overflow-hidden">
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 bg-violet-500/10 text-violet-600">
          <FileText className="w-3 h-3" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-text truncate">{artifact.filename}</div>
          <div className="text-[11px] text-text-muted truncate">
            {artifact.lineCount} lines &middot; {artifact.description}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {artifact.preview && (
            <button
              type="button"
              onClick={() => setShowPreview(!showPreview)}
              className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
              aria-label={showPreview ? 'Hide preview' : 'Show preview'}
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
          )}
          {onOpenInWorkspace && (
            <button
              type="button"
              onClick={() => onOpenInWorkspace({ type: 'artifact', artifact })}
              className="p-1.5 rounded-lg text-text-muted hover:text-secondary hover:bg-secondary/8 transition-colors"
              aria-label="Open in workspace"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {showPreview && artifact.preview && (
        <div className="px-3 pb-3 border-t border-surface-active">
          <pre className="text-[11px] leading-relaxed text-text-secondary bg-surface rounded-lg px-3 py-2 mt-2 overflow-x-auto whitespace-pre-wrap font-mono border border-surface-active max-h-[200px] overflow-y-auto">
            {artifact.preview}
          </pre>
        </div>
      )}
    </div>
  )
}
