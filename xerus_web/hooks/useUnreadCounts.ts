'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useDomains } from './useDomains'

const SEEN_KEY = 'xerus_last_seen_counts'

interface SeenCounts {
  [channelId: string]: number
}

function loadSeen(): SeenCounts {
  if (typeof window === 'undefined') return {}
  const stored = localStorage.getItem(SEEN_KEY)
  if (!stored) return {}
  try {
    const parsed: unknown = JSON.parse(stored)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    const result: SeenCounts = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'number' && value >= 0) {
        result[key] = value
      }
    }
    return result
  } catch {
    localStorage.removeItem(SEEN_KEY)
    return {}
  }
}

function persistSeen(seen: SeenCounts): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(SEEN_KEY, JSON.stringify(seen))
}

export function useUnreadCounts() {
  const { domains } = useDomains()
  const [seen, setSeen] = useState<SeenCounts>(loadSeen)

  const counts = useMemo(() => {
    const result: Record<string, number> = {}
    for (const domain of domains) {
      for (const channel of domain.channels) {
        const lastSeen = seen[channel.id] ?? 0
        const unread = Math.max(0, (channel.message_count ?? 0) - lastSeen)
        if (unread > 0) {
          result[channel.id] = unread
        }
      }
    }
    return result
  }, [domains, seen])

  const totalUnread = useMemo(
    () => Object.values(counts).reduce((sum, n) => sum + n, 0),
    [counts],
  )

  const markRead = useCallback((channelId: string) => {
    const channel = domains
      .flatMap(d => d.channels)
      .find(c => c.id === channelId)
    if (!channel) return

    setSeen(prev => {
      const next = { ...prev, [channelId]: channel.message_count ?? 0 }
      persistSeen(next)
      return next
    })
  }, [domains])

  const resetAll = useCallback(() => {
    const next: SeenCounts = {}
    for (const domain of domains) {
      for (const channel of domain.channels) {
        next[channel.id] = channel.message_count ?? 0
      }
    }
    setSeen(next)
    persistSeen(next)
  }, [domains])

  useEffect(() => {
    function handleStorageChange(event: StorageEvent) {
      if (event.key !== SEEN_KEY) return
      setSeen(loadSeen())
    }

    window.addEventListener('storage', handleStorageChange)
    return () => {
      window.removeEventListener('storage', handleStorageChange)
    }
  }, [])

  return { counts, totalUnread, markRead, resetAll }
}
