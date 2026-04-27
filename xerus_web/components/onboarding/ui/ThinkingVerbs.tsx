'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const MESSAGES = [
  'Confirming your subscription...',
  'Activating your workspace...',
  'Preparing your environment...',
  'Almost ready...',
]

const CYCLE_INTERVAL_MS = 2500

/* Exponential easing for natural deceleration */
const easeOutQuart = [0.25, 1, 0.5, 1] as const

/**
 * Cycles through status messages with fade transitions and a pulsing dot indicator.
 * Used during the post-checkout polling phase.
 */
export function ThinkingVerbs() {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % MESSAGES.length)
    }, CYCLE_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="flex items-center justify-center gap-3 py-8">
      {/* Pulsing dot — subtle activity indicator */}
      <motion.span
        className="w-2 h-2 rounded-full bg-primary/50"
        animate={{ opacity: [0.4, 1, 0.4], scale: [0.85, 1, 0.85] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      />
      <AnimatePresence mode="wait">
        <motion.p
          key={index}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.3, ease: easeOutQuart }}
          className="text-sm text-text-secondary font-medium"
        >
          {MESSAGES[index]}
        </motion.p>
      </AnimatePresence>
    </div>
  )
}
