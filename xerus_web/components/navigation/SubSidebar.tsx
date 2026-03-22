'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Plus,
  ChevronDown,
  ChevronRight,
  Hash,
  FolderOpen,
  Folder,
  FolderPlus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useDomains, type Domain } from '@/hooks/useDomains'
import { useUnreadCounts } from '@/hooks/useUnreadCounts'

export function SubSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { domains, isLoading, error } = useDomains()
  const { counts, markRead } = useUnreadCounts()
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set())

  // Expand all domains on initial load
  useEffect(() => {
    if (domains.length > 0 && expandedDomains.size === 0) {
      setExpandedDomains(new Set(domains.map((d) => d.id)))
    }
  }, [domains, expandedDomains.size])

  const toggleDomain = (domainId: string) => {
    setExpandedDomains((prev) => {
      const next = new Set(prev)
      if (next.has(domainId)) {
        next.delete(domainId)
      } else {
        next.add(domainId)
      }
      return next
    })
  }

  const getDomainUnreadCount = (domain: Domain): number => {
    return domain.channels.reduce((sum, ch) => sum + (counts[ch.id] ?? 0), 0)
  }

  const handleAddProject = () => {
    router.push('/chat?prompt=Create+a+new+project')
  }

  const isChannelActive = (domainSlug: string, channelSlug: string): boolean => {
    return pathname === `/inbox/${domainSlug}/${channelSlug}`
  }

  const handleChannelClick = (channelId: string) => {
    if (counts[channelId] && counts[channelId] > 0) {
      markRead(channelId)
    }
  }

  // Loading skeleton
  if (isLoading) {
    return (
      <aside
        className="flex h-full w-[var(--sub-sidebar-width)] flex-col bg-surface-alt border-r border-surface-active"
        role="navigation"
        aria-label="Project navigation"
      >
        <div className="flex items-center justify-between h-16 px-4 shrink-0 border-b border-surface-active">
          <div className="w-16 h-3 bg-surface-hover rounded animate-pulse" />
          <div className="w-6 h-6 bg-surface-hover rounded-lg animate-pulse" />
        </div>
        <div className="py-2 px-2 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={`skeleton-domain-${i}`} className="space-y-1.5">
              <div className="flex items-center gap-2 px-2 py-1.5">
                <div className="w-3.5 h-3.5 bg-surface-hover rounded animate-pulse shrink-0" />
                <div className="w-4 h-4 bg-surface-hover rounded animate-pulse shrink-0" />
                <div className="flex-1 h-4 bg-surface-hover rounded animate-pulse" />
                <div className="w-6 h-4 bg-surface-hover rounded-full animate-pulse" />
              </div>
              <div className="pl-5 pr-1 space-y-1">
                {Array.from({ length: 2 }).map((_, j) => (
                  <div key={`skeleton-channel-${i}-${j}`} className="flex items-center gap-2 px-2 py-1.5">
                    <div className="w-3.5 h-3.5 bg-surface-hover rounded animate-pulse shrink-0" />
                    <div className="flex-1 h-3.5 bg-surface-hover rounded animate-pulse" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </aside>
    )
  }

  // Error state
  if (error) {
    return (
      <aside
        className="flex h-full w-[var(--sub-sidebar-width)] flex-col bg-surface-alt border-r border-surface-active"
        role="navigation"
        aria-label="Project navigation"
      >
        <div className="flex items-center justify-between h-16 px-4 shrink-0 border-b border-surface-active">
          <h2 className="text-[10px] font-semibold uppercase tracking-widest text-text-muted select-none">
            Inbox
          </h2>
        </div>
        <div className="flex-1 flex items-center justify-center px-4">
          <p className="text-sm text-text-muted text-center">
            Failed to load projects
          </p>
        </div>
      </aside>
    )
  }

  // Empty state
  if (domains.length === 0) {
    return (
      <aside
        className="flex h-full w-[var(--sub-sidebar-width)] flex-col bg-surface-alt border-r border-surface-active"
        role="navigation"
        aria-label="Project navigation"
      >
        <div className="flex items-center justify-between h-16 px-4 shrink-0 border-b border-surface-active">
          <h2 className="text-[10px] font-semibold uppercase tracking-widest text-text-muted select-none">
            Inbox
          </h2>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-4 gap-3">
          <FolderPlus className="w-8 h-8 text-text-muted" aria-hidden="true" />
          <p className="text-sm text-text-muted text-center">No projects yet</p>
          <button
            onClick={handleAddProject}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium text-white bg-[#FF6600] hover:bg-[#E65C00] transition-colors duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6600] focus-visible:ring-offset-2"
            aria-label="Create your first project"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            Create project
          </button>
        </div>
      </aside>
    )
  }

  return (
    <aside
      className="flex h-full w-[var(--sub-sidebar-width)] flex-col bg-surface-alt border-r border-surface-active"
      role="navigation"
      aria-label="Project navigation"
    >
      {/* Header */}
      <div className="flex items-center justify-between h-16 px-4 shrink-0 border-b border-surface-active">
        <h2 className="text-[10px] font-semibold uppercase tracking-widest text-text-muted select-none">
          Inbox
        </h2>
        <button
          onClick={handleAddProject}
          className="flex items-center justify-center w-6 h-6 rounded-lg text-text-secondary hover:text-[#FF6600] hover:bg-[#FF6600]/10 transition-colors duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6600] focus-visible:ring-offset-2"
          aria-label="Add new project"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {/* Domain/Channel Tree */}
      <ScrollArea className="flex-1">
        <div className="py-2 px-2">
          {domains.map((domain) => {
            const isExpanded = expandedDomains.has(domain.id)
            const domainUnread = getDomainUnreadCount(domain)
            return (
              <div key={domain.id} className="mb-1">
                {/* Domain Header */}
                <button
                  onClick={() => toggleDomain(domain.id)}
                  className="flex items-center gap-2 w-full px-2 py-1.5 rounded-xl text-sm font-medium text-text hover:bg-surface-hover transition-colors duration-200 active:scale-[0.98] group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6600] focus-visible:ring-offset-2"
                  aria-expanded={isExpanded}
                  aria-controls={`domain-${domain.id}-channels`}
                >
                  {isExpanded ? (
                    <ChevronDown className="w-3.5 h-3.5 text-text-muted shrink-0" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-text-muted shrink-0" aria-hidden="true" />
                  )}
                  {isExpanded ? (
                    <FolderOpen className="w-4 h-4 text-[#FF6600] shrink-0" aria-hidden="true" />
                  ) : (
                    <Folder className="w-4 h-4 text-text-secondary shrink-0" aria-hidden="true" />
                  )}
                  <span className="flex-1 text-left truncate">{domain.name}</span>
                  {domainUnread > 0 ? (
                    <span className="min-w-[18px] h-4 px-1 flex items-center justify-center rounded-full bg-[#FF6600] text-white text-[10px] font-semibold">
                      {domainUnread > 99 ? '99+' : domainUnread}
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold text-text-muted bg-surface-hover rounded-full px-1.5 py-0.5 group-hover:bg-surface-active">
                      {domain.channels.length}
                    </span>
                  )}
                </button>

                {/* Channel List */}
                <div
                  id={`domain-${domain.id}-channels`}
                  className={cn(
                    'overflow-hidden transition-all duration-200',
                    isExpanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
                  )}
                  role="group"
                  aria-label={`${domain.name} channels`}
                >
                  <div className="pl-5 pr-1 py-0.5 space-y-0.5">
                    {domain.channels.map((channel) => {
                      const isActive = isChannelActive(domain.slug, channel.slug)
                      const channelUnread = counts[channel.id] ?? 0
                      const hasUnread = channelUnread > 0
                      return (
                        <Link
                          key={channel.id}
                          href={`/inbox/${domain.slug}/${channel.slug}`}
                          onClick={() => handleChannelClick(channel.id)}
                          className={cn(
                            'flex items-center gap-2 px-2 py-1.5 rounded-xl text-sm transition-colors duration-200',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6600] focus-visible:ring-offset-2',
                            isActive
                              ? 'bg-[#FF6600]/10 text-[#FF6600] font-medium'
                              : hasUnread
                                ? 'text-text font-semibold hover:bg-surface-hover'
                                : 'text-text-secondary hover:bg-surface-hover hover:text-text'
                          )}
                          aria-current={isActive ? 'page' : undefined}
                        >
                          <Hash className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          <span className="flex-1 truncate">{channel.name}</span>
                          {hasUnread && !isActive && (
                            <span
                              className="min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-[#FF6600] text-white text-[10px] font-semibold"
                              aria-label={`${channelUnread} unread messages`}
                            >
                              {channelUnread > 99 ? '99+' : channelUnread}
                            </span>
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
    </aside>
  )
}
