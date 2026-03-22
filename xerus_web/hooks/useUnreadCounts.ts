'use client'

import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'xerus_unread_counts'
const UNREAD_UPDATE_EVENT = 'xerus:unread_update'

interface UnreadCounts {
  [channelId: string]: number
}

interface UnreadUpdateDetail {
  channelId: string
  count: number
}

function loadFromStorage(): UnreadCounts {
  if (typeof window === 'undefined') return {}
  const stored = localStorage.getItem(STORAGE_KEY)
  if (!stored) return {}
  try {
    const parsed: unknown = JSON.parse(stored)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    const result: UnreadCounts = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'number' && value >= 0) {
        result[key] = value
      }
    }
    return result
  } catch {
    localStorage.removeItem(STORAGE_KEY)
    return {}
  }
}

function persistToStorage(counts: UnreadCounts): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(counts))
}

export function useUnreadCounts() {
  const [counts, setCounts] = useState<UnreadCounts>(loadFromStorage)

  const totalUnread = Object.values(counts).reduce((sum, count) => sum + count, 0)

  const markRead = useCallback((channelId: string) => {
    setCounts((prev) => {
      const next = { ...prev }
      delete next[channelId]
      persistToStorage(next)
      return next
    })
  }, [])

  const resetAll = useCallback(() => {
    setCounts({})
    persistToStorage({})
  }, [])

  useEffect(() => {
    function handleUnreadUpdate(event: Event) {
      const customEvent = event as CustomEvent<UnreadUpdateDetail>
      const { channelId, count } = customEvent.detail
      if (typeof channelId !== 'string' || typeof count !== 'number') return

      setCounts((prev) => {
        const next = { ...prev }
        if (count <= 0) {
          delete next[channelId]
        } else {
          next[channelId] = count
        }
        persistToStorage(next)
        return next
      })
    }

    window.addEventListener(UNREAD_UPDATE_EVENT, handleUnreadUpdate)
    return () => {
      window.removeEventListener(UNREAD_UPDATE_EVENT, handleUnreadUpdate)
    }
  }, [])

  // Sync across tabs via storage event
  useEffect(() => {
    function handleStorageChange(event: StorageEvent) {
      if (event.key !== STORAGE_KEY) return
      setCounts(loadFromStorage())
    }

    window.addEventListener('storage', handleStorageChange)
    return () => {
      window.removeEventListener('storage', handleStorageChange)
    }
  }, [])

  return { counts, totalUnread, markRead, resetAll }
}
