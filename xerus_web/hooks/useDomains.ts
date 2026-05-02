'use client'

import useSWR from 'swr'
import { useAuth } from '@/utils/AuthContext'

export interface Channel {
  id: string
  slug: string
  name: string
  description?: string
  agent_count: number
}

export interface Domain {
  id: string
  slug: string
  name: string
  description?: string
  channels: Channel[]
}

interface DomainsResponse {
  domains: Domain[]
}

const SWR_KEY = '/company/domains?include=channels'

interface UseDomainReturn {
  domains: Domain[]
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function useDomains(): UseDomainReturn {
  const { isAuthReady } = useAuth()

  const { data, error, isLoading, mutate } = useSWR<{ data: DomainsResponse }>(
    isAuthReady ? SWR_KEY : null,
  )

  const response = data?.data ?? data
  const domains = (response as DomainsResponse | undefined)?.domains ?? []

  const refetch = async () => {
    await mutate()
  }

  return {
    domains,
    isLoading,
    error: error ? (error instanceof Error ? error.message : 'Failed to load channels') : null,
    refetch,
  }
}
