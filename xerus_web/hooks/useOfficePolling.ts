'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import useSWR from 'swr'
import { getUserAgents } from '@/lib/api/agents'
import type { OfficeAgent } from '@/hooks/useOfficeData'
import type { StatusTransition } from '@/components/office/office-types'
import { toOfficeAgent } from '@/utils/office'

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
    {
      refreshInterval: intervalMs,
      // Pause polling on hidden tabs and don't fire a fresh request on every focus —
      // SWR's default of refetch-on-focus stacks on top of the interval and floods the API.
      refreshWhenHidden: false,
      revalidateOnFocus: false,
      dedupingInterval: Math.min(intervalMs, 5000),
    },
  )

  // SWR returns the same array reference for the same response, but `?? []`
  // would create a new empty array each render. Memoise so derived effects stay stable.
  const agentList = useMemo(() => agents ?? [], [agents])
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
      // Append rather than replace — back-to-back polls in the same tick would
      // otherwise clobber unread transitions before the 3s clear timer fires.
      setTransitions(prev => [...prev, ...newTransitions])
    }
  }, [])

  useEffect(() => {
    if (agentList.length > 0) {
      detectTransitions(agentList)
      setLastRefresh(new Date())
    }
  }, [agentList, detectTransitions])

  // Clear the queue after the animation window. Re-enters whenever new
  // transitions are appended, so each batch gets its own visibility window.
  useEffect(() => {
    if (transitions.length === 0) return
    const timer = setTimeout(() => setTransitions([]), 3000)
    return () => clearTimeout(timer)
  }, [transitions])

  const domains = useMemo(() => {
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

  const refetch = useCallback(() => {
    mutate()
  }, [mutate])

  return {
    agents: agentList,
    agentsByDomain,
    domains,
    isLoading,
    error: error ? (error instanceof Error ? error.message : 'Failed to load office data') : null,
    transitions,
    lastRefresh,
    refetch,
  }
}
