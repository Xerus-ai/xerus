'use client'

import { motion } from 'framer-motion'

interface ContextLifeBarProps {
  /** 0-100 percentage of context window used */
  contextUsage?: number
}

function getBarColor(usage: number): string {
  if (usage < 60) return '#4CAF50'
  if (usage < 85) return '#FFC107'
  return '#F44336'
}

export function ContextLifeBar({ contextUsage }: ContextLifeBarProps) {
  if (contextUsage == null) return null

  const color = getBarColor(contextUsage)

  return (
    <div className="w-10 h-1 bg-black/10 rounded-full overflow-hidden">
      <motion.div
        className="h-full rounded-full"
        style={{ backgroundColor: color }}
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(contextUsage, 100)}%` }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      />
    </div>
  )
}
