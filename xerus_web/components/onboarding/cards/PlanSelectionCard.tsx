'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Cpu, MemoryStick, HardDrive, Check, Sparkles } from 'lucide-react'
import { PLANS, type PlanType } from '@/lib/plans'
import { cn } from '@/lib/utils'

interface PlanSelectionCardProps {
  onAction: (action: string, data: Record<string, unknown>) => void
}

const PLAN_ENTRIES: {
  id: PlanType
  description: string
  highlighted?: boolean
}[] = [
  {
    id: 'pro',
    description: 'For individuals getting started with AI agents',
  },
  {
    id: 'max',
    description: 'For power users who need more compute and credits',
    highlighted: true,
  },
  {
    id: 'ultra',
    description: 'For teams and professionals with demanding workloads',
  },
]

/* Exponential easing for natural deceleration */
const easeOutQuart = [0.25, 1, 0.5, 1] as const

export function PlanSelectionCard({ onAction }: PlanSelectionCardProps) {
  const [interval, setInterval] = useState<'monthly' | 'annual'>('monthly')
  const [selectedPlan, setSelectedPlan] = useState<PlanType | null>(null)

  const handleSelect = (planId: PlanType) => {
    setSelectedPlan(planId)
    onAction('plan-selected', { plan: planId, interval })
  }

  return (
    <div className="rounded-2xl border border-surface-active/60 bg-surface/60 p-5 max-w-[680px] space-y-5">
      {/* Header + Toggle */}
      <div className="flex items-center justify-between">
        <h3 className="font-serif text-lg text-text">Choose your plan</h3>
        <div className="flex items-center gap-2">
          <div className="bg-surface-hover p-0.5 rounded-lg flex items-center">
            <button
              onClick={() => setInterval('monthly')}
              className={cn(
                'px-3 py-1 rounded-md text-xs font-medium transition-all duration-200',
                interval === 'monthly'
                  ? 'bg-plan-highlight text-white shadow-sm'
                  : 'text-text-secondary hover:text-text'
              )}
            >
              Monthly
            </button>
            <button
              onClick={() => setInterval('annual')}
              className={cn(
                'px-3 py-1 rounded-md text-xs font-medium transition-all duration-200',
                interval === 'annual'
                  ? 'bg-plan-highlight text-white shadow-sm'
                  : 'text-text-secondary hover:text-text'
              )}
            >
              Annual
            </button>
          </div>
          {interval === 'annual' && (
            <motion.span
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.25, ease: easeOutQuart }}
              className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full"
            >
              Save 20%
            </motion.span>
          )}
        </div>
      </div>

      {/* Plan Cards — differentiated: Pro/Ultra compact, Max prominent */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.12fr_1fr] gap-3">
        {PLAN_ENTRIES.map((entry, index) => {
          const plan = PLANS[entry.id]
          const price = interval === 'monthly' ? plan.monthly : plan.annual
          const isSelected = selectedPlan === entry.id

          return (
            <motion.button
              key={entry.id}
              onClick={() => handleSelect(entry.id)}
              disabled={isSelected}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: index * 0.06, ease: easeOutQuart }}
              whileHover={!isSelected ? { y: -2, transition: { duration: 0.2, ease: easeOutQuart } } : undefined}
              whileTap={!isSelected ? { scale: 0.97 } : undefined}
              className={cn(
                'relative rounded-xl border text-left transition-all duration-200',
                entry.highlighted
                  ? 'bg-plan-highlight border-plan-highlight p-5'
                  : 'border-surface-active/60 p-4',
                isSelected && !entry.highlighted && 'ring-2 ring-primary/25 bg-surface/80',
                isSelected && entry.highlighted && 'ring-2 ring-white/20',
                !isSelected && !entry.highlighted && 'hover:border-primary/30'
              )}
            >
              {entry.highlighted && !isSelected && (
                <span className="absolute -top-2 left-3 bg-secondary text-white text-[8px] uppercase font-bold px-2 py-px rounded-full tracking-wider">
                  Popular
                </span>
              )}

              <p className={cn(
                'font-serif text-base',
                entry.highlighted ? 'text-white' : 'text-text'
              )}>{plan.label}</p>
              <div className="flex items-baseline gap-0.5 mt-1">
                <span className={cn(
                  'font-semibold',
                  entry.highlighted ? 'text-white text-[26px]' : 'text-text text-2xl'
                )}>${price}</span>
                <span className={cn(
                  'text-[10px]',
                  entry.highlighted ? 'text-white/70' : 'text-text-secondary'
                )}>/mo</span>
              </div>

              <p className={cn(
                'text-[10px] leading-relaxed mt-2 mb-3',
                entry.highlighted ? 'text-white/70' : 'text-text-secondary'
              )}>
                {entry.description}
              </p>

              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Cpu className={cn('w-3 h-3 shrink-0', entry.highlighted ? 'text-white/60' : 'text-text-muted')} />
                  <span className={cn('text-[10px]', entry.highlighted ? 'text-white/65' : 'text-text-secondary')}>{plan.vcpu} vCPU</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <MemoryStick className={cn('w-3 h-3 shrink-0', entry.highlighted ? 'text-white/60' : 'text-text-muted')} />
                  <span className={cn('text-[10px]', entry.highlighted ? 'text-white/65' : 'text-text-secondary')}>{plan.ram} GB RAM</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <HardDrive className={cn('w-3 h-3 shrink-0', entry.highlighted ? 'text-white/60' : 'text-text-muted')} />
                  <span className={cn('text-[10px]', entry.highlighted ? 'text-white/65' : 'text-text-secondary')}>{plan.disk} GB disk</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Sparkles className={cn('w-3 h-3 shrink-0', entry.highlighted ? 'text-white/60' : 'text-text-muted')} />
                  <span className={cn('text-[10px]', entry.highlighted ? 'text-white/65' : 'text-text-secondary')}>{plan.credits.toLocaleString()} bonus credits</span>
                </div>
              </div>

              <AnimatePresence>
                {isSelected && (
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: easeOutQuart }}
                    className={cn(
                      'absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center',
                      entry.highlighted ? 'bg-white' : 'bg-primary'
                    )}
                  >
                    <Check className={cn(
                      'w-3 h-3',
                      entry.highlighted ? 'text-plan-highlight' : 'text-white'
                    )} />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}
