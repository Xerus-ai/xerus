import { useMemo, useCallback } from 'react'
import {
  Sparkles, MessageSquare, PenTool,
  Trash2, Plus, ArrowRightLeft,
  FileText, BookOpen,
} from 'lucide-react'
import type { SlashCommand } from './SlashCommandPicker'
import type { Agent } from './types'

interface UseSlashCommandsOptions {
  currentAgent?: Agent | null
  onSendMessage: (message: string) => void
  onClearConversation?: () => void
  onNewConversation?: () => void
  onSwitchAgent?: (agent: Agent) => void
}

export function useSlashCommands({
  currentAgent,
  onSendMessage,
  onClearConversation,
  onNewConversation,
}: UseSlashCommandsOptions) {
  const commands = useMemo<SlashCommand[]>(() => {
    const cmds: SlashCommand[] = []

    const agentSkills = (currentAgent as Record<string, unknown> | null | undefined)?.skills as string[] | undefined
    if (agentSkills && agentSkills.length > 0) {
      for (const skill of agentSkills.slice(0, 8)) {
        cmds.push({
          name: skill,
          description: `Run ${skill} skill`,
          category: 'skill',
          icon: Sparkles,
        })
      }
    } else {
      cmds.push(
        { name: 'review', description: 'Review code changes', category: 'skill', icon: Sparkles },
        { name: 'plan', description: 'Create a plan', category: 'skill', icon: PenTool },
        { name: 'brainstorm', description: 'Explore ideas', category: 'skill', icon: MessageSquare },
      )
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
  }, [currentAgent])

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
