'use client'

import { useState, useCallback } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { AlertCircle, Loader2, GitCompareArrows, Check, X as XIcon, MessageSquare } from 'lucide-react'
import { ArtifactTabStrip } from './ArtifactTabStrip'
import {
  ArtifactContentRenderer,
  isFullBleedContent,
} from './ArtifactContentRenderer'
import { DiffRenderer } from './DiffRenderer'
import { ArtifactSidebar } from './ArtifactSidebar'
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
  onOpenInWorkspace?: (path: string) => void
  onSendMessage?: (message: string) => void
  variant?: 'split' | 'full'
  onToggleFullView?: () => void
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
  onOpenInWorkspace,
  onSendMessage,
  variant = 'split',
  onToggleFullView,
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
  const isFull = variant === 'full'

  const mainContent = (
    <div className={cn('flex flex-col flex-1 min-w-0 min-h-0')}>
      <ArtifactTabStrip
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={onSelectTab}
        onCloseTab={onCloseTab}
        onAddTab={onAddTab}
        onPublish={onPublish}
        onCopy={activeTab ? handleCopy : undefined}
        onOpenInWorkspace={onOpenInWorkspace}
        onClosePanel={onClosePanel}
        variant={variant}
        onToggleFullView={onToggleFullView}
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

      {activeTab?.content.type === 'plan' && onSendMessage && (
        <PlanActionBar
          title={activeTab.content.title}
          onSendMessage={onSendMessage}
        />
      )}
    </div>
  )

  return (
    <motion.div
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
      className={cn(
        'flex h-full w-full overflow-hidden',
        isFull ? 'flex-row' : 'flex-col',
        'bg-card border-l border-surface-active/40',
        className,
      )}
    >
      {mainContent}

      {isFull && (
        <ArtifactSidebar
          versions={[]}
          comments={[]}
          className="w-[320px] shrink-0"
        />
      )}
    </motion.div>
  )
}

function PlanActionBar({ title, onSendMessage }: { title: string; onSendMessage: (msg: string) => void }) {
  const [showFeedback, setShowFeedback] = useState(false)
  const [feedback, setFeedback] = useState('')

  const handleAccept = useCallback(() => {
    onSendMessage(`Plan approved: ${title}`)
  }, [onSendMessage, title])

  const handleReject = useCallback(() => {
    const msg = feedback
      ? `Plan rejected: ${title}. Feedback: ${feedback}`
      : `Plan rejected: ${title}`
    onSendMessage(msg)
    setFeedback('')
    setShowFeedback(false)
  }, [onSendMessage, title, feedback])

  return (
    <div className="border-t border-surface-active/40 bg-surface-alt/50 px-4 py-3">
      {showFeedback ? (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Describe changes needed..."
            className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-surface-active bg-surface text-text placeholder:text-text-muted focus:outline-none focus:border-primary/30"
            onKeyDown={(e) => { if (e.key === 'Enter') handleReject() }}
            autoFocus
          />
          <button
            type="button"
            onClick={handleReject}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-rose-500/10 text-rose-600 hover:bg-rose-500/20 transition-colors"
          >
            Send
          </button>
          <button
            type="button"
            onClick={() => setShowFeedback(false)}
            className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
          >
            <XIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleAccept}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 transition-colors"
          >
            <Check className="w-3.5 h-3.5" />
            Accept
          </button>
          <button
            type="button"
            onClick={() => setShowFeedback(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-rose-500/10 text-rose-600 hover:bg-rose-500/20 transition-colors"
          >
            <XIcon className="w-3.5 h-3.5" />
            Reject
          </button>
          <button
            type="button"
            onClick={() => setShowFeedback(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-surface-active text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Request changes
          </button>
        </div>
      )}
    </div>
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
