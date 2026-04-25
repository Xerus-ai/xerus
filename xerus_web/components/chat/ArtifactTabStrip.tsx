'use client'

import { cn } from '@/lib/utils'
import {
  X,
  Layout,
  Sparkles,
  FileText,
  FileCode,
  Image as ImageIcon,
  File,
  Share2,
  Plus,
  Copy,
  Check,
} from 'lucide-react'
import { useState } from 'react'
import type { ArtifactTab } from '@/hooks/useArtifactTabs'

interface ArtifactTabStripProps {
  tabs: ArtifactTab[]
  activeTabId: string | null
  onSelectTab: (id: string) => void
  onCloseTab: (id: string) => void
  onAddTab?: () => void
  onPublish?: () => void
  onCopy?: () => void
  onClosePanel: () => void
}

function getTabIcon(tab: ArtifactTab) {
  if (tab.kind === 'preview') return Layout
  switch (tab.content.type) {
    case 'plan':
      return Sparkles
    case 'image':
      return ImageIcon
    case 'markdown':
      return FileText
    case 'code':
    case 'csv':
      return FileCode
    default:
      return File
  }
}

export function ArtifactTabStrip({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onAddTab,
  onPublish,
  onCopy,
  onClosePanel,
}: ArtifactTabStripProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    if (!onCopy) return
    onCopy()
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className="flex items-center h-10 border-b border-border shrink-0 bg-card pl-1 pr-1.5">
      <div className="flex items-center gap-0.5 flex-1 min-w-0 overflow-x-auto scrollbar-thin">
        {tabs.map((tab) => {
          const Icon = getTabIcon(tab)
          const isActive = tab.id === activeTabId
          return (
            <div
              key={tab.id}
              data-active={isActive ? 'true' : 'false'}
              className={cn(
                'group flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-md transition-colors shrink-0 max-w-[180px]',
                isActive
                  ? 'bg-surface-hover text-text'
                  : 'text-text-muted hover:text-text hover:bg-surface-hover/60',
              )}
            >
              <button
                type="button"
                onClick={() => onSelectTab(tab.id)}
                className="flex items-center gap-1.5 min-w-0 text-xs font-medium"
                aria-current={isActive ? 'page' : undefined}
                title={tab.content.title}
              >
                <Icon className="w-3 h-3 shrink-0" />
                <span className="truncate">{tab.content.title}</span>
                {tab.loading && (
                  <span className="ml-1 inline-block w-2.5 h-2.5 rounded-full border border-primary/30 border-t-primary animate-spin shrink-0" />
                )}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onCloseTab(tab.id)
                }}
                aria-label={`Close ${tab.content.title}`}
                className={cn(
                  'p-0.5 rounded transition-opacity',
                  'hover:bg-surface-active',
                  isActive
                    ? 'opacity-70 hover:opacity-100'
                    : 'opacity-0 group-hover:opacity-70 hover:!opacity-100',
                )}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )
        })}

        {onAddTab && (
          <button
            type="button"
            onClick={onAddTab}
            className="ml-0.5 p-1.5 rounded-md text-text-muted hover:text-text hover:bg-surface-hover transition-colors shrink-0"
            aria-label="Add artifact"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-0.5 shrink-0 pl-2">
        {onCopy && (
          <button
            type="button"
            onClick={handleCopy}
            className="p-1.5 rounded-md text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
            aria-label="Copy content"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        )}

        {onPublish && (
          <button
            type="button"
            onClick={onPublish}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-primary bg-primary/10 hover:bg-primary/15 active:scale-[0.97] transition-all"
          >
            <Share2 className="w-3 h-3" />
            Publish
          </button>
        )}

        <button
          type="button"
          onClick={onClosePanel}
          className="p-1.5 rounded-md text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
          aria-label="Close panel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
