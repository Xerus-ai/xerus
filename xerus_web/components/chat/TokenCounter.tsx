'use client'

import { cn } from '@/lib/utils'

interface TokenCounterProps {
  used: number
  total: number
  className?: string
}

function formatK(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(0)}k`
  return String(n)
}

export function TokenCounter({ used, total, className }: TokenCounterProps) {
  const pct = total > 0 ? (used / total) * 100 : 0
  const isHigh = pct > 75

  return (
    <span
      className={cn(
        'text-[11px] tabular-nums select-none transition-colors',
        isHigh ? 'text-amber-500' : 'text-text-muted/50',
        className,
      )}
    >
      {formatK(used)} / {formatK(total)}
    </span>
  )
}
