'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Sun, Calendar, BellOff } from 'lucide-react'

interface SchedulePickerProps {
  agentName?: string
  onAction: (action: string, data: Record<string, any>) => void
}

const SCHEDULES = [
  { value: 'daily', label: 'Every day', sub: 'Morning check-in', icon: Sun },
  { value: 'weekly', label: 'Weekly', sub: 'Monday digest', icon: Calendar },
  { value: 'on-demand', label: 'Only when I ask', sub: 'No schedule', icon: BellOff },
] as const

/**
 * Simple inline schedule picker for agent check-in frequency.
 * Single-select, fills orange on pick.
 */
export function SchedulePicker({ agentName, onAction }: SchedulePickerProps) {
  const [picked, setPicked] = useState<string | null>(null)

  const handlePick = (value: string) => {
    setPicked(value)
    onAction('set-schedule', { schedule: value, agentName })
  }

  return (
    <div className="flex flex-wrap gap-2">
      {SCHEDULES.map(({ value, label, sub, icon: Icon }) => {
        const isActive = picked === value
        return (
          <motion.button
            key={value}
            whileTap={{ scale: 0.97 }}
            onClick={() => handlePick(value)}
            className={`
              flex items-center gap-2.5 px-4 py-3 rounded-xl text-left
              transition-all duration-200 border
              ${isActive
                ? 'bg-primary text-white border-primary'
                : 'bg-surface hover:bg-surface-hover text-text border-surface-active'
              }
            `}
          >
            <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-text-secondary'}`} />
            <div>
              <div className="text-sm font-medium">{label}</div>
              <div className={`text-xs ${isActive ? 'text-white/70' : 'text-text-muted'}`}>{sub}</div>
            </div>
          </motion.button>
        )
      })}
    </div>
  )
}
