'use client'

import { useCallback } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'

/**
 * Sync a state value with a URL search parameter.
 * Returns [currentValue, setValue] similar to useState.
 */
export function useSearchParamState(
  key: string,
  defaultValue = ''
): [string, (value: string) => void] {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const currentValue = searchParams.get(key) ?? defaultValue

  const setValue = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value === defaultValue || value === '') {
        params.delete(key)
      } else {
        params.set(key, value)
      }
      const query = params.toString()
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    },
    [searchParams, router, pathname, key, defaultValue]
  )

  return [currentValue, setValue]
}

/**
 * Sync an array state value with a URL search parameter (comma-separated).
 */
export function useSearchParamArray(
  key: string
): [string[], (value: string[]) => void] {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const raw = searchParams.get(key)
  const currentValue = raw ? raw.split(',').filter(Boolean) : []

  const setValue = useCallback(
    (value: string[]) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value.length === 0) {
        params.delete(key)
      } else {
        params.set(key, value.join(','))
      }
      const query = params.toString()
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    },
    [searchParams, router, pathname, key]
  )

  return [currentValue, setValue]
}
