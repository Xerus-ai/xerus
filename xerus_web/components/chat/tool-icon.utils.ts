// Shared utility: resolve tool name to icon category + icon/color maps
import {
  Terminal, FileText, Pencil, Search, Globe, Brain,
  Bot, Puzzle, ListChecks, HelpCircle,
} from 'lucide-react'
import type { ToolCallIcon } from './streaming-turn.types'

export const TOOL_ICON_MAP: Record<ToolCallIcon, typeof Terminal> = {
  bash: Terminal, read: FileText, write: Pencil, search: Search,
  web: Globe, think: Brain, agent: Bot, skill: Puzzle,
  task: ListChecks, question: HelpCircle,
}

export const TOOL_COLOR_MAP: Record<ToolCallIcon, string> = {
  bash: 'bg-emerald-500/10 text-emerald-600',
  read: 'bg-blue-500/10 text-blue-600',
  write: 'bg-violet-500/10 text-violet-600',
  search: 'bg-amber-500/10 text-amber-600',
  web: 'bg-cyan-500/10 text-cyan-600',
  think: 'bg-slate-500/10 text-slate-600',
  agent: 'bg-secondary/10 text-secondary',
  skill: 'bg-purple-500/10 text-purple-600',
  task: 'bg-teal-500/10 text-teal-600',
  question: 'bg-rose-500/10 text-rose-600',
}

export function resolveToolIcon(name: string): ToolCallIcon {
  const n = name.toLowerCase()
  // Orchestration tools (exact match first to avoid partial collisions)
  if (n === 'agent' || n === 'task') return 'agent'
  if (n === 'skill') return 'skill'
  if (n === 'todowrite') return 'task'
  if (n === 'askuserquestion') return 'question'
  if (n === 'sendmessage') return 'agent'
  // File & search tools
  if (n.includes('read') || n.includes('glob') || n.includes('grep')) return 'read'
  if (n.includes('write') || n.includes('edit') || n.includes('notebook')) return 'write'
  if (n.includes('bash') || n.includes('exec') || n.includes('command')) return 'bash'
  if (n.includes('web') || n.includes('fetch')) return 'web'
  if (n.includes('search') || n.includes('toolsearch')) return 'search'
  if (n.includes('think') || n.includes('plan') || n.includes('reason')) return 'think'
  return 'search'
}
