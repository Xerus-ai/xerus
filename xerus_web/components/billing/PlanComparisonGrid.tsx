'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { Check, Cpu, MemoryStick, HardDrive } from 'lucide-react'
import { cn } from '@/lib/utils'
import { easeOutQuart } from '@/lib/motion'
import type { PlanType } from '@/lib/plans'
import type { Subscription } from '@/lib/api/billing'

interface PricingPlan {
  id: PlanType
  name: string
  description: string
  monthly: number
  annual: number
  limits: { icon: React.ElementType; text: string }[]
  features: string[]
  highlighted?: boolean
}

const PRICING_PLANS: PricingPlan[] = [
  {
    id: 'pro',
    name: 'Pro',
    description: 'For individuals getting started with AI agents',
    monthly: 19,
    annual: 15,
    limits: [
      { icon: Cpu, text: '1 vCPU' },
      { icon: MemoryStick, text: '2 GB RAM' },
      { icon: HardDrive, text: '10 GB disk' },
    ],
    features: ['500 bonus credits', 'Unlimited agents', 'BYOK (Bring Your Own Key)'],
  },
  {
    id: 'max',
    name: 'Max',
    description: 'For power users who need more compute and credits',
    monthly: 49,
    annual: 39,
    limits: [
      { icon: Cpu, text: '2 vCPU' },
      { icon: MemoryStick, text: '4 GB RAM' },
      { icon: HardDrive, text: '25 GB disk' },
    ],
    features: ['2,000 bonus credits', 'Unlimited agents', 'BYOK (Bring Your Own Key)'],
    highlighted: true,
  },
  {
    id: 'ultra',
    name: 'Ultra',
    description: 'For teams and professionals with demanding workloads',
    monthly: 149,
    annual: 119,
    limits: [
      { icon: Cpu, text: '4 vCPU' },
      { icon: MemoryStick, text: '8 GB RAM' },
      { icon: HardDrive, text: '50 GB disk' },
    ],
    features: ['10,000 bonus credits', 'Unlimited agents', 'BYOK (Bring Your Own Key)'],
  },
]

interface PlanComparisonGridProps {
  billingCycle: 'monthly' | 'annual'
  onCycleChange: (cycle: 'monthly' | 'annual') => void
  currentPlanType: string | undefined
  subscription: Subscription | null
  onPlanSelect: (planId: PlanType) => void
  loadingPlan: string | null
}

