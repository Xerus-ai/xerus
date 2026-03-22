'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Building2, FolderOpen, MessageCircle } from 'lucide-react'

interface WorkspaceSetupCardProps {
  suggestedWorkspace?: string
  suggestedProject?: string
  onAction: (action: string, data: Record<string, any>) => void
}

function TypewriterPreview({ text, className }: { text: string; className?: string }) {
  const [displayed, setDisplayed] = useState('')

  useEffect(() => {
    if (!text) { setDisplayed(''); return }
    setDisplayed('')
    let i = 0
    const timer = setInterval(() => {
      i++
      setDisplayed(text.slice(0, i))
      if (i >= text.length) clearInterval(timer)
    }, 35)
    return () => clearInterval(timer)
  }, [text])

  return <span className={className}>{displayed || '\u00A0'}</span>
}

/**
 * Interactive workspace setup card with input fields and live tree preview.
 * Rendered inline in the conversation when Xerus asks to set up the workspace.
 */
export function WorkspaceSetupCard({
  suggestedWorkspace = '',
  suggestedProject = '',
  onAction,
}: WorkspaceSetupCardProps) {
  const [workspace, setWorkspace] = useState(suggestedWorkspace)
  const [project, setProject] = useState(suggestedProject)

  const canSubmit = workspace.trim() && project.trim()

  return (
    <div className="rounded-[24px] bg-surface/80 backdrop-blur-sm border border-surface-active p-5 space-y-4 max-w-[480px]">
      {/* Input fields */}
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-text-muted uppercase tracking-wide">
            Workspace name
          </label>
          <input
            type="text"
            value={workspace}
            onChange={(e) => setWorkspace(e.target.value)}
            placeholder="Acme Corp"
            className="mt-1 w-full bg-white/60 rounded-xl border border-surface-active px-3 py-2.5 text-sm text-text placeholder:text-text-muted outline-none focus:border-[#FF6600]/40 transition-colors"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-text-muted uppercase tracking-wide">
            First project
          </label>
          <input
            type="text"
            value={project}
            onChange={(e) => setProject(e.target.value)}
            placeholder="Content Strategy"
            className="mt-1 w-full bg-white/60 rounded-xl border border-surface-active px-3 py-2.5 text-sm text-text placeholder:text-text-muted outline-none focus:border-[#FF6600]/40 transition-colors"
          />
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-dashed border-surface-active" />

      {/* Live tree preview */}
      <div className="space-y-1 px-1">
        <AnimatePresence>
          {workspace && (
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-surface-hover"
            >
              <div className="w-6 h-6 rounded-lg bg-[#FF6600] flex items-center justify-center shrink-0">
                <Building2 className="w-3.5 h-3.5 text-white" />
              </div>
              <TypewriterPreview
                text={workspace}
                className="text-sm font-semibold text-text truncate"
              />
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {project && workspace && (
            <motion.div
              initial={{ opacity: 0, x: -8, height: 0 }}
              animate={{ opacity: 1, x: 0, height: 'auto' }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="ml-5"
            >
              <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl">
                <FolderOpen className="w-4 h-4 text-[#FF6600] shrink-0" />
                <TypewriterPreview
                  text={project}
                  className="text-sm font-medium text-text truncate"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {project && workspace && (
            <motion.div
              initial={{ opacity: 0, x: -8, height: 0 }}
              animate={{ opacity: 1, x: 0, height: 'auto' }}
              transition={{ type: 'spring', stiffness: 300, damping: 25, delay: 0.15 }}
              className="ml-10"
            >
              <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl">
                <MessageCircle className="w-3.5 h-3.5 text-text-muted shrink-0" />
                <span className="text-sm text-text-secondary"># general</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {!workspace && (
          <div className="space-y-2.5 px-3 pt-1">
            <div className="h-2.5 bg-surface-active rounded-full w-3/4" />
            <div className="h-2.5 bg-surface-active rounded-full w-1/2 ml-5" />
            <div className="h-2.5 bg-surface-active rounded-full w-2/5 ml-10" />
          </div>
        )}
      </div>

      {/* Submit */}
      <div className="flex justify-end">
        <button
          onClick={() => onAction('create-workspace', { workspace: workspace.trim(), project: project.trim() })}
          disabled={!canSubmit}
          className="px-5 py-2.5 rounded-xl bg-[#FF6600] hover:bg-[#E65C00] text-white text-sm font-medium transition-all duration-200 disabled:opacity-30 disabled:hover:bg-[#FF6600]"
        >
          Create workspace
        </button>
      </div>
    </div>
  )
}
