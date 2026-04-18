'use client'

import { useState } from 'react'
import { ExternalLink, Loader2, CheckCircle2, ArrowRight, ClipboardPaste, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from '@/lib/toast'
import { triggerCliLogin, completeCliLogin, getCliAuthStatus, type CliAuthStatus } from '@/lib/api/user'

interface CLIAuthStatusPanelProps {
  cliAuthStatus: CliAuthStatus | null
  onStatusChange?: (status: CliAuthStatus) => void
}

export function CLIAuthStatusPanel({ cliAuthStatus, onStatusChange }: CLIAuthStatusPanelProps) {
  const [isLoggingIn, setIsLoggingIn] = useState<'claudecode' | 'codex' | null>(null)
  const [pendingAdapter, setPendingAdapter] = useState<'claudecode' | 'codex' | null>(null)
  const [authCode, setAuthCode] = useState('')
  const [isSubmittingCode, setIsSubmittingCode] = useState(false)

  const handleLogin = async (adapter: 'claudecode' | 'codex') => {
    setIsLoggingIn(adapter)
    try {
      const result = await triggerCliLogin(adapter)
      if (result.authUrl) {
        window.open(result.authUrl, '_blank', 'noopener,noreferrer')
        if (result.needsCode) {
          setPendingAdapter(adapter)
          setAuthCode('')
          toast.info('Authenticate in the opened tab, then paste the redirect URL below.', {
            duration: 15000,
          })
        } else {
          toast.success('Complete login in the opened tab', {
            description: 'Once authenticated, your status will update automatically.',
          })
          setTimeout(async () => {
            try {
              const updated = await getCliAuthStatus()
              onStatusChange?.(updated)
            } catch { /* ignore */ }
          }, 8000)
        }
      } else {
        // Never show raw CLI output — give a clean actionable message
        toast.error('Could not extract login URL from the CLI.', {
          description: 'Try again, or use the API key option below instead.',
        })
      }
    } catch {
      toast.error('Could not start login', {
        description: 'Make sure your sandbox is running by starting a chat first.',
      })
    } finally {
      setIsLoggingIn(null)
    }
  }

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) setAuthCode(text.trim())
    } catch {
      toast.error('Could not read clipboard. Please paste manually.')
    }
  }

  const handleSubmitCode = async () => {
    if (!pendingAdapter || !authCode.trim()) return
    setIsSubmittingCode(true)
    try {
      const result = await completeCliLogin(pendingAdapter, authCode.trim())
      if (result.success) {
        toast.success(result.message)
        setPendingAdapter(null)
        setAuthCode('')
        try {
          const updated = await getCliAuthStatus()
          onStatusChange?.(updated)
        } catch { /* ignore */ }
      } else {
        toast.error(result.message)
      }
    } catch {
      toast.error('Failed to complete authentication.')
    } finally {
      setIsSubmittingCode(false)
    }
  }

  const pendingLabel = pendingAdapter === 'claudecode' ? 'Claude' : 'Codex'
  const claudeAuth = cliAuthStatus?.claudecode
  const codexAuth = cliAuthStatus?.codex
  const claudeConnected = claudeAuth?.authenticated && claudeAuth.method !== 'platform'
  const codexConnected = codexAuth?.authenticated && codexAuth.method !== 'platform'

  return (
    <motion.div
      id="cli-auth"
      className="mb-8 bg-surface/50 rounded-2xl border border-surface-active/50 p-5"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.05 }}
    >
      <div className="mb-1">
        <h2 className="text-sm font-medium text-text">Use Your Own Subscription</h2>
        <p className="text-xs text-text-secondary mt-0.5">
          Connect your Claude or OpenAI subscription to use your own billing instead of Xerus credits.
        </p>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Claude Code login card */}
        <div className="p-4 bg-card rounded-xl border border-surface-active/50">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 bg-surface rounded-lg flex items-center justify-center border border-surface-active/50 shrink-0">
              <img src="/icons/claudecode-color.svg" alt="Claude Code" className="w-5 h-5 object-contain" />
            </div>
            <div>
              <span className="text-sm font-medium text-text">Claude Code</span>
              <p className="text-[10px] text-text-secondary">Anthropic subscription</p>
            </div>
          </div>

          {claudeConnected ? (
            <div className="flex items-center gap-2 px-3 py-2 bg-success/10 rounded-lg border border-success/20">
              <CheckCircle2 className="w-4 h-4 text-success" />
              <span className="text-xs font-medium text-success">
                {claudeAuth?.method === 'subscription' ? 'Subscription' : 'API Key'}
              </span>
              <button
                onClick={() => handleLogin('claudecode')}
                className="ml-auto text-[10px] font-medium text-text bg-surface border border-surface-active rounded-md px-2 py-0.5 hover:bg-surface-hover transition-colors"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={() => handleLogin('claudecode')}
              disabled={isLoggingIn !== null}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-text text-white rounded-lg hover:bg-text/90 disabled:opacity-50 transition-colors text-xs font-medium"
            >
              {isLoggingIn === 'claudecode' ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  Login with Claude
                  <ExternalLink className="w-3 h-3 opacity-60" />
                </>
              )}
            </button>
          )}
        </div>

        {/* Codex login card - Coming Soon */}
        <div className="p-4 bg-card rounded-xl border border-surface-active/50 opacity-60">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 bg-surface rounded-lg flex items-center justify-center border border-surface-active/50 shrink-0">
              <img src="/icons/codex-color.svg" alt="Codex" className="w-5 h-5 object-contain" />
            </div>
            <div>
              <span className="text-sm font-medium text-text">Codex</span>
              <p className="text-[10px] text-text-secondary">OpenAI subscription</p>
            </div>
          </div>

          <div className="flex items-center justify-center gap-2 px-3 py-2.5 bg-surface-hover rounded-lg border border-surface-active">
            <span className="text-xs font-medium text-text-muted italic">Coming Soon</span>
          </div>
        </div>
      </div>

      {/* Paste redirect URL — shown after OAuth redirect (both Claude and Codex) */}
      <AnimatePresence>
        {pendingAdapter && (
          <motion.div
            className="mt-4 bg-card rounded-xl border border-surface-active/50 overflow-hidden"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <div>
                <h3 className="text-sm font-medium text-text">Complete {pendingLabel} Login</h3>
                <p className="text-xs text-text-secondary mt-0.5">
                  Paste the redirect URL from your browser to finish connecting.
                </p>
              </div>
              <button
                onClick={() => { setPendingAdapter(null); setAuthCode(''); }}
                className="p-1 rounded-md hover:bg-surface-active/50 transition-colors text-text-secondary"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Steps */}
            <div className="px-4 pb-3">
              <div className="flex flex-col gap-1.5 text-[11px] text-text-secondary">
                <div className="flex items-start gap-2">
                  <span className="w-4 h-4 rounded-full bg-surface-active/50 flex items-center justify-center text-[10px] font-medium text-text shrink-0 mt-px">1</span>
                  <span>Sign in on the page that just opened</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-4 h-4 rounded-full bg-surface-active/50 flex items-center justify-center text-[10px] font-medium text-text shrink-0 mt-px">2</span>
                  <span>You&#39;ll see a page that won&#39;t load — that&#39;s expected</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-4 h-4 rounded-full bg-warning/15 flex items-center justify-center text-[10px] font-medium text-warning shrink-0 mt-px">3</span>
                  <span className="font-medium text-text">Copy the full URL from the address bar and paste it below</span>
                </div>
              </div>
            </div>

            {/* Input + actions */}
            <div className="px-4 pb-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={authCode}
                  onChange={(e) => setAuthCode(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmitCode()}
                  placeholder="http://localhost:1455/auth/callback?code=..."
                  className="flex-1 px-3 py-2 text-xs bg-surface/50 rounded-lg border border-surface-active/50 focus:outline-none focus:ring-1 focus:ring-text/20 focus:border-text/30 font-mono"
                  disabled={isSubmittingCode}
                  autoFocus
                />
                <button
                  onClick={handlePasteFromClipboard}
                  disabled={isSubmittingCode}
                  className="flex items-center gap-1.5 px-3 py-2 bg-surface/50 rounded-lg border border-surface-active/50 hover:bg-surface-active/30 disabled:opacity-50 transition-colors text-xs font-medium text-text-secondary whitespace-nowrap"
                  title="Paste from clipboard"
                >
                  <ClipboardPaste className="w-3.5 h-3.5" />
                  Paste
                </button>
                <button
                  onClick={handleSubmitCode}
                  disabled={isSubmittingCode || !authCode.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-text text-white rounded-lg hover:bg-text/90 disabled:opacity-50 transition-colors text-xs font-medium whitespace-nowrap"
                >
                  {isSubmittingCode ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <>
                      Connect
                      <ArrowRight className="w-3 h-3" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Subtle note */}
      <p className="mt-3 text-[10px] text-text-secondary/70 text-center">
        No subscription? No problem — agents run on Xerus credits via OpenRouter by default.
      </p>
    </motion.div>
  )
}
