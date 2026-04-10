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
import { getModelIconPath } from '@/utils/models'

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
function AgentIcon({ agent, size = 20 }: { agent: Agent; size?: number }) {
  const avatarUrl = agent.avatarUrl
  if (isMascotConfig(avatarUrl)) {
    return <MascotAvatar config={avatarUrl!} size={size} className="w-full h-full" alt={agent.name} />
  }
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatarUrl} alt={agent.name} className="w-full h-full object-cover rounded-full" />
  }
  return (
    <span className="w-full h-full flex items-center justify-center bg-primary/10 text-primary text-[10px] font-semibold rounded-full">
      {agent.name.substring(0, 2).toUpperCase()}
    </span>
  )
}

// Use centralized model icon mapping
const getModelIcon = getModelIconPath

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
          className={cn("w-auto justify-between h-9 px-2 bg-gray-50/50 border-transparent hover:bg-gray-100/50 text-sm font-normal", className)}
          disabled={disabled}
        >
          {(() => {
            const display = selectedAgent ?? XERUS_AGENT
            const modelIcon = getModelIcon(display.model)
            return (
              <div className="flex items-center gap-2.5 overflow-hidden">
                <div className="relative shrink-0 w-7 h-7">
                  <div className="w-7 h-7 rounded-lg overflow-hidden">
                    <AgentIcon agent={display} size={28} />
                  </div>
                  <div className="absolute -top-1 -left-1 bg-white border border-blue-200 rounded-md p-px shadow-sm z-20" title="Claude Code">
                    <img src="/icons/claudecode-color.svg" alt="" className="w-3 h-3 object-contain" />
                  </div>
                  {modelIcon && (
                    <div className="absolute -bottom-0.5 -right-0.5 bg-white rounded-full p-[1px]" title={display.model}>
                      <img
                        src={modelIcon}
                        alt={display.model || 'Model'}
                        className="w-3 h-3"
                      />
                    </div>
                  )}
                </div>
                <span className="truncate text-[15px] font-normal">{display.name}</span>
              </div>
            )
          })()}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[270px] p-0 overflow-visible" align="start">
        <div className="flex items-center border-b px-3">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <Input
            placeholder="Search agents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 border-none focus-visible:ring-0 px-0"
          />
        </div>
        <ScrollArea className="h-[300px] p-1 pl-2.5">
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
                  "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-primary/[0.06]",
                  isSelected ? "bg-primary/[0.08]" : ""
                )}
                role="option"
                aria-selected={isSelected}
                data-testid="agent-option"
              >
                <div className="flex items-center gap-2">
                  <div className="relative w-8 h-8">
                    <div className="w-8 h-8 rounded-xl overflow-hidden">
                      <AgentIcon agent={pinnedAgent} size={32} />
                    </div>
                    <div className="absolute -top-1 -left-1 bg-white border border-blue-200 rounded-md p-px shadow-sm z-20" title="Claude Code">
                      <img src="/icons/claudecode-color.svg" alt="" className="w-3 h-3 object-contain" />
                    </div>
                    {getModelIcon(pinnedAgent.model) && (
                      <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow-sm" title={pinnedAgent.model}>
                        <img
                          src={getModelIcon(pinnedAgent.model)!}
                          alt={pinnedAgent.model || 'Model'}
                          className="w-3 h-3"
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col">
                    <span className="font-medium">{pinnedAgent.name}</span>
                    <span className="text-xs text-muted-foreground truncate max-w-[180px]">
                      {pinnedAgent.description}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}

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
              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground mt-2 first:mt-0">
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
                    "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-primary/[0.06] data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
                    selectedAgent && selectedAgent.id === agent.id ? "bg-primary/[0.08]" : ""
                  )}
                  role="option"
                  aria-selected={selectedAgent?.id === agent.id}
                  data-testid="agent-option"
                >
                  <div className="flex items-center gap-2">
                    <div className="relative w-8 h-8">
                      <div className="w-8 h-8 rounded-xl overflow-hidden">
                        <AgentIcon agent={agent} size={32} />
                      </div>
                      <div className="absolute -top-1 -left-1 bg-white border border-blue-200 rounded-md p-px shadow-sm z-20" title="Claude Code">
                        <img src="/icons/claudecode-color.svg" alt="" className="w-3 h-3 object-contain" />
                      </div>
                      {getModelIcon(agent.model) && (
                        <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow-sm" title={agent.model}>
                          <img
                            src={getModelIcon(agent.model)!}
                            alt={agent.model || 'Model'}
                            className="w-3 h-3"
                          />
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col">
                      <span className="font-medium">{agent.name}</span>
                      <span className="text-xs text-muted-foreground truncate max-w-[180px]">
                        {agent.description || 'No description'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
