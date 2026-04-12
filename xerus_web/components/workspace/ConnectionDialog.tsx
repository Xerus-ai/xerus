'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Search, X } from 'lucide-react'
import useSWR from 'swr'
import { apiCall } from '@/lib/api/client'
import { getUserAgents } from '@/lib/api/agents'
import { getWorkspaceOverview } from '@/lib/api/workspace'

interface ConnectionResult {
  type: 'agent' | 'channel' | 'file'
  ref: string
  label: string
  sublabel: string
}

interface ConnectionDialogProps {
  filePath: string
  open: boolean
  onClose: () => void
  onCreated: () => void
}

async function createConnection(filePath: string, targetType: string, targetRef: string) {
  const response = await apiCall('/workspace/connections', {
    method: 'POST',
    body: JSON.stringify({ file_path: filePath, target_type: targetType, target_ref: targetRef }),
  })
  return response.json()
}

export function ConnectionDialog({ filePath, open, onClose, onCreated }: ConnectionDialogProps) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  const { data: agents = [] } = useSWR(open ? 'agents/mine' : null, getUserAgents)
  const { data: overview } = useSWR(open ? 'workspace/overview' : null, getWorkspaceOverview, {
    revalidateOnFocus: false,
    dedupingInterval: 30000,
  })

  // Build searchable results
  const allResults = useMemo<ConnectionResult[]>(() => {
    const results: ConnectionResult[] = []

    // Agents
    for (const agent of agents) {
      results.push({
        type: 'agent',
        ref: agent.slug || String(agent.id),
        label: agent.name || agent.slug || String(agent.id),
        sublabel: 'Agent',
      })
    }

    // Channels from projects
    if (overview?.projects) {
      for (const project of overview.projects) {
        for (const channel of project.channels) {
          results.push({
            type: 'channel',
            ref: `${project.slug}/${channel.name}`,
            label: `#${channel.name}`,
            sublabel: project.name,
          })
        }
      }
    }

    return results
  }, [agents, overview])

  const filteredResults = useMemo(() => {
    if (!query.trim()) return allResults
    const q = query.toLowerCase()
    return allResults.filter(
      (r) => r.label.toLowerCase().includes(q) || r.sublabel.toLowerCase().includes(q),
    )
  }, [allResults, query])

  const grouped = useMemo(() => {
    const groups: Record<string, ConnectionResult[]> = {}
    for (const result of filteredResults) {
      const key = result.type === 'agent' ? 'AGENTS' : result.type === 'channel' ? 'CHANNELS' : 'FILES'
      if (!groups[key]) groups[key] = []
      groups[key].push(result)
    }
    return groups
  }, [filteredResults])

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

  const handleSelect = useCallback(async (result: ConnectionResult) => {
    await createConnection(filePath, result.type, result.ref)
    onCreated()
    onClose()
  }, [filePath, onCreated, onClose])

  if (!open) return null

  return (
    <div
      ref={dialogRef}
      className="absolute z-50 mt-1 w-72 bg-white rounded-2xl shadow-lg border border-surface-active overflow-hidden"
    >
      {/* Search input */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-surface-active/40">
        <Search className="w-4 h-4 text-text-muted shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search agents, channels, files..."
          className="flex-1 text-sm bg-transparent focus:outline-none text-text placeholder:text-text-muted"
        />
        <button onClick={onClose} className="p-0.5 rounded hover:bg-surface-hover text-text-muted">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Results */}
      <div className="max-h-80 overflow-y-auto py-1">
        {Object.keys(grouped).length === 0 ? (
          <p className="text-sm text-text-muted text-center py-6">No results found</p>
        ) : (
          Object.entries(grouped).map(([groupName, items]) => (
            <div key={groupName}>
              <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider px-3 pt-2 pb-1">
                {groupName}
              </p>
              {items.map((item) => (
                <button
                  key={`${item.type}-${item.ref}`}
                  onClick={() => handleSelect(item)}
                  className="w-full flex items-center justify-between px-3 py-2 hover:bg-surface-hover/60 transition-colors text-left"
                >
                  <span className="text-sm text-text truncate">{item.label}</span>
                  <span className="text-xs text-text-muted shrink-0 ml-2">{item.sublabel}</span>
                </button>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
