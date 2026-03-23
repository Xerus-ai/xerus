'use client'

import { useState, useEffect, useCallback } from 'react'
import { apiGet } from '@/lib/api/client'
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

interface UseDomainReturn {
  domains: Domain[]
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function useDomains(): UseDomainReturn {
  const { isAuthReady } = useAuth()
  const [domains, setDomains] = useState<Domain[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchDomains = useCallback(async () => {
    if (!isAuthReady) return

    try {
      setIsLoading(true)
      setError(null)
      const raw = await apiGet<{ data: DomainsResponse }>('/company/domains?include=channels')
      const response = raw.data ?? raw
      setDomains(response.domains ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load channels')
      setDomains([])
    } finally {
      setIsLoading(false)
    }
  }, [isAuthReady])

  useEffect(() => {
    fetchDomains()
  }, [fetchDomains])

  return { domains, isLoading, error, refetch: fetchDomains }
}

