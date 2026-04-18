'use client'

import { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

interface ThoughtBubbleProps {
  task: string | undefined
  isHovered: boolean
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + '\u2026' : text
}

export function ThoughtBubble({ task, isHovered }: ThoughtBubbleProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (isHovered && task) {
      setVisible(true)
      const timer = setTimeout(() => setVisible(false), 5000)
      return () => clearTimeout(timer)
    }
    setVisible(false)
  }, [isHovered, task])

  return (
    <AnimatePresence>
      {visible && task && (
        <motion.div
          className="absolute -top-10 left-1/2 -translate-x-1/2 z-10 whitespace-nowrap"
          initial={{ opacity: 0, y: 4, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4, scale: 0.95 }}
          transition={{ duration: 0.2 }}
        >
          <div className="bg-card border border-surface-active shadow-sm rounded-xl px-2.5 py-1 text-[10px] text-text-secondary max-w-[160px] truncate">
            {truncate(task, 50)}
          </div>
          {/* Bubble tail */}
          <div className="w-2 h-2 bg-card border-b border-r border-surface-active rotate-45 absolute -bottom-1 left-1/2 -translate-x-1/2" />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
