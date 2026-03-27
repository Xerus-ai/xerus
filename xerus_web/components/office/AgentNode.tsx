'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { AgentAvatarWithModel } from '@/components/agents/AgentAvatar'
import { useLayout } from '@/components/layout/LayoutContext'
import { ContextLifeBar } from './ContextLifeBar'
import { SleepIndicator } from './SleepIndicator'
import { ThoughtBubble } from './ThoughtBubble'
import { BusyGlow } from './BusyGlow'
import { AgentLabel } from './AgentLabel'
import type { AgentNodeState } from './office-types'

interface AgentNodeProps {
  state: AgentNodeState
  labelHidden?: boolean
}

export function AgentNode({ state, labelHidden = false }: AgentNodeProps) {
  const { agent, position } = state
  const [isHovered, setIsHovered] = useState(false)
  const { openRightPanel } = useLayout()

  const isActive = agent.status === 'active'
  const isSleeping = agent.status === 'sleeping'
  const isError = agent.status === 'error'

  const handleClick = () => {
    openRightPanel(
      <div className="p-6">
        <h3 className="font-serif text-lg text-text mb-2">{agent.name}</h3>
        <p className="text-sm text-text-secondary mb-4">
          {agent.domain} department
        </p>
        <div className="space-y-3">
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">
              Status
            </span>
            <p className="text-sm text-text mt-1">{agent.status}</p>
          </div>
          {agent.current_task && (
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">
                Current Task
              </span>
              <p className="text-sm text-text mt-1">{agent.current_task}</p>
            </div>
          )}
          {agent.next_wake && (
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">
                Next Wake
              </span>
              <p className="text-sm text-text mt-1">{agent.next_wake}</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <motion.button
      type="button"
      className="absolute flex flex-col items-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xl"
      style={{
        left: `${position.x}%`,
        top: `${position.y}%`,
        transform: 'translate(-50%, -50%)',
        zIndex: 20,
      }}
      // Animate position changes (agent slides between zones)
      animate={{
        left: `${position.x}%`,
        top: `${position.y}%`,
      }}
      transition={{
        duration: 0.8,
        ease: [0.4, 0, 0.2, 1],
      }}
      // Entry animation
      initial={{ opacity: 0, scale: 0.8 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      // Hover
      whileHover={{ scale: 1.08 }}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      aria-label={`${agent.name}: ${agent.status}`}
    >
      {/* Thought bubble (shows on hover for active agents) */}
      {isActive && (
        <ThoughtBubble task={agent.current_task} isHovered={isHovered} />
      )}

      {/* Sleep Zzz indicator */}
      {isSleeping && <SleepIndicator />}

      {/* Context life bar */}
      {/* Context menu wiring - see beads task */}
      <ContextLifeBar contextUsage={undefined} />

      {/* Agent avatar container */}
      <div className="relative">
        {/* Busy glow for active agents */}
        {isActive && <BusyGlow />}

        {/* Error glow for error agents */}
        {isError && (
          <div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              background: 'radial-gradient(circle, rgba(244,67,54,0.25) 0%, transparent 70%)',
            }}
          />
        )}

        {/* Idle bobbing wrapper */}
        <motion.div
          animate={
            !isSleeping
              ? { y: [0, -3, 0] }
              : { y: 0 }
          }
          transition={
            !isSleeping
              ? { duration: 2.8, repeat: Infinity, ease: 'easeInOut' }
              : undefined
          }
        >
          <AgentAvatarWithModel
            name={agent.name}
            avatarUrl={agent.avatar_url}
            size="lg"
            hideBadge
            className="w-14 h-14 !bg-transparent !rounded-none"
          />
        </motion.div>
      </div>

      {/* Name + status dot */}
      <AgentLabel
        name={agent.name}
        status={agent.status}
        isHidden={labelHidden}
        isHovered={isHovered}
      />
    </motion.button>
  )
}
