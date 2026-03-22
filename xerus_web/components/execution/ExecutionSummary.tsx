'use client'

import { cn } from '@/lib/utils'
import { Clock, Wrench, Zap, DollarSign, Check, X, Loader2 } from 'lucide-react'

export interface ExecutionSummaryProps {
  duration_ms: number
  tool_count: number
  token_usage: number
  estimated_cost: number
  status?: 'running' | 'completed' | 'error'
  className?: string
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const seconds = Math.floor(ms / 1000) % 60
  const minutes = Math.floor(ms / 60000)
  if (minutes === 0) return `${seconds}s`
  return `${minutes}m ${seconds}s`
}

function formatTokens(count: number): string {
  if (count < 1000) return `${count}`
  return `${(count / 1000).toFixed(1)}k`
}

function formatCost(cost: number): string {
  return `$${cost.toFixed(2)}`
}

function StatusBadge({ status }: { status: 'running' | 'completed' | 'error' }) {
  if (status === 'running') {
    return (
      <div className="flex items-center gap-1.5 text-xs text-yellow-600">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-pulse rounded-full bg-yellow-500 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-yellow-500" />
        </span>
        Running
      </div>
    )
  }

  if (status === 'completed') {
    return (
      <div className="flex items-center gap-1 text-xs text-green-600">
        <Check className="h-3.5 w-3.5" />
        Completed
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1 text-xs text-red-600">
      <X className="h-3.5 w-3.5" />
      Error
    </div>
  )
}

interface StatPillProps {
  icon: React.ReactNode
  label: string
  value: string
}

function StatPill({ icon, label, value }: StatPillProps) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-text-muted">{icon}</span>
      <span className="text-xs text-text-secondary">{label}</span>
      <span className="text-sm font-medium text-text">{value}</span>
    </div>
  )
}

export function ExecutionSummary({
  duration_ms,
  tool_count,
  token_usage,
  estimated_cost,
  status,
  className,
}: ExecutionSummaryProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-4 bg-surface rounded-2xl p-3 flex-wrap',
        className
      )}
    >
      {status && <StatusBadge status={status} />}

      {status && (
        <div className="h-4 w-px bg-surface-active" aria-hidden="true" />
      )}

      <StatPill
        icon={<Clock className="h-3.5 w-3.5" />}
        label="Duration"
        value={formatDuration(duration_ms)}
      />

      <div className="h-4 w-px bg-surface-active" aria-hidden="true" />

      <StatPill
        icon={<Wrench className="h-3.5 w-3.5" />}
        label="Tools"
        value={String(tool_count)}
      />

      <div className="h-4 w-px bg-surface-active" aria-hidden="true" />

      <StatPill
        icon={<Zap className="h-3.5 w-3.5" />}
        label="Tokens"
        value={formatTokens(token_usage)}
      />

      <div className="h-4 w-px bg-surface-active" aria-hidden="true" />

      <StatPill
        icon={<DollarSign className="h-3.5 w-3.5" />}
        label="Cost"
        value={formatCost(estimated_cost)}
      />
    </div>
  )
}
