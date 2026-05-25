'use client'

import { useEffect, useRef } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { ExternalLink, Loader2 } from 'lucide-react'
import { syncSubscription } from '@/lib/api/billing'

interface PolarCheckoutOverlayProps {
  checkoutUrl: string
  onSuccess: () => void
  onCancel: () => void
}

/**
 * Opens Polar checkout in a new tab and shows a waiting overlay.
 * Polls syncSubscription every 3s to detect when payment completes,
 * AND detects tab close as a fallback trigger.
 */
export function PolarCheckoutOverlay({
  checkoutUrl,
  onSuccess,
  onCancel,
}: PolarCheckoutOverlayProps) {
  const shouldReduceMotion = useReducedMotion()
  const tabRef = useRef<Window | null>(null)
  const openedRef = useRef(false)
  const resolvedRef = useRef(false)

  useEffect(() => {
    if (openedRef.current) return
    openedRef.current = true
    tabRef.current = window.open(checkoutUrl, '_blank')
  }, [checkoutUrl])

  // Poll syncSubscription to detect payment completion while tab is open
  useEffect(() => {
    const interval = setInterval(async () => {
      if (resolvedRef.current) return
      try {
        const result = await syncSubscription()
        if (result.synced && result.subscription_status === 'active') {
          resolvedRef.current = true
          clearInterval(interval)
          onSuccess()
        }
      } catch {
        // Network error during poll — ignore and retry next tick
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [onSuccess])

  // Fallback: detect tab close (user may close before webhook arrives)
  useEffect(() => {
    const interval = setInterval(() => {
      if (resolvedRef.current) { clearInterval(interval); return }
      if (tabRef.current && tabRef.current.closed) {
        clearInterval(interval)
        if (!resolvedRef.current) {
          resolvedRef.current = true
          onSuccess()
        }
      }
    }, 1500)
    return () => clearInterval(interval)
  }, [onSuccess])

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Waiting for checkout"
      initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0 }}
      transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.3 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
    >
      <motion.div
        initial={shouldReduceMotion ? { scale: 1, opacity: 1 } : { scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={shouldReduceMotion ? { scale: 1, opacity: 0 } : { scale: 0.95, opacity: 0 }}
        transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
        className="relative w-full max-w-[420px] bg-white rounded-2xl shadow-2xl p-8 text-center space-y-5"
      >
        <Loader2 className="w-8 h-8 text-primary mx-auto animate-spin" />

        <div>
          <h3 className="font-serif text-lg text-gray-900">Complete your checkout</h3>
          <p className="text-sm text-gray-500 mt-1.5">
            A new tab has opened with the payment form. Come back here once you're done.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={() => {
              if (tabRef.current && !tabRef.current.closed) {
                tabRef.current.focus()
              } else {
                tabRef.current = window.open(checkoutUrl, '_blank')
              }
            }}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-white text-sm font-medium transition-colors"
          >
            Open checkout tab
            <ExternalLink className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={onCancel}
            className="px-5 py-2 rounded-xl text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Cancel
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
