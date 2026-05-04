import { useState, useCallback, useRef } from 'react'
import type { KBEntry } from '@/components/chat/UnifiedMentionPicker'

interface UseKBSearchReturn {
  entries: KBEntry[]
  loading: boolean
  search: (query: string) => void
}

export function useKBSearch(): UseKBSearchReturn {
  const [entries, setEntries] = useState<KBEntry[]>([])
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  const search = useCallback((query: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query) {
      setEntries([])
      return
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(
          `/api/knowledge-base/search?q=${encodeURIComponent(query)}`,
        )
        if (res.ok) {
          const data = await res.json()
          setEntries(data.entries ?? [])
        } else {
          setEntries([])
        }
      } catch {
        setEntries([])
      } finally {
        setLoading(false)
      }
    }, 300)
  }, [])

  return { entries, loading, search }
}
