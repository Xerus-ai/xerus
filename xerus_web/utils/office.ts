import type { Assistant } from '@/lib/api/types'
import type { OfficeAgent } from '@/hooks/useOfficeData'

/** Map a real Assistant to the simplified OfficeAgent shape */
export function toOfficeAgent(a: Assistant): OfficeAgent {
  // Map Assistant.status ('active'|'inactive') to office status
  // Use last_used_at to determine if sleeping vs idle
  let status: OfficeAgent['status'] = 'idle'
  if (a.status === 'active') {
    status = 'active'
  } else {
    // Inactive agents: if used recently, idle; if not used in 24h+, sleeping
    const lastUsed = a.lastUsed ? new Date(a.lastUsed).getTime() : 0
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000
    status = lastUsed > dayAgo ? 'idle' : 'sleeping'
  }

  return {
    id: String(a.id),
    name: a.name,
    slug: a.name.toLowerCase().replace(/\s+/g, '-'),
    avatar_url: a.avatarUrl ?? undefined,
    status,
    current_task: undefined,
    next_wake: undefined,
    domain: a.category || 'general',
  }
}
