'use client'

import { SWRConfig } from 'swr'
import { apiGet } from '@/lib/api'

const swrFetcher = <T,>(key: string): Promise<T> => apiGet<T>(key)

export function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher: swrFetcher,
        revalidateOnFocus: false,
        shouldRetryOnError: true,
        errorRetryCount: 2,
        dedupingInterval: 5000,
      }}
    >
      {children}
    </SWRConfig>
  )
}
