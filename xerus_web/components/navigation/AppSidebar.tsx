'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import useSWR from 'swr'
import {
  MessageSquare, Inbox, Home,
  Bot, Puzzle, Unplug, FileText, Files, Settings,
  PanelLeftClose, PanelLeftOpen,
  Plus, Hash, ChevronDown, ChevronRight, FolderOpen, Folder, FolderPlus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiCall } from '@/lib/api/client'
import { UserMenu } from '@/components/UserMenu'
import { useUnreadCounts } from '@/hooks/useUnreadCounts'
import { useWorkspaceSection, type WorkspaceSection } from '@/components/layout/WorkspaceSectionContext'
import { useSidebarSlotContent } from '@/components/layout/SidebarSlotContext'
import { useDomains } from '@/hooks/useDomains'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { getWorkspaceOverview, type WorkspaceOverview } from '@/lib/api/workspace'

const TABS = [
  { name: 'Home', href: '/workspace', icon: Home },
  { name: 'Chat', href: '/chat', icon: MessageSquare },
  { name: 'Inbox', href: '/inbox', icon: Inbox },
]

const DEBUG_MODE = process.env.NEXT_PUBLIC_DEBUG_MODE === 'true'

export function AppSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { totalUnread, counts, markRead } = useUnreadCounts()
  const { activeSection, setActiveSection, navigateToPath } = useWorkspaceSection()
  const SlotComponent = useSidebarSlotContent()
  const [collapsed, setCollapsed] = useState(false)

  const activeTab = pathname === '/' ? null // Office dashboard — logo is the indicator, no tab active
    : pathname.startsWith('/chat') ? 'chat'
    : pathname.startsWith('/inbox') ? 'inbox'
    : 'home' // /workspace, /ai-agents, /skills, /settings etc.

  const isOnWorkspace = pathname === '/workspace'

  const isOnWorkspaceRef = useRef(isOnWorkspace)
  isOnWorkspaceRef.current = isOnWorkspace

  const handleSectionClick = useCallback((section: WorkspaceSection) => {
    setActiveSection(section)
    if (!isOnWorkspaceRef.current) router.push('/workspace')
  }, [setActiveSection, router])

  const handlePathClick = useCallback((path: string) => {
    navigateToPath(path)
    if (!isOnWorkspaceRef.current) router.push('/workspace')
  }, [navigateToPath, router])

  // ---- Collapsed mode ----
  if (collapsed) {
    return (
      <TooltipProvider delayDuration={100}>
        <aside className="flex h-full w-[var(--sidebar-collapsed-width)] flex-col bg-surface border-r border-surface-active items-center py-3 gap-1" role="navigation">
          <Tooltip>
            <TooltipTrigger asChild>
              <Link href="/" className="flex items-center justify-center w-10 h-10 rounded-2xl hover:bg-surface-hover transition-colors mb-2" aria-label="Home">
                <Image src="/logo/xerus.svg" alt="Xerus" width={28} height={28} />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">Office</TooltipContent>
          </Tooltip>
          {TABS.map((tab) => {
            const active = activeTab === tab.name.toLowerCase()
            return (
              <Tooltip key={tab.name}>
                <TooltipTrigger asChild>
                  <Link href={tab.href} className={cn('relative flex items-center justify-center w-10 h-10 rounded-2xl transition-colors', active ? 'bg-primary/10 text-primary' : 'text-text-secondary hover:bg-surface-hover hover:text-text')} aria-label={tab.name} aria-current={active ? 'page' : undefined}>
                    <tab.icon className="w-5 h-5" />
                    {tab.name === 'Inbox' && totalUnread > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-primary text-white text-[9px] font-semibold">{totalUnread > 99 ? '99+' : totalUnread}</span>
                    )}
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">{tab.name}</TooltipContent>
              </Tooltip>
            )
          })}
          <div className="flex-1" />
          <Tooltip><TooltipTrigger asChild><button onClick={() => setCollapsed(false)} className="flex items-center justify-center w-10 h-10 rounded-2xl text-text-secondary hover:bg-surface-hover hover:text-text transition-colors" aria-label="Toggle sidebar"><PanelLeftOpen className="w-5 h-5" /></button></TooltipTrigger><TooltipContent side="right">Expand</TooltipContent></Tooltip>
        </aside>
      </TooltipProvider>
    )
  }

  // ---- Expanded mode ----
  return (
    <aside className="flex h-full w-[var(--sidebar-width)] flex-col bg-surface border-r border-surface-active" role="navigation" aria-label="Main navigation">
      {/* Header */}
      <div className="flex items-center justify-between px-5 h-[68px] shrink-0">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-9 h-9 shrink-0 rounded-xl overflow-hidden">
            <Image src="/logo/xerus.svg" alt="Xerus" width={36} height={36} className="w-full h-full object-contain" />
          </div>
          <div className="flex items-start gap-1">
            <span className="font-serif text-xl text-text tracking-tight">Xerus</span>
            <span className="text-[10px] font-semibold text-[#13af5b] bg-[#50d38d]/20 px-2 py-[3px] rounded-sm leading-none mt-[2px]">beta</span>
          </div>
        </Link>
        <button onClick={() => setCollapsed(true)} className="p-1.5 rounded-lg text-text-secondary hover:text-text hover:bg-surface-hover transition-colors" aria-label="Collapse sidebar">
          <PanelLeftClose className="w-[18px] h-[18px]" />
        </button>
      </div>

      {/* Tab bar */}
      <div className="px-4 pb-4 flex items-center gap-2">
        {TABS.map((tab) => {
          const active = activeTab === tab.name.toLowerCase()
          return (
            <Link
              key={tab.name}
              href={tab.href}
              className={cn(
                'relative flex items-center gap-2 rounded-2xl transition-all duration-150',
                active ? 'bg-primary/10 text-primary px-3.5 py-2' : 'text-text-secondary hover:bg-surface-hover/50 hover:text-text p-2'
              )}
              aria-current={active ? 'page' : undefined}
              aria-label={tab.name}
            >
              <tab.icon className="w-5 h-5" />
              {active && <span className="text-[14px] font-medium">{tab.name}</span>}
              {tab.name === 'Inbox' && totalUnread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-0.5 flex items-center justify-center rounded-full bg-primary text-white text-[10px] font-semibold">{totalUnread > 99 ? '99+' : totalUnread}</span>
              )}
            </Link>
          )
        })}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto scrollbar-thin min-h-0">
        {(activeTab === 'home' || activeTab === null) ? (
          <HomeSidebarBody
            activeSection={activeSection}
            isOnWorkspace={isOnWorkspace}
            onSectionClick={handleSectionClick}
            onPathClick={handlePathClick}
          />
        ) : activeTab === 'chat' ? (
          SlotComponent ? <SlotComponent /> : <ChatSidebarFallback />
        ) : activeTab === 'inbox' ? (
          <InboxSidebarBody counts={counts} markRead={markRead} />
        ) : null}
      </div>

      {/* Bottom */}
      <div className="border-t border-surface-active px-3 py-3 shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="flex-1 min-w-0">
            <UserMenu />
          </div>
          <Link
            href="/settings"
            className={cn(
              'flex items-center justify-center w-9 h-9 rounded-xl shrink-0 transition-colors',
              pathname.startsWith('/settings') ? 'bg-primary/10 text-primary' : 'text-text-secondary hover:bg-surface-hover hover:text-text'
            )}
            aria-label="Settings"
          >
            <Settings className="w-[18px] h-[18px]" />
          </Link>
        </div>
      </div>
    </aside>
  )
}

