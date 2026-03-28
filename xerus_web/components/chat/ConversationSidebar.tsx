'use client'

import { useState, useEffect, useMemo, useCallback, memo } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Plus,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  ChevronRight,
  Search,
  Hash,
  X,
  Loader2,
  Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ProjectGroup, SessionEntry, SessionStatus, SelectedChannel } from './types'
import { useDomains, type Domain } from '@/hooks/useDomains'

interface ConversationSidebarProps {
  projects: ProjectGroup[]
  currentConversationId?: string | null
  onSelectConversation: (id: string) => void
  onNewConversation: () => void
  onDeleteConversation?: (id: string) => void
  isCollapsed?: boolean
  isLoading?: boolean
  onToggleCollapse?: () => void
  className?: string
  selectedChannel?: SelectedChannel | null
  onSelectChannel?: (channel: SelectedChannel) => void
  onClearChannel?: () => void
}

// ---------------------------------------------------------------------------
// Channel picker panel
// ---------------------------------------------------------------------------

function ChannelPickerPanel({
  selectedChannelId,
  onSelectChannel,
  onClearChannel,
  domains,
  isLoading,
}: {
  selectedChannelId: string | null
  onSelectChannel: (channel: SelectedChannel) => void
  onClearChannel: () => void
  domains: Domain[]
  isLoading: boolean
}) {
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!selectedChannelId || domains.length === 0) return
    for (const domain of domains) {
      if (domain.channels.some((ch) => ch.id === selectedChannelId)) {
        setExpandedDomains((prev) => new Set([...prev, domain.id]))
        break
      }
    }
  }, [selectedChannelId, domains])

  const toggleDomain = (domainId: string) => {
    setExpandedDomains((prev) => {
      const next = new Set(prev)
      if (next.has(domainId)) next.delete(domainId)
      else next.add(domainId)
      return next
    })
  }

  if (isLoading) {
    return (
      <div className="px-2 py-2 space-y-1">
        {[0, 1].map((i) => (
          <div key={i} className="h-7 bg-surface-hover rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }

  if (domains.length === 0) {
    return <div className="px-3 py-3 text-xs text-text-muted text-center">No channels yet</div>
  }

  return (
    <ScrollArea className="max-h-48">
      <div className="py-1 px-2 space-y-0.5">
        {domains.map((domain: Domain) => {
          const isExpanded = expandedDomains.has(domain.id)
          return (
            <div key={domain.id}>
              <button
                type="button"
                onClick={() => toggleDomain(domain.id)}
                className="flex items-center gap-1.5 w-full px-2 py-1 rounded-lg text-xs font-semibold text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
              >
                {isExpanded ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
                <span className="truncate uppercase tracking-wider">{domain.name}</span>
              </button>
              {isExpanded && (
                <div className="pl-4 space-y-0.5 mt-0.5">
                  {domain.channels.map((channel) => {
                    const isActive = channel.id === selectedChannelId
                    return (
                      <button
                        key={channel.id}
                        type="button"
                        onClick={() => {
                          if (isActive) onClearChannel()
                          else onSelectChannel({ id: channel.id, slug: channel.slug, name: channel.name, domainName: domain.name })
                        }}
                        className={cn(
                          'flex items-center gap-1.5 w-full px-2 py-1 rounded-lg text-xs transition-colors',
                          isActive
                            ? 'bg-primary/10 text-primary font-medium'
                            : 'text-text-secondary hover:bg-surface-hover hover:text-text',
                        )}
                      >
                        <Hash className="w-3 h-3 shrink-0" />
                        <span className="flex-1 text-left truncate">{channel.name}</span>
                        {isActive && <X className="w-3 h-3 shrink-0 opacity-60" />}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </ScrollArea>
  )
}

// ---------------------------------------------------------------------------
// Time formatting
// ---------------------------------------------------------------------------

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} minutes ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<SessionStatus, { dotColor: string; textColor: string; label: string }> = {
  working: { dotColor: 'text-primary', textColor: 'text-primary', label: 'Working' },
  pending_approval: { dotColor: 'text-amber-500', textColor: 'text-amber-500', label: 'Pending your approval' },
  finished: { dotColor: 'text-emerald-500', textColor: 'text-emerald-500', label: 'Finished' },
  error: { dotColor: 'text-red-500', textColor: 'text-red-500', label: 'Error during generation' },
  idle: { dotColor: 'text-text-muted', textColor: 'text-text-muted', label: '' },
}

// ---------------------------------------------------------------------------
// Status indicator
// ---------------------------------------------------------------------------

function StatusIndicator({ status }: { status: SessionStatus }) {
  const config = STATUS_CONFIG[status]

  if (status === 'working') {
    return <Loader2 className={cn('w-3.5 h-3.5 animate-spin shrink-0', config.dotColor)} />
  }

  // Idle sessions show a clock icon instead of a dot
  if (status === 'idle') {
    return <Clock className="w-3.5 h-3.5 shrink-0 text-text-muted" />
  }

  return (
    <span
      className={cn('inline-block w-2.5 h-2.5 rounded-full shrink-0', config.dotColor)}
      style={{ backgroundColor: 'currentColor' }}
    />
  )
}

// ---------------------------------------------------------------------------
// Three-dot menu button (always visible)
// ---------------------------------------------------------------------------

function ThreeDotMenu({ onClick }: { onClick: (e: React.MouseEvent) => void }) {
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick(e as unknown as React.MouseEvent) }}
      className="flex items-center justify-center w-5 h-5 rounded-md hover:bg-surface-active text-text-muted hover:text-text transition-colors cursor-pointer shrink-0"
    >
      <MoreHorizontal className="w-3.5 h-3.5" />
    </span>
  )
}

// ---------------------------------------------------------------------------
// Session row
// ---------------------------------------------------------------------------

const SessionRow = memo(function SessionRow({
  session,
  isActive,
  onSelectConversation,
  onDeleteConversation,
}: {
  session: SessionEntry
  isActive: boolean
  onSelectConversation: (id: string) => void
  onDeleteConversation?: (id: string) => void
}) {
  const statusConfig = STATUS_CONFIG[session.status]

  const handleSelect = useCallback(() => {
    onSelectConversation(session.id)
  }, [onSelectConversation, session.id])

  const handleDelete = useCallback(() => {
    onDeleteConversation?.(session.id)
  }, [onDeleteConversation, session.id])

  return (
    <button
      type="button"
      onClick={handleSelect}
      data-testid="session-row"
      className={cn(
        'group relative flex items-center gap-2 w-full text-left px-3 py-2 rounded-lg transition-all duration-150',
        isActive
          ? 'bg-primary/10'
          : 'hover:bg-surface-hover'
      )}
    >
      {/* Status dot / spinner / clock */}
      <div className="shrink-0 flex items-center justify-center w-4">
        <StatusIndicator status={session.status} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className={cn(
          'text-sm font-medium truncate leading-tight',
          isActive ? 'text-primary' : 'text-text',
        )}>
          {session.title}
        </div>
        <div className={cn(
          'text-[11px] mt-0.5 truncate',
          session.status === 'idle' ? 'text-text-muted' : statusConfig.textColor,
        )}>
          {session.status === 'idle'
            ? formatRelativeTime(session.updatedAt)
            : (session.statusText ?? statusConfig.label)
          }
        </div>
      </div>

      {/* Three-dot menu — always visible */}
      {onDeleteConversation && (
        <ThreeDotMenu onClick={(e) => { e.stopPropagation(); handleDelete() }} />
      )}
    </button>
  )
})

// ---------------------------------------------------------------------------
// Project group
// ---------------------------------------------------------------------------

const ProjectGroupSection = memo(function ProjectGroupSection({
  project,
  currentConversationId,
  onSelectConversation,
  onDeleteConversation,
  defaultExpanded,
}: {
  project: ProjectGroup
  currentConversationId?: string | null
  onSelectConversation: (id: string) => void
  onDeleteConversation?: (id: string) => void
  defaultExpanded: boolean
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <div className="mb-1">
      {/* Project header */}
      <div className="flex items-center gap-1 w-full px-3 py-2 rounded-lg hover:bg-surface-hover transition-colors">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
        >
          <div className="shrink-0 text-text-muted">
            {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-text truncate">{project.name}</div>
            <div className="text-[11px] text-text-muted truncate">
              {project.path} &middot; {project.sessions.length} session{project.sessions.length !== 1 ? 's' : ''}
            </div>
          </div>
        </button>
        {/* Three-dot menu on project row — always visible */}
        <ThreeDotMenu onClick={(e) => { e.stopPropagation() }} />
      </div>

      {/* Sessions */}
      {expanded && (
        <div className="ml-2 space-y-0.5 mt-0.5">
          {project.sessions.map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              isActive={currentConversationId === session.id}
              onSelectConversation={onSelectConversation}
              onDeleteConversation={onDeleteConversation}
            />
          ))}
        </div>
      )}
    </div>
  )
})

// ---------------------------------------------------------------------------
// Main sidebar
// ---------------------------------------------------------------------------

export function ConversationSidebar({
  projects,
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  isCollapsed = false,
  isLoading = false,
  onToggleCollapse,
  className,
  selectedChannel,
  onSelectChannel,
  onClearChannel,
}: ConversationSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [isChannelPickerOpen, setIsChannelPickerOpen] = useState(false)
  const { domains: channelDomains, isLoading: isLoadingChannels } = useDomains()

  // Filter projects/sessions by search
  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return projects
    const q = searchQuery.toLowerCase()
    return projects
      .map((project) => ({
        ...project,
        sessions: project.sessions.filter(
          (s) =>
            s.title.toLowerCase().includes(q) ||
            (s.statusText?.toLowerCase().includes(q) ?? false)
        ),
      }))
      .filter((p) => p.sessions.length > 0 || p.name.toLowerCase().includes(q))
  }, [projects, searchQuery])

  // Determine which project contains the active session (expand by default)
  const activeProjectId = useMemo(() => {
    if (!currentConversationId) return null
    for (const p of projects) {
      if (p.sessions.some((s) => s.id === currentConversationId)) return p.id
    }
    return null
  }, [projects, currentConversationId])

  // Collapsed state -- narrow strip
  if (isCollapsed) {
    return (
      <div
        className={cn(
          'flex flex-col items-center w-12 bg-surface-alt border-r border-surface-active shrink-0 py-3 gap-2',
          'h-full',
          'transition-all duration-200',
          className
        )}
      >
        <button
          type="button"
          onClick={onToggleCollapse}
          className="p-2 rounded-xl text-text-muted hover:text-primary hover:bg-primary/8 transition-colors"
          aria-label="Expand sidebar"
        >
          <PanelLeftOpen className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onNewConversation}
          className="p-2 rounded-xl text-text-muted hover:text-primary hover:bg-primary/8 transition-colors"
          aria-label="New session"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex flex-col shrink-0',
        'h-full',
        'transition-all duration-200',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between h-14 px-4 shrink-0">
        <h2 className="text-lg font-semibold text-text select-none">
          Sessions
        </h2>
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="p-1.5 rounded-lg text-text-muted hover:text-primary hover:bg-primary/8 transition-colors"
            aria-label="Collapse sidebar"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Search bar */}
      <div className="px-3 pb-2 shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
          <input
            type="text"
            placeholder="Search sessions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="session-search"
            className={cn(
              'w-full pl-8 pr-3 py-1.5 rounded-lg text-sm',
              'bg-surface border border-surface-active',
              'text-text placeholder:text-text-muted',
              'focus:outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20',
              'transition-colors'
            )}
          />
        </div>
      </div>

      {/* Project groups */}
      <ScrollArea data-testid="session-list" className="flex-1 px-2 pt-1">
        {filteredProjects.length === 0 ? (
          <div className="px-3 py-8 text-center">
            {isLoading ? (
              <div className="space-y-3 px-2 animate-pulse">
                <div className="h-3 bg-surface-active/40 rounded-full w-24" />
                <div className="h-8 bg-surface-active/30 rounded-lg" />
                <div className="h-8 bg-surface-active/20 rounded-lg" />
              </div>
            ) : searchQuery ? (
              <p className="text-sm text-text-muted">No matching sessions</p>
            ) : (
              <>
                <p className="text-sm text-text-muted">No conversations yet</p>
                <p className="text-xs text-text-muted mt-1">Send a message to get started</p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-0.5">
            {filteredProjects.map((project) => (
              <ProjectGroupSection
                key={project.id}
                project={project}
                currentConversationId={currentConversationId}
                onSelectConversation={onSelectConversation}
                onDeleteConversation={onDeleteConversation}
                defaultExpanded={project.id === activeProjectId || filteredProjects.length === 1}
              />
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Channel picker panel */}
      {isChannelPickerOpen && onSelectChannel && onClearChannel && (
        <div className="border-t border-surface-active">
          <div className="flex items-center justify-between px-3 py-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">
              Channels
            </span>
            {selectedChannel && (
              <button type="button" onClick={() => { onClearChannel!(); setIsChannelPickerOpen(false) }} className="text-[10px] text-primary hover:underline">
                Clear
              </button>
            )}
          </div>
          <ChannelPickerPanel
            selectedChannelId={selectedChannel?.id ?? null}
            onSelectChannel={(ch) => { onSelectChannel(ch); setIsChannelPickerOpen(false) }}
            onClearChannel={() => { onClearChannel(); setIsChannelPickerOpen(false) }}
            domains={channelDomains}
            isLoading={isLoadingChannels}
          />
        </div>
      )}

      {/* Bottom bar */}
      <div className="flex items-center border-t border-surface-active px-2 py-2 gap-1 shrink-0">
        <button
          type="button"
          onClick={() => setIsChannelPickerOpen((prev) => !prev)}
          data-testid="channel-button"
          className={cn(
            'flex items-center justify-center gap-1.5 flex-1 px-3 py-2 rounded-xl text-sm',
            selectedChannel
              ? 'text-primary bg-primary/8 font-medium'
              : 'text-text-secondary hover:text-primary hover:bg-primary/8',
            'transition-colors active:scale-[0.98]',
          )}
          title={selectedChannel ? `${selectedChannel.domainName} / ${selectedChannel.name}` : 'Select channel'}
        >
          <Hash className="w-4 h-4 shrink-0" />
          <span className="truncate">{selectedChannel ? `#${selectedChannel.name}` : 'Channel'}</span>
        </button>
        <button
          type="button"
          onClick={onNewConversation}
          data-testid="new-session-button"
          className={cn(
            'flex items-center justify-center gap-1.5 flex-1 px-3 py-2 rounded-xl text-sm',
            'text-text-secondary hover:text-primary hover:bg-primary/8',
            'transition-colors active:scale-[0.98]',
          )}
        >
          <Plus className="w-3.5 h-3.5" />
          New Session
        </button>
      </div>
    </div>
  )
}
