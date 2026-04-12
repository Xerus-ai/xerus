'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Search, X } from 'lucide-react'
import useSWR from 'swr'
import { apiCall } from '@/lib/api/client'

interface TagInfo {
  tag: string
  count: number
}

interface TagDialogProps {
  filePath: string
  open: boolean
  onClose: () => void
  onCreated: () => void
}

async function fetchTagList(): Promise<TagInfo[]> {
  const response = await apiCall('/workspace/tags/list', { method: 'GET' })
  const data = await response.json()
  const unwrapped = data.data ?? data
  return unwrapped.tags ?? []
}

async function createTag(filePath: string, tag: string) {
  const response = await apiCall('/workspace/tags', {
    method: 'POST',
    body: JSON.stringify({ file_path: filePath, tag }),
  })
  return response.json()
}

export function TagDialog({ filePath, open, onClose, onCreated }: TagDialogProps) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  const { data: tags = [] } = useSWR<TagInfo[]>(open ? 'workspace/tags/list' : null, fetchTagList, {
    revalidateOnFocus: false,
    dedupingInterval: 15000,
  })

  const filtered = useMemo(() => {
    if (!query.trim()) return tags
    const q = query.toLowerCase()
    return tags.filter((t) => t.tag.toLowerCase().includes(q))
  }, [tags, query])

  const showCreateOption = useMemo(() => {
    if (!query.trim()) return false
    const q = query.trim().toLowerCase()
    return !tags.some((t) => t.tag.toLowerCase() === q)
  }, [tags, query])

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery('')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open, onClose])

  const handleSelect = useCallback(async (tag: string) => {
    await createTag(filePath, tag)
    onCreated()
    onClose()
  }, [filePath, onCreated, onClose])

  const handleCreateNew = useCallback(async () => {
    const tag = query.trim().toLowerCase().replace(/\s+/g, '-')
    if (!tag) return
    await createTag(filePath, tag)
    onCreated()
    onClose()
  }, [filePath, query, onCreated, onClose])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && showCreateOption) {
      e.preventDefault()
      handleCreateNew()
    }
    if (e.key === 'Escape') {
      onClose()
    }
  }, [showCreateOption, handleCreateNew, onClose])

  if (!open) return null

  return (
    <div
      ref={dialogRef}
      className="absolute z-50 mt-1 w-64 bg-white rounded-2xl shadow-lg border border-surface-active overflow-hidden"
    >
      {/* Search / create input */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-surface-active/40">
        <Search className="w-4 h-4 text-text-muted shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search or create tag..."
          className="flex-1 text-sm bg-transparent focus:outline-none text-text placeholder:text-text-muted"
        />
        <button onClick={onClose} className="p-0.5 rounded hover:bg-surface-hover text-text-muted">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Results */}
      <div className="max-h-80 overflow-y-auto py-1">
        {showCreateOption && (
          <button
            onClick={handleCreateNew}
            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-surface-hover/60 transition-colors text-left"
          >
            <span className="text-sm text-primary font-medium">
              Create &ldquo;{query.trim().toLowerCase().replace(/\s+/g, '-')}&rdquo;
            </span>
          </button>
        )}

        {filtered.length > 0 && (
          <>
            <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider px-3 pt-2 pb-1">
              EXISTING TAGS
            </p>
            {filtered.map((t) => (
              <button
                key={t.tag}
                onClick={() => handleSelect(t.tag)}
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-surface-hover/60 transition-colors text-left"
              >
                <span className="text-sm text-text">#{t.tag}</span>
                <span className="text-xs text-text-muted">{t.count} files</span>
              </button>
            ))}
          </>
        )}

        {filtered.length === 0 && !showCreateOption && (
          <p className="text-sm text-text-muted text-center py-6">No tags yet</p>
        )}
      </div>
    </div>
  )
}
