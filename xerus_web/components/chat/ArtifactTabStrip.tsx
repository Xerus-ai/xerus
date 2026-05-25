'use client'

import { cn } from '@/lib/utils'
import {
  X,
  Sparkles,
  FileText,
  FileCode,
  Image as ImageIcon,
  File,
  Share2,
  Copy,
  Check,
  ExternalLink,
  ChevronLeft,
  Maximize2,
  MoreHorizontal,
  RefreshCw,
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
  onOpenInWorkspace?: (path: string) => void
  onClosePanel: () => void
  variant?: 'split' | 'full'
  onToggleFullView?: () => void
}

function getTabIcon(tab: ArtifactTab) {
  if (tab.kind === 'preview') return Maximize2
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
  onOpenInWorkspace,
  onClosePanel,
  variant = 'split',
  onToggleFullView,
}: ArtifactTabStripProps) {
  const activeTab = tabs.find(t => t.id === activeTabId)
  const isFileTab = activeTab?.kind === 'file'
  const filePath = isFileTab ? activeTab.id.replace('file:', '') : null
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    if (!onCopy) return
    onCopy()
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  if (variant === 'full') {
    return <FullViewToolbar
      activeTab={activeTab}
      onClosePanel={onClosePanel}
      onCopy={handleCopy}
      copied={copied}
      onPublish={onPublish}
    />
  }

  return (
    <div className="flex items-center h-10 border-b border-surface-active/40 shrink-0 bg-card px-3 gap-2">
      {/* Title — shows active tab name with icon */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        {activeTab && (() => {
          const Icon = getTabIcon(activeTab)
          return <Icon className="w-3.5 h-3.5 text-text-muted shrink-0" />
        })()}
        <span className="text-[13px] font-semibold text-text truncate">
          {activeTab?.content.title ?? 'Artifact'}
        </span>
        {activeTab?.loading && (
          <RefreshCw className="w-3 h-3 text-primary animate-spin shrink-0" />
        )}
      </div>

      {/* Actions — compact icon buttons */}
      <div className="flex items-center gap-0.5 shrink-0">
        {tabs.length > 1 && (
          <TabSwitcher
            tabs={tabs}
            activeTabId={activeTabId}
            onSelectTab={onSelectTab}
            onCloseTab={onCloseTab}
          />
        )}

        {onCopy && (
          <IconBtn onClick={handleCopy} label="Copy content">
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
          </IconBtn>
        )}

        {isFileTab && filePath && onOpenInWorkspace && (
          <IconBtn onClick={() => onOpenInWorkspace(filePath)} label="Open in workspace">
            <ExternalLink className="w-3.5 h-3.5" />
          </IconBtn>
        )}

        {onToggleFullView && (
          <IconBtn onClick={onToggleFullView} label="Expand">
            <Maximize2 className="w-3.5 h-3.5" />
          </IconBtn>
        )}

        {onPublish && (
          <button
            type="button"
            onClick={onPublish}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-secondary bg-secondary/8 hover:bg-secondary/12 transition-colors"
          >
            <Share2 className="w-3 h-3" />
            Share
          </button>
        )}

        <IconBtn onClick={onClosePanel} label="Close panel">
          <X className="w-4 h-4" />
        </IconBtn>
      </div>
    </div>
  )
}

function FullViewToolbar({
  activeTab,
  onClosePanel,
  onCopy,
  copied,
  onPublish,
}: {
  activeTab?: ArtifactTab
  onClosePanel: () => void
  onCopy?: () => void
  copied: boolean
  onPublish?: () => void
}) {
  return (
    <div className="flex items-center h-12 px-4 border-b border-surface-active/40 shrink-0 bg-card gap-3">
      {/* Back button */}
      <button
        type="button"
        onClick={onClosePanel}
        className="inline-flex items-center gap-1 px-2 h-[30px] rounded-md text-[13px] font-medium text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
        Back
      </button>

      {/* Title */}
      <span className="text-[15px] font-bold text-text flex-1 truncate">
        {activeTab?.content.title ?? 'Artifact'}
      </span>

      {/* Version selector (placeholder) */}
      <button
        type="button"
        className="inline-flex items-center gap-1 px-2 h-7 rounded-md border border-surface-active bg-surface-hover/40 text-[11px] font-medium text-text-muted hover:border-surface-pressed transition-colors tabular-nums"
      >
        v3 (latest) ▾
      </button>

      {/* Actions */}
      <div className="flex items-center gap-1">
        {onCopy && (
          <IconBtn onClick={onCopy} label="Copy">
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
          </IconBtn>
        )}
        {onPublish && (
          <button
            type="button"
            onClick={onPublish}
            className="px-2.5 py-1 rounded-md text-[11px] font-medium text-secondary bg-secondary/8 hover:bg-secondary/12 transition-colors"
          >
            Share
          </button>
        )}
        <IconBtn onClick={() => {}} label="More actions">
          <MoreHorizontal className="w-3.5 h-3.5" />
        </IconBtn>
      </div>
    </div>
  )
}

function TabSwitcher({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
}: {
  tabs: ArtifactTab[]
  activeTabId: string | null
  onSelectTab: (id: string) => void
  onCloseTab: (id: string) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <IconBtn onClick={() => setOpen(!open)} label="Switch tab">
        <span className="text-[10px] font-semibold tabular-nums">{tabs.length}</span>
      </IconBtn>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 w-52 bg-card border border-surface-active rounded-lg shadow-lg py-1">
            {tabs.map((tab) => {
              const Icon = getTabIcon(tab)
              return (
                <div
                  key={tab.id}
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors group',
                    tab.id === activeTabId ? 'bg-surface-hover' : 'hover:bg-surface-hover/60',
                  )}
                >
                  <button
                    type="button"
                    className="flex items-center gap-2 flex-1 min-w-0 text-[12px] font-medium text-text"
                    onClick={() => { onSelectTab(tab.id); setOpen(false) }}
                  >
                    <Icon className="w-3 h-3 text-text-muted shrink-0" />
                    <span className="truncate">{tab.content.title}</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onCloseTab(tab.id) }}
                    className="p-0.5 rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:bg-surface-active transition-all"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function IconBtn({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="p-1.5 rounded-md text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
    >
      {children}
    </button>
  )
}
