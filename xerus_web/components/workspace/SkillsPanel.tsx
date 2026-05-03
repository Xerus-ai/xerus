'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import useSWR, { mutate as swrMutate } from 'swr'
import { getSkills, installSkill, uninstallSkill, importSkill } from '@/lib/api/skills'
import { getAssistants } from '@/lib/api/agents'
import type { Skill, Assistant } from '@/lib/api/types'
import { PageHeader } from '@/components/common/PageHeader'
import { SkillCard, ImportSkillCard } from '@/components/skills/SkillCard'
import { UploadPanel } from '@/components/upload/UploadPanel'

interface SkillsPanelProps {
  onSelect: (skill: Skill) => void
  onCountChange?: (count: number) => void
  viewToggle?: React.ReactNode
}

export function SkillsPanel({ onSelect, onCountChange, viewToggle }: SkillsPanelProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [uploadPanelOpen, setUploadPanelOpen] = useState(false)

  // SWR for deduplication + caching (rule: client-swr-dedup)
  const { data: skillsData } = useSWR('skills/all', () => getSkills({ limit: 100 }))
  const { data: agents = [] } = useSWR<Assistant[]>('agents-list', async () => {
    const result = await getAssistants()
    return result.agents
  })

  const allSkills = useMemo(() => skillsData?.skills || [], [skillsData])
  const categories = useMemo(() => skillsData?.categories || [], [skillsData])

  // Report count via ref (rule: advanced-event-handler-refs)
  const onCountChangeRef = useRef(onCountChange)
  onCountChangeRef.current = onCountChange
  useEffect(() => {
    onCountChangeRef.current?.(allSkills.length)
  }, [allSkills.length])

  const filterSkill = useCallback((skill: Skill, query: string): boolean => {
    if (!query) return true
    return [skill.name.toLowerCase(), skill.description.toLowerCase(), skill.category?.toLowerCase() || '',
      ...skill.tags.map(t => t.toLowerCase()), skill.author?.toLowerCase() || ''
    ].some(field => field.includes(query))
  }, [])

  const filteredMySkills = useMemo(() => {
    const query = searchQuery.toLowerCase().trim()
    return allSkills.filter(s => s.userId && filterSkill(s, query))
  }, [allSkills, searchQuery, filterSkill])

  const filteredInstalled = useMemo(() => {
    const query = searchQuery.toLowerCase().trim()
    return allSkills.filter(s => s.isInstalled && !s.userId && filterSkill(s, query))
  }, [allSkills, searchQuery, filterSkill])

  const filteredMarketplace = useMemo(() => {
    const query = searchQuery.toLowerCase().trim()
    return allSkills.filter(skill => {
      if (skill.isInstalled) return false
      const matchesSearch = filterSkill(skill, query)
      const matchesCategory = selectedCategories.length === 0 || (skill.category && selectedCategories.includes(skill.category))
      return matchesSearch && matchesCategory
    })
  }, [allSkills, searchQuery, selectedCategories, filterSkill])

  const handleToggleCategory = useCallback((category: string) => {
    setSelectedCategories(prev => prev.includes(category) ? prev.filter(c => c !== category) : [...prev, category])
  }, [])

  const handleClearCategories = useCallback(() => { setSelectedCategories([]) }, [])

  const refreshSkills = useCallback(() => { swrMutate('skills/all') }, [])

  const handleInstall = useCallback(async (skillSlug: string, _agentId: number, scope: 'channel' | 'global', channelId?: string) => {
    await installSkill(skillSlug, { scope, channel_id: channelId })
    refreshSkills()
  }, [refreshSkills])

  const handleUninstall = useCallback(async (skillSlug: string) => {
    await uninstallSkill(skillSlug)
    refreshSkills()
  }, [refreshSkills])

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="max-w-[1140px] mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 flex flex-col items-start">
        <PageHeader
          description="Browse and install skills for your AI agents"
          badge="Skills Marketplace"
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="Search skills..."
          categories={categories}
          selectedCategories={selectedCategories}
          onToggleCategory={handleToggleCategory}
          onClearCategories={handleClearCategories}
          actions={viewToggle}
        />

        {/* My Skills (user-created + installed) */}
        <div className="w-full mb-12">
          <div className="flex items-center gap-3 mb-6">
            <h2 className="font-serif text-2xl text-text tracking-tight">My Skills</h2>
            <span className="bg-secondary/10 text-secondary text-xs font-bold px-2 py-1 rounded-md tabular-nums">
              {filteredMySkills.length + filteredInstalled.length} Skills
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            <ImportSkillCard onClick={() => setUploadPanelOpen(true)} />
            {filteredMySkills.map(skill => (
              <SkillCard
                key={skill.slug}
                skill={skill}
                onClick={() => onSelect(skill)}
                agents={agents}
              />
            ))}
            {filteredInstalled.map(skill => (
              <SkillCard
                key={skill.slug}
                skill={skill}
                onClick={() => onSelect(skill)}
                agents={agents}
                isInstalled
                onInstall={(agentId, scope, channelId) => handleInstall(skill.slug, agentId, scope, channelId)}
                onUninstall={() => handleUninstall(skill.slug)}
              />
            ))}
          </div>
        </div>

        {/* Marketplace */}
        <div className="w-full">
          <div className="flex items-center gap-3 mb-6">
            <h2 className="font-serif text-2xl text-text tracking-tight">Marketplace</h2>
            <span className="bg-surface-active text-text-secondary text-xs font-bold px-2 py-1 rounded-md tabular-nums">
              {filteredMarketplace.length} Available
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {filteredMarketplace.map(skill => (
              <SkillCard
                key={skill.slug}
                skill={skill}
                onClick={() => onSelect(skill)}
                agents={agents}
                onInstall={(agentId, scope, channelId) => handleInstall(skill.slug, agentId, scope, channelId)}
                onUninstall={() => handleUninstall(skill.slug)}
              />
            ))}
          </div>
        </div>

        {filteredMySkills.length === 0 && filteredInstalled.length === 0 && filteredMarketplace.length === 0 && searchQuery && (
          <div className="w-full text-center py-20">
            <p className="text-text-secondary">No skills found matching your criteria.</p>
          </div>
        )}
      </div>

      <UploadPanel
        context="import"
        isOpen={uploadPanelOpen}
        onClose={() => setUploadPanelOpen(false)}
        onImportSkill={async (files) => {
          await importSkill(files)
          refreshSkills()
          setUploadPanelOpen(false)
        }}
      />
    </div>
  )
}
