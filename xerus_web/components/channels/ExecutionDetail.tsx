'use client'

import { useState, useEffect } from 'react'
import {
  Terminal,
  FileText,
  Search,
  Pencil,
  Globe,
  Clock,
  Coins,
  CheckCircle2,
  XCircle,
  Loader2,
  Copy,
  ChevronRight,
} from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { apiGet } from '@/lib/api/client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StepKind = 'bash' | 'read' | 'write' | 'search' | 'web' | 'think'

interface ExecutionStep {
  id: string
  kind: StepKind
  title: string
  detail?: string
  output?: string
  duration_ms: number
  status: 'success' | 'error'
}

interface ExecutionData {
  id: string
  agent_slug: string
  agent_name: string
  status: 'running' | 'complete' | 'failed'
  started_at: string
  finished_at?: string
  duration_ms: number
  tokens_used: number
  cost_credits: number
  steps: ExecutionStep[]
  files_changed: string[]
}

/** Shape returned by GET /api/v1/execute/:id/status */
interface ExecutionStatusResponse {
  execution_id: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  agent_slug: string
  started_at: string
  completed_at?: string
  summary?: {
    total_tokens: number
    duration_ms: number
    tool_calls: number
    agents_used: number
  }
}

interface ExecutionDetailProps {
  executionId: string | null
  open: boolean
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Step icon mapping
// ---------------------------------------------------------------------------

const STEP_ICON: Record<StepKind, typeof Terminal> = {
  bash: Terminal,
  read: FileText,
  write: Pencil,
  search: Search,
  web: Globe,
  think: Clock,
}

const STEP_COLOR: Record<StepKind, string> = {
  bash: 'bg-emerald-500/10 text-emerald-600',
  read: 'bg-blue-500/10 text-blue-600',
  write: 'bg-violet-500/10 text-violet-600',
  search: 'bg-amber-500/10 text-amber-600',
  web: 'bg-cyan-500/10 text-cyan-600',
  think: 'bg-slate-500/10 text-slate-600',
}

// ---------------------------------------------------------------------------
// API fetch helper
// ---------------------------------------------------------------------------

function mapStatusResponse(resp: ExecutionStatusResponse): ExecutionData {
  const backendStatus = resp.status
  let displayStatus: ExecutionData['status'] = 'running'
  if (backendStatus === 'completed') displayStatus = 'complete'
  else if (backendStatus === 'failed' || backendStatus === 'cancelled') displayStatus = 'failed'

  const durationMs = resp.summary?.duration_ms ?? (
    resp.completed_at
      ? new Date(resp.completed_at).getTime() - new Date(resp.started_at).getTime()
      : Date.now() - new Date(resp.started_at).getTime()
  )

  // Format agent slug into a display name (e.g. "content-writer" -> "Content Writer")
  const agentName = resp.agent_slug
    .split(/[-_]/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')

  return {
    id: resp.execution_id,
    agent_slug: resp.agent_slug,
    agent_name: agentName,
    status: displayStatus,
    started_at: resp.started_at,
    finished_at: resp.completed_at,
    duration_ms: durationMs,
    tokens_used: resp.summary?.total_tokens ?? 0,
    cost_credits: 0,
    steps: [],
    files_changed: [],
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSec = seconds % 60
  if (minutes < 60) return `${minutes}m ${remainingSec}s`
  const hours = Math.floor(minutes / 60)
  const remainingMin = minutes % 60
  return `${hours}h ${remainingMin}m`
}

function formatTime(dateString: string): string {
  return new Date(dateString).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: ExecutionData['status'] }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full',
        status === 'complete' && 'bg-emerald-500/10 text-emerald-600',
        status === 'running' && 'bg-blue-500/10 text-blue-600',
        status === 'failed' && 'bg-red-500/10 text-red-600'
      )}
    >
      {status === 'complete' && <CheckCircle2 className="w-3 h-3" />}
      {status === 'running' && <Loader2 className="w-3 h-3 animate-spin" />}
      {status === 'failed' && <XCircle className="w-3 h-3" />}
      {status === 'complete' ? 'Completed' : status === 'running' ? 'Running' : 'Failed'}
    </span>
  )
}

