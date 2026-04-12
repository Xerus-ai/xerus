'use client'

import { useState, useCallback, useRef } from 'react'
import { Plus, X } from 'lucide-react'
import useSWR, { mutate } from 'swr'
import { cn } from '@/lib/utils'
import { apiCall } from '@/lib/api/client'
import { ConnectionDialog } from './ConnectionDialog'
import { TagDialog } from './TagDialog'

interface Tag {
  id: number
  tag: string
}

interface Connection {
  id: number
  target_type: string
  target_ref: string
}

interface PropertyBarProps {
  filePath: string
}

async function fetchFileTags(filePath: string): Promise<Tag[]> {
  const response = await apiCall(`/workspace/tags?file_path=${encodeURIComponent(filePath)}`, { method: 'GET' })
  const data = await response.json()
  const unwrapped = data.data ?? data
  return unwrapped.tags ?? []
}

async function fetchFileConnections(filePath: string): Promise<Connection[]> {
  const response = await apiCall(`/workspace/connections?file_path=${encodeURIComponent(filePath)}`, { method: 'GET' })
  const data = await response.json()
  const unwrapped = data.data ?? data
  return unwrapped.connections ?? []
}

async function deleteTag(id: number) {
  await apiCall(`/workspace/tags/${id}`, { method: 'DELETE' })
}

async function deleteConnection(id: number) {
  await apiCall(`/workspace/connections/${id}`, { method: 'DELETE' })
}

export function PropertyBar({ filePath }: PropertyBarProps) {
  const [showDropdown, setShowDropdown] = useState(false)
  const [tagDialogOpen, setTagDialogOpen] = useState(false)
  const [connectionDialogOpen, setConnectionDialogOpen] = useState(false)
  const addBtnRef = useRef<HTMLButtonElement>(null)

  const tagKey = filePath ? `workspace/tags?file=${filePath}` : null
  const connKey = filePath ? `workspace/connections?file=${filePath}` : null

  const { data: tags = [] } = useSWR<Tag[]>(tagKey, () => fetchFileTags(filePath), {
    revalidateOnFocus: false,
  })

  const { data: connections = [] } = useSWR<Connection[]>(connKey, () => fetchFileConnections(filePath), {
    revalidateOnFocus: false,
  })

  const refreshAll = useCallback(() => {
    if (tagKey) mutate(tagKey)
    if (connKey) mutate(connKey)
  }, [tagKey, connKey])

  const handleRemoveTag = useCallback(async (id: number) => {
    await deleteTag(id)
    refreshAll()
  }, [refreshAll])

  const handleRemoveConnection = useCallback(async (id: number) => {
    await deleteConnection(id)
    refreshAll()
  }, [refreshAll])

  const handleDropdownSelect = useCallback((type: 'tag' | 'connection') => {
    setShowDropdown(false)
    if (type === 'tag') setTagDialogOpen(true)
    else setConnectionDialogOpen(true)
  }, [])

  return (
    <div className="relative flex items-center gap-2 flex-wrap min-h-[32px]">
      {/* Tag chips */}
      {tags.map((tag) => (
        <span
          key={tag.id}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-hover text-xs font-medium text-text"
        >
          #{tag.tag}
          <button
            onClick={() => handleRemoveTag(tag.id)}
            className="p-0.5 rounded-full hover:bg-surface-active text-text-muted hover:text-text transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}

      {/* Connection chips */}
      {connections.map((conn) => (
        <span
          key={conn.id}
          className={cn(
            'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium',
            'bg-primary/10 text-primary',
          )}
        >
          &rarr; {conn.target_ref}
          <button
            onClick={() => handleRemoveConnection(conn.id)}
            className="p-0.5 rounded-full hover:bg-primary/20 text-primary/60 hover:text-primary transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}

      {/* "+ Add property" button */}
      <div className="relative">
        <button
          ref={addBtnRef}
          onClick={() => setShowDropdown(!showDropdown)}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium text-text-secondary hover:text-text hover:bg-surface-hover transition-colors border border-dashed border-surface-active"
        >
          <Plus className="w-3 h-3" />
          Add property
        </button>

        {/* Dropdown */}
        {showDropdown && (
          <div className="absolute z-50 top-full left-0 mt-1 w-40 bg-white rounded-xl shadow-lg border border-surface-active overflow-hidden">
            <button
              onClick={() => handleDropdownSelect('tag')}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-surface-hover/60 text-sm text-text text-left transition-colors"
            >
              # Tag
            </button>
            <button
              onClick={() => handleDropdownSelect('connection')}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-surface-hover/60 text-sm text-text text-left transition-colors"
            >
              &rarr; Connection
            </button>
          </div>
        )}
      </div>

      {/* Dialogs */}
      <TagDialog
        filePath={filePath}
        open={tagDialogOpen}
        onClose={() => setTagDialogOpen(false)}
        onCreated={refreshAll}
      />
      <ConnectionDialog
        filePath={filePath}
        open={connectionDialogOpen}
        onClose={() => setConnectionDialogOpen(false)}
        onCreated={refreshAll}
      />
    </div>
  )
}
