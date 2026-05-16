'use client'

import { useState, useMemo } from 'react'
import useSWR from 'swr'
import { Plus, X, Puzzle, Loader2 } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { getSkills, installSkill, uninstallSkill } from '@/lib/api/skills'
import { toast } from '@/lib/toast'
import type { Skill } from '@/lib/api/types'

interface SkillsRibbonProps {
  channelSlug: string
  onSkillClick?: (skillSlug: string) => void
}

export function SkillsRibbon({ channelSlug, onSkillClick }: SkillsRibbonProps) {
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [processing, setProcessing] = useState<string | null>(null)

  const { data: skillsData, mutate } = useSWR(
    channelSlug ? `skills/channel/${channelSlug}` : 'skills/all',
    () => getSkills({ limit: 100, channel_id: channelSlug || undefined }),
    { dedupingInterval: 30_000, revalidateOnFocus: false },
  )

  const allSkills = useMemo(() => skillsData?.skills || [], [skillsData])
  const installedSkills = useMemo(() => allSkills.filter(s => s.isInstalled), [allSkills])
  const availableSkills = useMemo(() => allSkills.filter(s => !s.isInstalled), [allSkills])

  const handleInstall = async (skill: Skill) => {
    setProcessing(skill.slug)
    try {
      await installSkill(skill.slug, { scope: channelSlug ? 'channel' : 'global', channel_id: channelSlug || undefined })
      await mutate()
    } catch {
      toast.error(`Failed to install ${skill.name}`)
    } finally {
      setProcessing(null)
    }
  }

  const handleUninstall = async (skill: Skill) => {
    setProcessing(skill.slug)
    try {
      await uninstallSkill(skill.slug)
      await mutate()
    } catch {
      toast.error(`Failed to remove ${skill.name}`)
    } finally {
      setProcessing(null)
    }
  }

  return (
    <div className="flex items-center gap-1.5 px-4 py-2 border-t border-surface-active/20">
      <Puzzle className="w-3.5 h-3.5 text-text-muted shrink-0" />

      {/* + button right after the icon */}
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <button
            className="flex items-center gap-1 px-1.5 py-1 hover:bg-primary/5 text-primary rounded-full transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            aria-label={popoverOpen ? 'Close skills manager' : 'Manage channel skills'}
            title="Manage skills available to agents in this channel"
          >
            {popoverOpen ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            <span className="text-[11px] font-medium whitespace-nowrap">Skills</span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side="top"
          sideOffset={8}
          className="w-72 p-0 rounded-2xl bg-surface border border-surface-active shadow-sm max-h-[320px] flex flex-col"
        >
          <div className="px-4 pt-4 pb-2 shrink-0">
            <div className="flex items-center gap-2">
              <Puzzle className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-text">Channel Skills</h3>
            </div>
            <p className="text-[11px] text-text-muted mt-0.5">{installedSkills.length} installed</p>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-thin px-4 pb-4">
            {/* Installed */}
            {installedSkills.length > 0 ? (
              <div className="space-y-0.5">
                {installedSkills.map((skill) => {
                  const isProcessing = processing === skill.slug
                  return (
                    <div key={skill.slug} className="flex items-center gap-2 py-1.5 px-2 rounded-xl hover:bg-surface-hover group transition-colors cursor-pointer"
                      onClick={() => {
                        onSkillClick?.(skill.slug)
                        setPopoverOpen(false)
                      }}
                    >
                      <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Puzzle className="w-3 h-3 text-primary" />
                      </div>
                      <span className="text-sm text-text truncate flex-1">{skill.name}</span>
                      {isProcessing ? (
                        <Loader2 className="w-3 h-3 text-text-muted animate-spin shrink-0" />
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleUninstall(skill)
                          }}
                          className="w-4 h-4 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 hover:text-destructive text-text-muted transition-all shrink-0"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-4 border-2 border-dashed border-surface-active rounded-xl">
                <p className="text-[11px] text-text-muted italic">No skills installed</p>
              </div>
            )}

            {/* Available */}
            {availableSkills.length > 0 && (
              <div className="mt-2 pt-2 border-t border-surface-active/40">
                <p className="text-[10px] font-medium text-text-muted mb-1">Add skill</p>
                <div className="space-y-0.5">
                  {availableSkills.map((skill) => {
                    const isProcessing = processing === skill.slug
                    return (
                      <button
                        key={skill.slug}
                        onClick={() => handleInstall(skill)}
                        disabled={isProcessing}
                        className="w-full flex items-center gap-2 py-1.5 px-2 rounded-xl hover:bg-surface-hover transition-colors text-left disabled:opacity-50"
                      >
                        <Puzzle className="w-3 h-3 text-text-muted shrink-0" />
                        <span className="text-sm text-text truncate flex-1">{skill.name}</span>
                        {isProcessing ? (
                          <Loader2 className="w-3 h-3 text-text-muted animate-spin shrink-0" />
                        ) : (
                          <Plus className="w-3 h-3 text-primary shrink-0" />
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* Installed skill chips only */}
      {installedSkills.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none flex-1">
          {installedSkills.slice(0, 6).map((skill) => (
            <button
              key={skill.slug}
              onClick={() => onSkillClick?.(skill.slug)}
              className="px-2.5 py-1 rounded-full bg-surface-hover text-[11px] font-medium text-text-secondary hover:bg-surface-pressed hover:text-text transition-colors whitespace-nowrap shrink-0"
              title={skill.description || skill.name}
            >
              {skill.name}
            </button>
          ))}
          {installedSkills.length > 6 && (
            <span className="text-[11px] text-text-muted whitespace-nowrap shrink-0">
              +{installedSkills.length - 6} more
            </span>
          )}
        </div>
      )}
    </div>
  )
}
