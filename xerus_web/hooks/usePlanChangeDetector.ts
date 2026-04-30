'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/utils/AuthContext'
import { getStatus } from '@/lib/api/workspace'
import { getCreditBalance } from '@/lib/api/user'
import type { PlanType } from '@/lib/plans'

export type PlanDrift = 'upgrade' | 'downgrade' | null

interface PlanChangeDetectorResult {
  planDrift: PlanDrift
  oldPlan: PlanType | null
  newPlan: PlanType | null
  loading: boolean
}

const PLAN_ORDER: Record<PlanType, number> = { pro: 1, max: 2, ultra: 3 }

export function usePlanChangeDetector(): PlanChangeDetectorResult {
  const { user, isAuthReady } = useAuth()
  const [planDrift, setPlanDrift] = useState<PlanDrift>(null)
  const [oldPlan, setOldPlan] = useState<PlanType | null>(null)
  const [newPlan, setNewPlan] = useState<PlanType | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isAuthReady || !user) return

    let cancelled = false

    async function detect() {
      try {
        const [status, credits] = await Promise.all([getStatus(), getCreditBalance()])

        if (cancelled) return

        const userPlan = credits.plan_type as PlanType
        const sandboxPlan = (status.sandbox_plan || null) as PlanType | null

        if (!sandboxPlan || !userPlan || sandboxPlan === userPlan) {
          setPlanDrift(null)
          setOldPlan(null)
          setNewPlan(null)
        } else {
          const direction = PLAN_ORDER[userPlan] > PLAN_ORDER[sandboxPlan] ? 'upgrade' : 'downgrade'
          setPlanDrift(direction)
          setOldPlan(sandboxPlan)
          setNewPlan(userPlan)
        }
      } catch {
        setPlanDrift(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    detect()
    return () => { cancelled = true }
  }, [isAuthReady, user])

  return { planDrift, oldPlan, newPlan, loading }
}
