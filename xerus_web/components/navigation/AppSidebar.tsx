'use client'

import { useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import useSWR from 'swr'
import {
  MessageSquare, Inbox, Home,
  Bot, Puzzle, Unplug, FileText, Files, Settings,
  PanelLeftClose, PanelLeftOpen,
  Plus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiCall } from '@/lib/api/client'
import { UserMenu } from '@/components/UserMenu'
import { useUnreadCounts } from '@/hooks/useUnreadCounts'
import { useWorkspaceSection, type WorkspaceSection } from '@/components/layout/WorkspaceSectionContext'
import { useSidebarSlotContent } from '@/components/layout/SidebarSlotContext'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { InboxSidebarBody } from './InboxSidebarBody'
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
  const [showNewProjectRow, setShowNewProjectRow] = useState(false)

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
        {/* + button for creating projects — visible when on inbox tab */}
        {activeTab === 'inbox' && (
          <button
            onClick={() => setShowNewProjectRow(true)}
            className="ml-auto p-1 rounded-lg hover:bg-primary/10 text-primary transition-colors"
            title="Create project"
          >
            <Plus className="w-5 h-5" />
          </button>
        )}
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
          SlotComponent ? <SlotComponent /> : <ChatSidebarLoading />
        ) : activeTab === 'inbox' ? (
          <InboxSidebarBody counts={counts} markRead={markRead} showNewRow={showNewProjectRow} onNewRowDone={() => setShowNewProjectRow(false)} />
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

  return (
    <nav className="px-4 py-2 space-y-5">
      {/* Workspace — drive content */}
      <div>
        <p className="text-xs font-semibold text-text-secondary/60 mb-1.5 px-3 tracking-wide">Workspace</p>
        <div className="space-y-0.5">
          {overview?.documents && overview.documents.length > 0 ? (
            overview.documents.map(doc => (
              <button
                key={doc.path}
                onClick={() => onPathClick(doc.path)}
                className="flex items-center gap-3 w-full px-3 py-2 rounded-xl text-[14px] text-text-secondary hover:bg-surface-hover/60 hover:text-text transition-colors"
              >
                <FileText className="w-4 h-4 shrink-0" />
                <span className="flex-1 text-left truncate">{doc.name.replace(/\.md$/, '')}</span>
              </button>
            ))
          ) : (
            <p className="px-3 py-2 text-[13px] text-text-muted">No files yet</p>
          )}
        </div>
      </div>

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

/* ---- Chat loading ---- */
function ChatSidebarLoading() {
  return (
    <div className="px-4 py-10 text-center">
      <p className="text-sm text-text-secondary">Loading sessions...</p>
    </div>
  )
}
