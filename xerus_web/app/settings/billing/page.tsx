'use client'

import { useState, useEffect } from 'react'
import { useRedirectIfNotAuth } from '@/utils/AuthContext'
import { getCreditBalance, type CreditBalance } from '@/lib/api/user'
import {
  createCheckout,
  createCreditCheckout,
  getPortalUrl,
  getSubscription,
  getUsage,
  changePlan,
  type Subscription,
  type UsageData,
} from '@/lib/api/billing'
import { PLANS, type PlanType } from '@/lib/plans'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import { Crown, Sparkles, CreditCard, ExternalLink } from 'lucide-react'
import { toast } from '@/lib/toast'
import { easeOutQuart } from '@/lib/motion'
import { UsageDashboard } from '@/components/billing/UsageDashboard'
import { CreditTopupSection } from '@/components/billing/CreditTopupSection'
import { PlanComparisonGrid } from '@/components/billing/PlanComparisonGrid'

const PLAN_LABELS: Record<string, string> = {
  pro: 'Pro',
  max: 'Max',
  ultra: 'Ultra',
}

export default function BillingPage() {
  const user = useRedirectIfNotAuth()
  const [credits, setCredits] = useState<CreditBalance | null>(null)
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [usage, setUsage] = useState<UsageData | null>(null)
  const [billingError, setBillingError] = useState(false)
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly')
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null)
  const [loadingCredits, setLoadingCredits] = useState<number | null>(null)
  const [portalLoading, setPortalLoading] = useState(false)

  useEffect(() => {
    if (!user) return
    Promise.all([
      getCreditBalance().then(setCredits),
      getSubscription().then(setSubscription).catch((err) => {
        console.error('Failed to fetch subscription:', err)
      }),
      getUsage().then(setUsage).catch((err) => {
        console.error('Failed to fetch usage:', err)
      }),
    ]).catch((error) => {
      console.error('Failed to fetch billing data:', error)
      setBillingError(true)
    })
  }, [user])

  const handlePlanSelect = async (planId: PlanType) => {
    setLoadingPlan(planId)
    try {
      if (subscription && subscription.status === 'active' && subscription.plan_type !== planId) {
        await changePlan(planId, billingCycle)
        toast.success('Plan changed successfully')
        const updated = await getSubscription()
        setSubscription(updated)
        const updatedCredits = await getCreditBalance()
        setCredits(updatedCredits)
      } else {
        const { checkout_url } = await createCheckout(planId, billingCycle)
        window.location.href = checkout_url
      }
    } catch (error) {
      console.error('Plan selection failed:', error)
    } finally {
      setLoadingPlan(null)
    }
  }

  const handleCreditPurchase = async (creditAmount: 500 | 2000 | 5000) => {
    setLoadingCredits(creditAmount)
    try {
      const { checkout_url } = await createCreditCheckout(creditAmount)
      window.location.href = checkout_url
    } catch (error) {
      console.error('Credit purchase failed:', error)
    } finally {
      setLoadingCredits(null)
    }
  }

  const handleManageSubscription = async () => {
    setPortalLoading(true)
    try {
      const { portal_url } = await getPortalUrl()
      window.location.href = portal_url
    } catch (error) {
      console.error('Failed to open portal:', error)
    } finally {
      setPortalLoading(false)
    }
  }

  const totalCredits = credits ? PLANS[credits.plan_type as PlanType]?.credits ?? 500 : 500
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

  const formatDate = (iso: string): string => {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
  }

  return (
    <div className="max-w-[960px]">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: easeOutQuart }}
      >
        <h1 className="font-serif text-[22px] text-text tracking-tight mb-1">Billing</h1>
        <p className="text-sm text-text-secondary mb-10">Manage your plan and subscription</p>
      </motion.div>

      {billingError && (
        <motion.div
          className="bg-red-50/30 rounded-2xl border border-red-200/60 p-5 mb-6"
          role="alert"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.05, ease: easeOutQuart }}
        >
          <p className="text-sm text-red-600 font-medium">Failed to load billing data</p>
          <p className="text-xs text-red-500/80 mt-1">
            We couldn&apos;t retrieve your current plan information. Please refresh the page or try again later.
          </p>
        </motion.div>
      )}

      {/* Current Plan */}
      <motion.div
        className="bg-surface/60 rounded-2xl border border-surface-active/60 p-6 mb-4"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05, ease: easeOutQuart }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-surface-hover flex items-center justify-center">
              <Crown className="w-4 h-4 text-text-secondary" />
            </div>
            <div>
              <p className="text-sm font-medium text-text">Current plan</p>
              <p className="text-xs text-text-secondary mt-0.5">
                {credits ? PLAN_LABELS[credits.plan_type] || 'Pro' : '--'} Plan
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
              <motion.div
                className="h-full rounded-full bg-primary/70"
                initial={{ width: 0 }}
                animate={{ width: `${creditsPercent}%` }}
                transition={{ duration: 0.8, delay: 0.3, ease: easeOutQuart }}
              />
            </div>
            <p className="text-[11px] text-text-secondary">
              {formatResetDate(credits.credits_reset_date)}
            </p>
          </>
        )}
      </motion.div>

      {/* Subscription Status */}
      {subscription && (
        <motion.div
          className="bg-surface/60 rounded-2xl border border-surface-active/60 p-6 mb-12"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.08, ease: easeOutQuart }}
        >
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-text-secondary" />
                <p className="text-sm font-medium text-text">Subscription</p>
                <span className={cn(
                  'text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full',
                  subscription.status === 'active'
                    ? 'text-emerald-600 bg-emerald-50'
                    : subscription.status === 'canceled'
                      ? 'text-amber-600 bg-amber-50'
                      : 'text-red-600 bg-red-50'
                )}>
                  {subscription.status}
                </span>
              </div>
              <p className="text-xs text-text-secondary">
                {subscription.status === 'active' && !subscription.cancel_at_period_end
                  ? `Renews ${formatDate(subscription.current_period_end)}`
                  : subscription.cancel_at_period_end
                    ? `Cancels ${formatDate(subscription.current_period_end)}`
                    : `Period ends ${formatDate(subscription.current_period_end)}`
                }
              </p>
            </div>
            <button
              onClick={handleManageSubscription}
              disabled={portalLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-hover hover:bg-surface-active/60 text-sm font-medium text-text transition-all duration-200 disabled:opacity-50"
            >
              {portalLoading ? 'Loading...' : 'Manage Subscription'}
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        </motion.div>
      )}

      {!subscription && <div className="mb-12" />}

      {/* Plans Section */}
      <PlanComparisonGrid
        billingCycle={billingCycle}
        onCycleChange={setBillingCycle}
        currentPlanType={credits?.plan_type}
        subscription={subscription}
        onPlanSelect={handlePlanSelect}
        loadingPlan={loadingPlan}
      />

      {/* Credit Top-up Section */}
      <CreditTopupSection
        onPurchase={handleCreditPurchase}
        loadingCredits={loadingCredits}
      />

      {/* Usage Dashboard */}
      {usage && <UsageDashboard usage={usage} />}
    </div>
  )
}
