'use client'

import { Check, FolderOpen, Hash, Users, Mail } from 'lucide-react'

interface SummaryCardProps {
  workspace: string
  project: string
  channels: string[]
  agents: string[]
  firstDeliverable?: string
  onAction: (action: string, data: Record<string, any>) => void
}

/**
 * Final recap card showing what was created during onboarding.
 * Read-only — no interactive elements. The app transition handles the CTA.
 */
export function SummaryCard({
  workspace,
  project,
  channels,
  agents,
  firstDeliverable,
}: SummaryCardProps) {
  return (
    <div className="rounded-[24px] bg-surface/80 backdrop-blur-sm border border-surface-active p-5 max-w-[480px] space-y-3">
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-full bg-green-500/10 flex items-center justify-center">
          <Check className="w-4 h-4 text-green-600" />
        </div>
        <span className="font-serif text-lg text-text">{workspace}</span>
      </div>

      <div className="space-y-2 pl-2">
        <div className="flex items-center gap-2.5 text-sm text-text-secondary">
          <FolderOpen className="w-4 h-4 text-primary shrink-0" />
          <span>{project}</span>
        </div>

        <div className="flex items-center gap-2.5 text-sm text-text-secondary">
          <Hash className="w-4 h-4 text-text-muted shrink-0" />
          <span>{channels.join(', ')}</span>
        </div>

        <div className="flex items-center gap-2.5 text-sm text-text-secondary">
          <Users className="w-4 h-4 text-primary shrink-0" />
          <span>{agents.join(', ')}</span>
        </div>

        {firstDeliverable && (
          <div className="flex items-center gap-2.5 text-sm text-text-secondary">
            <Mail className="w-4 h-4 text-text-muted shrink-0" />
            <span>{firstDeliverable}</span>
          </div>
        )}
      </div>
    </div>
  )
}