function StepItem({ step, index }: { step: ExecutionStep; index: number }) {
  const Icon = STEP_ICON[step.kind]
  const colorClass = STEP_COLOR[step.kind]

  return (
    <div className="flex gap-3 group">
      {/* Timeline rail */}
      <div className="flex flex-col items-center">
        <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0', colorClass)}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <div className="w-px flex-1 bg-border group-last:bg-transparent" />
      </div>

      {/* Content */}
      <div className="pb-5 min-w-0 flex-1">
        <div className="flex items-baseline gap-2 mb-0.5">
          <span className="text-sm font-medium text-text">{step.title}</span>
          <span className="text-[11px] text-text-muted tabular-nums font-mono">
            {formatDuration(step.duration_ms)}
          </span>
          {step.status === 'error' && (
            <span className="text-[10px] font-medium text-red-500 uppercase">Failed</span>
          )}
        </div>
        {step.detail && (
          <p className="text-xs text-text-muted mb-1 font-mono truncate">{step.detail}</p>
        )}
        {step.output && (
          <div className="relative group/output">
            <pre className="text-[11px] leading-relaxed text-text-secondary bg-surface/80 rounded-xl px-3 py-2 overflow-x-auto whitespace-pre-wrap font-mono border border-border">
              {step.output}
            </pre>
            <button
              type="button"
              aria-label="Copy output"
              className="absolute top-1.5 right-1.5 p-1 rounded-md bg-card/80 text-text-muted hover:text-text opacity-0 group-hover/output:opacity-100 transition-opacity"
              onClick={() => navigator.clipboard.writeText(step.output ?? '')}
            >
              <Copy className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ExecutionDetail({ executionId, open, onClose }: ExecutionDetailProps) {
  const [execution, setExecution] = useState<ExecutionData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!executionId || !open) {
      setExecution(null)
      setError(null)
      return
    }

    let cancelled = false
    setIsLoading(true)
    setError(null)

    apiGet<{ data: ExecutionStatusResponse }>(`/execute/${executionId}/status`)
      .then((result) => {
        if (cancelled) return
        const resp = (result as Record<string, unknown>).data
          ? (result as { data: ExecutionStatusResponse }).data
          : result as unknown as ExecutionStatusResponse
        setExecution(mapStatusResponse(resp))
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load execution')
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => { cancelled = true }
  }, [executionId, open])

  if (!open) return null

  if (isLoading) {
    return (
      <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
        <SheetContent side="right" className="w-full sm:max-w-[480px] p-0 bg-card flex flex-col items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
          <p className="text-sm text-text-muted mt-2">Loading execution...</p>
        </SheetContent>
      </Sheet>
    )
  }

  if (error || !execution) {
    return (
      <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
        <SheetContent side="right" className="w-full sm:max-w-[480px] p-0 bg-card flex flex-col items-center justify-center">
          <XCircle className="w-6 h-6 text-red-500" />
          <p className="text-sm text-text-secondary mt-2">{error ?? 'Execution not found'}</p>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[480px] p-0 bg-card flex flex-col"
      >
        <SheetHeader className="px-5 pt-5 pb-0 space-y-0">
          <div className="flex items-center gap-3 mb-3">
            <Avatar className="w-9 h-9 ring-2 ring-border">
              <AvatarFallback className="text-xs font-medium bg-surface-hover text-text-secondary">
                {execution.agent_name.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-base font-semibold text-text leading-tight">
                {execution.agent_name}
              </SheetTitle>
              <SheetDescription className="text-xs text-text-muted">
                {formatDate(execution.started_at)}
              </SheetDescription>
            </div>
            <StatusBadge status={execution.status} />
          </div>

          {/* Stats bar */}
          <div className="flex items-center gap-1 pb-4 flex-wrap">
            <span className="inline-flex items-center gap-1 text-[11px] text-text-muted bg-surface rounded-full px-2.5 py-1">
              <Clock className="w-3 h-3" />
              {formatDuration(execution.duration_ms)}
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] text-text-muted bg-surface rounded-full px-2.5 py-1">
              <Coins className="w-3 h-3" />
              {execution.cost_credits} credits
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] text-text-muted bg-surface rounded-full px-2.5 py-1">
              {execution.tokens_used.toLocaleString()} tokens
            </span>
          </div>
        </SheetHeader>

        {/* Divider */}
        <div className="h-px bg-border" />

        {/* Execution timeline */}
        <ScrollArea className="flex-1">
          <div className="px-5 pt-4 pb-6">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text-muted mb-4">
              Execution Timeline
            </h3>
            <div>
              {execution.steps.length === 0 ? (
                <p className="text-xs text-text-muted text-center py-6">
                  Step-level timeline not available for this execution.
                </p>
              ) : (
                execution.steps.map((step, i) => (
                  <StepItem key={step.id} step={step} index={i} />
                ))
              )}
            </div>

            {/* Files changed */}
            {execution.files_changed.length > 0 && (
              <div className="mt-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text-muted mb-3">
                  Files Changed
                </h3>
                <div className="space-y-1">
                  {execution.files_changed.map((file) => (
                    <div
                      key={file}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface/60 border border-border text-sm group/file hover:bg-surface-hover transition-colors"
                    >
                      <FileText className="w-3.5 h-3.5 text-text-muted shrink-0" />
                      <span className="text-text-secondary font-mono text-xs flex-1 truncate">{file}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-text-muted opacity-0 group-hover/file:opacity-100 transition-opacity" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
