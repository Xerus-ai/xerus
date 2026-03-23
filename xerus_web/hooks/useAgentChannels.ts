'use client'

import { useState, useEffect, useCallback } from 'react'
import { apiCall } from '@/lib/api/client'
import { useAuth } from '@/utils/AuthContext'
import { toast } from 'sonner'

export interface AgentChannel {
  channel_id: string
  channel_slug: string
  channel_name: string
  domain_slug: string
  domain_name: string
  is_primary: boolean
}

interface ChannelsPayload {
  channels: AgentChannel[]
  primary_channel: string
}

interface UseAgentChannelsReturn {
  assignedChannels: AgentChannel[]
  isLoading: boolean
  processing: string | null
  assignChannel: (channelId: string) => Promise<void>
  unassignChannel: (channelId: string) => Promise<void>
  setPrimaryChannel: (channelId: string) => Promise<void>
  refetch: () => Promise<void>
}

async function parseChannelsResponse(response: Response): Promise<AgentChannel[]> {
  const result = await response.json()
  const data = result.data ?? result
  return (data as ChannelsPayload).channels ?? []
}

export function useAgentChannels(agentId: number): UseAgentChannelsReturn {
  const { isAuthReady } = useAuth()
  const [assignedChannels, setAssignedChannels] = useState<AgentChannel[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [processing, setProcessing] = useState<string | null>(null)

  const fetchChannels = useCallback(async () => {
    if (!isAuthReady || !agentId || agentId < 0) return

    try {
      setIsLoading(true)
      const response = await apiCall(`/agents/${agentId}/channels`, { method: 'GET' })
      setAssignedChannels(await parseChannelsResponse(response))
    } catch {
      toast.error("Couldn't load channel assignments")
      setAssignedChannels([])
    } finally {
      setIsLoading(false)
    }
  }, [isAuthReady, agentId])

  useEffect(() => {
    fetchChannels()
  }, [fetchChannels])

  const assignChannel = useCallback(async (channelId: string) => {
    if (!agentId || agentId < 0) return
    setProcessing(channelId)
    try {
      const response = await apiCall(`/agents/${agentId}/channels`, {
        method: 'POST',
        body: JSON.stringify({ channel_id: channelId }),
      })
      setAssignedChannels(await parseChannelsResponse(response))
    } catch {
      // apiCall already shows error toast
    } finally {
      setProcessing(null)
    }
  }, [agentId])

  const unassignChannel = useCallback(async (channelId: string) => {
    if (!agentId || agentId < 0) return
    setProcessing(channelId)
    try {
      const response = await apiCall(`/agents/${agentId}/channels/${channelId}`, { method: 'DELETE' })
      setAssignedChannels(await parseChannelsResponse(response))
    } catch {
      // apiCall already shows error toast
    } finally {
      setProcessing(null)
    }
  }, [agentId])

  const setPrimaryChannel = useCallback(async (channelId: string) => {
    if (!agentId || agentId < 0) return
    setProcessing(channelId)
    try {
      const response = await apiCall(`/agents/${agentId}/channels/${channelId}/primary`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      setAssignedChannels(await parseChannelsResponse(response))
    } catch {
      // apiCall already shows error toast
    } finally {
      setProcessing(null)
    }
  }, [agentId])

  return {
    assignedChannels,
    isLoading,
    processing,
    assignChannel,
    unassignChannel,
    setPrimaryChannel,
    refetch: fetchChannels,
  }
}
