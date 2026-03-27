'use client'

import { useRouter } from 'next/navigation'
import { useDomains } from '@/hooks/useDomains'
import { Plus, LayoutGrid } from 'lucide-react'

// ---------------------------------------------------------------------------
// Mini inbox visual — shows what the populated inbox looks like
// ---------------------------------------------------------------------------

function MiniInboxPreview() {
  return (
    <div className="rounded-[24px] overflow-hidden bg-gradient-to-br from-surface-hover to-surface p-5 h-[310px] flex gap-3">
      {/* Mini sidebar */}
      <div className="w-[140px] shrink-0 bg-surface-alt rounded-2xl p-3 flex flex-col">
        <div className="text-[8px] font-bold text-text-muted uppercase tracking-widest mb-2 px-0.5">
          Projects
        </div>

        {/* Product domain */}
        <div className="flex items-center gap-1 px-1.5 py-1 rounded-lg bg-[#FF6600]/8 text-[#FF6600] text-[10px] font-medium mb-0.5">
          <svg className="w-[11px] h-[11px] shrink-0 rotate-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          <svg className="w-[11px] h-[11px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2v11z"/></svg>
          Product
        </div>
        <div className="py-[3px] px-1.5 pl-[22px] text-[9px] rounded-[5px] bg-[#FF6600]/6 text-[#FF6600] font-medium mb-px">
          <span className="font-semibold mr-0.5">#</span> Onboarding
        </div>
        <div className="py-[3px] px-1.5 pl-[22px] text-[9px] text-text-secondary rounded-[5px] mb-px">
          <span className="font-semibold text-text-muted mr-0.5">#</span> Analytics
        </div>
        <div className="py-[3px] px-1.5 pl-[22px] text-[9px] text-text-secondary rounded-[5px] mb-px">
          <span className="font-semibold text-text-muted mr-0.5">#</span> Design
        </div>

        {/* Engineering domain */}
        <div className="flex items-center gap-1 px-1.5 py-1 rounded-lg text-text-muted text-[10px] font-medium mt-1.5">
          <svg className="w-[11px] h-[11px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          <svg className="w-[11px] h-[11px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2v11z"/></svg>
          Engineering
        </div>

        <div className="flex items-center gap-1 px-1.5 py-1 text-[9px] text-[#FF6600] font-medium mt-auto">
          <svg className="w-[10px] h-[10px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New project
        </div>
      </div>

      {/* Mini channel view */}
      <div className="flex-1 bg-surface-alt rounded-2xl p-3.5 flex flex-col overflow-hidden">
        {/* Channel header */}
        <div className="flex items-center gap-1 mb-0.5">
          <span className="text-[#FF6600] font-bold text-xs">#</span>
          <span className="text-xs font-semibold">product-onboarding</span>
          <div className="ml-auto flex">
            <MiniMascot color="#f97316" bg="#ffedd5" />
            <MiniMascot color="#fbbf24" bg="#fffbeb" className="-ml-1" />
            <MiniMascot color="#10b981" bg="#f0fdf4" className="-ml-1" />
          </div>
        </div>
        <div className="text-[8px] text-text-muted mb-2">Go-to-market strategy for the product launch</div>

        {/* Tabs */}
        <div className="flex mb-2.5">
          <span className="px-2 py-[3px] text-[8px] font-medium text-text-muted rounded-md">Tasks</span>
          <span className="px-2 py-[3px] text-[8px] font-medium text-white bg-[#FF6600] rounded-md">Activity</span>
          <span className="px-2 py-[3px] text-[8px] font-medium text-text-muted rounded-md">Deliverables</span>
        </div>

        {/* Messages */}
        <MiniMessage
          color="#f97316"
          bg="#ffedd5"
          name="Curator Carla"
          nameColor="#f97316"
          text="Budget reallocation: shift 40% to tutorials"
          time="3h"
          badge="NEEDS APPROVAL"
          showApproval
        />
        <MiniMessage
          color="#fbbf24"
          bg="#fffbeb"
          name="Wordsmith Wally"
          nameColor="#b45309"
          text="Content calendar draft — 8 tutorials, 4 opinions"
          time="1h"
        />
        <MiniMessage
          color="#10b981"
          bg="#f0fdf4"
          name="DataDog Dan"
          nameColor="#10b981"
          text="Engagement: +1.5% avg improvement"
          time="45m"
          isLast
        />

        <div className="mt-auto py-1.5 px-2.5 bg-surface rounded-lg text-[8px] text-text-muted">
          Message this channel...
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
      className={`w-5 h-5 rounded-[7px] flex items-center justify-center border-[1.5px] border-surface-alt ${className}`}
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
  text,
  time,
  badge,
  showApproval,
  isLast,
}: {
  color: string
  bg: string
  name: string
  nameColor: string
  text: string
  time: string
  badge?: string
  showApproval?: boolean
  isLast?: boolean
}) {
  return (
    <div className={`flex gap-2 py-[7px] ${isLast ? '' : 'border-b border-surface-hover'}`}>
      <div className="w-6 h-6 rounded-lg shrink-0 flex items-center justify-center" style={{ background: bg }}>
        <div className="w-3.5 h-4 rounded-[4px] relative" style={{ background: color }}>
          <div className="absolute top-1 left-1/2 -translate-x-1/2 w-2 h-1 rounded-sm bg-white/50" />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[9px] font-semibold mb-px" style={{ color: nameColor }}>
          {name}
          {badge && (
            <span className="inline-block text-[7px] font-bold px-[5px] py-px rounded ml-1 bg-[#FF6600]/10 text-[#FF6600]">
              {badge}
            </span>
          )}
        </div>
        <div className="text-[8px] text-text-secondary leading-[1.4]">{text}</div>
        {showApproval && (
          <div className="flex gap-1 mt-1">
            <span className="px-2 py-px rounded-[5px] text-[7px] font-semibold bg-[#FF6600] text-white">Approve</span>
            <span className="px-2 py-px rounded-[5px] text-[7px] font-semibold bg-surface-hover text-text-muted">Reject</span>
            <span className="px-2 py-px rounded-[5px] text-[7px] font-semibold text-[#FF6600]">Discuss</span>
          </div>
        )}
      </div>
      <span className="text-[7px] text-text-muted shrink-0">{time}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function InboxPage() {
  const { domains, isLoading } = useDomains()
  const router = useRouter()
  const hasProjects = domains.length > 0

  if (isLoading) {
    return (
      <div className="flex-1 h-full flex items-center justify-center">
        <div className="h-10 w-10 rounded-2xl animate-shimmer" />
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
          <svg className="w-7 h-7 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z"/>
          </svg>
        </div>
        <h2 className="font-serif text-xl text-text mb-1">Select a channel</h2>
        <p className="text-sm text-text-muted max-w-xs mb-5">
          Pick a channel from the sidebar to view tasks and conversations with your agents.
        </p>
        {firstChannel && (
          <button
            onClick={() => router.push(`/inbox/${firstDomain.slug}/${firstChannel.slug}`)}
            className="px-5 py-2.5 rounded-xl text-sm font-medium text-[#FF6600] bg-[#FF6600]/8 hover:bg-[#FF6600]/12 transition-colors"
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
          <div className="flex gap-2.5 justify-center">
            <button
              className="flex items-center gap-2 px-6 py-[11px] rounded-[14px] text-[13px] font-medium text-white bg-[#FF6600] hover:bg-[#E65C00] shadow-[0_2px_16px_rgba(255,102,0,0.22)] hover:shadow-[0_4px_24px_rgba(255,102,0,0.32)] hover:-translate-y-px active:scale-[0.98] transition-all"
            >
              <Plus className="w-4 h-4" />
              Create your first project
            </button>
            <button
              onClick={() => router.push('/agents')}
              className="flex items-center gap-2 px-6 py-[11px] rounded-[14px] text-[13px] font-medium text-text bg-surface-alt border border-surface-active hover:bg-surface-hover transition-all"
            >
              <LayoutGrid className="w-4 h-4" />
              Browse agents
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
