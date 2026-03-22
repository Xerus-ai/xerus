// Shared utility: resolve tool name to icon category
import type { ToolCallIcon } from './streaming-turn.types'

export function resolveToolIcon(name: string): ToolCallIcon {
  const n = name.toLowerCase()
  // Orchestration tools (exact match first to avoid partial collisions)
  if (n === 'agent' || n === 'task') return 'agent'
  if (n === 'skill') return 'skill'
  if (n === 'todowrite') return 'task'
  if (n === 'askuserquestion') return 'question'
  // File & search tools
  if (n.includes('read') || n.includes('glob') || n.includes('grep')) return 'read'
  if (n.includes('write') || n.includes('edit') || n.includes('notebook')) return 'write'
  if (n.includes('bash') || n.includes('exec') || n.includes('command')) return 'bash'
  if (n.includes('web') || n.includes('fetch')) return 'web'
  if (n.includes('search') || n.includes('toolsearch')) return 'search'
  if (n.includes('think') || n.includes('plan') || n.includes('reason')) return 'think'
  return 'search'
}
