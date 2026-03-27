'use client'

import { useState, useEffect } from 'react'
import { useRedirectIfNotAuth } from '@/utils/AuthContext'
import { getCreditBalance, type CreditBalance } from '@/lib/api/user'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import { Crown, MessageSquare, Clock, Database, Check, Sparkles } from 'lucide-react'
import { toast } from '@/lib/toast'

const PLAN_CREDITS: Record<string, number> = {
  free: 10,
  starter: 2500,
  advanced: 10000,
  prodigy: 100000,
}

const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  starter: 'Starter',
  advanced: 'Advanced',
  prodigy: 'Prodigy',
}

interface PricingPlan {
  id: string
  name: string
  description: string
  monthly: number
  yearly: number
  limits: { icon: React.ElementType; text: string }[]
  features: string[]
  highlighted?: boolean
}

const PLANS: PricingPlan[] = [
  {
    id: 'starter',
    name: 'Starter',
    description: 'For hobbyists who want agentic AI and personal projects',
    monthly: 29,
    yearly: 24,
    limits: [
      { icon: MessageSquare, text: '2,500 messages/month' },
      { icon: Clock, text: '500 minutes/month' },
      { icon: Database, text: '4M words training data' },
    ],
    features: ['1 agent instance', 'Hosted personal link', 'Embed on websites', 'Lead capture'],
  },
  {
    id: 'advanced',
    name: 'Advanced',
    description: 'For creators who want to scale across multiple channels',
    monthly: 99,
    yearly: 79,
    limits: [
      { icon: MessageSquare, text: '10,000 messages/month' },
      { icon: Clock, text: '2,000 minutes/month' },
      { icon: Database, text: '10M words training data' },
    ],
    features: ['2 agent instances', 'Brandable embeds', 'RSS feeds', 'Priority support'],
    highlighted: true,
  },
  {
    id: 'prodigy',
    name: 'Prodigy',
    description: 'For teams who use AI for content creation and workflows',
    monthly: 399,
    yearly: 319,
    limits: [
      { icon: MessageSquare, text: '100,000 messages/month' },
      { icon: Clock, text: '10,000 minutes/month' },
      { icon: Database, text: 'Unlimited training data' },
    ],
    features: [
      '5 agent instances',
      'White labeled embed',
      'Custom domain',
      'SMS/WhatsApp support',
    ],
  },
]

