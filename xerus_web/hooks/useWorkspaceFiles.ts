import { useState, useCallback, useRef } from 'react'
import type { FileItem } from '@/components/chat/UnifiedMentionPicker'

interface UseWorkspaceFilesReturn {
  files: FileItem[]
  loading: boolean
  search: (query: string) => void
}

export function useWorkspaceFiles(conversationId?: string): UseWorkspaceFilesReturn {
  const [files, setFiles] = useState<FileItem[]>([])
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  const search = useCallback(
    (query: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (!query || !conversationId) {
        setFiles([])
        return
      }

      debounceRef.current = setTimeout(async () => {
        setLoading(true)
        try {
          const res = await fetch(
            `/api/conversations/${conversationId}/workspace/files?q=${encodeURIComponent(query)}`,
          )
          if (res.ok) {
            const data = await res.json()
            setFiles(data.files ?? [])
          } else {
            setFiles([])
          }
        } catch {
          setFiles([])
        } finally {
          setLoading(false)
        }
      }, 300)
    },
    [conversationId],
  )

  return { files, loading, search }
}