export function PlanComparisonGrid({
  billingCycle,
  onCycleChange,
  currentPlanType,
  subscription,
  onPlanSelect,
  loadingPlan,
}: PlanComparisonGridProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.1, ease: easeOutQuart }}
    >
      <div className="flex items-center justify-between mb-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
          Available Plans
        </p>
        <div className="flex items-center gap-3">
          <div
            className="bg-surface-hover p-0.5 rounded-lg flex items-center"
            role="radiogroup"
            aria-label="Billing interval"
          >
            <button
              onClick={() => onCycleChange('monthly')}
              role="radio"
              aria-checked={billingCycle === 'monthly'}
              className={cn(
                'px-3.5 py-1.5 rounded-md text-xs font-medium transition-all duration-200',
                billingCycle === 'monthly'
                  ? 'bg-plan-highlight text-white shadow-sm'
                  : 'text-text-secondary hover:text-text'
              )}
            >
              Monthly
            </button>
            <button
              onClick={() => onCycleChange('annual')}
              role="radio"
              aria-checked={billingCycle === 'annual'}
              className={cn(
                'px-3.5 py-1.5 rounded-md text-xs font-medium transition-all duration-200',
                billingCycle === 'annual'
                  ? 'bg-plan-highlight text-white shadow-sm'
                  : 'text-text-secondary hover:text-text'
              )}
            >
              Annual
            </button>
          </div>
          {billingCycle === 'annual' && (
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

      {/* Differentiated plan grid: Pro compact, Max prominent, Ultra compact */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_1.15fr_1fr] gap-3 items-start">
        {PRICING_PLANS.map((plan, index) => {
          const price = billingCycle === 'monthly' ? plan.monthly : plan.annual
          const isCurrentPlan = currentPlanType === plan.id

          return (
            <motion.div
              key={plan.id}
              className={cn(
                'relative rounded-2xl border flex flex-col transition-all duration-200',
                plan.highlighted
                  ? 'bg-plan-highlight border-plan-highlight p-7 shadow-md'
                  : 'bg-surface/60 border-surface-active/60 p-6',
                isCurrentPlan && !plan.highlighted && 'ring-2 ring-primary/20'
              )}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.14 + index * 0.07, ease: easeOutQuart }}
              whileHover={{ y: -3, transition: { duration: 0.25, ease: easeOutQuart } }}
            >
              {plan.highlighted && (
                <span className="absolute -top-2.5 left-5 bg-secondary text-white text-[9px] uppercase font-bold px-2.5 py-0.5 rounded-full tracking-wider">
                  Recommended
                </span>
              )}

              <h3 className={cn(
                'font-serif text-lg mb-1',
                plan.highlighted ? 'text-white' : 'text-text'
              )}>
                {plan.name}
              </h3>

              <div className="flex items-baseline gap-0.5 mb-2">
                <span className={cn(
                  'font-semibold',
                  plan.highlighted ? 'text-white text-[34px]' : 'text-text text-3xl'
                )}>
                  ${price}
                </span>
                <span className={cn(
                  'text-xs',
                  plan.highlighted ? 'text-white/60' : 'text-text-secondary'
                )}>/mo</span>
              </div>

              <p className={cn(
                'text-xs leading-relaxed mb-5 min-h-[32px]',
                plan.highlighted ? 'text-white/60' : 'text-text-secondary'
              )}>
                {plan.description}
              </p>

              {/* Limits */}
              <div className="space-y-2.5 mb-5">
                {plan.limits.map((limit, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <limit.icon className={cn(
                      'w-3.5 h-3.5 shrink-0',
                      plan.highlighted ? 'text-white/50' : 'text-text-secondary'
                    )} />
                    <span className={cn(
                      'text-xs',
                      plan.highlighted ? 'text-white/70' : 'text-text-secondary'
                    )}>{limit.text}</span>
                  </div>
                ))}
              </div>

              {/* CTA */}
              <button
                onClick={() => onPlanSelect(plan.id)}
                disabled={isCurrentPlan || loadingPlan === plan.id}
                aria-label={`Select ${plan.name} plan at $${price} per month`}
                className={cn(
                  'w-full py-2.5 rounded-xl text-sm font-medium transition-all duration-200 mb-5',
                  isCurrentPlan
                    ? plan.highlighted
                      ? 'bg-white/10 text-white/50 cursor-default'
                      : 'bg-surface-hover text-text-secondary cursor-default'
                    : plan.highlighted
                      ? 'bg-white text-plan-highlight hover:bg-white/90 shadow-sm'
                      : 'bg-plan-highlight text-white hover:bg-plan-highlight/80'
                )}
              >
                {loadingPlan === plan.id
                  ? 'Loading...'
                  : isCurrentPlan
                    ? 'Current plan'
                    : subscription?.subscription_status === 'active'
                      ? 'Switch plan'
                      : 'Get started'
                }
              </button>

              {/* Features */}
              <div className="flex-grow space-y-2">
                {plan.features.map((feature, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <Check
                      className={cn(
                        'w-3.5 h-3.5 shrink-0 mt-0.5',
                        plan.highlighted ? 'text-white/50' : 'text-text-secondary'
                      )}
                    />
                    <span className={cn(
                      'text-xs leading-snug',
                      plan.highlighted ? 'text-white/60' : 'text-text-secondary'
                    )}>{feature}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )
        })}
      </div>
    </motion.div>
  )
}
