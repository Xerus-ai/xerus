'use client'

import { useState, useMemo, type ReactNode } from 'react'
import Image from 'next/image'
import {
  Wrench,
} from 'lucide-react'
import { ModelIcon } from '@/components/agents/AgentAvatar'
import { cn } from '@/lib/utils'
import { Agent } from './types'
import { XERUS_AGENT, XERUS_MASTER_SLUG } from './AgentDropdown'
import { isMascotConfig } from '@/lib/mascot-config'
import { MascotAvatar } from '@/components/agents/MascotAvatar'

interface ChatWelcomeProps {
  currentAgent?: Agent | null
  userName?: string
  onSuggestionClick?: (text: string) => void
  className?: string
  agents?: Agent[]
}

// ---------------------------------------------------------------------------
// Greeting System
// ---------------------------------------------------------------------------

type TimeSlot = 'lateNight' | 'earlyMorning' | 'morning' | 'afternoon' | 'evening'

const GREETINGS: Record<TimeSlot, string[]> = {
  lateNight: [
    'Burning the midnight oil, {name}?',
    'The night is young, {name}.',
    'Still at it, {name}?',
    'Can\'t sleep either, {name}?',
    'Quiet hours, big ideas, {name}.',
  ],
  earlyMorning: [
    'Early bird gets the worm, {name}.',
    'Fresh start, {name}?',
    'Up before the sun, {name}?',
    'The world is still asleep, {name}.',
    'First light, first move, {name}.',
  ],
  morning: [
    'Good morning, {name}.',
    'What\'s the plan today, {name}?',
    'Ready to roll, {name}?',
    'Morning, {name}. What are we building?',
    'A new day, {name}. What\'s first?',
  ],
  afternoon: [
    'How\'s the afternoon going, {name}?',
    'What are we working on, {name}?',
    'Afternoon push, {name}?',
    'Deep in the day, {name}. What\'s next?',
    'The day is yours, {name}.',
  ],
  evening: [
    'Winding down or ramping up, {name}?',
    'Evening mode, {name}.',
    'Still going strong, {name}?',
    'One more thing before the day ends, {name}?',
    'The evening stretch, {name}.',
  ],
}

function getTimeSlot(): TimeSlot {
  const hour = new Date().getHours()
  if (hour >= 23 || hour < 5) return 'lateNight'
  if (hour < 8) return 'earlyMorning'
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  return 'evening'
}

function pickGreeting(name: string): string {
  const slot = getTimeSlot()
  const pool = GREETINGS[slot]
  const idx = Math.floor(Math.random() * pool.length)
  return pool[idx].replace('{name}', name)
}

// ---------------------------------------------------------------------------
// Card Illustrations (pure CSS art — no images)
// ---------------------------------------------------------------------------

function PlanVisual() {
  return (
    <div className="relative w-full h-24 flex items-center justify-center">
      {/* Stacked document cards fanning out */}
      <div className="relative w-20 h-16">
        <div className="absolute inset-0 rounded-lg bg-primary/[0.10] border border-primary/15 -rotate-6 group-hover:-rotate-12 group-hover:-translate-x-1 transition-transform duration-500" />
        <div className="absolute inset-0 rounded-lg bg-primary/[0.07] border border-primary/15 rotate-3 group-hover:rotate-6 group-hover:translate-x-1 transition-transform duration-500">
          <div className="mt-3 mx-2.5 space-y-1">
            <div className="h-[3px] w-10 rounded-full bg-primary/30" />
            <div className="h-[3px] w-7 rounded-full bg-primary/20" />
          </div>
        </div>
        <div className="absolute inset-0 rounded-lg bg-surface-alt border border-primary/20 group-hover:-translate-y-1 transition-transform duration-500">
          <div className="mt-3 mx-2.5 space-y-1.5">
            <div className="h-[3px] w-12 rounded-full bg-primary/35" />
            <div className="h-[3px] w-9 rounded-full bg-primary/22" />
            <div className="h-[3px] w-6 rounded-full bg-primary/15" />
          </div>
          <div className="absolute bottom-2 right-2 w-4 h-4 rounded bg-primary/10 flex items-center justify-center">
            <div className="w-2 h-2 rounded-sm bg-primary/30" />
          </div>
        </div>
      </div>
    </div>
  )
}

