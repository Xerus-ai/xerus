'use client'

import { Check } from 'lucide-react'

interface CollapsedConfirmProps {
  text: string
}

/**
 * Single-line confirmation that replaces a generative UI card after action completes.
 * e.g. "Bright Spark Agency created with Content Strategy project"
 */
export function CollapsedConfirm({ text }: CollapsedConfirmProps) {
  return (
    <div className="flex items-center gap-2 text-sm text-text-secondary">
      <Check className="w-4 h-4 text-green-600 shrink-0" />
      <span>{text}</span>
    </div>
  )
}
