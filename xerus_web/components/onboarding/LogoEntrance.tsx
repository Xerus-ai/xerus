'use client'

import { motion } from 'framer-motion'

interface LogoEntranceProps {
  phase: 'center' | 'avatar'
  onAnimationComplete?: () => void
}

/**
 * Xerus logo entrance animation.
 * 'center': Large breathing logo centered on screen (96px).
 * 'avatar': Small inline avatar for the message group (36px).
 */
export function LogoEntrance({ phase, onAnimationComplete }: LogoEntranceProps) {
  if (phase === 'center') {
    return (
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-10">
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{
            opacity: 1,
            scale: [1, 1.03, 1],
          }}
          transition={{
            opacity: { duration: 0.8, ease: 'easeOut' },
            scale: { duration: 3, repeat: Infinity, ease: 'easeInOut' },
          }}
        >
          <img
            src="/logo/xerus.svg"
            alt="Xerus"
            width={96}
            height={96}
            className="drop-shadow-lg"
          />
        </motion.div>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 200, damping: 25 }}
      onAnimationComplete={onAnimationComplete}
      className="shrink-0"
    >
      <img
        src="/logo/xerus.svg"
        alt="Xerus"
        width={36}
        height={36}
        className="drop-shadow-sm"
      />
    </motion.div>
  )
}

/**
 * Small inline avatar for agent messages after the intro group.
 */
export function XerusAvatar() {
  return (
    <div className="shrink-0 w-9 h-9">
      <img
        src="/logo/xerus.svg"
        alt="Xerus"
        width={36}
        height={36}
        className="drop-shadow-sm"
      />
    </div>
  )
}