function AgentsVisual({ agents }: { agents: Agent[] }) {
  // Take first 4 agents that have avatars
  const displayAgents = agents.filter((a) => a.avatarUrl).slice(0, 4)

  return (
    <div className="relative w-full h-24 flex items-center justify-center">
      <div className="flex -space-x-3 group-hover:space-x-1 transition-all duration-500">
        {displayAgents.map((agent, i) => (
          <div
            key={agent.id}
            className="relative w-11 h-11 rounded-2xl overflow-hidden border border-surface-active bg-surface-hover flex items-center justify-center transition-all duration-500 group-hover:scale-105"
            style={{
              zIndex: displayAgents.length - i,
              transitionDelay: `${i * 50}ms`,
            }}
          >
            {isMascotConfig(agent.avatarUrl) ? (
              <MascotAvatar config={agent.avatarUrl!} size={44} className="w-full h-full" alt={agent.name} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={agent.avatarUrl!} alt={agent.name} className="w-full h-full object-cover" />
            )}
            {/* Status dot */}
            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-surface bg-[#22C55E]" />
          </div>
        ))}
        {displayAgents.length === 0 && (
          <>
            {/* Fallback if no agents loaded yet */}
            {[0, 1, 2].map((i) => (
              <div key={i} className="w-11 h-11 rounded-2xl bg-surface-hover border border-surface-active animate-pulse" style={{ zIndex: 3 - i }} />
            ))}
          </>
        )}
      </div>
    </div>
  )
}

function DelegateVisual() {
  return (
    <div className="relative w-full h-24 flex items-center justify-center">
      {/* Mini kanban columns */}
      <div className="flex gap-2">
        {/* Column 1: To Do */}
        <div className="w-14 flex flex-col gap-1">
          <div className="h-1 w-8 rounded-full bg-primary/20 mb-1" />
          <div className="h-6 rounded-md bg-primary/[0.06] border border-primary/10 group-hover:translate-x-[64px] group-hover:translate-y-[28px] group-hover:bg-primary/10 transition-all duration-700" />
          <div className="h-5 rounded-md bg-primary/[0.04] border border-primary/8" />
        </div>
        {/* Column 2: Doing */}
        <div className="w-14 flex flex-col gap-1">
          <div className="h-1 w-6 rounded-full bg-[#22C55E]/30 mb-1" />
          <div className="h-7 rounded-md bg-[#22C55E]/[0.06] border border-[#22C55E]/10" />
        </div>
        {/* Column 3: Done */}
        <div className="w-14 flex flex-col gap-1">
          <div className="h-1 w-7 rounded-full bg-[#3B82F6]/20 mb-1" />
          <div className="h-5 rounded-md bg-[#3B82F6]/[0.06] border border-[#3B82F6]/10" />
          <div className="h-5 rounded-md bg-[#3B82F6]/[0.04] border border-[#3B82F6]/8" />
        </div>
      </div>
    </div>
  )
}

function SummarizeVisual() {
  return (
    <div className="relative w-full h-24 flex items-center justify-center">
      {/* Document with text lines that compress on hover */}
      <div className="relative w-20 rounded-lg bg-surface-alt border border-primary/10 p-3 overflow-hidden">
        <div className="space-y-1.5 transition-all duration-500 group-hover:space-y-0.5">
          <div className="h-[3px] w-full rounded-full bg-primary/30 transition-all duration-500 group-hover:w-14" />
          <div className="h-[3px] w-11 rounded-full bg-primary/22 transition-all duration-500 group-hover:w-14 group-hover:delay-75" />
          <div className="h-[3px] w-14 rounded-full bg-primary/18 transition-all duration-500 group-hover:w-14" />
          <div className="h-[3px] w-8 rounded-full bg-primary/14 transition-all duration-500 group-hover:w-14" />
          <div className="h-[3px] w-12 rounded-full bg-primary/10 transition-all duration-500 group-hover:opacity-0" />
          <div className="h-[3px] w-6 rounded-full bg-primary/8 transition-all duration-500 group-hover:opacity-0" />
        </div>
        {/* Summary badge that appears on hover */}
        <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[8px] font-bold opacity-0 group-hover:opacity-100 transition-opacity duration-500 delay-200">
          TL;DR
        </div>
      </div>
    </div>
  )
}

// Fallback visual for non-orchestrator agents: large icon
function IconVisual({ icon }: { icon: ReactNode }) {
  return (
    <div className="relative w-full h-24 flex items-center justify-center">
      <div className="w-14 h-14 rounded-2xl bg-primary/12 flex items-center justify-center text-primary/60 group-hover:text-primary group-hover:scale-110 group-hover:bg-primary/18 transition-all duration-300">
        <div className="w-7 h-7 [&>svg]:w-7 [&>svg]:h-7">
          {icon}
        </div>
      </div>
    </div>
  )
}

// Map orchestrator suggestion labels to their visuals
function getOrchestratorVisual(label: string, agents: Agent[]): ReactNode {
  switch (label) {
    case 'Plan a new project': return <PlanVisual />
    case 'Check on my agents': return <AgentsVisual agents={agents} />
    case 'Delegate a task': return <DelegateVisual />
    case 'Summarize recent work': return <SummarizeVisual />
    default: return null
  }
}

// ---------------------------------------------------------------------------
// Suggestions (per personality_type)
// ---------------------------------------------------------------------------

interface Suggestion {
  label: string
  prompt: string
  icon: ReactNode
  visual?: ReactNode
}

function buildSuggestions(agents: Agent[]): Suggestion[] {
  const items = [
    { label: 'Plan a new project', prompt: 'Help me plan and break down a new project into tasks for my team' },
    { label: 'Check on my agents', prompt: 'Give me a status update on what my agents are working on' },
    { label: 'Delegate a task', prompt: 'I have a task that needs the right agent assigned to it' },
    { label: 'Summarize recent work', prompt: 'Summarize what has been accomplished across my workspace this week' },
  ]
  return items.map((item) => ({
    ...item,
    icon: null,
    visual: getOrchestratorVisual(item.label, agents),
  }))
}

// ---------------------------------------------------------------------------
// Agent Avatar
// ---------------------------------------------------------------------------

function AgentHeroAvatar({ agent, size }: { agent: Agent; size: number }) {
  if (agent.slug === XERUS_MASTER_SLUG) {
    return (
      <Image
        src="/logo/xerus.svg"
        alt="Xerus"
        width={size}
        height={size}
        className="w-full h-full"
        priority
      />
    )
  }
  const avatarUrl = agent.avatarUrl
  if (isMascotConfig(avatarUrl)) {
    return <MascotAvatar config={avatarUrl!} size={size} className="w-full h-full" alt={agent.name} />
  }
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatarUrl} alt={agent.name} className="w-full h-full object-cover rounded-2xl" />
  }
  return (
    <span className="w-full h-full flex items-center justify-center bg-primary/10 text-primary text-2xl font-semibold rounded-2xl">
      {agent.name.substring(0, 2).toUpperCase()}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Agent Profile Inline (replaces logo when a specific agent is selected)
// ---------------------------------------------------------------------------

function AgentProfileInline({ agent }: { agent: Agent }) {
  const avatarUrl = agent.avatarUrl
  const tools = agent.tools ?? []

  return (
    <div className="flex items-center justify-center gap-4 mb-8">
      {/* Avatar with model badge */}
      <div className="relative shrink-0">
        <div className="w-14 h-14 rounded-2xl overflow-hidden border border-surface-active bg-surface-hover">
          {isMascotConfig(avatarUrl) ? (
            <MascotAvatar config={avatarUrl!} size={56} className="w-full h-full" alt={agent.name} />
          ) : avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt={agent.name} className="w-full h-full object-cover" />
          ) : (
            <span className="w-full h-full flex items-center justify-center bg-primary/10 text-primary text-lg font-semibold">
              {agent.name.substring(0, 2).toUpperCase()}
            </span>
          )}
        </div>
        {agent.model && (
          <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 bg-white border border-surface-active rounded-md px-1.5 py-0.5 shadow-sm flex items-center gap-0.5 whitespace-nowrap">
            <ModelIcon model={agent.model} size="sm" />
            <span className="text-[9px] font-bold text-text-secondary max-w-[50px] truncate">{agent.model}</span>
          </div>
        )}
      </div>

      {/* Name + description + tools */}
      <div className="text-left">
        <h3 className="font-serif text-lg text-text">{agent.name}</h3>
        <p className="text-sm text-text-muted leading-relaxed line-clamp-2">
          {agent.description}
        </p>

        {tools.length > 0 && (
          <div className="flex items-center gap-1.5 mt-2">
            {tools.slice(0, 5).map((tool) => (
              <div
                key={tool.name_slug}
                className="w-6 h-6 rounded-md bg-white border border-surface-active flex items-center justify-center overflow-hidden shadow-sm"
                title={tool.name}
              >
                {tool.img_src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={tool.img_src} alt={tool.name} className="w-3.5 h-3.5 object-contain" />
                ) : (
                  <Wrench className="w-3 h-3 text-text-secondary" />
                )}
              </div>
            ))}
            {tools.length > 5 && (
              <span className="text-[10px] font-medium text-text-muted">+{tools.length - 5}</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChatWelcome({
  currentAgent,
  userName,
  onSuggestionClick,
  className,
  agents = [],
}: ChatWelcomeProps) {
  const agent = currentAgent ?? XERUS_AGENT
  const firstName = userName?.split(' ')[0] ?? ''

  const [greeting] = useState(() => pickGreeting(firstName || 'there'))

  const suggestions = useMemo(() => buildSuggestions(agents), [agents])

  return (
    <div data-testid="chat-welcome" className={cn('flex flex-col items-center h-full px-6 pt-16 pb-8 overflow-y-auto scrollbar-thin', className)}>
      <div className="max-w-3xl w-full text-center my-auto relative">
        {/* Warm radial glow behind content */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/4 w-[500px] h-[400px] bg-[radial-gradient(ellipse_at_center,_rgba(255,102,0,0.08)_0%,_transparent_70%)] pointer-events-none" />

        {/* Top: Xerus logo OR agent profile */}
        {!currentAgent || currentAgent.slug === XERUS_MASTER_SLUG ? (
          <div className="relative flex justify-center mb-8">
            <div className="w-10 h-10">
              <AgentHeroAvatar agent={agent} size={40} />
            </div>
          </div>
        ) : (
          <AgentProfileInline agent={currentAgent} />
        )}

        {/* Greeting */}
        <h1 className="font-serif text-[30px] leading-[1.25] font-medium text-text tracking-[-0.01em] mb-10" suppressHydrationWarning>
          {greeting}
        </h1>

        {/* Suggestion cards */}
        <div className="grid grid-cols-4 gap-4 text-left">
          {suggestions.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => onSuggestionClick?.(s.prompt)}
              className={cn(
                'group flex flex-col rounded-[32px] p-4 overflow-hidden',
                'bg-surface/60 backdrop-blur-sm shadow-[0_2px_16px_rgba(255,102,0,0.15)]',
                'hover:shadow-[0_4px_24px_rgba(255,102,0,0.22)]',
                'active:scale-[0.98] transition-all duration-300 cursor-pointer',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
              )}
            >
              {/* Visual or icon fallback */}
              {s.visual ?? (s.icon && <IconVisual icon={s.icon} />)}

              {/* Text */}
              <h3 className="font-serif text-base text-text group-hover:text-primary transition-colors duration-300 mb-1">
                {s.label}
              </h3>
              <p className="text-sm text-text-muted leading-relaxed line-clamp-2">
                {s.prompt}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
