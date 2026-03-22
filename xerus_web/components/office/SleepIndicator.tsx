'use client'

import { motion } from 'framer-motion'

export function SleepIndicator() {
  return (
    <motion.span
      className="absolute -top-4 left-1/2 -translate-x-1/2 text-xs font-bold text-gray-400 select-none pointer-events-none"
      animate={{
        y: [0, -6, 0],
        opacity: [0.9, 0.5, 0.9],
      }}
      transition={{
        duration: 1.6,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    >
      Zzz
    </motion.span>
  )
}