export default function BillingPage() {
  const user = useRedirectIfNotAuth()
  const [credits, setCredits] = useState<CreditBalance | null>(null)
  const [billingError, setBillingError] = useState(false)
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly')

  useEffect(() => {
    if (!user) return
    getCreditBalance()
      .then(setCredits)
      .catch((error) => {
        console.error('Failed to fetch billing data:', error)
        setBillingError(true)
      })
  }, [user])

  const handlePlanSelect = (planId: string) => {
    toast.info('Plan upgrades coming soon', {
      description: 'Reach out to support if you need to change your plan.',
    })
  }

  const totalCredits = credits ? PLAN_CREDITS[credits.plan_type] || 10 : 10
  const creditsPercent = credits
    ? Math.min(100, (credits.credits_available / totalCredits) * 100)
    : 0

  const formatResetDate = (iso: string): string => {
    const reset = new Date(iso)
    const now = new Date()
    const diffDays = Math.ceil((reset.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays <= 0) return 'Resets today'
    if (diffDays === 1) return 'Resets tomorrow'
    return `Resets in ${diffDays} days`
  }

  return (
    <div className="max-w-[960px]">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <h1 className="font-serif text-[22px] text-text tracking-tight mb-1">Billing</h1>
        <p className="text-sm text-text-secondary mb-8">Manage your plan and subscription</p>
      </motion.div>

      {billingError && (
        <motion.div
          className="bg-red-50/30 rounded-2xl border border-red-200/60 p-5 mb-6"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
        >
          <p className="text-sm text-red-600 font-medium">Failed to load billing data</p>
          <p className="text-xs text-red-500/80 mt-1">
            We couldn&apos;t retrieve your current plan information. Please refresh the page or try again later.
          </p>
        </motion.div>
      )}

      {/* Current Plan */}
      <motion.div
        className="bg-surface/60 rounded-2xl border border-surface-active/60 p-6 mb-10"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-surface-hover flex items-center justify-center">
              <Crown className="w-4 h-4 text-text-secondary" />
            </div>
            <div>
              <p className="text-sm font-medium text-text">Current plan</p>
              <p className="text-xs text-text-secondary mt-0.5">
                {credits ? PLAN_LABELS[credits.plan_type] || 'Free' : '--'} Plan
              </p>
            </div>
          </div>
          {credits && (
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-text-secondary" />
              <span className="text-sm font-medium text-text">
                {credits.credits_available}
              </span>
              <span className="text-sm text-text-secondary">/ {totalCredits} credits</span>
            </div>
          )}
        </div>

        {credits && (
          <>
            <div className="w-full h-1.5 bg-surface-hover rounded-full overflow-hidden mb-2">
              <div
                className="h-full rounded-full bg-primary/70 transition-all duration-500"
                style={{ width: `${creditsPercent}%` }}
              />
            </div>
            <p className="text-[11px] text-text-secondary">
              {formatResetDate(credits.credits_reset_date)}
            </p>
          </>
        )}
      </motion.div>

      {/* Plans Section */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <div className="flex items-center justify-between mb-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
            Available Plans
          </p>
          <div className="flex items-center gap-3">
            <div className="bg-surface-hover p-0.5 rounded-lg flex items-center">
              <button
                onClick={() => setBillingCycle('monthly')}
                className={cn(
                  'px-3.5 py-1.5 rounded-md text-xs font-medium transition-all duration-200',
                  billingCycle === 'monthly'
                    ? 'bg-[#261E1B] text-white shadow-sm'
                    : 'text-text-secondary hover:text-text'
                )}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingCycle('yearly')}
                className={cn(
                  'px-3.5 py-1.5 rounded-md text-xs font-medium transition-all duration-200',
                  billingCycle === 'yearly'
                    ? 'bg-[#261E1B] text-white shadow-sm'
                    : 'text-text-secondary hover:text-text'
                )}
              >
                Annual
              </button>
            </div>
            {billingCycle === 'yearly' && (
              <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                Save 20%
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PLANS.map((plan, index) => {
            const price = billingCycle === 'monthly' ? plan.monthly : plan.yearly
            const isCurrentPlan = credits?.plan_type === plan.id

            return (
              <motion.div
                key={plan.id}
                className={cn(
                  'relative bg-surface/60 rounded-2xl border p-6 flex flex-col transition-all duration-200',
                  plan.highlighted
                    ? 'border-primary/30 shadow-sm'
                    : 'border-surface-active/60',
                  isCurrentPlan && 'ring-2 ring-primary/20'
                )}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.15 + index * 0.05 }}
              >
                {plan.highlighted && (
                  <span className="absolute -top-2.5 left-5 bg-primary text-white text-[9px] uppercase font-bold px-2.5 py-0.5 rounded-full tracking-wider">
                    Recommended
                  </span>
                )}

                <h3 className="font-serif text-lg text-text mb-1">{plan.name}</h3>

                <div className="flex items-baseline gap-0.5 mb-2">
                  <span className="text-3xl font-semibold text-text">${price}</span>
                  <span className="text-xs text-text-secondary">/mo</span>
                </div>

                <p className="text-xs text-text-secondary leading-relaxed mb-5 min-h-[32px]">
                  {plan.description}
                </p>

                {/* Limits */}
                <div className="space-y-2.5 mb-5">
                  {plan.limits.map((limit, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <limit.icon className="w-3.5 h-3.5 text-text-secondary shrink-0" />
                      <span className="text-xs text-text-secondary">{limit.text}</span>
                    </div>
                  ))}
                </div>

                {/* CTA */}
                <button
                  onClick={() => handlePlanSelect(plan.id)}
                  disabled={isCurrentPlan}
                  className={cn(
                    'w-full py-2.5 rounded-xl text-sm font-medium transition-all duration-200 mb-5',
                    isCurrentPlan
                      ? 'bg-surface-hover text-text-secondary cursor-default'
                      : plan.highlighted
                        ? 'bg-primary text-white hover:bg-primary/90 shadow-sm'
                        : 'bg-[#261E1B] text-white hover:bg-[#1a1412]'
                  )}
                >
                  {isCurrentPlan ? 'Current plan' : 'Get started'}
                </button>

                {/* Features */}
                <div className="flex-grow space-y-2">
                  {plan.features.map((feature, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <Check
                        className={cn(
                          'w-3.5 h-3.5 shrink-0 mt-0.5',
                          plan.highlighted ? 'text-primary' : 'text-text-secondary'
                        )}
                      />
                      <span className="text-xs text-text-secondary leading-snug">{feature}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )
          })}
        </div>
      </motion.div>
    </div>
  )
}
