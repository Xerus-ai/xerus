'use client'

import { useState, useMemo } from 'react'
import { ChevronsUpDown, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Agent } from './types'
import { isMascotConfig } from '@/lib/mascot-config'
import { MascotAvatar } from '@/components/agents/MascotAvatar'
// getModelIconPath removed — model badges stripped from dropdown for cleaner UX

export const XERUS_MASTER_SLUG = 'xerus-master'
export const XERUS_CTO_SLUG = 'xerus-cto'

export const XERUS_AGENT: Agent = {
  id: 0, // Resolved at runtime from agents list
  slug: XERUS_MASTER_SLUG,
  name: 'Xerus',
  description: 'Runs the show, delegates the rest',
  avatarUrl: '/logo/xerus.svg',
  model: 'anthropic/claude-sonnet-4.5',
  status: 'active',
  capabilities: [],
  domain: undefined,
}

export const CTO_AGENT: Agent = {
  id: -1,
  slug: XERUS_CTO_SLUG,
  name: 'Claude Code',
  description: 'Your technical CTO. Writes and ships code.',
  avatarUrl: undefined,
  model: 'anthropic/claude-sonnet-4.5',
  status: 'active',
  capabilities: [],
  domain: undefined,
}

interface AgentDropdownProps {
  agents: Agent[]
  selectedAgent: Agent | null
  onAgentChange: (agent: Agent | null) => void
  disabled?: boolean
  className?: string
}

// Render agent avatar: mascot config > URL > letter fallback
function AgentIcon({ agent, size = 24 }: { agent: Agent; size?: number }) {
  const avatarUrl = agent.avatarUrl
  if (isMascotConfig(avatarUrl)) {
    return <MascotAvatar config={avatarUrl!} size={size} className="w-full h-full" alt={agent.name} />
  }
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatarUrl} alt={agent.name} className="w-full h-full object-cover rounded-full" />
  }
  return (
    <span className="w-full h-full flex items-center justify-center bg-surface-hover text-text-secondary text-[10px] font-semibold rounded-full">
      {agent.name.substring(0, 2).toUpperCase()}
    </span>
  )
}

export function AgentDropdown({
  agents,
  selectedAgent,
  onAgentChange,
  disabled = false,
  className
}: AgentDropdownProps) {
  const [open, setOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const PINNED_AGENTS = [XERUS_AGENT, CTO_AGENT]

  // Filter agents by search, excluding pinned agents from the grouped list
  const filteredAgents = useMemo(() => {
    const pinnedSlugs = new Set([XERUS_MASTER_SLUG, XERUS_CTO_SLUG])
    const nonPinned = agents.filter(a => !pinnedSlugs.has(a.slug ?? ''))
    if (!searchQuery) return nonPinned
    return nonPinned.filter(agent =>
      agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (agent.description && agent.description.toLowerCase().includes(searchQuery.toLowerCase()))
    )
  }, [agents, searchQuery])

  // Group filtered agents by domain
  const groupedAgents = useMemo(() => {
    const groups: Record<string, Agent[]> = {}
    for (const agent of filteredAgents) {
      const domain = agent.domain ?? agent.personality_type ?? 'General'
      if (!groups[domain]) {
        groups[domain] = []
      }
      groups[domain].push(agent)
    }
    // Sort domain keys alphabetically, but "General" always last
    const sortedKeys = Object.keys(groups).sort((a, b) => {
      if (a === 'General') return 1
      if (b === 'General') return -1
      return a.localeCompare(b)
    })
    return sortedKeys.map(key => ({ domain: key, agents: groups[key] }))
  }, [filteredAgents])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Select agent"
          data-testid="agent-dropdown"
          className={cn("w-auto justify-between h-9 px-2 bg-transparent border-transparent hover:bg-surface-hover text-sm font-normal", className)}
          disabled={disabled}
        >
          {(() => {
            const display = selectedAgent ?? XERUS_AGENT
            return (
              <div className="flex items-center gap-2 overflow-hidden">
                <div className="shrink-0 w-6 h-6 rounded-lg overflow-hidden">
                  <AgentIcon agent={display} size={24} />
                </div>
                <span className="truncate text-sm font-medium">{display.name}</span>
              </div>
            )
          })()}
          <ChevronsUpDown className="ml-1.5 h-3.5 w-3.5 shrink-0 opacity-40" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[240px] p-0 bg-card rounded-lg border border-border shadow-md"
        align="start"
        sideOffset={6}
      >
        <div className="flex items-center border-b border-border px-2.5">
          <Search className="mr-2 h-3.5 w-3.5 shrink-0 opacity-40" />
          <Input
            placeholder="Search agents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex h-9 w-full rounded-md bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 border-none focus-visible:ring-0 px-0"
          />
        </div>
        <ScrollArea className="max-h-[280px] p-1">
          {/* Pinned main agents — always first */}
          {PINNED_AGENTS.map((pinnedAgent) => {
            const matchesSearch = !searchQuery || pinnedAgent.name.toLowerCase().includes(searchQuery.toLowerCase()) || (pinnedAgent.slug ?? '').toLowerCase().includes(searchQuery.toLowerCase())
            if (!matchesSearch) return null
            const isXerus = pinnedAgent.slug === XERUS_MASTER_SLUG
            const isSelected = isXerus ? !selectedAgent : selectedAgent?.slug === pinnedAgent.slug
            return (
              <div
                key={pinnedAgent.slug}
                onClick={() => {
                  onAgentChange(isXerus ? null : pinnedAgent)
                  setOpen(false)
                }}
                className={cn(
                  "flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none transition-colors duration-100 hover:bg-surface-hover",
                  isSelected && "bg-surface-hover"
                )}
                role="option"
                aria-selected={isSelected}
                data-testid="agent-option"
              >
                <div className="w-6 h-6 rounded-lg overflow-hidden shrink-0">
                  <AgentIcon agent={pinnedAgent} size={24} />
                </div>
                <span className="font-medium truncate">{pinnedAgent.name}</span>
              </div>
            )
          })}

          {/* Separator between pinned and grouped */}
          {PINNED_AGENTS.some(a => !searchQuery || a.name.toLowerCase().includes(searchQuery.toLowerCase()) || (a.slug ?? '').toLowerCase().includes(searchQuery.toLowerCase())) && groupedAgents.length > 0 && (
            <div className="my-1 mx-2 border-t border-border" />
          )}

          {groupedAgents.length === 0 && searchQuery && !PINNED_AGENTS.some(a =>
            a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (a.slug ?? '').toLowerCase().includes(searchQuery.toLowerCase())
          ) && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No agent found.
            </div>
          )}

          {groupedAgents.map(({ domain, agents: domainAgents }) => (
            <div key={domain}>
              <div className="px-2 py-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wide mt-1.5 first:mt-0">
                {domain}
              </div>
              {domainAgents.map((agent) => (
                <div
                  key={agent.id}
                  onClick={() => {
                    onAgentChange(agent)
                    setOpen(false)
                  }}
                  className={cn(
                    "flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none transition-colors duration-100 hover:bg-surface-hover data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
                    selectedAgent && selectedAgent.id === agent.id && "bg-surface-hover"
                  )}
                  role="option"
                  aria-selected={selectedAgent?.id === agent.id}
                  data-testid="agent-option"
                >
                  <div className="w-6 h-6 rounded-lg overflow-hidden shrink-0">
                    <AgentIcon agent={agent} size={24} />
                  </div>
                  <span className="font-medium truncate">{agent.name}</span>
                </div>
              ))}
            </div>
          ))}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
