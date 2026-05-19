import { useRef, useEffect } from 'react'
import type { ChatState } from './types'

interface ArtifactAutoOpenInput {
  pendingArtifactFile: ChatState['pendingArtifactFile']
  pendingPreview: ChatState['pendingPreview']
  pendingGuidancePreviewUrl: string | undefined
  artifacts: {
    openFile: (input: { name: string; path: string; extension: string; editDiff?: { oldString: string; newString: string } }) => Promise<void>
    openPreview: (url: string, label?: string, port?: number) => void
  }
}

export function useArtifactAutoOpen({ pendingArtifactFile, pendingPreview, pendingGuidancePreviewUrl, artifacts }: ArtifactAutoOpenInput) {
  const lastHitlPreviewRef = useRef<string | null>(null)
  useEffect(() => {
    if (!pendingGuidancePreviewUrl || pendingGuidancePreviewUrl === lastHitlPreviewRef.current) return
    lastHitlPreviewRef.current = pendingGuidancePreviewUrl
    artifacts.openPreview(pendingGuidancePreviewUrl)
  }, [pendingGuidancePreviewUrl, artifacts])

  const lastArtifactFileTsRef = useRef<number | null>(null)
  const artifactDebounceRef = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => {
    const file = pendingArtifactFile
    if (!file || file.ts === lastArtifactFileTsRef.current) return
    lastArtifactFileTsRef.current = file.ts
    if (artifactDebounceRef.current) clearTimeout(artifactDebounceRef.current)
    const delay = typeof document !== 'undefined' && document.hidden ? 500 : 100
    artifactDebounceRef.current = setTimeout(() => {
      void artifacts.openFile({ name: file.name, path: file.path, extension: file.extension, editDiff: file.editDiff })
    }, delay)
    return () => { if (artifactDebounceRef.current) clearTimeout(artifactDebounceRef.current) }
  }, [pendingArtifactFile, artifacts])

  const lastSsePreviewTsRef = useRef<number | null>(null)
  useEffect(() => {
    if (!pendingPreview || pendingPreview.ts === lastSsePreviewTsRef.current) return
    lastSsePreviewTsRef.current = pendingPreview.ts
    artifacts.openPreview(pendingPreview.url, pendingPreview.label, pendingPreview.port)
  }, [pendingPreview, artifacts])
}
