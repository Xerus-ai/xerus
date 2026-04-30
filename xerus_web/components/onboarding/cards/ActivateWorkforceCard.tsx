'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Key, Sparkles, ArrowRight } from 'lucide-react'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { easeOutQuart } from '@/lib/motion'

type Provider = 'claudecode' | 'codex' | 'openrouter' | 'skip'

interface ActivateWorkforceCardProps {
  onAction: (action: string, data: Record<string, unknown>) => void
}

export function ActivateWorkforceCard({ onAction }: ActivateWorkforceCardProps) {
  const [openRouterKey, setOpenRouterKey] = useState('')
  const [showKeyInput, setShowKeyInput] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [hoveredProvider, setHoveredProvider] = useState<string | null>(null)

  const handleOpenRouterSubmit = () => {
    if (!openRouterKey.trim()) return
    setSubmitting(true)
    onAction('provider-selected', { provider: 'openrouter', key: openRouterKey.trim() })
  }

  return (
    <div className="rounded-2xl border border-surface-active/60 bg-surface/60 p-5 max-w-[480px] space-y-5">
      <div>
        <h3 className="font-serif text-lg text-text">Connect your AI provider</h3>
        <p className="text-xs text-text-secondary mt-1.5 leading-relaxed">
          Bring your own key for unlimited usage, or skip to use your bonus credits. You can always configure this later in Settings &gt; API Keys.
        </p>
      </div>

      <div className="space-y-2">
        {/* Claude Code — configure in settings */}
        <motion.button
          onClick={() => {
            setSubmitting(true)
            onAction('provider-selected', { provider: 'claudecode' })
          }}
          disabled={submitting}
          onMouseEnter={() => setHoveredProvider('claude')}
          onMouseLeave={() => setHoveredProvider(null)}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: easeOutQuart }}
          whileHover={{ y: -1, transition: { duration: 0.2, ease: easeOutQuart } }}
          whileTap={{ scale: 0.98 }}
          className="w-full flex items-center gap-3.5 px-4 py-4 rounded-xl border border-[#D97757]/20 bg-[#D97757]/[0.04] hover:bg-[#D97757]/[0.07] hover:border-[#D97757]/30 transition-all duration-200 text-left group disabled:opacity-50"
        >
          <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shrink-0 shadow-sm">
            <Image src="/icons/claudecode-color.svg" alt="Claude Code" width={24} height={24} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text">Use Claude Code</p>
            <p className="text-[10px] text-text-secondary mt-0.5">Set up your Anthropic key in Settings after onboarding</p>
          </div>
          <motion.div
            animate={{ x: hoveredProvider === 'claude' ? 3 : 0 }}
            transition={{ duration: 0.2, ease: easeOutQuart }}
          >
            <ArrowRight className="w-4 h-4 text-text-muted group-hover:text-[#D97757]/60 transition-colors shrink-0" />
          </motion.div>
        </motion.button>

        {/* Codex — coming soon */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.06, ease: easeOutQuart }}
          className="relative w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl border border-dashed border-surface-active/50 bg-surface-hover/30"
        >
          <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shrink-0 shadow-sm opacity-50">
            <Image src="/icons/codex-color.svg" alt="Codex" width={24} height={24} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-text-muted">Use OpenAI Codex</p>
              <span className="text-[9px] font-semibold uppercase tracking-wider text-text-muted bg-surface-active/60 px-1.5 py-px rounded-full">
                Soon
              </span>
            </div>
            <p className="text-[10px] text-text-muted mt-0.5">Configure OpenAI key in Settings</p>
          </div>
        </motion.div>

        {/* OpenRouter key */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.12, ease: easeOutQuart }}
        >
          <AnimatePresence mode="wait">
            {!showKeyInput ? (
              <motion.button
                key="openrouter-trigger"
                onClick={() => setShowKeyInput(true)}
                disabled={submitting}
                onMouseEnter={() => setHoveredProvider('openrouter')}
                onMouseLeave={() => setHoveredProvider(null)}
                whileHover={{ y: -1, transition: { duration: 0.2, ease: easeOutQuart } }}
                whileTap={{ scale: 0.98 }}
                exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.15 } }}
                className="w-full flex items-center gap-3.5 px-4 py-4 rounded-xl border border-surface-active/60 bg-surface hover:border-purple-400/25 transition-all duration-200 text-left group disabled:opacity-50"
              >
                <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shrink-0 shadow-sm">
                  <Image src="/icons/openrouter.svg" alt="OpenRouter" width={24} height={24} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text">Paste OpenRouter key</p>
                  <p className="text-[10px] text-text-secondary mt-0.5">Use your own API key for all models</p>
                </div>
                <motion.div
                  animate={{ x: hoveredProvider === 'openrouter' ? 3 : 0 }}
                  transition={{ duration: 0.2, ease: easeOutQuart }}
                >
                  <ArrowRight className="w-4 h-4 text-text-muted group-hover:text-purple-400/60 transition-colors shrink-0" />
                </motion.div>
              </motion.button>
            ) : (
              <motion.div
                key="openrouter-input"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.25, ease: easeOutQuart }}
                className="rounded-xl border border-surface-active/60 bg-surface p-4 space-y-3"
              >
                <input
                  type="password"
                  value={openRouterKey}
                  onChange={(e) => setOpenRouterKey(e.target.value)}
                  placeholder="sk-or-..."
                  autoFocus
                  className="w-full bg-card/60 rounded-xl border border-surface-active px-3 py-2.5 text-sm text-text placeholder:text-text-muted outline-none focus:border-primary/40 transition-colors"
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowKeyInput(false)}
                    className="px-3 py-2 rounded-lg text-xs font-medium text-text-secondary hover:text-text transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleOpenRouterSubmit}
                    disabled={!openRouterKey.trim() || submitting}
                    className="flex-1 px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white text-sm font-medium transition-all duration-200 disabled:opacity-30"
                  >
                    {submitting ? 'Connecting...' : 'Connect'}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Skip option */}
      <motion.div
        className="border-t border-dashed border-surface-active pt-3"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.35, delay: 0.2, ease: easeOutQuart }}
      >
        <button
          onClick={() => onAction('provider-selected', { provider: 'skip' })}
          disabled={submitting}
          className={cn(
            'flex items-center gap-2 text-xs text-text-secondary hover:text-text transition-colors disabled:opacity-50',
          )}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Skip for now — use bonus credits</span>
        </button>
      </motion.div>
    </div>
  )
}