/* ---- Home body: Dynamic from workspace overview ---- */
function HomeSidebarBody({ activeSection, isOnWorkspace, onSectionClick, onPathClick }: {
  activeSection: WorkspaceSection
  isOnWorkspace: boolean
  onSectionClick: (section: WorkspaceSection) => void
  onPathClick: (path: string) => void
}) {
  const { data: overview } = useSWR('workspace/overview', getWorkspaceOverview, {
    revalidateOnFocus: false,
    dedupingInterval: 30000,
  })

  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())

  // Auto-expand all projects on first load
  useEffect(() => {
    if (overview?.projects && expandedProjects.size === 0) {
      setExpandedProjects(new Set(overview.projects.map(p => p.slug)))
    }
  }, [overview?.projects, expandedProjects.size])

  const toggleProject = (slug: string) => {
    setExpandedProjects(prev => {
      const next = new Set(prev)
      next.has(slug) ? next.delete(slug) : next.add(slug)
      return next
    })
  }

  return (
    <nav className="px-4 py-2 space-y-5">
      {/* Projects — dynamic from overview */}
      {overview?.projects && overview.projects.length > 0 ? overview.projects.map(project => {
        const isExpanded = expandedProjects.has(project.slug)
        return (
          <div key={project.slug}>
            <button
              onClick={() => toggleProject(project.slug)}
              className="flex items-center gap-2 w-full px-3 py-2 rounded-xl text-[15px] font-medium text-text hover:bg-surface-hover transition-colors group"
            >
              {isExpanded ? <ChevronDown className="w-4 h-4 text-text-secondary shrink-0" /> : <ChevronRight className="w-4 h-4 text-text-secondary shrink-0" />}
              {isExpanded ? <FolderOpen className="w-5 h-5 text-primary shrink-0" /> : <Folder className="w-5 h-5 text-text-secondary shrink-0" />}
              <span className="flex-1 text-left truncate">{project.name}</span>
              <span className="text-[11px] font-medium text-text-secondary bg-surface-hover rounded-full px-2 py-0.5">{project.channels.length}</span>
            </button>
            {isExpanded && (
              <div className="pl-7 pr-2 py-0.5 space-y-0.5">
                {project.channels.map(channel => (
                  <button
                    key={channel.name}
                    onClick={() => onPathClick(channel.path)}
                    className="flex items-center gap-2 w-full px-3 py-1.5 rounded-xl text-[14px] text-text-secondary hover:bg-surface-hover/60 hover:text-text transition-colors"
                  >
                    <Hash className="w-4 h-4 shrink-0" />
                    <span className="flex-1 text-left truncate">{channel.name}</span>
                    {channel.deliverables.length > 0 ? (
                      <span className="text-[10px] font-medium text-text-secondary">{channel.deliverables.length}</span>
                    ) : null}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      }) : null}

      {/* Workspace — documents from shared/knowledge */}
      {overview?.documents && overview.documents.length > 0 ? (
        <div>
          <p className="text-xs font-semibold text-text-secondary/60 mb-1.5 px-3 tracking-wide">Workspace</p>
          <div className="space-y-0.5">
            {overview.documents.map(doc => (
              <button
                key={doc.path}
                onClick={() => onPathClick(doc.path)}
                className="flex items-center gap-3 w-full px-3 py-2 rounded-xl text-[14px] text-text-secondary hover:bg-surface-hover/60 hover:text-text transition-colors"
              >
                <FileText className="w-4 h-4 shrink-0" />
                <span className="flex-1 text-left truncate">{doc.name.replace(/\.md$/, '')}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Marketplace */}
      <div>
        <p className="text-xs font-semibold text-text-secondary/60 mb-1.5 px-3 tracking-wide">Marketplace</p>
        <div className="space-y-0.5">
          {[
            { id: 'agents' as WorkspaceSection, label: 'Agents', icon: Bot, count: overview?.stats.agentCount },
            { id: 'skills' as WorkspaceSection, label: 'Skills', icon: Puzzle },
            { id: 'connectors' as WorkspaceSection, label: 'Connectors', icon: Unplug },
          ].map(item => {
            const active = isOnWorkspace && activeSection === item.id
            const Icon = item.icon
            return (
              <button
                key={item.id}
                onClick={() => onSectionClick(item.id)}
                className={cn(
                  'flex items-center w-full gap-3 px-3 py-2.5 rounded-xl text-[15px] transition-all duration-150',
                  active ? 'bg-primary/10 text-primary font-medium' : 'text-text-secondary hover:bg-surface-hover/60 hover:text-text'
                )}
              >
                <Icon className={cn('w-5 h-5', active ? 'text-primary' : 'text-text-secondary')} />
                {item.label}
                {item.count !== undefined && item.count > 0 && (
                  <span className="ml-auto text-[11px] font-medium text-text-secondary">{item.count}</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* All Files — debug mode only */}
      {DEBUG_MODE && (
        <div>
          <div className="border-t border-surface-active/30 my-2 mx-3" />
          <button
            onClick={() => onSectionClick('files')}
            className={cn(
              'flex items-center w-full gap-3 px-3 py-2.5 rounded-xl text-[15px] transition-all duration-150',
              isOnWorkspace && activeSection === 'files' ? 'bg-primary/10 text-primary font-medium' : 'text-text-secondary hover:bg-surface-hover/60 hover:text-text'
            )}
          >
            <Files className={cn('w-5 h-5', isOnWorkspace && activeSection === 'files' ? 'text-primary' : 'text-text-secondary')} />
            All Files
          </button>
        </div>
      )}
    </nav>
  )
}

/* ---- Chat fallback ---- */
function ChatSidebarFallback() {
  return (
    <div className="px-4 py-10 text-center">
      <p className="text-sm text-text-secondary">Loading sessions...</p>
    </div>
  )
}

/* ---- Inbox body ---- */
function InboxSidebarBody({ counts, markRead }: {
  counts: Record<string, number>
  markRead: (channelId: string) => void
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { domains, isLoading, refetch: refreshDomains } = useDomains()
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (domains.length > 0 && expandedDomains.size === 0) {
      setExpandedDomains(new Set(domains.map((d) => d.id)))
    }
  }, [domains, expandedDomains.size])

  const toggleDomain = (domainId: string) => {
    setExpandedDomains((prev) => {
      const next = new Set(prev)
      next.has(domainId) ? next.delete(domainId) : next.add(domainId)
      return next
    })
  }

  if (isLoading) {
    return (
      <div className="px-4 py-6 space-y-3">
        {[0, 1, 2].map((i) => <div key={i} className="h-9 rounded-xl animate-shimmer" />)}
      </div>
    )
  }

  if (domains.length === 0) {
    return (
      <div className="px-4 py-3 opacity-40 pointer-events-none select-none" aria-hidden="true">
        {/* Ghost preview — shows what populated sidebar looks like */}
        <div className="mb-1">
          <div className="flex items-center gap-2 w-full px-3 py-2 rounded-xl text-sm font-medium text-text">
            <ChevronDown className="w-4 h-4 text-text-secondary shrink-0" />
            <FolderOpen className="w-[18px] h-[18px] text-primary shrink-0" />
            <span className="flex-1 text-left truncate">Product</span>
            <span className="text-[11px] font-medium text-text-secondary bg-surface-hover rounded-full px-2 py-0.5">3</span>
          </div>
          <div className="pl-6 pr-2 py-0.5 space-y-0.5">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm text-text-secondary">
              <Hash className="w-4 h-4 shrink-0" />
              <span>Onboarding</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm text-text-secondary">
              <Hash className="w-4 h-4 shrink-0" />
              <span>Analytics</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm text-text-secondary">
              <Hash className="w-4 h-4 shrink-0" />
              <span>Design</span>
            </div>
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
    )
  }

  return (
    <ScrollArea className="flex-1">
      <div className="px-4 py-3">
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

// Inline project creation form for sidebar empty state
function CreateProjectInline({ onCreated }: { onCreated: () => Promise<void> }) {
  const [isOpen, setIsOpen] = useState(false)
  const [name, setName] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  const handleCreate = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    setIsCreating(true)
    try {
      await apiCall('/company/domains', {
        method: 'POST',
        body: JSON.stringify({ name: trimmed }),
      })
      setName('')
      setIsOpen(false)
      await onCreated()
    } catch {
      // apiCall already shows toast on error
    } finally {
      setIsCreating(false)
    }
  }

  if (!isOpen) {
    return (
      <button onClick={() => setIsOpen(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white bg-primary hover:bg-primary/90 transition-colors">
        <Plus className="w-4 h-4" /> Create project
      </button>
    )
  }

  return (
    <div className="w-full px-2">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setIsOpen(false) }}
        placeholder="Project name"
        className="w-full px-3 py-2 rounded-xl bg-surface border border-surface-active text-sm text-text placeholder:text-text-muted outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus:border-primary/40 focus:shadow-[0_2px_12px_rgba(255,102,0,0.08)]"
        disabled={isCreating}
      />
      <div className="flex gap-2 mt-2">
        <button onClick={handleCreate} disabled={isCreating || !name.trim()} className="flex-1 px-3 py-1.5 rounded-xl text-sm font-medium text-white bg-primary hover:bg-primary/90 disabled:opacity-50 transition-colors">
          {isCreating ? 'Creating...' : 'Create'}
        </button>
        <button onClick={() => { setIsOpen(false); setName('') }} className="px-3 py-1.5 rounded-xl text-sm text-text-muted hover:bg-surface-hover transition-colors">
          Cancel
        </button>
      </div>
    </div>
  )
}
