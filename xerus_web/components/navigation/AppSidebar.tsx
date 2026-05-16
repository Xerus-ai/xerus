'use client'

import { useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import useSWR from 'swr'
import {
  MessageSquare, Inbox, Home,
  Bot, Puzzle, Unplug, FileText, Files, Folder, Settings, Upload,
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
import { ThemeToggle } from '@/components/ThemeToggle'
import { InboxSidebarBody } from './InboxSidebarBody'
import { getWorkspaceOverview, type WorkspaceOverview } from '@/lib/api/workspace'
import { getAssistants } from '@/lib/api/agents'

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

  const handleUploadClick = useCallback(() => {
    setActiveSection('knowledge')
    if (!isOnWorkspaceRef.current) router.push('/workspace')
    window.dispatchEvent(new CustomEvent('xerus:upload'))
  }, [setActiveSection, router])

  // ---- Collapsed mode ----
  if (collapsed) {
    return (
      <TooltipProvider delayDuration={100}>
        <aside className="flex h-full w-[var(--sidebar-collapsed-width)] flex-col bg-surface border-r border-border items-center py-3 gap-1" role="navigation">
          <Tooltip>
            <TooltipTrigger asChild>
              <Link href="/" className="flex items-center justify-center w-9 h-9 rounded-xl hover:bg-surface-hover transition-colors mb-2" aria-label="Home">
                <Image src="/logo/xerus.svg" alt="Xerus" width={24} height={24} />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">Office</TooltipContent>
          </Tooltip>
          {TABS.map((tab) => {
            const active = activeTab === tab.name.toLowerCase()
            return (
              <Tooltip key={tab.name}>
                <TooltipTrigger asChild>
                  <Link href={tab.href} className={cn('relative flex items-center justify-center w-9 h-9 rounded-xl transition-colors', active ? 'bg-secondary/10 text-secondary' : 'text-text-muted hover:bg-surface-hover hover:text-text')} aria-label={tab.name} aria-current={active ? 'page' : undefined}>
                    <tab.icon className="w-[18px] h-[18px]" />
                    {tab.name === 'Inbox' && totalUnread > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-0.5 flex items-center justify-center rounded-full bg-secondary text-white text-[9px] font-semibold tabular-nums">{totalUnread > 99 ? '99+' : totalUnread}</span>
                    )}
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">{tab.name}</TooltipContent>
              </Tooltip>
            )
          })}
          <div className="flex-1" />
          <ThemeToggle collapsed />
          <Tooltip><TooltipTrigger asChild><button onClick={() => setCollapsed(false)} className="flex items-center justify-center w-9 h-9 rounded-xl text-text-muted hover:bg-surface-hover hover:text-text transition-colors" aria-label="Toggle sidebar"><PanelLeftOpen className="w-[18px] h-[18px]" /></button></TooltipTrigger><TooltipContent side="right">Expand</TooltipContent></Tooltip>
        </aside>
      </TooltipProvider>
    )
  }

  // ---- Expanded mode ----
  return (
    <aside className="flex h-full w-[var(--sidebar-width)] flex-col bg-surface border-r border-border" role="navigation" aria-label="Main navigation">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 shrink-0">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-7 h-7 shrink-0 rounded-lg overflow-hidden">
            <Image src="/logo/xerus.svg" alt="Xerus" width={28} height={28} className="w-full h-full object-contain" />
          </div>
          <span className="font-serif text-lg text-text tracking-tight">Xerus</span>
        </Link>
        <button onClick={() => setCollapsed(true)} className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors" aria-label="Collapse sidebar">
          <PanelLeftClose className="w-4 h-4" />
        </button>
      </div>

      {/* Tab bar */}
      <div className="px-3 pb-3 flex items-center gap-1.5">
        {TABS.map((tab) => {
          const active = activeTab === tab.name.toLowerCase()
          return (
            <Link
              key={tab.name}
              href={tab.href}
              className={cn(
                'relative flex items-center gap-2 rounded-lg transition-all duration-150',
                active ? 'bg-secondary/10 text-secondary px-3 py-2 font-medium' : 'text-text-muted hover:bg-surface-hover/60 hover:text-text p-2'
              )}
              aria-current={active ? 'page' : undefined}
              aria-label={tab.name}
            >
              <tab.icon className="w-[18px] h-[18px]" />
              {active && <span className="text-sm">{tab.name}</span>}
              {tab.name === 'Inbox' && totalUnread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-0.5 flex items-center justify-center rounded-full bg-secondary text-white text-[10px] font-semibold tabular-nums">{totalUnread > 99 ? '99+' : totalUnread}</span>
              )}
            </Link>
          )
        })}
        {/* + button for creating projects — visible when on inbox tab */}
        {activeTab === 'inbox' && (
          <button
            onClick={() => setShowNewProjectRow(true)}
            className="ml-auto p-1.5 rounded-lg text-secondary hover:bg-secondary/10 hover:text-secondary transition-colors"
            title="Create project"
          >
            <Plus className="w-4 h-4" />
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
            onUploadClick={handleUploadClick}
          />
        ) : activeTab === 'chat' ? (
          SlotComponent ? <SlotComponent /> : <ChatSidebarLoading />
        ) : activeTab === 'inbox' ? (
          <InboxSidebarBody counts={counts} markRead={markRead} showNewRow={showNewProjectRow} onNewRowDone={() => setShowNewProjectRow(false)} />
        ) : null}
      </div>

      {/* Bottom */}
      <div className="border-t border-border px-3 py-2.5 shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="flex-1 min-w-0">
            <UserMenu />
          </div>
          <Link
            href="/settings"
            className={cn(
              'flex items-center justify-center w-8 h-8 rounded-lg shrink-0 transition-colors',
              pathname.startsWith('/settings') ? 'bg-secondary/10 text-secondary' : 'text-text-muted hover:bg-surface-hover hover:text-text'
            )}
            aria-label="Settings"
          >
            <Settings className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </aside>
  )
}

