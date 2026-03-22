'use client'

import { motion } from 'framer-motion'

export function BusyGlow() {
  return (
    <motion.div
      className="absolute inset-0 rounded-full pointer-events-none"
      style={{
        background: 'radial-gradient(circle, rgba(255,102,0,0.2) 0%, transparent 70%)',
      }}
      animate={{
        opacity: [0.15, 0.35, 0.15],
        scale: [1, 1.15, 1],
      }}
      transition={{
        duration: 2,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    />
  )
}
