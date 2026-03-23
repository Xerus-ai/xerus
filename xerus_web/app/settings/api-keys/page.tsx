'use client'

import { useState, useEffect } from 'react'
import { ExternalLink, Eye, EyeOff, RefreshCw, Network, Server, Shield, ArrowUpRight } from 'lucide-react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { useRedirectIfNotAuth } from '@/utils/AuthContext'
import { saveApiKey, checkApiKeyStatus, deleteApiKey, getAllApiKeys } from '@/lib/api/user'
import { getStatus as getWorkspaceStatus } from '@/lib/api/workspace'
import type { WorkspaceStatus } from '@/lib/api/workspace'
import { cn } from '@/lib/utils'

const PROVIDERS = [
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Unified API gateway powering all agent AI models.',
    Icon: Network,
    keyUrl: 'https://openrouter.ai/keys',
    docsUrl: 'https://openrouter.ai/docs',
    usageUrl: 'https://openrouter.ai/activity',
    modelsUrl: 'https://openrouter.ai/models',
  },
  {
    id: 'daytona',
    name: 'Daytona',
    description: 'Persistent cloud sandboxes where agents execute code.',
    Icon: Server,
    keyUrl: 'https://app.daytona.io/dashboard/keys',
    docsUrl: 'https://www.daytona.io/docs',
    dashboardUrl: 'https://app.daytona.io/dashboard',
  },
]