/* ---- Home body: Dynamic from workspace overview ---- */
function HomeSidebarBody({ activeSection, isOnWorkspace, onSectionClick, onPathClick, onUploadClick }: {
  activeSection: WorkspaceSection
  isOnWorkspace: boolean
  onSectionClick: (section: WorkspaceSection) => void
  onPathClick: (path: string) => void
  onUploadClick: () => void
}) {
  const { data: overview } = useSWR('workspace/overview', getWorkspaceOverview, {
    revalidateOnFocus: false,
    dedupingInterval: 30000,
  })
  const { data: agentsData } = useSWR('sidebar/agents', () => getAssistants({ limit: 100 }), {
    revalidateOnFocus: false,
    dedupingInterval: 30000,
  })
  const agentCount = agentsData?.agents.length ?? 0

  return (
    <nav className="px-3 py-3 space-y-5">
      {/* Workspace — drive content */}
      <div>
        <div className="flex items-center justify-between mb-2 px-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">Workspace</p>
          <button
            onClick={onUploadClick}
            className="p-1 rounded-md hover:bg-surface-hover text-text-muted hover:text-text transition-colors"
            title="Upload file"
          >
            <Upload className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="space-y-0.5">
          {(overview?.folders?.length ?? 0) + (overview?.documents?.length ?? 0) > 0 ? (
            <>
              {overview?.folders?.map(folder => (
                <button
                  key={folder.path}
                  onClick={() => onPathClick(folder.path)}
                  className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-text-secondary hover:bg-surface-hover hover:text-text transition-colors"
                >
                  <Folder className="w-[18px] h-[18px] shrink-0" />
                  <span className="flex-1 text-left truncate">{folder.name}</span>
                </button>
              ))}
              {overview?.documents?.map(doc => (
                <button
                  key={doc.path}
                  onClick={() => onPathClick(doc.path)}
                  className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-text-secondary hover:bg-surface-hover hover:text-text transition-colors"
                >
                  <FileText className="w-[18px] h-[18px] shrink-0" />
                  <span className="flex-1 text-left truncate">{doc.name.replace(/\.md$/, '')}</span>
                </button>
              ))}
            </>
          ) : (
            <p className="px-3 py-2 text-sm text-text-muted">No files yet</p>
          )}
        </div>
      </div>

      {/* Marketplace */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-2 px-3">Marketplace</p>
        <div className="space-y-0.5">
          {[
            { id: 'agents' as WorkspaceSection, label: 'Agents', icon: Bot, count: agentCount },
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
                  'flex items-center w-full gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150',
                  active ? 'bg-secondary/10 text-secondary font-medium shadow-sm' : 'text-text-secondary hover:bg-surface-hover/60 hover:text-text'
                )}
              >
                <Icon className={cn('w-[18px] h-[18px]', active ? 'text-secondary' : 'text-text-muted')} />
                {item.label}
                {item.count !== undefined && item.count > 0 && (
                  <span className={cn('ml-auto text-xs font-normal tabular-nums', active ? 'text-secondary/80' : 'text-text-muted')}>{item.count}</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* All Files — debug mode only */}
      {DEBUG_MODE && (
        <div>
          <div className="border-t border-border my-2 mx-3" />
          <button
            onClick={() => onSectionClick('files')}
            className={cn(
              'flex items-center w-full gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150',
              isOnWorkspace && activeSection === 'files' ? 'bg-secondary/10 text-secondary font-medium shadow-sm' : 'text-text-secondary hover:bg-surface-hover/60 hover:text-text'
            )}
          >
            <Files className={cn('w-[18px] h-[18px]', isOnWorkspace && activeSection === 'files' ? 'text-secondary' : 'text-text-muted')} />
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
