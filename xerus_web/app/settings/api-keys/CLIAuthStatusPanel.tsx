'use client'

import { useState, useEffect } from 'react'
import { Sparkles, Cpu, ExternalLink, Loader2, CheckCircle2, ArrowRight, Copy, Check } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from '@/lib/toast'
import { triggerCliLogin, completeCliLogin, getCliAuthStatus, type CliAuthStatus } from '@/lib/api/user'

interface CLIAuthStatusPanelProps {
  cliAuthStatus: CliAuthStatus | null
  onStatusChange?: (status: CliAuthStatus) => void
}

export function CLIAuthStatusPanel({ cliAuthStatus, onStatusChange }: CLIAuthStatusPanelProps) {
  const [isLoggingIn, setIsLoggingIn] = useState<'claudecode' | 'codex' | null>(null)
  // Claude: code paste flow (localhost callback can't reach sandbox)
  const [pendingAdapter, setPendingAdapter] = useState<'claudecode' | 'codex' | null>(null)
  const [authCode, setAuthCode] = useState('')
  const [isSubmittingCode, setIsSubmittingCode] = useState(false)
  // Codex: device auth flow (shows code to enter on OpenAI page)
  const [deviceCode, setDeviceCode] = useState<string | null>(null)
  const [deviceCodeCopied, setDeviceCodeCopied] = useState(false)

  const pollAuthStatus = (delayMs: number) => {
    setTimeout(async () => {
      try {
        const updated = await getCliAuthStatus()
        onStatusChange?.(updated)
      } catch { /* ignore */ }
    }, delayMs)
  }

  const handleLogin = async (adapter: 'claudecode' | 'codex') => {
    setIsLoggingIn(adapter)
    try {
      const result = await triggerCliLogin(adapter)

      if (result.deviceCode && result.authUrl) {
        // Device auth flow (Codex --device-auth): show code, open activation page
        setDeviceCode(result.deviceCode)
        window.open(result.authUrl, '_blank', 'noopener,noreferrer')
        toast.success(`Enter code ${result.deviceCode} on the opened page`, {
          description: 'Once authenticated, your status will update automatically.',
        })
        // Poll a few times since CLI auto-detects completion
        pollAuthStatus(10000)
        pollAuthStatus(20000)
        pollAuthStatus(30000)
      } else if (result.authUrl && result.needsCode) {
        // OAuth flow with code paste (Claude): open auth URL, show paste input
        window.open(result.authUrl, '_blank', 'noopener,noreferrer')
        setPendingAdapter(adapter)
        setAuthCode('')
        toast.info('Authenticate in the opened tab, then paste the code from the URL bar below.')
      } else if (result.authUrl) {
        // Auth URL opened, auto-polling
        window.open(result.authUrl, '_blank', 'noopener,noreferrer')
        toast.success('Complete login in the opened tab', {
          description: 'Once authenticated, your status will update automatically.',
        })
        pollAuthStatus(8000)
      } else {
        toast.info(result.message)
      }
    } catch {
      toast.error('Could not start login', {
        description: 'Make sure your sandbox is running by starting a chat first.',
      })
    } finally {
      setIsLoggingIn(null)
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

  const handleCopyDeviceCode = async () => {
    if (!deviceCode) return
    await navigator.clipboard.writeText(deviceCode)
    setDeviceCodeCopied(true)
    setTimeout(() => setDeviceCodeCopied(false), 2000)
  }

  const claudeAuth = cliAuthStatus?.claudecode
  const codexAuth = cliAuthStatus?.codex
  const claudeConnected = claudeAuth?.authenticated && claudeAuth.method !== 'platform'
  const codexConnected = codexAuth?.authenticated && codexAuth.method !== 'platform'

  // Clear device code when codex becomes connected
  useEffect(() => {
    if (codexConnected && deviceCode) {
      setDeviceCode(null)
    }
  }, [codexConnected, deviceCode])

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
        <div className="p-4 bg-white rounded-xl border border-surface-active/50">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 bg-gradient-to-br from-orange-50 to-amber-50 rounded-lg flex items-center justify-center border border-orange-100">
              <Sparkles className="w-4 h-4 text-orange-500" />
            </div>
            <div>
              <span className="text-sm font-medium text-text">Claude</span>
              <p className="text-[10px] text-text-secondary">Anthropic subscription</p>
            </div>
          </div>

          {claudeConnected ? (
            <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 rounded-lg border border-emerald-100">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-medium text-emerald-700">Connected</span>
              {claudeAuth?.method === 'subscription' && (
                <span className="ml-auto text-[10px] text-emerald-600">Subscription</span>
              )}
              {claudeAuth?.method === 'api' && (
                <span className="ml-auto text-[10px] text-emerald-600">API Key</span>
              )}
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

        {/* Codex login card */}
        <div className="p-4 bg-white rounded-xl border border-surface-active/50">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg flex items-center justify-center border border-green-100">
              <Cpu className="w-4 h-4 text-green-600" />
            </div>
            <div>
              <span className="text-sm font-medium text-text">Codex</span>
              <p className="text-[10px] text-text-secondary">OpenAI subscription</p>
            </div>
          </div>

          {codexConnected ? (
            <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 rounded-lg border border-emerald-100">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-medium text-emerald-700">Connected</span>
              {codexAuth?.method === 'subscription' && (
                <span className="ml-auto text-[10px] text-emerald-600">Subscription</span>
              )}
              {codexAuth?.method === 'api' && (
                <span className="ml-auto text-[10px] text-emerald-600">API Key</span>
              )}
            </div>
          ) : (
            <button
              onClick={() => handleLogin('codex')}
              disabled={isLoggingIn !== null}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-text text-white rounded-lg hover:bg-text/90 disabled:opacity-50 transition-colors text-xs font-medium"
            >
              {isLoggingIn === 'codex' ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  Login with Codex
                  <ExternalLink className="w-3 h-3 opacity-60" />
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Device code display — shown for Codex device auth flow */}
      <AnimatePresence>
        {deviceCode && !codexConnected && (
          <motion.div
            className="mt-4 p-4 bg-green-50/50 rounded-xl border border-green-200/50"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <p className="text-xs text-text-secondary mb-2">
              Enter this code on the OpenAI page that just opened:
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-4 py-2.5 bg-white rounded-lg border border-green-200 text-center text-lg font-mono font-bold tracking-widest text-green-700">
                {deviceCode}
              </code>
              <button
                onClick={handleCopyDeviceCode}
                className="flex items-center gap-1.5 px-3 py-2.5 bg-white rounded-lg border border-green-200 hover:bg-green-50 transition-colors text-xs font-medium text-text-secondary"
              >
                {deviceCodeCopied ? (
                  <Check className="w-3.5 h-3.5 text-green-600" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
            <p className="mt-2 text-[10px] text-text-secondary/70">
              Status will update automatically once you complete authentication.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Code paste input — shown for Claude OAuth flow */}
      <AnimatePresence>
        {pendingAdapter && (
          <motion.div
            className="mt-4 p-4 bg-amber-50/50 rounded-xl border border-amber-200/50"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <p className="text-xs text-text-secondary mb-2">
              After authenticating, your browser will show a page that can&#39;t load.
              Copy the <strong>full URL</strong> from the address bar and paste it below:
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={authCode}
                onChange={(e) => setAuthCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmitCode()}
                placeholder="Paste the URL or code here..."
                className="flex-1 px-3 py-2 text-xs bg-white rounded-lg border border-surface-active/50 focus:outline-none focus:ring-1 focus:ring-amber-400 focus:border-amber-400"
                disabled={isSubmittingCode}
              />
              <button
                onClick={handleSubmitCode}
                disabled={isSubmittingCode || !authCode.trim()}
                className="flex items-center gap-1.5 px-3 py-2 bg-text text-white rounded-lg hover:bg-text/90 disabled:opacity-50 transition-colors text-xs font-medium whitespace-nowrap"
              >
                {isSubmittingCode ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <>
                    Submit
                    <ArrowRight className="w-3 h-3" />
                  </>
                )}
              </button>
            </div>
            <button
              onClick={() => { setPendingAdapter(null); setAuthCode(''); }}
              className="mt-2 text-[10px] text-text-secondary/70 hover:text-text-secondary transition-colors"
            >
              Cancel
            </button>
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
