'use client'

import { FileText } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ChannelDeliverablesProps {
  channelId: string
  className?: string
}

export function ChannelDeliverables({ className }: ChannelDeliverablesProps) {
  return (
    <div className={cn('flex flex-col h-full items-center justify-center gap-3', className)}>
      <FileText className="w-10 h-10 text-text-secondary/50" />
      <p className="text-sm font-medium text-text-secondary">Deliverables coming soon</p>
      <p className="text-xs text-text-muted text-center max-w-[240px]">
        Agents will be able to share files, reports, and other deliverables here.
      </p>
    </div>
  )
}
