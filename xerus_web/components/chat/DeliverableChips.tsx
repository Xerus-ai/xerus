'use client'

import useSWR from 'swr'
import { useMemo } from 'react'
import { FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getWorkspaceOverview } from '@/lib/api/workspace'
import type { Agent } from './types'

interface DeliverableChipsProps {
  currentAgent: Agent | null
  onSelect: (input: { name: string; path: string; extension?: string }) => void
  className?: string
}

interface ChipItem {
  filename: string
  path: string
  channel: string
  date: string
}

const MAX_CHIPS = 6

export function DeliverableChips({ currentAgent, onSelect, className }: DeliverableChipsProps) {
  const { data: overview } = useSWR('workspace/overview', getWorkspaceOverview, {
    revalidateOnFocus: false,
    dedupingInterval: 30_000,
  })

  const chips = useMemo<ChipItem[]>(() => {
    if (!overview || !currentAgent?.slug) return []
    const agentSlug = currentAgent.slug
    const items: ChipItem[] = []

    for (const project of overview.projects) {
      for (const channel of project.channels) {
        if (!channel.agents.includes(agentSlug)) continue
        for (const deliverable of channel.deliverables) {
          items.push({
            filename: deliverable.file,
            path: `${channel.path}/output/deliverables/${deliverable.file}`,
            channel: channel.name,
            date: deliverable.date,
          })
        }
      }
    }

    items.sort((a, b) => b.date.localeCompare(a.date))
    return items.slice(0, MAX_CHIPS)
  }, [overview, currentAgent?.slug])

  if (chips.length === 0) return null

  return (
    <div
      className={cn(
        'w-full max-w-3xl mx-auto px-4 pb-1 flex items-center gap-1.5 overflow-x-auto scrollbar-thin',
        className,
      )}
      role="list"
      aria-label="Recent deliverables"
    >
      {chips.map((chip) => (
        <button
          key={chip.path}
          type="button"
          role="listitem"
          onClick={() =>
            onSelect({
              name: chip.filename,
              path: chip.path,
              extension: chip.filename.split('.').pop()?.toLowerCase(),
            })
          }
          title={`${chip.filename} \u2014 ${chip.channel}`}
          className={cn(
            'group flex items-center gap-1.5 px-2.5 py-1 rounded-full shrink-0',
            'border border-surface-active/70 bg-surface-alt/60',
            'text-[11px] text-text-secondary',
            'hover:bg-surface-hover hover:text-text hover:border-surface-pressed',
            'active:scale-[0.97] transition-all duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          )}
        >
          <FileText className="w-3 h-3 shrink-0 text-text-muted group-hover:text-secondary" />
          <span className="truncate max-w-[160px] font-medium">{chip.filename}</span>
        </button>
      ))}
    </div>
  )
}
