'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { getFile, getFileBlob } from '@/lib/api/workspace'
import type { ViewerContent, ViewerContentType } from '@/components/chat/ArtifactContentRenderer'
import type { WorkspaceArtifact } from '@/components/chat/chat-message.types'
import { toast } from '@/lib/toast'

// ---------------------------------------------------------------------------
// Extension → renderer type mapping (single source of truth)
// ---------------------------------------------------------------------------

const EXT_TO_VIEWER: Record<string, ViewerContentType> = {
  html: 'html', htm: 'html',
  pdf: 'pdf',
  md: 'markdown', mdx: 'markdown',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', svg: 'image', webp: 'image',
  csv: 'csv',
  ts: 'code', tsx: 'code', js: 'code', jsx: 'code', py: 'code', rb: 'code',
  go: 'code', rs: 'code', java: 'code', css: 'code', scss: 'code',
  json: 'code', yaml: 'code', yml: 'code', sql: 'code', sh: 'code',
}

export function extToViewerType(ext: string): ViewerContentType {
  return EXT_TO_VIEWER[ext] ?? 'text'
}

// Binary types need blob URLs; text types get inline string content.
const BINARY_TYPES = new Set<ViewerContentType>(['pdf', 'image'])

// ---------------------------------------------------------------------------
// Tab model
// ---------------------------------------------------------------------------

export type ArtifactTabKind = 'file' | 'plan' | 'preview' | 'artifact'

export interface ArtifactTab {
  id: string
  kind: ArtifactTabKind
  content: ViewerContent
  previousContent?: string
  loading?: boolean
  error?: string
}

export interface OpenFileInput {
  name: string
  path: string
  extension?: string
  editDiff?: { oldString: string; newString: string }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useArtifactTabs() {
  const [tabs, setTabs] = useState<ArtifactTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)

  // Object URLs created for binary blobs (pdf/image). Revoked on tab close + unmount.
  const objectUrlsRef = useRef<Map<string, string>>(new Map())

  const revokeObjectUrl = useCallback((id: string) => {
    const url = objectUrlsRef.current.get(id)
    if (url) {
      URL.revokeObjectURL(url)
      objectUrlsRef.current.delete(id)
    }
  }, [])

  const upsertAndActivate = useCallback((tab: ArtifactTab) => {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === tab.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = tab
        return next
      }
      return [...prev, tab]
    })
    setActiveTabId(tab.id)
  }, [])

  const updateTab = useCallback((id: string, patch: Partial<ArtifactTab>) => {
    setTabs((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, ...patch, content: { ...t.content, ...(patch.content ?? {}) } }
          : t,
      ),
    )
  }, [])

  const openFile = useCallback(
    async (input: OpenFileInput) => {
      const ext = (input.extension ?? input.name.split('.').pop() ?? '').toLowerCase()
      const type = extToViewerType(ext)
      const id = `file:${input.path}`

      const existing = tabs.find((t) => t.id === id)
      const prevContent = input.editDiff?.oldString ?? existing?.content.content

      upsertAndActivate({
        id,
        kind: 'file',
        content: { type, title: input.name, subtitle: ext.toUpperCase(), language: ext },
        previousContent: prevContent ?? undefined,
        loading: true,
      })

      try {
        if (BINARY_TYPES.has(type)) {
          const result = await getFileBlob(input.path)
          revokeObjectUrl(id)
          const url = URL.createObjectURL(result.blob)
          objectUrlsRef.current.set(id, url)
          updateTab(id, { loading: false, content: { type, title: input.name, url } })
        } else {
          const result = await getFile(input.path)
          updateTab(id, {
            loading: false,
            previousContent: prevContent ?? undefined,
            content: { type, title: input.name, content: result.content },
          })
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load file'
        updateTab(id, { loading: false, error: message })
        toast.error("Couldn't open the file", { description: message })
      }
    },
    [tabs, upsertAndActivate, updateTab, revokeObjectUrl],
  )

  const openPlan = useCallback(
    (payload: { title: string; content: string }) => {
      upsertAndActivate({
        id: `plan:${payload.title}`,
        kind: 'plan',
        content: { type: 'plan', title: payload.title, content: payload.content },
      })
    },
    [upsertAndActivate],
  )

  const openArtifact = useCallback(
    (artifact: WorkspaceArtifact) => {
      if (artifact.path) {
        void openFile({ name: artifact.filename, path: artifact.path })
        return
      }
      const ext = artifact.filename.split('.').pop()?.toLowerCase() ?? ''
      const type = extToViewerType(ext)
      upsertAndActivate({
        id: `artifact:${artifact.id}`,
        kind: 'artifact',
        content: {
          type,
          title: artifact.filename,
          subtitle: `${artifact.lineCount} lines \u00b7 ${artifact.description}`,
          content: artifact.preview,
          language: ext,
        },
      })
    },
    [upsertAndActivate, openFile],
  )

  const openPreview = useCallback(
    (url: string, label = 'Preview', port?: number) => {
      // One tab per port so two simultaneous dev servers get separate tabs.
      const id = port ? `preview:${port}` : 'preview'
      const subtitle = port ? `Live preview \u00b7 :${port}` : 'Live preview'
      upsertAndActivate({
        id,
        kind: 'preview',
        content: { type: 'html', title: label, subtitle, url },
      })
    },
    [upsertAndActivate],
  )

  const closeTab = useCallback(
    (id: string) => {
      revokeObjectUrl(id)
      // Compute the next active tab from prev state so we never read stale closures.
      let newActiveId: string | null = null
      setTabs((prev) => {
        const idx = prev.findIndex((t) => t.id === id)
        if (idx < 0) return prev
        const next = prev.filter((t) => t.id !== id)
        if (next.length > 0) {
          const fallbackIdx = Math.max(0, Math.min(idx - 1, next.length - 1))
          newActiveId = next[fallbackIdx].id
        }
        return next
      })
      setActiveTabId((current) => (current === id ? newActiveId : current))
    },
    [revokeObjectUrl],
  )

  const closeAll = useCallback(() => {
    for (const url of objectUrlsRef.current.values()) {
      URL.revokeObjectURL(url)
    }
    objectUrlsRef.current.clear()
    setTabs([])
    setActiveTabId(null)
  }, [])

  // Revoke all object URLs on unmount to prevent leaks
  useEffect(() => {
    const urls = objectUrlsRef.current
    return () => {
      for (const url of urls.values()) {
        URL.revokeObjectURL(url)
      }
      urls.clear()
    }
  }, [])

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null

  return {
    tabs,
    activeTabId,
    activeTab,
    openFile,
    openPlan,
    openArtifact,
    openPreview,
    closeTab,
    setActiveTabId,
    closeAll,
  }
}

export type UseArtifactTabsResult = ReturnType<typeof useArtifactTabs>
