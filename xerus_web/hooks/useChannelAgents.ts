'use client'

import { useState, useEffect, useCallback } from 'react'
import { apiGet, apiCall } from '@/lib/api/client'
import { useAuth } from '@/utils/AuthContext'
import { toast } from '@/lib/toast'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChannelAgent {
  id: string
  name: string
  slug: string
  avatar_url?: string
  status: 'active' | 'running' | 'idle' | 'sleeping' | 'paused' | 'error'
  ai_model?: string
  adapter_type?: string
  description?: string
  tools?: string[]
  skills?: string[]
}

interface UseChannelAgentsReturn {
  agents: ChannelAgent[]
  allAgents: ChannelAgent[]
  isLoading: boolean
  assignAgent: (agentId: string, channelSlug: string) => Promise<void>
  unassignAgent: (agentId: string, channelSlug: string) => Promise<void>
  refetch: () => Promise<void>
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Fetch channel-assigned agents via single-query endpoint + all workspace agents.
 * Uses GET /company/channels/:slug/agents (single query) instead of N+1 calls.
 */
export function useChannelAgents(channelSlug: string): UseChannelAgentsReturn {
  const { isAuthReady } = useAuth()
  const [agents, setAgents] = useState<ChannelAgent[]>([])
  const [allAgents, setAllAgents] = useState<ChannelAgent[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const fetchAgents = useCallback(async () => {
    if (!isAuthReady || !channelSlug) return

    try {
      setIsLoading(true)

      // Fetch assigned agents and all agents in parallel (2 requests total)
      const [assignedResult, allResult] = await Promise.all([
        apiGet<{ data?: { agents: ChannelAgent[] }; agents?: ChannelAgent[] }>(
          `/company/channels/${channelSlug}/agents`
        ),
        apiGet<{ data?: { agents: Array<Record<string, unknown>> }; agents?: Array<Record<string, unknown>> }>(
          '/agents?limit=50'
        ),
      ])

      // Parse assigned agents
      const assignedData = assignedResult.data ?? assignedResult
      setAgents(assignedData.agents ?? [])

      // Parse all workspace agents
      const allData = allResult.data ?? allResult
      const rawAgents = allData.agents ?? []
      const mapped: ChannelAgent[] = rawAgents.map((a) => ({
        id: String(a.id),
        name: (a.name as string) ?? 'Agent',
        slug: (a.slug as string) ?? '',
        avatar_url: (a.avatar_url as string | undefined),
        status: (a.is_active ? 'active' : 'idle') as ChannelAgent['status'],
        ai_model: (a.ai_model as string | undefined),
        adapter_type: (a.adapter_type as string | undefined),
        description: (a.description as string | undefined),
      }))
      setAllAgents(mapped)
    } catch {
      toast.error("Couldn't load channel agents", {
        description: 'Please refresh the page and try again.',
      })
      setAgents([])
      setAllAgents([])
    } finally {
      setIsLoading(false)
    }
  }, [isAuthReady, channelSlug])

  useEffect(() => {
    fetchAgents()
  }, [fetchAgents])

  const assignAgent = useCallback(
    async (agentId: string, targetChannelSlug: string) => {
      await apiCall(`/agents/${agentId}/channels`, {
        method: 'POST',
        body: JSON.stringify({ channel_slug: targetChannelSlug }),
      })
      await fetchAgents()
    },
    [fetchAgents]
  )

  const unassignAgent = useCallback(
    async (agentId: string, targetChannelSlug: string) => {
      await apiCall(`/agents/${agentId}/channels/${targetChannelSlug}`, {
        method: 'DELETE',
      })
      await fetchAgents()
    },
    [fetchAgents]
  )

  return {
    agents,
    allAgents,
    isLoading,
    assignAgent,
    unassignAgent,
    refetch: fetchAgents,
  }
}
