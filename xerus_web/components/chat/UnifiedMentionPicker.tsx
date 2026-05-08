'use client'

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { Bot, FileText, BookOpen, Loader2, Folder } from 'lucide-react'
import type { Agent } from './types'
import { isMascotConfig } from '@/lib/mascot-config'
import { MascotAvatar } from '@/components/agents/MascotAvatar'

export interface FileItem {
  path: string
  name: string
  type: 'file' | 'directory'
}

export interface KBEntry {
  id: string
  title: string
  summary?: string
}

export type MentionItem =
  | { type: 'agent'; agent: Agent }
  | { type: 'file'; file: FileItem }
  | { type: 'kb'; entry: KBEntry }

interface UnifiedMentionPickerProps {
  query: string
  agents: Agent[]
  files: FileItem[]
  kbEntries: KBEntry[]
  filesLoading?: boolean
  kbLoading?: boolean
  selectedIdx: number
  onSelect: (item: MentionItem) => void
  onClose: () => void
  onSelectedIdxChange: (idx: number) => void
}

export function UnifiedMentionPicker({
  query,
  agents,
  files,
  kbEntries,
  filesLoading,
  kbLoading,
  selectedIdx,
  onSelect,
  onClose,
  onSelectedIdxChange,
}: UnifiedMentionPickerProps) {
  const pickerRef = useRef<HTMLDivElement>(null)

  const isFileMode = query.startsWith('/')
  const isKBMode = query.startsWith('kb:')

  const filteredAgents = isFileMode || isKBMode ? [] : agents.filter(
    (a) =>
      a.name.toLowerCase().includes(query.toLowerCase()) ||
      (a.domain ?? '').toLowerCase().includes(query.toLowerCase()),
  ).slice(0, 6)

  const filteredFiles = isFileMode
    ? files.filter((f) => f.path.toLowerCase().includes(query.slice(1).toLowerCase())).slice(0, 6)
    : []

  const filteredKB = isKBMode
    ? kbEntries.filter((e) => e.title.toLowerCase().includes(query.slice(3).toLowerCase())).slice(0, 6)
    : []

  const allItems: MentionItem[] = [
    ...filteredAgents.map((a): MentionItem => ({ type: 'agent', agent: a })),
    ...filteredFiles.map((f): MentionItem => ({ type: 'file', file: f })),
    ...filteredKB.map((e): MentionItem => ({ type: 'kb', entry: e })),
  ]

  useEffect(() => {
    if (!pickerRef.current || allItems.length === 0) return
    const allButtons = pickerRef.current.querySelectorAll('[role="option"]')
    const target = allButtons[selectedIdx] as HTMLElement | undefined
    target?.scrollIntoView({ block: 'nearest' })
  }, [selectedIdx, allItems.length])

  if (allItems.length === 0 && !filesLoading && !kbLoading) return null

  let globalIdx = 0

  return (
    <div
      ref={pickerRef}
      className="absolute bottom-full left-0 w-[280px] mb-2 bg-card border border-border rounded-xl shadow-lg backdrop-blur-sm overflow-hidden max-h-[280px] overflow-y-auto z-10"
      role="listbox"
      aria-label="Mention picker"
      onMouseDown={(e) => e.preventDefault()}
    >
      {/* Agents section */}
      {filteredAgents.length > 0 && (
        <>
          <div className="px-3 py-1.5 border-b border-border">
            <span className="text-[11px] font-medium uppercase tracking-wide text-text-muted">Agents</span>
          </div>
          <div className="p-1">
            {filteredAgents.map((agent) => {
              const idx = globalIdx++
              return (
                <button
                  key={agent.id}
                  type="button"
                  role="option"
                  aria-selected={idx === selectedIdx}
                  className={cn(
                    'flex items-center gap-2.5 w-full px-2 py-1.5 text-left text-sm rounded-md transition-colors duration-100',
                    idx === selectedIdx ? 'bg-surface-hover text-text' : 'text-text hover:bg-surface-hover',
                  )}
                  onMouseDown={(e) => { e.preventDefault(); onSelect({ type: 'agent', agent }) }}
                  onMouseEnter={() => onSelectedIdxChange(idx)}
                >
                  <div className="w-6 h-6 rounded-lg overflow-hidden shrink-0 flex items-center justify-center bg-surface-hover text-text-secondary">
                    {isMascotConfig(agent.avatarUrl) ? (
                      <MascotAvatar config={agent.avatarUrl!} size={24} className="w-full h-full" alt={agent.name} />
                    ) : agent.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={agent.avatarUrl} alt={agent.name} className="w-full h-full object-cover" />
                    ) : (
                      <Bot className="w-3.5 h-3.5" />
                    )}
                  </div>
                  <span className="font-medium truncate">{agent.name}</span>
                </button>
              )
            })}
          </div>
        </>
      )}

      {/* Files section */}
      {(filteredFiles.length > 0 || filesLoading) && (
        <>
          <div className="px-3 py-1.5 border-b border-border">
            <span className="text-[11px] font-medium uppercase tracking-wide text-text-muted">Files</span>
            {filesLoading && <Loader2 className="inline w-3 h-3 ml-1.5 animate-spin text-text-muted" />}
          </div>
          <div className="p-1">
            {filteredFiles.map((file) => {
              const idx = globalIdx++
              return (
                <button
                  key={file.path}
                  type="button"
                  role="option"
                  aria-selected={idx === selectedIdx}
                  className={cn(
                    'flex items-center gap-2.5 w-full px-2 py-1.5 text-left text-sm rounded-md transition-colors duration-100',
                    idx === selectedIdx ? 'bg-surface-hover text-text' : 'text-text hover:bg-surface-hover',
                  )}
                  onMouseDown={(e) => { e.preventDefault(); onSelect({ type: 'file', file }) }}
                  onMouseEnter={() => onSelectedIdxChange(idx)}
                >
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 bg-blue-500/10 text-blue-600">
                    {file.type === 'directory' ? <Folder className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium truncate block">{file.name}</span>
                    <span className="text-[11px] text-text-muted truncate block">{file.path}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </>
      )}

      {/* KB section */}
      {(filteredKB.length > 0 || kbLoading) && (
        <>
          <div className="px-3 py-1.5 border-b border-border">
            <span className="text-[11px] font-medium uppercase tracking-wide text-text-muted">Knowledge Base</span>
            {kbLoading && <Loader2 className="inline w-3 h-3 ml-1.5 animate-spin text-text-muted" />}
          </div>
          <div className="p-1">
            {filteredKB.map((entry) => {
              const idx = globalIdx++
              return (
                <button
                  key={entry.id}
                  type="button"
                  role="option"
                  aria-selected={idx === selectedIdx}
                  className={cn(
                    'flex items-center gap-2.5 w-full px-2 py-1.5 text-left text-sm rounded-md transition-colors duration-100',
                    idx === selectedIdx ? 'bg-surface-hover text-text' : 'text-text hover:bg-surface-hover',
                  )}
                  onMouseDown={(e) => { e.preventDefault(); onSelect({ type: 'kb', entry }) }}
                  onMouseEnter={() => onSelectedIdxChange(idx)}
                >
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 bg-purple-500/10 text-purple-600">
                    <BookOpen className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium truncate block">{entry.title}</span>
                    {entry.summary && (
                      <span className="text-[11px] text-text-muted truncate block">{entry.summary}</span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
