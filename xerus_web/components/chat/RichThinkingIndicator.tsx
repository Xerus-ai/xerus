'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { cn } from '@/lib/utils'
import {
  Terminal, FileText, Pencil, Search, Globe, Brain,
  Bot, Puzzle, ListChecks, HelpCircle,
} from 'lucide-react'
import type { ExecutionState } from './types'
import type { TurnPart, ToolCallIcon } from './streaming-turn.types'

const TOOL_ICON: Record<ToolCallIcon, typeof Terminal> = {
  bash: Terminal, read: FileText, write: Pencil, search: Search,
  web: Globe, think: Brain, agent: Bot, skill: Puzzle,
  task: ListChecks, question: HelpCircle,
}

const TOOL_COLOR: Record<ToolCallIcon, string> = {
  bash: 'text-emerald-600', read: 'text-blue-600', write: 'text-violet-600',
  search: 'text-amber-600', web: 'text-cyan-600', think: 'text-slate-500',
  agent: 'text-secondary', skill: 'text-purple-600', task: 'text-teal-600',
  question: 'text-rose-600',
}

const ICON_BG: Record<ToolCallIcon, string> = {
  bash: 'bg-emerald-500/10', read: 'bg-blue-500/10', write: 'bg-violet-500/10',
  search: 'bg-amber-500/10', web: 'bg-cyan-500/10', think: 'bg-slate-500/10',
  agent: 'bg-secondary/10', skill: 'bg-purple-500/10', task: 'bg-teal-500/10',
  question: 'bg-rose-500/10',
}

const VERB_MAP: Record<ToolCallIcon, string> = {
  read: 'Reading', write: 'Writing', bash: 'Running', search: 'Searching',
  web: 'Fetching', think: 'Thinking', agent: 'Delegating', skill: 'Executing',
  task: 'Tracking', question: 'Asking',
}

const AMBIENT_VERBS = ['thinking...', 'pondering...', 'considering...', 'working on it...']
const VERB_CYCLE_MS = 3500

function resolvePhaseVerb(phase: string | undefined): string | null {
  if (!phase) return null
  const p = phase.toLowerCase()
  if (p.includes('workspace') || p.includes('scaffold')) return 'preparing workspace...'
  if (p.includes('plan')) return 'crafting a plan...'
  if (p.includes('analyz') || p.includes('assess')) return 'analyzing your request...'
  if (p.includes('generat') || p.includes('complet')) return 'generating a response...'
  if (p.includes('verif') || p.includes('review')) return 'verifying results...'
  return null
}

function formatToolSummary(parts: TurnPart[]): string | null {
  const running = parts.filter(
    (p): p is Extract<TurnPart, { type: 'tool' }> => p.type === 'tool' && p.state === 'running',
  )
  if (running.length === 0) return null

  const byCategory = new Map<ToolCallIcon, number>()
  for (const t of running) {
    byCategory.set(t.icon, (byCategory.get(t.icon) ?? 0) + 1)
  }

  const fragments: string[] = []
  for (const [icon, count] of byCategory) {
    const verb = VERB_MAP[icon] ?? 'Processing'
    if (count === 1) {
      const tool = running.find(t => t.icon === icon)
      const target = tool?.target ? ` ${tool.target}` : ''
      fragments.push(`${verb}${target}`)
    } else {
      fragments.push(`${verb} ${count} items`)
    }
  }
  return fragments.join(', ') + '...'
}

interface RichThinkingIndicatorProps {
  executionState?: ExecutionState | null
  parts?: TurnPart[]
}

export function RichThinkingIndicator({ executionState, parts }: RichThinkingIndicatorProps) {
  const [ambientIndex, setAmbientIndex] = useState(0)
  const lastVerbRef = useRef(Date.now())

  const toolSummary = useMemo(() => {
    if (!parts || parts.length === 0) return null
    return formatToolSummary(parts)
  }, [parts])

  const runningIcons = useMemo(() => {
    if (!parts) return []
    const running = parts.filter(
      (p): p is Extract<TurnPart, { type: 'tool' }> => p.type === 'tool' && p.state === 'running',
    )
    return [...new Set(running.map(t => t.icon))]
  }, [parts])

  const activeStep = executionState?.steps?.find((s) => s.status === 'active')
  const phaseVerb = resolvePhaseVerb(activeStep?.name)

  const displayText = toolSummary
    ?? phaseVerb
    ?? (executionState?.error ? 'ran into a problem...' : null)
    ?? AMBIENT_VERBS[ambientIndex]

  useEffect(() => {
    if (toolSummary || phaseVerb) return
    const interval = setInterval(() => {
      setAmbientIndex((prev) => (prev + 1) % AMBIENT_VERBS.length)
      lastVerbRef.current = Date.now()
    }, VERB_CYCLE_MS)
    return () => clearInterval(interval)
  }, [toolSummary, phaseVerb])

  const isError = executionState?.error

  return (
    <span data-testid="thinking-indicator" className="inline-flex items-center gap-1.5 text-[14px] text-text-secondary flex-wrap">
      {runningIcons.length > 0 ? (
        <span className="inline-flex items-center gap-0.5 mr-0.5">
          {runningIcons.map((icon) => {
            const Icon = TOOL_ICON[icon]
            return (
              <span
                key={icon}
                className={cn(
                  'w-5 h-5 rounded-md inline-flex items-center justify-center animate-pulse',
                  ICON_BG[icon], TOOL_COLOR[icon],
                )}
              >
                <Icon className="w-2.5 h-2.5" />
              </span>
            )
          })}
        </span>
      ) : !isError ? (
        <svg className="w-3.5 h-3.5 text-secondary animate-thinking-breathe shrink-0" fill="currentColor" fillRule="evenodd" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z" />
        </svg>
      ) : null}

      <span className={cn('transition-opacity duration-300', isError && 'text-red-500/80')}>
        {displayText}
      </span>

      {!isError && runningIcons.length === 0 && (
        <span className="inline-flex items-center gap-[3px] ml-0.5" aria-hidden="true">
          {[0, 0.2, 0.4].map((delay, i) => (
            <span
              key={i}
              className="w-1 h-1 rounded-full bg-secondary animate-thinking-dot"
              style={{ animationDelay: `${delay}s` }}
            />
          ))}
        </span>
      )}
    </span>
  )
}
