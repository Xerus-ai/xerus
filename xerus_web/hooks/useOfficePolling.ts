'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import useSWR from 'swr'
import { getUserAgents } from '@/lib/api/agents'
import type { Assistant } from '@/lib/api/types'
import type { OfficeAgent } from '@/hooks/useOfficeData'
import type { StatusTransition } from '@/components/office/office-types'

/** Map a real Assistant to the simplified OfficeAgent shape */
function toOfficeAgent(a: Assistant): OfficeAgent {
  let status: OfficeAgent['status'] = 'idle'
  if (a.status === 'active') {
    status = 'active'
  } else {
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

const fetchOfficeAgents = async (): Promise<OfficeAgent[]> => {
  const userAgents = await getUserAgents()
  return userAgents.map(toOfficeAgent)
}

interface UseOfficePollingReturn {
  agents: OfficeAgent[]
  agentsByDomain: Map<string, OfficeAgent[]>
  domains: ReturnType<typeof import('@/hooks/useOfficeData').useOfficeAgents>['domains']
  isLoading: boolean
  error: string | null
  transitions: StatusTransition[]
  lastRefresh: Date | null
  refetch: () => void
}

export function useOfficePolling(intervalMs = 30000): UseOfficePollingReturn {
  const { data: agents, error, isLoading, mutate } = useSWR(
    'office-agents',
    fetchOfficeAgents,
    { refreshInterval: intervalMs }
  )

  const agentList = agents ?? []
  const previousAgentsRef = useRef<Map<string, OfficeAgent>>(new Map())
  const [transitions, setTransitions] = useState<StatusTransition[]>([])
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const detectTransitions = useCallback((current: OfficeAgent[]) => {
    const prev = previousAgentsRef.current
    const newTransitions: StatusTransition[] = []

    for (const agent of current) {
      const prevAgent = prev.get(agent.id)
      if (prevAgent && prevAgent.status !== agent.status) {
        newTransitions.push({
          agentId: agent.id,
          from: prevAgent.status,
          to: agent.status,
          taskTitle: agent.current_task,
        })
      }
    }

    const nextMap = new Map<string, OfficeAgent>()
    for (const agent of current) {
      nextMap.set(agent.id, agent)
    }
    previousAgentsRef.current = nextMap

    if (newTransitions.length > 0) {
      setTransitions(newTransitions)
    }
  }, [])

  useEffect(() => {
    if (agentList.length > 0) {
      detectTransitions(agentList)
      setLastRefresh(new Date())
    }
  }, [agentList, detectTransitions])

  // Clear transitions after animation window
  useEffect(() => {
    if (transitions.length > 0) {
      const timer = setTimeout(() => setTransitions([]), 3000)
      return () => clearTimeout(timer)
    }
  }, [transitions])

  // Derive domains
  const domains = (() => {
    const seen = new Map<string, { id: string; slug: string; name: string }>()
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
  })()

  // Group agents by domain
  const agentsByDomain = (() => {
    const map = new Map<string, OfficeAgent[]>()
    for (const agent of agentList) {
      const domain = agent.domain || 'general'
      const existing = map.get(domain) ?? []
      existing.push(agent)
      map.set(domain, existing)
    }
    return map
  })()

  return {
    agents: agentList,
    agentsByDomain,
    domains,
    isLoading,
    error: error ? (error instanceof Error ? error.message : 'Failed to load office data') : null,
    transitions,
    lastRefresh,
    refetch: () => mutate(),
  }
}
