'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Plus, Hash, ChevronDown, ChevronRight, FolderOpen, Folder } from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiCall } from '@/lib/api/client'
import { useDomains } from '@/hooks/useDomains'
import { ScrollArea } from '@/components/ui/scroll-area'

interface InboxSidebarBodyProps {
  counts: Record<string, number>
  markRead: (channelId: string) => void
  showNewRow: boolean
  onNewRowDone: () => void
}

export function InboxSidebarBody({ counts, markRead, showNewRow, onNewRowDone }: InboxSidebarBodyProps) {
  const pathname = usePathname()
  const { domains, isLoading, refetch: refreshDomains } = useDomains()
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set())
  const [newName, setNewName] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const newRowRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (domains.length > 0 && expandedDomains.size === 0) {
      setExpandedDomains(new Set(domains.map((d) => d.id)))
    }
  }, [domains, expandedDomains.size])

  useEffect(() => {
    if (showNewRow) {
      setNewName('')
      setTimeout(() => newRowRef.current?.focus(), 50)
    }
  }, [showNewRow])

  const toggleDomain = (domainId: string) => {
    setExpandedDomains((prev) => {
      const next = new Set(prev)
      next.has(domainId) ? next.delete(domainId) : next.add(domainId)
      return next
    })
  }

  const handleCreateProject = async () => {
    const trimmed = newName.trim()
    if (!trimmed) return
    setIsCreating(true)
    try {
      await apiCall('/company/domains', {
        method: 'POST',
        body: JSON.stringify({ name: trimmed }),
      })
      setNewName('')
      onNewRowDone()
      await refreshDomains()
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error(error)
    } finally {
      setIsCreating(false)
    }
  }

  const newProjectRow = showNewRow ? (
    <div className="mb-1 animate-[fadeInUp_0.15s_ease-out]">
      <div className="flex items-center gap-2 w-full px-3 py-2 rounded-xl">
        <ChevronRight className="w-4 h-4 text-text-secondary shrink-0" />
        <FolderOpen className="w-[18px] h-[18px] text-primary shrink-0" />
        <input
          ref={newRowRef}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCreateProject()
            if (e.key === 'Escape') { onNewRowDone(); setNewName('') }
          }}
          onBlur={() => { if (!newName.trim()) { onNewRowDone(); setNewName('') } }}
          placeholder="Project name..."
          disabled={isCreating}
          className="flex-1 bg-transparent border-none outline-none text-sm font-medium text-text placeholder:text-text-muted caret-primary"
        />
        <span className="text-[10px] text-text-muted bg-surface rounded px-1.5 py-0.5 shrink-0">↵</span>
      </div>
    </div>
  ) : null

  if (isLoading) {
    return (
      <div className="px-4 py-6 space-y-3">
        {[0, 1, 2].map((i) => <div key={i} className="h-9 rounded-xl animate-shimmer" />)}
      </div>
    )
  }

  if (domains.length === 0) {
    return (
      <div className="px-4 py-2">
        {newProjectRow}
        <div className="opacity-30 pointer-events-none select-none" aria-hidden="true">
          <div className="mb-1">
            <div className="flex items-center gap-2 w-full px-3 py-2 rounded-xl text-sm font-medium text-text">
              <ChevronDown className="w-4 h-4 text-text-secondary shrink-0" />
              <FolderOpen className="w-[18px] h-[18px] text-primary shrink-0" />
              <span className="flex-1 text-left truncate">Product</span>
              <span className="text-[11px] font-medium text-text-secondary bg-surface-hover rounded-full px-2 py-0.5">3</span>
            </div>
            <div className="pl-6 pr-2 py-0.5 space-y-0.5">
              {['Onboarding', 'Analytics', 'Design'].map((name) => (
                <div key={name} className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm text-text-secondary">
                  <Hash className="w-4 h-4 shrink-0" />
                  <span>{name}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="mb-1">
            <div className="flex items-center gap-2 w-full px-3 py-2 rounded-xl text-sm font-medium text-text">
              <ChevronRight className="w-4 h-4 text-text-secondary shrink-0" />
              <Folder className="w-[18px] h-[18px] text-text-secondary shrink-0" />
              <span className="flex-1 text-left truncate">Engineering</span>
              <span className="text-[11px] font-medium text-text-secondary bg-surface-hover rounded-full px-2 py-0.5">2</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <ScrollArea className="flex-1">
      <div className="px-4 py-3">
        {newProjectRow}
        {domains.map((domain) => {
          const isExpanded = expandedDomains.has(domain.id)
          const domainUnread = domain.channels.reduce((sum, ch) => sum + (counts[ch.id] ?? 0), 0)
          return (
            <div key={domain.id} className="mb-1">
              <button onClick={() => toggleDomain(domain.id)} className="flex items-center gap-2 w-full px-3 py-2 rounded-xl text-sm font-medium text-text hover:bg-surface-hover transition-colors group">
                {isExpanded ? <ChevronDown className="w-4 h-4 text-text-secondary shrink-0" /> : <ChevronRight className="w-4 h-4 text-text-secondary shrink-0" />}
                {isExpanded ? <FolderOpen className="w-[18px] h-[18px] text-primary shrink-0" /> : <Folder className="w-[18px] h-[18px] text-text-secondary shrink-0" />}
                <span className="flex-1 text-left truncate">{domain.name}</span>
                {domainUnread > 0 ? (
                  <span className="min-w-[18px] h-5 px-1.5 flex items-center justify-center rounded-full bg-primary text-white text-[10px] font-semibold">{domainUnread > 99 ? '99+' : domainUnread}</span>
                ) : (
                  <span className="text-[11px] font-medium text-text-secondary bg-surface-hover rounded-full px-2 py-0.5">{domain.channels.length}</span>
                )}
              </button>
              <div className={cn('overflow-hidden transition-all duration-200', isExpanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0')}>
                <div className="pl-6 pr-2 py-0.5 space-y-0.5">
                  {domain.channels.map((channel) => {
                    const isActive = pathname === `/inbox/${domain.slug}/${channel.slug}`
                    const unread = counts[channel.id] ?? 0
                    return (
                      <Link key={channel.id} href={`/inbox/${domain.slug}/${channel.slug}`} onClick={() => unread > 0 && markRead(channel.id)} className={cn('flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm transition-colors', isActive ? 'bg-primary/10 text-primary font-medium' : unread > 0 ? 'text-text font-semibold hover:bg-surface-hover' : 'text-text-secondary hover:bg-surface-hover hover:text-text')}>
                        <Hash className="w-4 h-4 shrink-0" />
                        <span className="flex-1 truncate">{channel.name}</span>
                        {unread > 0 && !isActive && (
                          <span className="min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-primary text-white text-[10px] font-semibold">{unread > 99 ? '99+' : unread}</span>
                        )}
                      </Link>
                    )
                  })}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </ScrollArea>
  )
}
