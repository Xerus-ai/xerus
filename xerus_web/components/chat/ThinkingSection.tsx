'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Brain, ChevronRight, ChevronDown } from 'lucide-react'

interface ThinkingSectionProps {
  content: string
  defaultExpanded?: boolean
}

export function ThinkingSection({ content, defaultExpanded = false }: ThinkingSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <button
      type="button"
      onClick={() => setExpanded(!expanded)}
      className={cn(
        'w-full text-left rounded-xl border border-surface-active bg-surface-alt/50',
        'hover:bg-surface-hover/80 transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6600]'
      )}
    >
      <div className="flex items-center gap-2.5 px-3 py-2">
        <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 bg-violet-500/10 text-violet-600">
          <Brain className="w-3 h-3" />
        </div>
        <span className="text-xs font-medium text-text flex-1">Reasoning</span>
        <span className="text-[11px] text-text-muted">
          {expanded ? 'Hide' : 'Show'} thinking
        </span>
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-text-muted shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-text-muted shrink-0" />
        )}
      </div>
      {expanded && (
        <div className="px-3 pb-2.5 pt-0">
          <p className="text-[13px] leading-relaxed text-black/75 italic">
            {content}
          </p>
        </div>
      )}
    </button>
  )
}
