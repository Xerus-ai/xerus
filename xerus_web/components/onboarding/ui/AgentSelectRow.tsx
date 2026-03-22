'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Check } from 'lucide-react'
import { MascotAvatar } from '@/components/agents/MascotAvatar'
import { isMascotConfig } from '@/lib/mascot-config'

interface AgentTemplate {
  id: string
  name: string
  description: string
  model?: string
  avatar_url?: string
  tools?: Array<{ name: string; name_slug: string; img_src?: string }>
}

interface AgentSelectRowProps {
  agents: AgentTemplate[]
  recommended?: string[]
  onAction: (action: string, data: Record<string, any>) => void
}

/**
 * Horizontal scroll row of selectable agent cards.
 * Uses MascotAvatar for agent robots. "Hire" toggle instead of "Select".
 */
export function AgentSelectRow({
  agents,
  recommended = [],
  onAction,
}: AgentSelectRowProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set(recommended))

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleConfirm = () => {
    onAction('confirm-agents', { agentIds: Array.from(selected) })
  }

  return (
    <div className="space-y-3">
      {/* Scrollable card row — contained within parent width */}
      <div className="overflow-x-auto pb-2 scrollbar-hide">
        <div className="flex gap-3" style={{ minWidth: 'min-content' }}>
          {agents.map((agent) => {
            const isSelected = selected.has(agent.id)
            const hasMascot = isMascotConfig(agent.avatar_url)

            return (
              <motion.div
                key={agent.id}
                whileTap={{ scale: 0.97 }}
                className={`
                  shrink-0 w-[172px] rounded-[24px] p-4 cursor-pointer
                  transition-all duration-300 flex flex-col
                  ${isSelected
                    ? 'bg-surface ring-2 ring-[#FF6600] shadow-md'
                    : 'bg-surface hover:bg-surface-hover shadow-sm'
                  }
                `}
                onClick={() => toggle(agent.id)}
              >
                {/* Mascot Avatar */}
                <div className="w-12 h-12 rounded-xl overflow-hidden bg-surface-hover mb-3">
                  {hasMascot ? (
                    <MascotAvatar
                      config={agent.avatar_url!}
                      size={48}
                      className="w-full h-full"
                      alt={agent.name}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-lg font-serif text-text-muted">
                      {agent.name.charAt(0)}
                    </div>
                  )}
                </div>

                {/* Name */}
                <h4 className="font-serif text-sm text-text leading-tight line-clamp-1">
                  {agent.name}
                </h4>

                {/* Description */}
                <p className="text-[11px] text-text-secondary leading-relaxed mt-1 line-clamp-2 flex-1">
                  {agent.description}
                </p>

                {/* Tool chips */}
                {agent.tools && agent.tools.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {agent.tools.slice(0, 2).map((tool) => (
                      <span
                        key={tool.name_slug}
                        className="text-[10px] text-text-muted bg-surface-hover rounded-md px-1.5 py-0.5 leading-tight"
                      >
                        {tool.name}
                      </span>
                    ))}
                    {agent.tools.length > 2 && (
                      <span className="text-[10px] text-text-muted bg-surface-hover rounded-md px-1.5 py-0.5 leading-tight">
                        +{agent.tools.length - 2}
                      </span>
                    )}
                  </div>
                )}

                {/* Hire toggle */}
                <button
                  className={`
                    mt-3 w-full py-1.5 rounded-xl text-xs font-medium transition-all duration-200
                    flex items-center justify-center gap-1.5
                    ${isSelected
                      ? 'bg-[#FF6600] text-white'
                      : 'bg-surface-hover hover:bg-surface-pressed text-text'
                    }
                  `}
                >
                  {isSelected && <Check className="w-3 h-3" />}
                  {isSelected ? 'Hired' : 'Hire'}
                </button>
              </motion.div>
            )
          })}
        </div>
      </div>

      {/* Confirm button */}
      {selected.size > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex justify-center"
        >
          <button
            onClick={handleConfirm}
            className="px-5 py-2 rounded-xl bg-[#FF6600] hover:bg-[#E65C00] text-white text-sm font-medium transition-all duration-200 shadow-sm"
          >
            Confirm team ({selected.size} agent{selected.size !== 1 ? 's' : ''})
          </button>
        </motion.div>
      )}
    </div>
  )
}
