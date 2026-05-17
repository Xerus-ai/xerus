import { useMemo, useCallback, useState, useEffect } from 'react'
import {
  Sparkles, Trash2, Plus, ArrowRightLeft,
  FileText, BookOpen,
} from 'lucide-react'
import type { SlashCommand } from './SlashCommandPicker'
import type { Agent } from './types'
import { getSkills } from '@/lib/api/skills'

interface UseSlashCommandsOptions {
  currentAgent?: Agent | null
  onSendMessage: (message: string) => void
  onClearConversation?: () => void
  onNewConversation?: () => void
  onSwitchAgent?: (agent: Agent) => void
}

interface InstalledSkill {
  slug: string
  name: string
  description: string
}

export function useSlashCommands({
  onSendMessage,
  onClearConversation,
  onNewConversation,
}: UseSlashCommandsOptions) {
  const [installedSkills, setInstalledSkills] = useState<InstalledSkill[]>([])

  useEffect(() => {
    let cancelled = false
    getSkills({ limit: 50 })
      .then(({ skills }) => {
        if (cancelled) return
        const installed = skills
          .filter((s) => s.isInstalled)
          .map((s) => ({ slug: s.slug, name: s.name, description: s.description }))
        setInstalledSkills(installed)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const commands = useMemo<SlashCommand[]>(() => {
    const cmds: SlashCommand[] = []

    for (const skill of installedSkills) {
      cmds.push({
        name: skill.slug,
        description: skill.description || `Run ${skill.name}`,
        category: 'skill',
        icon: Sparkles,
      })
    }

    cmds.push(
      { name: 'clear', description: 'Clear conversation', category: 'action', icon: Trash2 },
      { name: 'new', description: 'Start new conversation', category: 'action', icon: Plus },
      { name: 'switch', description: 'Switch active agent', category: 'action', icon: ArrowRightLeft },
    )

    cmds.push(
      { name: 'file', description: 'Attach a workspace file', category: 'context', icon: FileText },
      { name: 'context', description: 'Search knowledge base', category: 'context', icon: BookOpen },
    )

    return cmds
  }, [installedSkills])

  const executeCommand = useCallback(
    (cmd: SlashCommand, args: string) => {
      switch (cmd.category) {
        case 'skill':
          onSendMessage(`/${cmd.name} ${args}`.trim())
          break
        case 'action':
          if (cmd.name === 'clear' && onClearConversation) onClearConversation()
          else if (cmd.name === 'new' && onNewConversation) onNewConversation()
          else onSendMessage(`/${cmd.name} ${args}`.trim())
          break
        case 'context':
          onSendMessage(`/${cmd.name} ${args}`.trim())
          break
      }
    },
    [onSendMessage, onClearConversation, onNewConversation],
  )

  return { commands, executeCommand }
}
