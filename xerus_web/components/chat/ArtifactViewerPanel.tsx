'use client'

import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { AlertCircle, Loader2, GitCompareArrows } from 'lucide-react'
import { ArtifactTabStrip } from './ArtifactTabStrip'
import {
  ArtifactContentRenderer,
  isFullBleedContent,
} from './ArtifactContentRenderer'
import { DiffRenderer } from './DiffRenderer'
import type { ArtifactTab } from '@/hooks/useArtifactTabs'

// Re-export shared types so existing imports keep working
export type { ViewerContent, ViewerContentType } from './ArtifactContentRenderer'

interface ArtifactViewerPanelProps {
  tabs: ArtifactTab[]
  activeTabId: string | null
  onSelectTab: (id: string) => void
  onCloseTab: (id: string) => void
  onClosePanel: () => void
  onAddTab?: () => void
  onPublish?: () => void
  className?: string
}

export function ArtifactViewerPanel({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onClosePanel,
  onAddTab,
  onPublish,
  className,
}: ArtifactViewerPanelProps) {
  const reduceMotion = useReducedMotion()
  const [showDiff, setShowDiff] = useState(false)
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null

  const hasDiff = !!(activeTab?.previousContent && activeTab.content.content)

  const handleCopy = () => {
    if (!activeTab) return
    const text = activeTab.content.content || activeTab.content.url || ''
    if (text) navigator.clipboard.writeText(text).catch(() => {})
  }

  const isFullBleed = activeTab ? isFullBleedContent(activeTab.content.type) : false

  return (
    <motion.div
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
      className={cn(
        'flex flex-col h-full w-full overflow-hidden',
        'bg-card border-l border-surface-active/40',
        className,
      )}
    >
      <ArtifactTabStrip
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={onSelectTab}
        onCloseTab={onCloseTab}
        onAddTab={onAddTab}
        onPublish={onPublish}
        onCopy={activeTab ? handleCopy : undefined}
        onClosePanel={onClosePanel}
      />

      {hasDiff && (
        <div className="flex items-center px-3 py-1.5 border-b border-surface-active/40 bg-surface-alt/30">
          <button
            type="button"
            onClick={() => setShowDiff(!showDiff)}
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors',
              showDiff
                ? 'bg-secondary/15 text-secondary'
                : 'text-text-muted hover:text-text hover:bg-surface-hover',
            )}
          >
            <GitCompareArrows className="w-3.5 h-3.5" />
            Diff
          </button>
        </div>
      )}

      <div
        className={cn(
          'flex-1',
          isFullBleed && !showDiff ? 'overflow-hidden' : 'overflow-y-auto scrollbar-thin',
        )}
      >
        {!activeTab ? (
          <EmptyTabState />
        ) : activeTab.error ? (
          <ErrorState message={activeTab.error} title={activeTab.content.title} />
        ) : activeTab.loading && !activeTab.content.content && !activeTab.content.url ? (
          <LoadingState title={activeTab.content.title} />
        ) : showDiff && hasDiff ? (
          <DiffRenderer
            oldContent={activeTab.previousContent!}
            newContent={activeTab.content.content!}
            language={activeTab.content.language}
          />
        ) : (
          <ArtifactContentRenderer content={activeTab.content} />
        )}
      </div>
    </motion.div>
  )
}

function EmptyTabState() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-6">
      <p className="text-sm text-text-muted">No artifact open</p>
      <p className="text-xs text-text-muted/70">Pick a deliverable to view it here</p>
    </div>
  )
}

function LoadingState({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
      <Loader2 className="w-6 h-6 text-primary animate-spin" />
      <p className="text-sm text-text-muted">
        Loading <span className="font-medium text-text">{title}</span>
      </p>
    </div>
  )
}

function ErrorState({ message, title }: { message: string; title: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
      <AlertCircle className="w-8 h-8 text-rose-500/70" />
      <p className="text-sm font-medium text-text">Couldn't load {title}</p>
      <p className="text-xs text-text-muted">{message}</p>
    </div>
  )
}
