'use client'

import { useCallback } from 'react'
import useSWR from 'swr'
import { apiGet } from '@/lib/api/client'
import { useAuth } from '@/utils/AuthContext'

// ---------------------------------------------------------------------------
// Company business data — topics, research reports, and prospects that agents
// write to company.db (the structured layer of the workspace data model).
// Read-only surface backed by GET /company/business.
// ---------------------------------------------------------------------------

export interface Topic {
  id: number
  name: string
  description: string | null
  relevance_score: number | null
  trend_direction: 'rising' | 'stable' | 'declining' | null
  research_count: number
  last_researched_at: string | null
  source_agent: string
  created_at: string
  updated_at: string
}

export interface ResearchReport {
  id: number
  topic: string
  source_skill: string
  source_agent: string
  key_findings: string | null
  summary: string | null
  sheet_url: string | null
  created_at: string
}

export interface Prospect {
  id: number
  name: string
  type: string
  status: string
  relevance_score: number | null
  source_agent: string
  source_url: string | null
  notes: string | null
  created_at: string
}

export interface CompanyBusinessData {
  topics: Topic[]
  research_reports: ResearchReport[]
  prospects: Prospect[]
}

const EMPTY_DATA: CompanyBusinessData = { topics: [], research_reports: [], prospects: [] }

const POLL_INTERVAL_MS = 30_000
const POLL_MAX_BACKOFF_MS = 120_000

interface UseCompanyBusinessDataReturn {
  data: CompanyBusinessData
  isLoading: boolean
  error: string | null
  refetch: () => void
}

const fetchCompanyBusinessData = async (): Promise<CompanyBusinessData> => {
  const raw = await apiGet<{ data?: CompanyBusinessData } & Partial<CompanyBusinessData>>(
    '/company/business',
  )
  const payload = raw.data ?? raw
  return {
    topics: payload.topics ?? [],
    research_reports: payload.research_reports ?? [],
    prospects: payload.prospects ?? [],
  }
}

export function useCompanyBusinessData(): UseCompanyBusinessDataReturn {
  const { isAuthReady } = useAuth()
  const swrKey = isAuthReady ? (['company-business'] as const) : null

  const { data, isLoading, error, mutate } = useSWR<CompanyBusinessData>(
    swrKey,
    fetchCompanyBusinessData,
    {
      refreshInterval: POLL_INTERVAL_MS,
      refreshWhenHidden: false,
      onErrorRetry: (_err, _key, _config, revalidate, { retryCount }) => {
        const delay = Math.min(POLL_MAX_BACKOFF_MS, POLL_INTERVAL_MS * 2 ** retryCount)
        setTimeout(() => revalidate({ retryCount }), delay)
      },
    },
  )

  const refetch = useCallback(() => { mutate() }, [mutate])

  return {
    data: data ?? EMPTY_DATA,
    isLoading,
    error: error instanceof Error ? error.message : (error ? 'Failed to load business data' : null),
    refetch,
  }
}
