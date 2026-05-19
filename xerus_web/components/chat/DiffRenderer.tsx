'use client'

import { cn } from '@/lib/utils'

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged'
  content: string
  oldNum?: number
  newNum?: number
}

function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')
  const result: DiffLine[] = []

  let oldIdx = 0
  let newIdx = 0

  while (oldIdx < oldLines.length || newIdx < newLines.length) {
    if (oldIdx >= oldLines.length) {
      result.push({ type: 'added', content: newLines[newIdx], newNum: newIdx + 1 })
      newIdx++
    } else if (newIdx >= newLines.length) {
      result.push({ type: 'removed', content: oldLines[oldIdx], oldNum: oldIdx + 1 })
      oldIdx++
    } else if (oldLines[oldIdx] === newLines[newIdx]) {
      result.push({ type: 'unchanged', content: oldLines[oldIdx], oldNum: oldIdx + 1, newNum: newIdx + 1 })
      oldIdx++
      newIdx++
    } else {
      const lookAheadNew = newLines.indexOf(oldLines[oldIdx], newIdx)
      const lookAheadOld = oldLines.indexOf(newLines[newIdx], oldIdx)

      if (lookAheadNew >= 0 && (lookAheadOld < 0 || lookAheadNew - newIdx <= lookAheadOld - oldIdx)) {
        while (newIdx < lookAheadNew) {
          result.push({ type: 'added', content: newLines[newIdx], newNum: newIdx + 1 })
          newIdx++
        }
      } else if (lookAheadOld >= 0) {
        while (oldIdx < lookAheadOld) {
          result.push({ type: 'removed', content: oldLines[oldIdx], oldNum: oldIdx + 1 })
          oldIdx++
        }
      } else {
        result.push({ type: 'removed', content: oldLines[oldIdx], oldNum: oldIdx + 1 })
        result.push({ type: 'added', content: newLines[newIdx], newNum: newIdx + 1 })
        oldIdx++
        newIdx++
      }
    }
  }

  return result
}

interface DiffRendererProps {
  oldContent: string
  newContent: string
  language?: string
}

export function DiffRenderer({ oldContent, newContent }: DiffRendererProps) {
  const lines = computeDiff(oldContent, newContent)
  const addedCount = lines.filter(l => l.type === 'added').length
  const removedCount = lines.filter(l => l.type === 'removed').length

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-surface-active bg-surface-alt/50 text-xs text-text-muted">
        <span className="text-emerald-600">+{addedCount}</span>
        <span className="text-rose-500">-{removedCount}</span>
      </div>
      <div className="flex-1 overflow-auto font-mono text-[12px] leading-[1.6] min-w-0">
        {lines.map((line, i) => (
          <div
            key={i}
            className={cn(
              'flex',
              line.type === 'added' && 'bg-emerald-500/8',
              line.type === 'removed' && 'bg-rose-500/8',
            )}
          >
            <span className={cn(
              'w-10 shrink-0 text-right pr-2 select-none',
              line.type === 'added' ? 'text-emerald-600/60' : line.type === 'removed' ? 'text-rose-500/60' : 'text-text-muted/40',
            )}>
              {line.oldNum ?? ''}
            </span>
            <span className={cn(
              'w-10 shrink-0 text-right pr-2 select-none',
              line.type === 'added' ? 'text-emerald-600/60' : line.type === 'removed' ? 'text-rose-500/60' : 'text-text-muted/40',
            )}>
              {line.newNum ?? ''}
            </span>
            <span className={cn(
              'w-5 shrink-0 text-center select-none',
              line.type === 'added' ? 'text-emerald-600' : line.type === 'removed' ? 'text-rose-500' : 'text-text-muted/30',
            )}>
              {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
            </span>
            <span className={cn(
              'flex-1 px-2 whitespace-pre-wrap break-all',
              line.type === 'added' ? 'text-emerald-700 dark:text-emerald-300' : line.type === 'removed' ? 'text-rose-700 dark:text-rose-300' : 'text-text-secondary',
            )}>
              {line.content}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
