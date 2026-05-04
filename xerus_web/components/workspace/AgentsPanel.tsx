'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import { getUserAgents, getMarketplaceAgents, cloneAgent, importAgent } from '@/lib/api/agents'
import type { Assistant } from '@/lib/api/types'
import { PageHeader } from '@/components/common/PageHeader'
import { AgentCard, CreateAgentCard } from '@/components/agents/AgentCard'
import { UploadPanel } from '@/components/upload/UploadPanel'

interface AgentsPanelProps {
  onSelect: (agent: Assistant) => void
  onCountChange?: (count: number) => void
  viewToggle?: React.ReactNode
}

export function AgentsPanel({ onSelect, onCountChange, viewToggle }: AgentsPanelProps) {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [cloningSlug, setCloningSlug] = useState<string | null>(null)
  const [uploadPanelOpen, setUploadPanelOpen] = useState(false)

  // SWR for deduplication + caching (rule: client-swr-dedup)
  const { data: myAgentsRaw = [] } = useSWR('agents/mine', getUserAgents)
  const { data: marketplaceResult } = useSWR('agents/marketplace', () => getMarketplaceAgents({ limit: 100 }))

  const allAgents = useMemo(() => [
    ...myAgentsRaw,
    ...(marketplaceResult?.agents || []),
  ], [myAgentsRaw, marketplaceResult])

  // Report count via ref (rule: advanced-event-handler-refs)
  const onCountChangeRef = useRef(onCountChange)
  onCountChangeRef.current = onCountChange
  useEffect(() => {
    onCountChangeRef.current?.(allAgents.length)
  }, [allAgents.length])

  const { myAgents, marketplaceAgents } = useMemo(() => {
    const query = searchQuery.toLowerCase().trim()
    const applySearch = (list: Assistant[]) => {
      if (!query) return list
      return list.filter(a =>
        [a.name?.toLowerCase() || '', a.description?.toLowerCase() || '', a.category?.toLowerCase() || '', a.model?.toLowerCase() || '',
          ...(a.tools || []).map(t => (t.name || t.name_slug || '').toLowerCase())
        ].some(field => field.includes(query))
      )
    }
    const applyCategory = (list: Assistant[]) => {
      if (selectedCategories.length === 0) return list
      return list.filter(a => a.category && selectedCategories.includes(a.category))
    }
    return {
      myAgents: applyCategory(applySearch(myAgentsRaw || [])),
      marketplaceAgents: applyCategory(applySearch(marketplaceResult?.agents || [])),
    }
  }, [myAgentsRaw, marketplaceResult, searchQuery, selectedCategories])

  const categories = useMemo(() => {
    return Array.from(new Set(allAgents.map(a => a.category).filter(Boolean) as string[]))
  }, [allAgents])

  const handleToggleCategory = useCallback((category: string) => {
    setSelectedCategories(prev => prev.includes(category) ? prev.filter(c => c !== category) : [...prev, category])
  }, [])

  const handleClearCategories = useCallback(() => { setSelectedCategories([]) }, [])

  const handleClone = useCallback(async (agentSlug: string, event: React.MouseEvent) => {
    event.stopPropagation()
    setCloningSlug(agentSlug)
    try {
      const result = await cloneAgent(agentSlug)
      if (result.success) mutate('agents/mine')
    } catch { /* API layer handles toasts */ }
    finally { setCloningSlug(null) }
  }, [])

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="max-w-[1140px] mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 flex flex-col items-start">
        <PageHeader
          description="Discover and create custom assistants"
          badge="AI Agents"
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="Search assistants..."
          categories={categories}
          selectedCategories={selectedCategories}
          onToggleCategory={handleToggleCategory}
          onClearCategories={handleClearCategories}
          actions={viewToggle}
        />

        {/* My Agents */}
        <div data-testid="my-agents-section" className="w-full mb-12">
          <div className="flex items-center gap-3 mb-6">
            <h2 className="font-serif text-2xl text-text tracking-tight">My Agents</h2>
            <span className="bg-secondary/10 text-secondary text-xs font-bold px-2 py-1 rounded-md tabular-nums">
              {myAgents.length} Agents
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 stagger-in">
            <CreateAgentCard onClick={() => setUploadPanelOpen(true)} />
            {myAgents.map((agent) => (
              <AgentCard
                key={agent.slug || agent.id}
                agent={agent}
                onClick={() => onSelect(agent)}
                onChat={(e) => { e.stopPropagation(); router.push(`/chat?agent=${agent.slug || agent.id}`) }}
                isOwner
              />
            ))}
          </div>
        </div>

        {/* Marketplace */}
        <div data-testid="marketplace-section" className="w-full">
          <div className="flex items-center gap-3 mb-6">
            <h2 className="font-serif text-2xl text-text tracking-tight">Agent Marketplace</h2>
            <span className="bg-surface-active text-text-secondary text-xs font-bold px-2 py-1 rounded-md tabular-nums">
              {marketplaceAgents.length} Available
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 stagger-in">
            {marketplaceAgents.map((agent) => {
              const slug = agent.slug || String(agent.id)
              return (
                <AgentCard
                  key={slug}
                  agent={agent}
                  onClick={() => onSelect(agent)}
                  onClone={(e) => handleClone(slug, e)}
                  isCloning={cloningSlug === slug}
                  isOwner={false}
                />
              )
            })}
          </div>
        </div>

        {myAgents.length === 0 && marketplaceAgents.length === 0 && searchQuery && (
          <div className="w-full text-center py-20">
            <p className="text-text-secondary">No agents match your search -- try a different keyword or browse the marketplace.</p>
          </div>
        )}
      </div>

      <UploadPanel
        context="import"
        isOpen={uploadPanelOpen}
        onClose={() => setUploadPanelOpen(false)}
        onImportAgent={async (files) => {
          await importAgent(files)
          mutate('agents/mine')
          setUploadPanelOpen(false)
        }}
      />
    </div>
  )
}
