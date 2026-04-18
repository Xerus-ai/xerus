'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
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
  const channelSlugRef = useRef(channelSlug)

  const fetchAssigned = useCallback(async (signal?: AbortSignal) => {
    if (!isAuthReady || !channelSlug) return
    const result = await apiGet<{ data?: { agents: ChannelAgent[] }; agents?: ChannelAgent[] }>(
      `/company/channels/${channelSlug}/agents`,
      signal ? { signal } : undefined,
    )
    if (signal?.aborted || channelSlugRef.current !== channelSlug) return
    const data = result.data ?? result
    setAgents(data.agents ?? [])
  }, [isAuthReady, channelSlug])

  const fetchAll = useCallback(async (signal?: AbortSignal) => {
    if (!isAuthReady) return
    const result = await apiGet<{ data?: { agents: Array<Record<string, unknown>> }; agents?: Array<Record<string, unknown>> }>(
      '/agents?limit=50',
      signal ? { signal } : undefined,
    )
    if (signal?.aborted) return
    const data = result.data ?? result
    const rawAgents = data.agents ?? []
    const mapped: ChannelAgent[] = rawAgents.map((a) => ({
      id: String(a.id),
      name: typeof a.name === 'string' ? a.name : 'Agent',
      slug: typeof a.slug === 'string' ? a.slug : '',
      avatar_url: typeof a.avatar_url === 'string' ? a.avatar_url : undefined,
      status: (a.is_active ? 'active' : 'idle') as ChannelAgent['status'],
      ai_model: typeof a.ai_model === 'string' ? a.ai_model : undefined,
      adapter_type: typeof a.adapter_type === 'string' ? a.adapter_type : undefined,
      description: typeof a.description === 'string' ? a.description : undefined,
    }))
    setAllAgents(mapped)
  }, [isAuthReady])

  const fetchAgents = useCallback(async (signal?: AbortSignal) => {
    if (!isAuthReady || !channelSlug) return
    setIsLoading(true)
    // allSettled so a transient failure on one endpoint doesn't wipe data the
    // other endpoint just successfully loaded.
    const [assignedResult, allResult] = await Promise.allSettled([
      fetchAssigned(signal),
      fetchAll(signal),
    ])
    if (signal?.aborted) {
      setIsLoading(false)
      return
    }

    const failed: string[] = []
    if (assignedResult.status === 'rejected') {
      const reason = assignedResult.reason
      if (!(reason instanceof Error && reason.name === 'AbortError')) {
        setAgents([])
        failed.push('channel agents')
      }
    }
    if (allResult.status === 'rejected') {
      const reason = allResult.reason
      if (!(reason instanceof Error && reason.name === 'AbortError')) {
        setAllAgents([])
        failed.push('workspace agents')
      }
    }
    if (failed.length > 0) {
      toast.error(`Couldn't load ${failed.join(' and ')}`, {
        description: 'Please refresh the page and try again.',
      })
    }
    if (channelSlugRef.current === channelSlug) {
      setIsLoading(false)
    }
  }, [isAuthReady, channelSlug, fetchAssigned, fetchAll])

  useEffect(() => {
    channelSlugRef.current = channelSlug
    const controller = new AbortController()
    fetchAgents(controller.signal)
    return () => controller.abort()
  }, [channelSlug, fetchAgents])

  // Mutations only refresh the assigned list — the workspace agents catalogue
  // doesn't change when membership flips, so re-fetching it is wasted work.
  const assignAgent = useCallback(
    async (agentId: string, targetChannelSlug: string) => {
      await apiCall(`/agents/${agentId}/channels`, {
        method: 'POST',
        body: JSON.stringify({ channel_slug: targetChannelSlug }),
      })
      if (targetChannelSlug === channelSlugRef.current) {
        await fetchAssigned().catch(() => { /* toast already fired by apiCall */ })
      }
    },
    [fetchAssigned],
  )

  const unassignAgent = useCallback(
    async (agentId: string, targetChannelSlug: string) => {
      // Snapshot BEFORE the optimistic update so we can restore even if the
      // recovery refetch itself fails (network down during DELETE).
      const isCurrentChannel = targetChannelSlug === channelSlugRef.current
      const snapshot = isCurrentChannel ? agents : null
      if (isCurrentChannel) {
        setAgents(prev => prev.filter(a => a.id !== agentId))
      }
      try {
        await apiCall(`/agents/${agentId}/channels/${targetChannelSlug}`, {
          method: 'DELETE',
        })
        if (isCurrentChannel) {
          await fetchAssigned().catch(() => { /* keep optimistic state — server confirmed delete */ })
        }
      } catch (err) {
        if (isCurrentChannel && snapshot) {
          // Restore from snapshot first; refetch the source of truth in the background.
          setAgents(snapshot)
          fetchAssigned().catch(() => { /* snapshot already restored */ })
        }
        throw err
      }
    },
    [agents, fetchAssigned],
  )

  const refetch = useCallback(() => fetchAgents(), [fetchAgents])

  return {
    agents,
    allAgents,
    isLoading,
    assignAgent,
    unassignAgent,
    refetch,
  }
}
