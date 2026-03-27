'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { ExecutionState } from './types'

type AnimationPhase = 'idle' | 'active' | 'settling'

const AMBIENT_VERBS = [
  'thinking...',
  'pondering...',
  'considering...',
  'working on it...',
  'mulling this over...',
]

const VERB_CYCLE_MS = 3500
const MIN_VERB_DISPLAY_MS = 800

function resolvePhaseVerb(phase: string | undefined): string | null {
  if (!phase) return null
  const p = phase.toLowerCase()
  if (p.includes('workspace') || p.includes('scaffold') || p.includes('setup')) return 'preparing workspace...'
  if (p.includes('plan')) return 'crafting a plan...'
  if (p.includes('analyz') || p.includes('assess')) return 'analyzing your request...'
  if (p.includes('generat') || p.includes('complet')) return 'generating a response...'
  if (p.includes('verif') || p.includes('review')) return 'verifying results...'
  return null
}

function resolveVerb(
  executionState: ExecutionState | null | undefined,
): { verb: string; phase: AnimationPhase } {
  // Error state
  if (executionState?.error) {
    return { verb: 'ran into a problem...', phase: 'idle' }
  }

  // Coordinated / delegation
  if (executionState?.mode === 'coordinated' && executionState.agents?.length) {
    const agentName = executionState.agents[executionState.agents.length - 1]
    return { verb: `coordinating with ${agentName}...`, phase: 'active' }
  }

  // Progress phase
  const activeStep = executionState?.steps?.find((s) => s.status === 'active')
  const phaseVerb = resolvePhaseVerb(activeStep?.name)
  if (phaseVerb) {
    return { verb: phaseVerb, phase: 'active' }
  }

  // Settling (verification/generation steps)
  if (executionState?.completedSteps && executionState.totalSteps &&
      executionState.completedSteps >= executionState.totalSteps - 1) {
    return { verb: 'wrapping up...', phase: 'settling' }
  }

  // Fallback: ambient cycling
  return { verb: '', phase: 'idle' }
}

function ThinkingDots({ phase }: { phase: AnimationPhase }) {
  const animClass =
    phase === 'active'
      ? 'animate-thinking-active'
      : phase === 'settling'
        ? 'animate-thinking-settle'
        : 'animate-thinking-dot'

  return (
    <span className="inline-flex items-center gap-[3px] ml-0.5" aria-hidden="true">
      {[0, 0.2, 0.4].map((delay, i) => (
        <span
          key={i}
          className={cn('w-1 h-1 rounded-full bg-primary', animClass)}
          style={{ animationDelay: `${delay}s` }}
        />
      ))}
    </span>
  )
}

interface ThinkingIndicatorProps {
  executionState?: ExecutionState | null
}

export function ThinkingIndicator({
  executionState,
}: ThinkingIndicatorProps) {
  const [ambientIndex, setAmbientIndex] = useState(0)
  const [displayVerb, setDisplayVerb] = useState('thinking...')
  const [displayPhase, setDisplayPhase] = useState<AnimationPhase>('idle')
  const lastVerbChangeRef = useRef(Date.now())

  const { verb: resolvedVerb, phase: resolvedPhase } = useMemo(
    () => resolveVerb(executionState),
    [executionState],
  )

  // Ambient verb cycling (only when fallback is active)
  useEffect(() => {
    if (resolvedVerb !== '') return
    const interval = setInterval(() => {
      setAmbientIndex((prev) => (prev + 1) % AMBIENT_VERBS.length)
    }, VERB_CYCLE_MS)
    return () => clearInterval(interval)
  }, [resolvedVerb])

  // Apply resolved verb with minimum display time to prevent flashing
  useEffect(() => {
    const target = resolvedVerb || AMBIENT_VERBS[ambientIndex]
    const elapsed = Date.now() - lastVerbChangeRef.current

    if (elapsed < MIN_VERB_DISPLAY_MS) {
      const timer = setTimeout(() => {
        setDisplayVerb(target)
        setDisplayPhase(resolvedPhase)
        lastVerbChangeRef.current = Date.now()
      }, MIN_VERB_DISPLAY_MS - elapsed)
      return () => clearTimeout(timer)
    }

    setDisplayVerb(target)
    setDisplayPhase(resolvedPhase)
    lastVerbChangeRef.current = Date.now()
  }, [resolvedVerb, resolvedPhase, ambientIndex])

  const isError = executionState?.error

  return (
    <span className="inline-flex items-center gap-1.5 text-[14px] text-text-secondary">
      {!isError && (
        <svg className="w-3.5 h-3.5 text-primary animate-thinking-breathe shrink-0" fill="currentColor" fillRule="evenodd" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z" />
        </svg>
      )}
      <span className={cn(
        'transition-opacity duration-300',
        isError && 'text-red-500/80',
      )}>
        {displayVerb}
      </span>
      {!isError && <ThinkingDots phase={displayPhase} />}
    </span>
  )
}