export default function ApiKeysPage() {
  const user = useRedirectIfNotAuth()
  const [apiKeyInputs, setApiKeyInputs] = useState<Record<string, string>>({})
  const [savingStates, setSavingStates] = useState<Record<string, boolean>>({})
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({})
  const [apiKeyStatus, setApiKeyStatus] = useState<Record<string, boolean>>({})
  const [apiKeys, setApiKeys] = useState<Record<string, string | null>>({})
  const [isHydrated, setIsHydrated] = useState(false)
  const [sandboxStatus, setSandboxStatus] = useState<WorkspaceStatus | null>(null)

  const updateApiKeyStatus = (newStatus: Record<string, boolean>) => {
    setApiKeyStatus(newStatus)
    try {
      localStorage.setItem('apiKeyStatus', JSON.stringify(newStatus))
    } catch {}
  }

  useEffect(() => {
    setIsHydrated(true)
    try {
      const stored = localStorage.getItem('apiKeyStatus')
      if (stored) setApiKeyStatus(JSON.parse(stored))
    } catch {}
  }, [])

  useEffect(() => {
    if (!user) return
    checkApiKeyStatus().then(updateApiKeyStatus)
    getAllApiKeys().then(setApiKeys)
    getWorkspaceStatus().then(setSandboxStatus).catch(() => {})
  }, [user])

  const getMaskedPreview = (provider: string): string | undefined => {
    const key = apiKeys[provider]
    if (!key) return undefined
    return `sk-...${key.slice(-4)}`
  }

  const handleSave = async (provider: string) => {
    const input = apiKeyInputs[provider]
    if (!input) return
    setSavingStates((prev) => ({ ...prev, [provider]: true }))
    try {
      await saveApiKey(input, provider)
      updateApiKeyStatus({ ...apiKeyStatus, [provider]: true })
      setApiKeys((prev) => ({ ...prev, [provider]: input }))
      setApiKeyInputs((prev) => ({ ...prev, [provider]: '' }))
      toast.success(`${PROVIDERS.find((p) => p.id === provider)?.name} API key saved`)
    } catch {
      toast.error("Couldn't save your API key", { description: 'Please check the key and try again.' })
    } finally {
      setSavingStates((prev) => ({ ...prev, [provider]: false }))
    }
  }

  const handleClear = async (provider: string) => {
    setSavingStates((prev) => ({ ...prev, [provider]: true }))
    try {
      await deleteApiKey(provider)
      updateApiKeyStatus({ ...apiKeyStatus, [provider]: false })
      setApiKeys((prev) => ({ ...prev, [provider]: null }))
      setApiKeyInputs((prev) => ({ ...prev, [provider]: '' }))
      toast.success('API key removed')
    } catch {
      toast.error("Couldn't remove your API key", { description: 'Please try again.' })
    } finally {
      setSavingStates((prev) => ({ ...prev, [provider]: false }))
    }
  }

  return (
    <div className="max-w-[680px]">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <h1 className="font-serif text-[22px] text-text tracking-tight mb-1">API Keys</h1>
        <p className="text-sm text-text-secondary mb-8">
          Connect your provider keys to power agent execution
        </p>
      </motion.div>

      <div className="space-y-5">
        {PROVIDERS.map((provider, index) => {
          const isSet = isHydrated && !!apiKeyStatus[provider.id]
          const currentInput = apiKeyInputs[provider.id] || ''
          const isSaving = savingStates[provider.id] || false
          const showPassword = showPasswords[provider.id] || false
          const maskedPreview = getMaskedPreview(provider.id)

          return (
            <motion.div
              key={provider.id}
              className="bg-surface/50 rounded-2xl border border-surface-active/50 overflow-hidden"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.05 + index * 0.05 }}
            >
              {/* Header */}
              <div className="p-5 pb-4">
                <div className="flex items-center gap-2.5 mb-1">
                  <div className="relative w-8 h-8 bg-surface-hover rounded-lg flex items-center justify-center shrink-0">
                    <provider.Icon className="w-4 h-4 text-text-secondary" />
                  </div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium text-text">{provider.name}</h3>
                    {isHydrated && isSet && (
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    )}
                  </div>
                </div>
                <p className="text-xs text-text-secondary ml-[42px]">{provider.description}</p>
              </div>

              {/* Key input */}
              <div className="px-5 pb-4">
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={currentInput}
                      onChange={(e) =>
                        setApiKeyInputs((prev) => ({
                          ...prev,
                          [provider.id]: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2.5 pr-9 bg-white border border-surface-active/70 rounded-xl text-sm text-text focus:outline-none focus:ring-2 focus:ring-[#FF6600]/15 focus:border-[#FF6600]/40 transition-all placeholder:text-text-secondary/60"
                      placeholder={
                        isSet && maskedPreview
                          ? maskedPreview
                          : isSet
                            ? 'Enter new key to update'
                            : 'Paste your API key here'
                      }
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setShowPasswords((prev) => ({
                          ...prev,
                          [provider.id]: !showPassword,
                        }))
                      }
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-text-secondary hover:text-text-secondary transition-colors"
                    >
                      {showPassword ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>

                  {currentInput && (
                    <button
                      onClick={() => handleSave(provider.id)}
                      disabled={isSaving}
                      className="px-4 py-2.5 bg-[#FF6600] text-white rounded-xl hover:bg-[#E65C00] disabled:opacity-40 text-xs font-medium flex items-center gap-1.5 transition-colors shrink-0"
                    >
                      {isSaving ? (
                        <>
                          <RefreshCw className="h-3 w-3 animate-spin" />
                          Saving
                        </>
                      ) : (
                        'Save key'
                      )}
                    </button>
                  )}

                  {isSet && !currentInput && (
                    <button
                      onClick={() => handleClear(provider.id)}
                      disabled={isSaving}
                      className="px-4 py-2.5 text-red-500 border border-red-200/50 rounded-xl hover:bg-red-50/40 disabled:opacity-40 text-xs font-medium transition-colors shrink-0"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div className="mt-2 ml-0.5">
                  <a
                    href={provider.keyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-[#FF6600] hover:text-[#E65C00] font-medium transition-colors"
                  >
                    Get your API key
                    <ArrowUpRight className="h-2.5 w-2.5" />
                  </a>
                </div>
              </div>

              {/* Contextual info panel */}
              <div className="border-t border-surface-active/30 bg-surface-hover/20 px-5 py-4">
                {provider.id === 'openrouter' && (
                  <div>
                    <p className="text-[11px] font-medium text-text-secondary mb-2">
                      Available Models
                    </p>
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {['Claude 4.5', 'GPT-5', 'Gemini 2.5', 'DeepSeek V3', 'Qwen 3'].map(
                        (model) => (
                          <span
                            key={model}
                            className="text-[10px] font-medium text-text-secondary bg-white/80 border border-surface-active/40 px-2 py-0.5 rounded-md"
                          >
                            {model}
                          </span>
                        )
                      )}
                      <span className="text-[10px] font-medium text-text-secondary px-1 py-0.5">
                        +230 more
                      </span>
                    </div>
                    <div className="flex gap-4">
                      <a
                        href={provider.modelsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-text-secondary hover:text-text-secondary transition-colors inline-flex items-center gap-1"
                      >
                        View all models <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                      <a
                        href={provider.usageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-text-secondary hover:text-text-secondary transition-colors inline-flex items-center gap-1"
                      >
                        Check usage <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                      <a
                        href={provider.docsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-text-secondary hover:text-text-secondary transition-colors inline-flex items-center gap-1"
                      >
                        Docs <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>
                  </div>
                )}

                {provider.id === 'daytona' && (
                  <div>
                    <p className="text-[11px] font-medium text-text-secondary mb-2">
                      Sandbox Environment
                    </p>

                    {isSet && sandboxStatus ? (
                      <div className="flex items-center gap-3 mb-3">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              'w-1.5 h-1.5 rounded-full',
                              sandboxStatus.sandbox_running
                                ? 'bg-emerald-500'
                                : 'bg-text-muted/40'
                            )}
                          />
                          <span className="text-[11px] font-medium text-text">
                            {sandboxStatus.sandbox_running ? 'Running' : 'Stopped'}
                          </span>
                        </div>
                        {sandboxStatus.sandbox_id && (
                          <span className="text-[10px] text-text-secondary font-mono">
                            {sandboxStatus.sandbox_id}
                          </span>
                        )}
                      </div>
                    ) : isSet ? (
                      <p className="text-[11px] text-text-secondary mb-3">
                        Key connected. Sandbox will start on first agent execution.
                      </p>
                    ) : (
                      <p className="text-[11px] text-text-secondary mb-3">
                        Connect your key to provision a persistent sandbox.
                      </p>
                    )}

                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {[
                        'Persistent volumes',
                        'Terminal access',
                        'Browser preview',
                        'File system',
                      ].map((cap) => (
                        <span
                          key={cap}
                          className="text-[10px] font-medium text-text-secondary bg-white/80 border border-surface-active/40 px-2 py-0.5 rounded-md"
                        >
                          {cap}
                        </span>
                      ))}
                    </div>

                    <div className="flex gap-4">
                      {'dashboardUrl' in provider && (
                        <a
                          href={provider.dashboardUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-text-secondary hover:text-text-secondary transition-colors inline-flex items-center gap-1"
                        >
                          Dashboard <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                      <a
                        href={provider.docsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-text-secondary hover:text-text-secondary transition-colors inline-flex items-center gap-1"
                      >
                        Documentation <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Security note */}
      <motion.div
        className="flex items-center gap-2 mt-6 px-1"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.2 }}
      >
        <Shield className="w-3 h-3 text-text-secondary/60" />
        <p className="text-[11px] text-text-secondary/60">
          API keys are encrypted at rest and never exposed in logs or responses.
        </p>
      </motion.div>
    </div>
  )
}
