'use client'

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

export interface SlashCommand {
  name: string
  description: string
  category: 'skill' | 'action' | 'context'
  icon: LucideIcon
}

interface SlashCommandPickerProps {
  query: string
  commands: SlashCommand[]
  selectedIdx: number
  onSelect: (cmd: SlashCommand) => void
  onSelectedIdxChange: (idx: number) => void
}

const CATEGORY_LABELS: Record<string, string> = {
  skill: 'Skills',
  action: 'Actions',
  context: 'Context',
}

export function SlashCommandPicker({
  query,
  commands,
  selectedIdx,
  onSelect,
  onSelectedIdxChange,
}: SlashCommandPickerProps) {
  const pickerRef = useRef<HTMLDivElement>(null)

  const filtered = commands.filter(
    (cmd) =>
      cmd.name.toLowerCase().includes(query.toLowerCase()) ||
      cmd.description.toLowerCase().includes(query.toLowerCase()),
  )

  const grouped = (['skill', 'action', 'context'] as const)
    .map((cat) => ({
      category: cat,
      label: CATEGORY_LABELS[cat],
      items: filtered.filter((c) => c.category === cat),
    }))
    .filter((g) => g.items.length > 0)

  const flatItems = grouped.flatMap((g) => g.items)

  useEffect(() => {
    if (!pickerRef.current || flatItems.length === 0) return
    const allButtons = pickerRef.current.querySelectorAll('[role="option"]')
    const target = allButtons[selectedIdx] as HTMLElement | undefined
    target?.scrollIntoView({ block: 'nearest' })
  }, [selectedIdx, flatItems.length])

  if (flatItems.length === 0) return null

  return (
    <div
      ref={pickerRef}
      className="absolute bottom-full left-0 w-[320px] mb-2 bg-card border border-border rounded-xl shadow-lg backdrop-blur-sm overflow-hidden max-h-[280px] overflow-y-auto z-10"
      role="listbox"
      aria-label="Slash commands"
    >
      {grouped.map((group) => (
        <div key={group.category}>
          <div className="px-3 py-1.5 border-b border-border">
            <span className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
              {group.label}
            </span>
          </div>
          <div className="p-1">
            {group.items.map((cmd) => {
              const idx = flatItems.indexOf(cmd)
              const Icon = cmd.icon
              return (
                <button
                  key={cmd.name}
                  type="button"
                  role="option"
                  aria-selected={idx === selectedIdx}
                  className={cn(
                    'flex items-center gap-2.5 w-full px-2 py-1.5 text-left rounded-md transition-colors duration-100',
                    idx === selectedIdx
                      ? 'bg-surface-hover text-text'
                      : 'text-text hover:bg-surface-hover',
                  )}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    onSelect(cmd)
                  }}
                  onMouseEnter={() => onSelectedIdxChange(idx)}
                >
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 bg-surface-hover text-text-secondary">
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium">/{cmd.name}</span>
                    <span className="text-[11px] text-text-muted ml-2 truncate">
                      {cmd.description}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
