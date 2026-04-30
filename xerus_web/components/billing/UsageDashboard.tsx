'use client'

import { motion } from 'framer-motion'
import { BarChart3, Bot } from 'lucide-react'
import { easeOutQuart, staggerContainer, staggerItem } from '@/lib/motion'
import type { UsageData } from '@/lib/api/billing'

interface UsageDashboardProps {
  usage: UsageData
}

export function UsageDashboard({ usage }: UsageDashboardProps) {
  if (usage.by_agent.length === 0 && usage.by_day.length === 0) {
    return null
  }

  return (
    <motion.div
      className="mt-14"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.35, ease: easeOutQuart }}
    >
      <div className="flex items-center gap-2 mb-5">
        <BarChart3 className="w-4 h-4 text-text-secondary" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
          Usage This Period
        </p>
      </div>

      <motion.div
        className="grid grid-cols-1 md:grid-cols-2 gap-4"
        variants={staggerContainer}
        initial="hidden"
        animate="show"
      >
        {/* By Agent */}
        {usage.by_agent.length > 0 && (
          <motion.div
            className="bg-surface/60 rounded-2xl border border-surface-active/60 p-5"
            variants={staggerItem}
          >
            <p className="text-xs font-medium text-text-secondary mb-4">By Agent</p>
            <div className="space-y-3">
              {(() => {
                const maxAgentCredits = Math.max(...usage.by_agent.map(a => a.credits), 1)
                return usage.by_agent.map((agent, agentIndex) => {
                const barWidth = Math.max(4, (agent.credits / maxAgentCredits) * 100)
                return (
                  <motion.div
                    key={agent.agent_slug}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.35, delay: 0.4 + agentIndex * 0.05, ease: easeOutQuart }}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <Bot className="w-3 h-3 text-text-muted" />
                        <span className="text-xs text-text truncate max-w-[140px]">
                          {agent.agent_slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                        </span>
                      </div>
                      <span className="text-xs font-medium text-text tabular-nums">
                        {Math.round(agent.credits)}
                      </span>
                    </div>
                    <div className="h-2 bg-surface-hover rounded-full overflow-hidden">
                      <motion.div
                        className="h-full rounded-full bg-primary/60"
                        initial={{ width: 0 }}
                        animate={{ width: `${barWidth}%` }}
                        transition={{ duration: 0.6, delay: 0.5 + agentIndex * 0.05, ease: easeOutQuart }}
                      />
                    </div>
                  </motion.div>
                )
              })
              })()}
            </div>
          </motion.div>
        )}

        {/* By Day */}
        {usage.by_day.length > 0 && (
          <motion.div
            className="bg-surface/60 rounded-2xl border border-surface-active/60 p-5"
            variants={staggerItem}
          >
            <p className="text-xs font-medium text-text-secondary mb-4">By Day</p>
            <div className="flex items-end gap-1.5 h-[120px]">
              {(() => {
                const maxDayCredits = Math.max(...usage.by_day.map(d => d.credits), 1)
                return usage.by_day.map((day, dayIndex) => {
                const barHeight = Math.max(6, (day.credits / maxDayCredits) * 100)
                const dateLabel = new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                return (
                  <div key={day.date} className="flex-1 flex flex-col items-center justify-end h-full group">
                    <div className="relative">
                      <div className="absolute -top-7 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 text-[10px] text-text font-medium whitespace-nowrap bg-surface-alt border border-surface-active rounded-lg px-2 py-1 shadow-sm pointer-events-none">
                        {Math.round(day.credits)}
                      </div>
                    </div>
                    <motion.div
                      className="w-full rounded-md bg-primary/40 group-hover:bg-primary/65 transition-colors duration-200 min-w-[8px]"
                      initial={{ height: 0 }}
                      animate={{ height: `${barHeight}%` }}
                      transition={{ duration: 0.5, delay: 0.45 + dayIndex * 0.03, ease: easeOutQuart }}
                    />
                    <span className="text-[9px] text-text-muted mt-2 truncate w-full text-center">
                      {dateLabel}
                    </span>
                  </div>
                )
              })
              })()}
            </div>
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  )
}
