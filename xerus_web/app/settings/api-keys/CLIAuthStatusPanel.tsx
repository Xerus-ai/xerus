'use client'

import { useState } from 'react'
import { Sparkles, Cpu, ExternalLink, Loader2, CheckCircle2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { toast } from '@/lib/toast'
import { triggerCliLogin, getCliAuthStatus, type CliAuthStatus } from '@/lib/api/user'

interface CLIAuthStatusPanelProps {
  cliAuthStatus: CliAuthStatus | null
  onStatusChange?: (status: CliAuthStatus) => void
}

export function CLIAuthStatusPanel({ cliAuthStatus, onStatusChange }: CLIAuthStatusPanelProps) {
  const [isLoggingIn, setIsLoggingIn] = useState<'claudecode' | 'codex' | null>(null)

  const handleLogin = async (adapter: 'claudecode' | 'codex') => {
    setIsLoggingIn(adapter)
    try {
      const result = await triggerCliLogin(adapter)
      if (result.authUrl) {
        window.open(result.authUrl, '_blank', 'noopener,noreferrer')
        toast.success('Complete login in the opened tab', {
          description: 'Once authenticated, your status will update automatically.',
        })
        // Poll for auth status after a delay
        setTimeout(async () => {
          try {
            const updated = await getCliAuthStatus()
            onStatusChange?.(updated)
          } catch { /* ignore */ }
        }, 8000)
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

      {/* Subtle note */}
      <p className="mt-3 text-[10px] text-text-secondary/70 text-center">
        No subscription? No problem — agents run on Xerus credits via OpenRouter by default.
      </p>
    </motion.div>
  )
}
