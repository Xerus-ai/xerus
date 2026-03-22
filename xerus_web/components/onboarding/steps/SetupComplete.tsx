'use client'

import { motion } from 'framer-motion'
import { Check, ArrowRight } from 'lucide-react'

interface SetupCompleteProps {
  workspace: string
  project: string
  onEnter: () => void
}

export function SetupComplete({ workspace, project, onEnter }: SetupCompleteProps) {
  return (
    <div className="flex flex-col items-center text-center px-6">
      {/* Animated check */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
        className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mb-6"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.5 }}
        >
          <Check className="w-8 h-8 text-green-600" />
        </motion.div>
      </motion.div>

      <motion.h2
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="font-serif text-2xl sm:text-3xl text-text"
      >
        Your AI office is ready
      </motion.h2>

      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8 }}
        className="text-sm text-text-secondary mt-3 max-w-md"
      >
        {workspace} is set up with your {project} project. You&apos;re good to go.
      </motion.p>

      <motion.button
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1 }}
        onClick={onEnter}
        className="mt-8 px-8 py-3 rounded-xl bg-[#FF6600] hover:bg-[#E65C00] text-white text-sm font-medium transition-all duration-200 flex items-center gap-2 shadow-[0_0_20px_rgba(255,102,0,0.2)] active:scale-95"
      >
        Enter your office
        <ArrowRight className="w-4 h-4" />
      </motion.button>
    </div>
  )
}
