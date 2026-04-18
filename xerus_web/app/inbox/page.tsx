'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useDomains } from '@/hooks/useDomains'
import { apiCall } from '@/lib/api/client'
import { Plus, FolderOpen, ChevronRight, MessageSquare } from 'lucide-react'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import { XerusLoader } from '@/components/common/XerusLoader'

// ---------------------------------------------------------------------------
// Mini inbox preview — mirrors the real inbox layout precisely
// ---------------------------------------------------------------------------

function MiniInboxPreview() {
  return (
    <div className="rounded-3xl overflow-hidden bg-gradient-to-br from-surface-hover to-surface p-4 flex gap-3">
      {/* Mini sidebar */}
      <div className="w-[140px] shrink-0 bg-surface-alt rounded-2xl p-3 flex flex-col">
        <div className="flex items-center justify-between mb-2 px-0.5">
          <span className="text-[8px] font-bold text-text-muted uppercase tracking-widest">Projects</span>
          <span className="text-[10px] text-text-muted">+</span>
        </div>

        <div className="flex items-center gap-1 px-1.5 py-1 rounded-lg bg-primary/8 text-primary text-[10px] font-medium mb-0.5">
          <ChevronRight className="w-[11px] h-[11px] shrink-0 rotate-90" />
          <FolderOpen className="w-[11px] h-[11px] shrink-0" />
          Product
        </div>
        <div className="py-[3px] px-1.5 pl-[22px] text-[9px] rounded-[5px] bg-primary/6 text-primary font-medium mb-px">
          <span className="font-semibold mr-0.5">#</span> Onboarding
        </div>
        <div className="py-[3px] px-1.5 pl-[22px] text-[9px] text-text-secondary rounded-[5px] mb-px">
          <span className="font-semibold text-text-muted mr-0.5">#</span> Analytics
        </div>
        <div className="py-[3px] px-1.5 pl-[22px] text-[9px] text-text-secondary rounded-[5px] mb-px">
          <span className="font-semibold text-text-muted mr-0.5">#</span> Design
        </div>

        <div className="flex items-center gap-1 px-1.5 py-1 rounded-lg text-text-muted text-[10px] font-medium mt-1.5">
          <ChevronRight className="w-[11px] h-[11px] shrink-0" />
          <FolderOpen className="w-[11px] h-[11px] shrink-0" />
          Engineering
        </div>
      </div>

      {/* Mini channel view */}
      <div className="flex-1 bg-surface-alt rounded-2xl p-3.5 flex flex-col overflow-hidden">
        {/* Channel header */}
        <div className="flex items-start justify-between gap-2 mb-1">
          <div>
            <h3 className="font-serif text-xs font-semibold text-text">
              <span className="text-text-muted"># </span>product-onboarding
            </h3>
            <p className="text-[7px] text-text-muted mt-0.5">Competitive analysis and go-to-market strategy</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <div className="flex">
              <MiniMascot color="#f97316" bg="#ffedd5" />
              <MiniMascot color="#fbbf24" bg="#fffbeb" className="-ml-1.5" />
              <MiniMascot color="#10b981" bg="#f0fdf4" className="-ml-1.5" />
              <MiniMascot color="#8b5cf6" bg="#f5f3ff" className="-ml-1.5" />
              <div className="w-5 h-5 rounded-[7px] -ml-1.5 bg-surface-hover border-[1.5px] border-surface flex items-center justify-center text-[7px] font-semibold text-text-muted">+1</div>
            </div>
            <span className="text-[7px] text-text-muted">3 online</span>
          </div>
        </div>

        {/* Tabs — pill style, active=bg-text */}
        <div className="inline-flex bg-surface rounded-full p-[3px] mb-2.5 self-start">
          <span className="px-3 py-[3px] text-[8px] font-medium text-text-muted rounded-full">Tasks</span>
          <span className="px-3 py-[3px] text-[8px] font-medium text-white bg-text rounded-full shadow-sm">Activity</span>
          <span className="px-3 py-[3px] text-[8px] font-medium text-text-muted rounded-full">Deliverables</span>
        </div>

        {/* Date separator */}
        <div className="flex items-center gap-2 py-0.5">
          <div className="flex-1 h-px bg-surface-active" />
          <span className="text-[7px] font-medium text-text-muted">Today</span>
          <div className="flex-1 h-px bg-surface-active" />
        </div>

        {/* System event */}
        <div className="text-center py-0.5 mb-1">
          <span className="text-[7px] text-text-muted italic">strategist assigned task &quot;Q2 Content Strategy&quot; to writer &nbsp;19:31</span>
        </div>

        {/* Messages */}
        <div className="space-y-0.5">
          <MiniMessage color="#f97316" bg="#ffedd5" name="strategist" nameColor="#f97316" badge="NEEDS APPROVAL" time="3h ago">
            <div className="text-[8px] text-text font-semibold mt-0.5">Budget Reallocation Request</div>
            <div className="text-[7.5px] text-text-secondary leading-[1.5] mt-0.5">Based on the engagement analysis, I recommend shifting 40% of the opinion piece budget to tutorial content production.</div>
            <div className="text-[7.5px] text-text-secondary mt-0.5">Estimated impact: <strong className="text-text">+1.5% average engagement rate</strong>.</div>
            <div className="flex gap-1.5 mt-1.5">
              <span className="flex items-center gap-0.5 px-2 py-[2px] rounded-full text-[7px] font-semibold bg-primary text-white">Approve</span>
              <span className="flex items-center gap-0.5 px-2 py-[2px] rounded-full text-[7px] font-semibold bg-surface-hover text-text-muted">Reject</span>
              <span className="flex items-center gap-0.5 px-2 py-[2px] rounded-full text-[7px] font-semibold text-primary">Discuss</span>
            </div>
          </MiniMessage>

          <MiniMessage color="#fbbf24" bg="#fffbeb" name="writer" nameColor="#b45309" time="1h ago">
            <div className="text-[7.5px] text-text-secondary leading-[1.5] mt-0.5">Started drafting the Q2 content calendar. First draft will include:</div>
            <div className="text-[7.5px] text-text-secondary leading-[1.5]">8 tutorial posts (bi-weekly)<br/>4 opinion pieces (monthly)</div>
          </MiniMessage>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Mini components for the preview
// ---------------------------------------------------------------------------

function MiniMascot({ color, bg, className = '' }: { color: string; bg: string; className?: string }) {
  return (
    <div
      className={`w-5 h-5 rounded-[7px] flex items-center justify-center border-[1.5px] border-surface ${className}`}
      style={{ background: bg }}
    >
      <div className="w-2.5 h-3 rounded-[3px] relative" style={{ background: color }}>
        <div className="absolute top-1 left-1/2 -translate-x-1/2 w-[8px] h-1 rounded-sm bg-white/50" />
      </div>
    </div>
  )
}

function MiniMessage({
  color,
  bg,
  name,
  nameColor,
  time,
  badge,
  children,
}: {
  color: string
  bg: string
  name: string
  nameColor: string
  time: string
  badge?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex gap-2 py-2">
      <div className="w-6 h-6 rounded-lg shrink-0 flex items-center justify-center mt-0.5" style={{ background: bg }}>
        <div className="w-3.5 h-4 rounded-[4px] relative" style={{ background: color }}>
          <div className="absolute top-1 left-1/2 -translate-x-1/2 w-2 h-1 rounded-sm bg-white/50" />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-semibold" style={{ color: nameColor }}>{name}</span>
          {badge && (
            <span className="text-[7px] font-bold px-[5px] py-px rounded bg-primary/10 text-primary">
              {badge}
            </span>
          )}
          <span className="text-[7px] text-text-muted">{time}</span>
        </div>
        {children}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

function InboxPageContent() {
  const { domains, isLoading, refetch } = useDomains()
  const router = useRouter()
  const hasProjects = domains.length > 0
  const [showCreate, setShowCreate] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (showCreate) setTimeout(() => inputRef.current?.focus(), 50)
  }, [showCreate])

  const handleCreateProject = async () => {
    const trimmed = projectName.trim()
    if (!trimmed) return
    setIsCreating(true)
    try {
      await apiCall('/company/domains', {
        method: 'POST',
        body: JSON.stringify({ name: trimmed }),
      })
      setProjectName('')
      setShowCreate(false)
      await refetch()
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error(error)
    } finally {
      setIsCreating(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex-1 h-full flex items-center justify-center">
        <XerusLoader variant="inline" />
      </div>
    )
  }

  // If projects exist, guide user to select a channel
  if (hasProjects) {
    const firstDomain = domains[0]
    const firstChannel = firstDomain?.channels[0]

    return (
      <div className="flex-1 h-full flex flex-col items-center justify-center text-center px-6">
        <div className="w-14 h-14 rounded-2xl bg-surface-hover flex items-center justify-center mb-4">
          <MessageSquare className="w-7 h-7 text-text-muted" />
        </div>
        <h2 className="font-serif text-xl text-text mb-1">Select a channel</h2>
        <p className="text-sm text-text-muted max-w-xs mb-5">
          Pick a channel from the sidebar to view tasks and conversations with your agents.
        </p>
        {firstChannel && (
          <button
            onClick={() => router.push(`/inbox/${firstDomain.slug}/${firstChannel.slug}`)}
            className="px-5 py-2.5 rounded-xl text-sm font-medium text-primary bg-primary/8 hover:bg-primary/12 transition-colors"
          >
            Go to #{firstChannel.name}
          </button>
        )}
      </div>
    )
  }

  // No projects — show the full onboarding blank state
  return (
    <div className="flex-1 h-full flex items-center justify-center overflow-auto">
      <div className="w-[560px] max-w-[90vw] animate-[fadeInUp_0.4s_ease-out]">
        <MiniInboxPreview />

        <div className="pt-6 text-center">
          <h2 className="font-serif text-2xl font-semibold text-text mb-2">
            Your AI workforce starts here
          </h2>
          <p className="text-[13px] text-text-secondary leading-relaxed max-w-[420px] mx-auto mb-5">
            Create a project, add channels, assign agents from the marketplace —
            and watch them collaborate, report progress, and request your approval.
          </p>

          {!showCreate ? (
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 px-6 py-[11px] rounded-[14px] text-[13px] font-medium text-white bg-primary hover:bg-primary/90 shadow-[0_2px_16px_rgba(255,102,0,0.22)] hover:shadow-[0_4px_24px_rgba(255,102,0,0.32)] hover:-translate-y-px active:scale-[0.98] transition-all"
            >
              <Plus className="w-4 h-4" />
              Create your first project
            </button>
          ) : (
            <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-surface-alt animate-[fadeInUp_0.15s_ease-out]">
              <ChevronRight className="w-4 h-4 text-text-secondary shrink-0" />
              <FolderOpen className="w-[18px] h-[18px] text-primary shrink-0" />
              <input
                ref={inputRef}
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateProject()
                  if (e.key === 'Escape') { setShowCreate(false); setProjectName('') }
                }}
                onBlur={() => { if (!projectName.trim()) { setShowCreate(false); setProjectName('') } }}
                placeholder="Project name..."
                disabled={isCreating}
                className="bg-transparent border-none outline-none text-sm font-medium text-text placeholder:text-text-muted caret-primary w-[180px]"
              />
              <span className="text-[10px] text-text-muted bg-surface rounded px-1.5 py-0.5 shrink-0">↵</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function InboxPage() {
  return (
    <ErrorBoundary label="Inbox">
      <InboxPageContent />
    </ErrorBoundary>
  )
}
