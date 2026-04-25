'use client'

import { useState } from 'react'
import { RefreshCw, ChevronRight, AlertTriangle, Check, ChevronDown, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { syncTemplate, type TemplateSyncResult } from '@/lib/api/workspace'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'

type Status = 'idle' | 'confirming' | 'previewing' | 'previewed' | 'applying'

interface SyncTemplateActionProps {
  disabled: boolean
}

export function SyncTemplateAction({ disabled }: SyncTemplateActionProps) {
  const [status, setStatus] = useState<Status>('idle')
  const [preview, setPreview] = useState<TemplateSyncResult | null>(null)

  const reset = () => {
    setStatus('idle')
    setPreview(null)
  }

  const handlePreview = async () => {
    setStatus('previewing')
    try {
      const result = await syncTemplate(true)
      setPreview(result)
      setStatus('previewed')
    } catch {
      toast.error("Couldn't preview the sync", { description: 'Please try again.' })
      setStatus('confirming')
    }
  }

  const handleApply = async () => {
    setStatus('applying')
    try {
      const result = await syncTemplate(false)
      const updated = result.updatedPaths.length
      const skipped = result.skippedPaths.length
      toast.success('Workspace template synced', {
        description: `${updated} ${updated === 1 ? 'path' : 'paths'} updated${skipped ? `, ${skipped} skipped` : ''}.`,
      })
      reset()
    } catch {
      toast.error("Couldn't sync the template", {
        description: 'Your sandbox may still be starting up. Please try again.',
      })
      setStatus(preview ? 'previewed' : 'confirming')
    }
  }

  if (status === 'idle') {
    return (
      <button
        onClick={() => setStatus('confirming')}
        disabled={disabled}
        className="flex items-center w-full px-5 py-4 hover:bg-surface-hover/40 transition-colors disabled:opacity-40 text-left group"
      >
        <div className="w-8 h-8 rounded-lg bg-surface-hover flex items-center justify-center mr-3 shrink-0">
          <RefreshCw className="w-4 h-4 text-text-secondary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text">Sync from Template</p>
          <p className="text-xs text-text-secondary mt-0.5">
            Pull the latest platform files (skills, hooks, marketplace)
          </p>
        </div>
        <ChevronRight className="w-4 h-4 text-text-secondary/50 group-hover:text-text-secondary transition-colors shrink-0" />
      </button>
    )
  }

  return (
    <AnimatePresence>
      <motion.div
        key="sync-confirm"
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
        className="border-l-2 border-primary/30"
      >
        <div className="px-5 py-4">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center mr-0 shrink-0">
              <RefreshCw className={cn('w-4 h-4 text-primary', (status === 'previewing' || status === 'applying') && 'animate-spin')} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text">Sync from Template</p>
              <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                Updates platform files only:{' '}
                <span className="font-mono text-text">.claude/</span>,{' '}
                <span className="font-mono text-text">.xerus/</span>,{' '}
                <span className="font-mono text-text">marketplace/</span>, root{' '}
                <span className="font-mono text-text">CLAUDE.md</span>, and platform agents.
                Your documents, custom agents, projects, and memory stay as they are.
              </p>
            </div>
            <button
              type="button"
              onClick={reset}
              disabled={status === 'previewing' || status === 'applying'}
              aria-label="Cancel sync"
              className="p-1 rounded-md text-text-muted hover:text-text hover:bg-surface-hover transition-colors disabled:opacity-40 shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {preview && (
            <PreviewList result={preview} />
          )}

          {!preview && status !== 'previewing' && (
            <div className="flex items-start gap-2 px-3 py-2 mb-3 rounded-lg bg-amber-500/8 border border-amber-500/20">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed">
                Tip: preview the changes first to see exactly which paths will be replaced.
              </p>
            </div>
          )}

          <div className="flex items-center gap-2 mt-3">
            {!preview ? (
              <button
                onClick={handlePreview}
                disabled={status === 'previewing'}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-surface-hover text-text hover:bg-surface-pressed transition-colors disabled:opacity-50"
              >
                {status === 'previewing' ? (
                  <>
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    Loading preview...
                  </>
                ) : (
                  'Preview changes'
                )}
              </button>
            ) : null}

            <button
              onClick={handleApply}
              disabled={status === 'applying' || status === 'previewing'}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-white hover:bg-primary/90 active:scale-[0.97] transition-all disabled:opacity-50"
            >
              {status === 'applying' ? (
                <>
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  Syncing...
                </>
              ) : preview ? (
                <>
                  <Check className="w-3 h-3" />
                  Apply {preview.updatedPaths.length} {preview.updatedPaths.length === 1 ? 'change' : 'changes'}
                </>
              ) : (
                'Apply now'
              )}
            </button>

            <button
              onClick={reset}
              disabled={status === 'previewing' || status === 'applying'}
              className="ml-auto px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

// ---------------------------------------------------------------------------
// PreviewList — collapsible list of paths that will change
// ---------------------------------------------------------------------------

function PreviewList({ result }: { result: TemplateSyncResult }) {
  const [expanded, setExpanded] = useState(true)
  const totalPaths = result.updatedPaths.length + result.skippedPaths.length

  if (totalPaths === 0) {
    return (
      <p className="text-xs text-text-secondary px-3 py-2 mb-3 rounded-lg bg-surface-hover/50">
        Template repo has no platform paths to sync.
      </p>
    )
  }

  return (
    <div className="mb-3 rounded-lg border border-surface-active/60 bg-surface/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="flex items-center w-full px-3 py-2 text-left hover:bg-surface-hover/40 transition-colors"
      >
        <span className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary flex-1">
          {result.updatedPaths.length} {result.updatedPaths.length === 1 ? 'path' : 'paths'} will be replaced
          {result.skippedPaths.length > 0 && (
            <span className="ml-2 text-text-muted/70 normal-case font-normal">
              {result.skippedPaths.length} missing in template
            </span>
          )}
        </span>
        <ChevronDown
          className={cn(
            'w-3.5 h-3.5 text-text-muted transition-transform shrink-0',
            !expanded && '-rotate-90',
          )}
        />
      </button>

      {expanded && (
        <ul className="px-3 py-2 space-y-0.5 max-h-48 overflow-y-auto scrollbar-thin border-t border-surface-active/40">
          {result.updatedPaths.map((p) => (
            <li key={`u-${p}`} className="flex items-center gap-1.5 text-[11px] font-mono text-text-secondary">
              <Check className="w-3 h-3 text-emerald-500 shrink-0" />
              {p}
            </li>
          ))}
          {result.skippedPaths.map((p) => (
            <li key={`s-${p}`} className="flex items-center gap-1.5 text-[11px] font-mono text-text-muted/70 line-through">
              <X className="w-3 h-3 shrink-0" />
              {p}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
