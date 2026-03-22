'use client'

import React from 'react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { ChevronDown, Check } from 'lucide-react'
import { PRIORITIES } from './board-data'

interface Agent {
  id: string | number
  slug: string
  name: string
}

interface BoardFiltersProps {
  priorityFilter: string
  agentFilter: string
  domainFilter: string
  agents: Agent[]
  projects: string[]
  onFilterChange: (key: string, value: string) => void
}

export function BoardFilters({
  priorityFilter,
  agentFilter,
  domainFilter,
  agents,
  projects,
  onFilterChange,
}: BoardFiltersProps) {
  return (
    <div
      className="flex items-center gap-2 flex-wrap"
      role="toolbar"
      aria-label="Task filters"
    >
      {/* Priority pills */}
      {PRIORITIES.map((p) => (
        <button
          key={p}
          onClick={() => onFilterChange('priority', p)}
          className={cn(
            'px-6 py-2 rounded-full text-sm font-medium transition-all',
            priorityFilter === p
              ? 'bg-[#261E1B] text-white shadow-sm'
              : 'bg-surface-hover text-text-secondary hover:text-text hover:bg-surface-pressed'
          )}
        >
          {p === 'all' ? 'All' : p.charAt(0).toUpperCase() + p.slice(1)}
        </button>
      ))}

      {/* Divider */}
      <div className="w-px h-6 bg-surface-active/40 mx-1" />

      {/* Agent dropdown pill */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            className={cn(
              'px-6 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2',
              agentFilter !== 'all'
                ? 'bg-[#261E1B] text-white shadow-sm'
                : 'bg-surface-hover text-text-secondary hover:text-text hover:bg-surface-pressed'
            )}
          >
            {agentFilter === 'all' ? 'Agent' : agents.find(a => a.slug === agentFilter)?.name || 'Agent'}
            <ChevronDown className="w-4 h-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2 bg-white border border-surface-active rounded-xl shadow-lg" align="start">
          <div className="max-h-[260px] overflow-y-auto">
            <button
              onClick={() => onFilterChange('agent', 'all')}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-left transition-colors',
                agentFilter === 'all'
                  ? 'bg-surface-hover text-text'
                  : 'text-text-secondary hover:bg-surface-hover hover:text-text'
              )}
            >
              <div className={cn(
                'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0',
                agentFilter === 'all' ? 'bg-[#261E1B] border-[#261E1B]' : 'border-surface-active'
              )}>
                {agentFilter === 'all' && <Check className="w-3 h-3 text-white" />}
              </div>
              All Agents
            </button>
            {agents.map((a) => (
              <button
                key={a.id}
                onClick={() => onFilterChange('agent', a.slug)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-left transition-colors',
                  agentFilter === a.slug
                    ? 'bg-surface-hover text-text'
                    : 'text-text-secondary hover:bg-surface-hover hover:text-text'
                )}
              >
                <div className={cn(
                  'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0',
                  agentFilter === a.slug ? 'bg-[#261E1B] border-[#261E1B]' : 'border-surface-active'
                )}>
                  {agentFilter === a.slug && <Check className="w-3 h-3 text-white" />}
                </div>
                {a.name}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* Project dropdown pill (only if projects exist) */}
      {projects.length > 1 && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              className={cn(
                'px-6 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2',
                domainFilter !== 'all'
                  ? 'bg-[#261E1B] text-white shadow-sm'
                  : 'bg-surface-hover text-text-secondary hover:text-text hover:bg-surface-pressed'
              )}
            >
              {domainFilter === 'all' ? 'Project' : domainFilter.charAt(0).toUpperCase() + domainFilter.slice(1)}
              <ChevronDown className="w-4 h-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2 bg-white border border-surface-active rounded-xl shadow-lg" align="start">
            <div className="max-h-[260px] overflow-y-auto">
              {projects.map((d) => (
                <button
                  key={d}
                  onClick={() => onFilterChange('domain', d)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-left transition-colors',
                    domainFilter === d
                      ? 'bg-surface-hover text-text'
                      : 'text-text-secondary hover:bg-surface-hover hover:text-text'
                  )}
                >
                  <div className={cn(
                    'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0',
                    domainFilter === d ? 'bg-[#261E1B] border-[#261E1B]' : 'border-surface-active'
                  )}>
                    {domainFilter === d && <Check className="w-3 h-3 text-white" />}
                  </div>
                  {d === 'all' ? 'All Projects' : d.charAt(0).toUpperCase() + d.slice(1)}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}
