'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { Menu } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSidebarSlotContent } from '@/components/layout/SidebarSlotContext'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { useUnreadCounts } from '@/hooks/useUnreadCounts'
import { useDomains } from '@/hooks/useDomains'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Hash, ChevronDown, ChevronRight, FolderOpen, Folder, FolderPlus, Plus,
  Bot, Puzzle, Unplug,
} from 'lucide-react'
import { useWorkspaceSection, type WorkspaceSection } from '@/components/layout/WorkspaceSectionContext'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { getWorkspaceOverview } from '@/lib/api/workspace'

export function MobileHeader() {
  return (
    <div className="fixed top-0 left-0 right-0 z-40 pointer-events-none">
      <div className="flex items-center justify-between px-3 pt-2">
        {/* Left: Logo → Office */}
        <Link
          href="/"
          className="pointer-events-auto w-9 h-9 shrink-0 rounded-2xl bg-surface/90 backdrop-blur-sm border border-surface-active/40 flex items-center justify-center shadow-sm hover:shadow-md transition-all active:scale-95"
          aria-label="Office"
        >
          <Image src="/logo/xerus.svg" alt="Xerus" width={24} height={24} />
        </Link>

        {/* Right: Drawer trigger */}
        <div className="pointer-events-auto">
          <MobileDrawer />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Slide-out drawer with context-aware sidebar content
// ---------------------------------------------------------------------------

function MobileDrawer() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const SlotComponent = useSidebarSlotContent()

  const isChat = pathname.startsWith('/chat')
  const isInbox = pathname.startsWith('/inbox')

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          className="w-9 h-9 rounded-2xl bg-surface/90 backdrop-blur-sm border border-surface-active/40 flex items-center justify-center shadow-sm hover:shadow-md text-text-secondary hover:text-text transition-all active:scale-95"
          aria-label="Open menu"
        >
          <Menu className="w-4.5 h-4.5" />
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[300px] bg-surface p-0 border-l border-surface-active">
        <div className="flex flex-col h-full">
          {/* Drawer header */}
          <div className="flex items-center justify-between px-4 h-12 border-b border-surface-active/60 shrink-0">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">
              {isChat ? 'Conversations' : isInbox ? 'Channels' : 'Workspace'}
            </span>
          </div>

          {/* Content — context-aware */}
          <ScrollArea className="flex-1">
            {isChat && SlotComponent ? (
              <SlotComponent />
            ) : isInbox ? (
              <MobileInboxNav onClose={() => setOpen(false)} />
            ) : (
              <MobileWorkspaceNav onClose={() => setOpen(false)} />
            )}
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Workspace navigation (projects, drive, marketplace)
// ---------------------------------------------------------------------------

function MobileWorkspaceNav({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const { setActiveSection } = useWorkspaceSection()
  const { data: overview } = useSWR('workspace/overview', getWorkspaceOverview, {
    revalidateOnFocus: false,
    dedupingInterval: 30000,
  })

  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set(
    overview?.projects?.map(p => p.slug) ?? []
  ))

  const toggleProject = (slug: string) => {
    setExpandedProjects(prev => {
      const next = new Set(prev)
      next.has(slug) ? next.delete(slug) : next.add(slug)
      return next
    })
  }

  const navigateToSection = (section: WorkspaceSection) => {
    setActiveSection(section)
    router.push('/workspace')
    onClose()
  }

  return (
    <nav className="px-3 py-3 space-y-4">
      {/* Projects */}
      {overview?.projects && overview.projects.length > 0 ? (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-text-muted mb-1.5 px-2">Projects</p>
          {overview.projects.map(project => {
            const isExpanded = expandedProjects.has(project.slug)
            return (
              <div key={project.slug}>
                <button
                  onClick={() => toggleProject(project.slug)}
                  className="flex items-center gap-2 w-full px-2 py-1.5 rounded-xl text-sm font-medium text-text hover:bg-surface-hover transition-colors"
                >
                  {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-text-secondary shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-text-secondary shrink-0" />}
                  {isExpanded ? <FolderOpen className="w-4 h-4 text-[#FF6600] shrink-0" /> : <Folder className="w-4 h-4 text-text-secondary shrink-0" />}
                  <span className="flex-1 text-left truncate">{project.name}</span>
                  <span className="text-[10px] text-text-muted">{project.channels.length}</span>
                </button>
                {isExpanded && (
                  <div className="pl-6 pr-1 py-0.5 space-y-0.5">
                    {project.channels.map(channel => (
                      <button
                        key={channel.name}
                        onClick={() => { router.push(`/inbox/${project.slug}/${channel.name}`); onClose() }}
                        className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-[13px] text-text-secondary hover:bg-surface-hover/60 hover:text-text transition-colors"
                      >
                        <Hash className="w-3.5 h-3.5 shrink-0" />
                        <span className="flex-1 text-left truncate">{channel.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : null}

      {/* Marketplace */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-text-muted mb-1.5 px-2">Marketplace</p>
        <div className="space-y-0.5">
          {([
            { id: 'agents' as WorkspaceSection, label: 'Agents', icon: Bot },
            { id: 'skills' as WorkspaceSection, label: 'Skills', icon: Puzzle },
            { id: 'connectors' as WorkspaceSection, label: 'Connectors', icon: Unplug },
          ]).map(item => (
            <button
              key={item.id}
              onClick={() => navigateToSection(item.id)}
              className="flex items-center w-full gap-2.5 px-2 py-2 rounded-xl text-sm text-text-secondary hover:bg-surface-hover/60 hover:text-text transition-colors"
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </nav>
  )
}

// ---------------------------------------------------------------------------
// Inbox navigation (domains + channels)
// ---------------------------------------------------------------------------

function MobileInboxNav({ onClose }: { onClose: () => void }) {
  const pathname = usePathname()
  const router = useRouter()
  const { domains, isLoading } = useDomains()
  const { counts, markRead } = useUnreadCounts()
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set(
    domains.map(d => d.id)
  ))

  const toggleDomain = (id: string) => {
    setExpandedDomains(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  if (isLoading) {
    return (
      <div className="px-4 py-6 space-y-3">
        {[0, 1, 2].map(i => <div key={i} className="h-8 rounded-xl bg-surface-hover/50 animate-pulse" />)}
      </div>
    )
  }

  if (domains.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-5 py-12 gap-3">
        <FolderPlus className="w-8 h-8 text-text-muted" />
        <p className="text-sm text-text-secondary text-center">No projects yet</p>
        <button
          onClick={() => { router.push('/chat?q=Create+a+new+project+for+me'); onClose() }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white bg-[#FF6600] hover:bg-[#E65C00] transition-colors"
        >
          <Plus className="w-4 h-4" /> Create project
        </button>
      </div>
    )
  }

  return (
    <nav className="px-3 py-3">
      {domains.map(domain => {
        const isExpanded = expandedDomains.has(domain.id)
        const domainUnread = domain.channels.reduce((sum, ch) => sum + (counts[ch.id] ?? 0), 0)
        return (
          <div key={domain.id} className="mb-1">
            <button
              onClick={() => toggleDomain(domain.id)}
              className="flex items-center gap-2 w-full px-2 py-1.5 rounded-xl text-sm font-medium text-text hover:bg-surface-hover transition-colors"
            >
              {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-text-secondary shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-text-secondary shrink-0" />}
              {isExpanded ? <FolderOpen className="w-4 h-4 text-[#FF6600] shrink-0" /> : <Folder className="w-4 h-4 text-text-secondary shrink-0" />}
              <span className="flex-1 text-left truncate">{domain.name}</span>
              {domainUnread > 0 ? (
                <span className="min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-[#FF6600] text-white text-[10px] font-semibold">{domainUnread > 99 ? '99+' : domainUnread}</span>
              ) : (
                <span className="text-[10px] text-text-muted">{domain.channels.length}</span>
              )}
            </button>
            {isExpanded && (
              <div className="pl-6 pr-1 py-0.5 space-y-0.5">
                {domain.channels.map(channel => {
                  const isActive = pathname === `/inbox/${domain.slug}/${channel.slug}`
                  const unread = counts[channel.id] ?? 0
                  return (
                    <button
                      key={channel.id}
                      onClick={() => {
                        if (unread > 0) markRead(channel.id)
                        router.push(`/inbox/${domain.slug}/${channel.slug}`)
                        onClose()
                      }}
                      className={cn(
                        'flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-[13px] transition-colors',
                        isActive ? 'bg-[#FF6600]/8 text-[#FF6600] font-medium' : unread > 0 ? 'text-text font-semibold hover:bg-surface-hover' : 'text-text-secondary hover:bg-surface-hover hover:text-text'
                      )}
                    >
                      <Hash className="w-3.5 h-3.5 shrink-0" />
                      <span className="flex-1 text-left truncate">{channel.name}</span>
                      {unread > 0 && !isActive ? (
                        <span className="min-w-[14px] h-3.5 px-1 flex items-center justify-center rounded-full bg-[#FF6600] text-white text-[9px] font-semibold">{unread}</span>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </nav>
  )
}
