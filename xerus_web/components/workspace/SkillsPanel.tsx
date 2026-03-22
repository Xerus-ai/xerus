'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import useSWR, { mutate as swrMutate } from 'swr'
import { getSkills, getAssistants, installSkill, uninstallSkill, type Skill, type Assistant } from '@/lib/api'
import { PageHeader } from '@/components/common/PageHeader'
import { SkillCard } from '@/components/skills/SkillCard'

interface SkillsPanelProps {
  onSelect: (skill: Skill) => void
  onCountChange?: (count: number) => void
}

export function SkillsPanel({ onSelect, onCountChange }: SkillsPanelProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])

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
        />

        {/* My Skills */}
        {filteredMySkills.length > 0 && (
          <div className="w-full mb-12">
            <div className="flex items-center gap-3 mb-6">
              <h2 className="font-serif text-2xl text-text">My Skills</h2>
              <span className="bg-[#FF6600]/10 text-[#FF6600] text-xs font-bold px-2 py-1 rounded-md">
                {filteredMySkills.length} Skills
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {filteredMySkills.map(skill => (
                <SkillCard
                  key={skill.slug}
                  skill={skill}
                  onClick={() => onSelect(skill)}
                  agents={agents}
                />
              ))}
            </div>
          </div>
        )}

        {/* Installed */}
        {filteredInstalled.length > 0 && (
          <div className="w-full mb-12">
            <div className="flex items-center gap-3 mb-6">
              <h2 className="font-serif text-2xl text-text">Installed</h2>
              <span className="bg-emerald-500/10 text-emerald-600 text-xs font-bold px-2 py-1 rounded-md">
                {filteredInstalled.length} Active
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
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
        )}

        {/* Marketplace */}
        <div className="w-full">
          <div className="flex items-center gap-3 mb-6">
            <h2 className="font-serif text-2xl text-text">Marketplace</h2>
            <span className="bg-text-secondary/10 text-text-secondary text-xs font-bold px-2 py-1 rounded-md">
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
    </div>
  )
}
