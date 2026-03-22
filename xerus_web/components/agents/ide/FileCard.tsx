'use client'

import React from 'react'
import { FileText, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FileCardProps {
  fileName: string
  label: string
  description: string
  content: string | null
  isLoading: boolean
  isTemplate: boolean
  onClick: () => void
}

function getPreviewLines(content: string | null, maxLines: number = 8): string[] {
  if (!content) return []
  return content.split('\n').slice(0, maxLines)
}

function isTemplateContent(content: string): boolean {
  const templateMarkers = [
    '(calibrated during bootstrap)',
    '(learning from interactions)',
    '(no peers yet)',
    '(none)',
    '(no activity yet)',
    'completed_at: null',
  ]
  return templateMarkers.some(marker => content.includes(marker))
}

export function FileCard({
  fileName,
  label,
  description,
  content,
  isLoading,
  isTemplate,
  onClick,
}: FileCardProps) {
  const isMissing = content === null && !isLoading
  const showTemplate = !isMissing && isTemplate
  const previewLines = getPreviewLines(content)

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isLoading}
      className={cn(
        'w-full text-left rounded-2xl border transition-all duration-200 p-5 group',
        'hover:shadow-md hover:border-[#FF6600]/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6600]/40',
        isMissing
          ? 'bg-surface-alt/50 border-surface-active/50 opacity-60 cursor-default'
          : 'bg-surface border-surface-active cursor-pointer',
        isLoading && 'animate-pulse'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className={cn(
            'w-8 h-8 rounded-lg flex items-center justify-center',
            isMissing ? 'bg-surface-hover/50' : 'bg-[#FF6600]/5 group-hover:bg-[#FF6600]/10'
          )}>
            <FileText className={cn(
              'w-4 h-4',
              isMissing ? 'text-text-secondary/50' : 'text-[#FF6600]'
            )} />
          </div>
          <div>
            <h4 className={cn(
              'text-sm font-semibold',
              isMissing ? 'text-text-secondary/50' : 'text-text'
            )}>
              {fileName}
            </h4>
            <p className="text-xs text-text-secondary mt-0.5">{description}</p>
          </div>
        </div>

        {/* Badges */}
        {showTemplate && (
          <span className="text-[10px] font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200/50">
            Template
          </span>
        )}
        {isMissing && (
          <span className="text-[10px] font-medium text-text-secondary bg-surface-hover px-2 py-0.5 rounded-full flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            Not created
          </span>
        )}
      </div>

      {/* Content Preview */}
      {isLoading ? (
        <div className="space-y-2 mt-2">
          <div className="h-3 bg-surface-hover rounded w-full" />
          <div className="h-3 bg-surface-hover rounded w-3/4" />
          <div className="h-3 bg-surface-hover rounded w-1/2" />
        </div>
      ) : content ? (
        <div className="mt-2 font-mono text-xs text-text-secondary leading-relaxed overflow-hidden">
          {previewLines.map((line, i) => (
            <div key={i} className="truncate">
              {line || '\u00A0'}
            </div>
          ))}
          {content.split('\n').length > 8 && (
            <div className="text-text-muted mt-1 text-[10px]">
              +{content.split('\n').length - 8} more lines
            </div>
          )}
        </div>
      ) : isMissing ? (
        <div className="mt-2 text-xs text-text-secondary/50 italic">
          Will be created on first run
        </div>
      ) : null}
    </button>
  )
}

export { isTemplateContent }
