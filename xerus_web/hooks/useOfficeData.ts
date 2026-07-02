'use client'

import { useCallback, useMemo } from 'react'
import useSWR from 'swr'
import { toast } from '@/lib/toast'
import { getAssistants, getUserAgents } from '@/lib/api/agents'
import { apiPost, apiGet } from '@/lib/api/client'
import type { Assistant } from '@/lib/api/types'
import type { KanbanTask } from '@/components/common/TaskCard'
import type { Agent as KanbanAgent } from '@/components/common/PresenceAvatars'
import { toOfficeAgent } from '@/utils/office'

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

const COMPANY_TASK_POLL_INTERVAL_MS = 10_000
const POLL_MAX_BACKOFF_MS = 60_000

interface CompanyBoardData {
  tasks: KanbanTask[]
  agents: KanbanAgent[]
}

const fetchCompanyBoard = async (): Promise<CompanyBoardData> => {
  const result = await getAssistants({ limit: 100 })
  const agents: KanbanAgent[] = result.agents.map(a => ({
    id: String(a.id),
    name: a.name,
    slug: a.name.toLowerCase().replace(/\s+/g, '-'),
    status: a.status === 'active' ? 'active' as const : 'idle' as const,
  }))
  let tasks: KanbanTask[] = []
  try {
    const tasksRaw = await apiGet<unknown>('/tasks')
    const tasksData = unwrap<{ tasks?: KanbanTask[] }>(tasksRaw)
    tasks = tasksData.tasks ?? []
  } catch {
    // API not available yet — show empty state, not dummy data
    tasks = []
  }
  return { tasks, agents }
}

export function useCompanyTasks(): UseCompanyTasksReturn {
  const { data, isLoading, error: swrError, mutate } = useSWR<CompanyBoardData>(
    'company-board',
    fetchCompanyBoard,
    {
      refreshInterval: COMPANY_TASK_POLL_INTERVAL_MS,
      refreshWhenHidden: false,
      onErrorRetry: (_err, _key, _config, revalidate, { retryCount }) => {
        const delay = Math.min(POLL_MAX_BACKOFF_MS, COMPANY_TASK_POLL_INTERVAL_MS * 2 ** retryCount)
        setTimeout(() => revalidate({ retryCount }), delay)
      },
    },
  )

  const tasks = data?.tasks ?? []
  const agents = data?.agents ?? []
  const error = swrError instanceof Error ? swrError.message : (swrError ? 'Failed to load board data' : null)

  const updateTaskStatus = useCallback(async (taskId: string, newStatus: string) => {
    const applyStatus = (current: CompanyBoardData | undefined): CompanyBoardData => {
      const base = current ?? { tasks: [], agents: [] }
      return { ...base, tasks: base.tasks.map(t => (t.id === taskId ? { ...t, status: newStatus } : t)) }
    }
    await mutate(
      async (current) => {
        await apiPost(`/tasks/${taskId}/status`, { status: newStatus })
        return applyStatus(current)
      },
      {
        optimisticData: applyStatus,
        rollbackOnError: true,
        revalidate: false,
      },
    ).catch(() => {
      toast.error("Couldn't move that task — reverting", { description: 'The task has been moved back to its original position.' })
    })
  }, [mutate])

  const refetch = useCallback(() => { mutate() }, [mutate])

  return { tasks, agents, isLoading, error, updateTaskStatus, refetch }
}
