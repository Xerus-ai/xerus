'use client'

import { useState, useCallback, useMemo } from 'react'
import useSWR from 'swr'
import { toast } from '@/lib/toast'
import { getAssistants, getUserAgents } from '@/lib/api/agents'
import { apiPost, apiGet } from '@/lib/api/client'
import type { Assistant } from '@/lib/api/types'
import type { KanbanTask } from '@/components/common/TaskCard'
import type { Agent as KanbanAgent } from '@/components/common/PresenceAvatars'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OfficeAgent {
  id: string
  name: string
  slug: string
  avatar_url?: string
  status: 'active' | 'idle' | 'sleeping' | 'error'
  current_task?: string
  next_wake?: string
  domain: string
}

export interface OfficeDomain {
  id: string
  slug: string
  name: string
  description?: string
}

export interface ActivityEntry {
  id: string
  agent: string
  action: string
  timestamp: string
}

// Backend wraps responses as { success, data, meta }.
// Unwrap to get the actual payload.
function unwrap<T>(response: unknown): T {
  const res = response as Record<string, unknown>
  if (res && typeof res === 'object' && 'data' in res) {
    return res.data as T
  }
  return response as T
}

/** Map a real Assistant to the simplified OfficeAgent shape */
function toOfficeAgent(a: Assistant): OfficeAgent {
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

// ---------------------------------------------------------------------------
// useOfficeAgents - Agents grouped by domain for Office tab
// ---------------------------------------------------------------------------

interface UseOfficeAgentsReturn {
  agents: OfficeAgent[]
  agentsByDomain: Map<string, OfficeAgent[]>
  domains: OfficeDomain[]
  isLoading: boolean
  error: string | null
  refetch: () => void
}

const fetchOfficeAgents = async (): Promise<OfficeAgent[]> => {
  const userAgents = await getUserAgents()
  return userAgents.map(toOfficeAgent)
}

export function useOfficeAgents(): UseOfficeAgentsReturn {
  const { data: agents, error, isLoading, mutate } = useSWR(
    'office-agents',
    fetchOfficeAgents
  )

  const agentList = agents ?? []

  // Derive domains from agent data (no separate endpoint)
  const domains = useMemo(() => {
    const seen = new Map<string, OfficeDomain>()
    for (const agent of agentList) {
      const slug = agent.domain || 'general'
      if (!seen.has(slug)) {
        seen.set(slug, {
          id: slug,
          slug,
          name: slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, ' '),
        })
      }
    }
    return Array.from(seen.values())
  }, [agentList])

  const agentsByDomain = useMemo(() => {
    const map = new Map<string, OfficeAgent[]>()
    for (const agent of agentList) {
      const domain = agent.domain || 'general'
      const existing = map.get(domain) ?? []
      existing.push(agent)
      map.set(domain, existing)
    }
    return map
  }, [agentList])

  return {
    agents: agentList,
    agentsByDomain,
    domains,
    isLoading,
    error: error ? (error instanceof Error ? error.message : 'Failed to load office data') : null,
    refetch: () => mutate(),
  }
}

// ---------------------------------------------------------------------------
// useCompanyTasks - Tasks for Board tab
// ---------------------------------------------------------------------------

interface UseCompanyTasksReturn {
  tasks: KanbanTask[]
  agents: KanbanAgent[]
  isLoading: boolean
  error: string | null
  updateTaskStatus: (taskId: string, newStatus: string) => Promise<void>
  refetch: () => void
}

export function useCompanyTasks(): UseCompanyTasksReturn {
  const [tasks, setTasks] = useState<KanbanTask[]>([])
  const [agents, setAgents] = useState<KanbanAgent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await getAssistants({ limit: 100 })
      const agentPool = result.agents.map(a => ({
        id: String(a.id),
        name: a.name,
        slug: a.name.toLowerCase().replace(/\s+/g, '-'),
        status: a.status === 'active' ? 'active' as const : 'idle' as const,
      }))
      setAgents(agentPool)
      try {
        const tasksRaw = await apiGet<unknown>('/tasks')
        const tasksData = unwrap<{ tasks?: KanbanTask[] }>(tasksRaw)
        setTasks(tasksData.tasks ?? [])
      } catch {
        // API not available yet — show empty state, not dummy data
        setTasks([])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load board data')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Use SWR-style: fetch on mount
  const { mutate } = useSWR('company-tasks-trigger', () => {
    fetchData()
    return null
  })

  const updateTaskStatus = useCallback(async (taskId: string, newStatus: string) => {
    setTasks(prev => prev.map(t => (t.id === taskId ? { ...t, status: newStatus } : t)))
    try {
      await apiPost(`/tasks/${taskId}/status`, { status: newStatus })
    } catch {
      toast.error("Couldn't move that task — reverting", { description: 'The task has been moved back to its original position.' })
      fetchData()
    }
  }, [fetchData])

  return { tasks, agents, isLoading, error, updateTaskStatus, refetch: fetchData }
}
