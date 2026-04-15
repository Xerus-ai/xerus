'use client'

import { useState, useCallback, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { X, ExternalLink, RefreshCw, TerminalSquare, Globe, Layout } from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SandboxTab = 'terminal' | 'browser' | 'preview'

interface TabConfig {
  id: SandboxTab
  label: string
  url: string | null
}

interface SandboxPanelProps {
  terminalUrl: string | null
  browserUrl: string | null
  previewUrl: string | null
  activeTab: SandboxTab
  onTabChange: (tab: SandboxTab) => void
  onClose: () => void
  className?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

const TAB_META: Record<SandboxTab, { icon: typeof TerminalSquare; label: string }> = {
  terminal: { icon: TerminalSquare, label: 'Terminal' },
  browser: { icon: Globe, label: 'Browser' },
  preview: { icon: Layout, label: 'Preview' },
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SandboxPanel({
  terminalUrl,
  browserUrl,
  previewUrl,
  activeTab,
  onTabChange,
  onClose,
  className,
}: SandboxPanelProps) {
  // Per-tab loading/error/key state
  const [loadState, setLoadState] = useState<Record<string, { loading: boolean; error: boolean; key: number }>>({})

  const getState = useCallback((tab: string) => loadState[tab] ?? { loading: true, error: false, key: 0 }, [loadState])

  const handleLoad = useCallback((tab: string) => {
    setLoadState(prev => ({ ...prev, [tab]: { ...prev[tab], loading: false, error: false, key: prev[tab]?.key ?? 0 } }))
  }, [])

  const handleError = useCallback((tab: string) => {
    setLoadState(prev => ({ ...prev, [tab]: { ...prev[tab], loading: false, error: true, key: prev[tab]?.key ?? 0 } }))
  }, [])

  const handleRetry = useCallback((tab: string) => {
    setLoadState(prev => ({ ...prev, [tab]: { loading: true, error: false, key: (prev[tab]?.key ?? 0) + 1 } }))
  }, [])

  // Which tabs are available (have a URL)
  const availableTabs = useMemo<TabConfig[]>(() => {
    const tabs: TabConfig[] = []
    if (terminalUrl) tabs.push({ id: 'terminal', label: 'Terminal', url: terminalUrl })
    if (browserUrl) tabs.push({ id: 'browser', label: 'Browser', url: browserUrl })
    if (previewUrl) tabs.push({ id: 'preview', label: 'Preview', url: previewUrl })
    return tabs
  }, [terminalUrl, browserUrl, previewUrl])

  const activeConfig = availableTabs.find(t => t.id === activeTab) ?? availableTabs[0]
  if (!activeConfig) return null

  const safeUrl = activeConfig.url && isValidUrl(activeConfig.url) ? activeConfig.url : null
  const tabState = getState(activeConfig.id)
  const TabIcon = TAB_META[activeConfig.id].icon

  return (
    <div className={cn('hidden md:flex flex-col h-full overflow-hidden bg-card', className)}>
      {/* Tab bar — compact 36px */}
      <div className="flex items-center h-9 border-b border-border shrink-0 bg-card px-1">
        {/* Tabs */}
        <div className="flex items-center gap-0.5 flex-1 min-w-0">
          {availableTabs.map(tab => {
            const Icon = TAB_META[tab.id].icon
            const isActive = tab.id === activeConfig.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.id)}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors',
                  isActive
                    ? 'text-primary bg-primary/8'
                    : 'text-text-muted hover:text-text hover:bg-surface-hover',
                )}
              >
                <Icon className="w-3 h-3" />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={() => handleRetry(activeConfig.id)}
            className="p-1 rounded-md text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
            aria-label="Reload"
          >
            <RefreshCw className={cn('w-3 h-3', tabState.loading && 'animate-spin')} />
          </button>

          <a
            href={safeUrl ?? '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 rounded-md text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
            aria-label="Open in new tab"
          >
            <ExternalLink className="w-3 h-3" />
          </a>

          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
            aria-label="Close panel"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Content area — each tab stays mounted (hidden) to preserve state */}
      <div className="flex-1 overflow-hidden relative">
        {availableTabs.map(tab => {
          const url = tab.url && isValidUrl(tab.url) ? tab.url : null
          const state = getState(tab.id)
          const isVisible = tab.id === activeConfig.id
          const isDark = tab.id === 'terminal'

          return (
            <div
              key={tab.id}
              className={cn('absolute inset-0', isVisible ? 'z-10' : 'z-0 invisible')}
            >
              {/* Loading overlay */}
              {state.loading && isVisible && (
                <div className={cn(
                  'absolute inset-0 flex flex-col items-center justify-center gap-3 z-20',
                  isDark ? 'bg-[#1a1a1a]' : 'bg-card',
                )}>
                  <div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
                  <p className={cn('text-xs', isDark ? 'text-gray-400' : 'text-text-muted')}>
                    {tab.id === 'terminal' ? 'Starting Claude Code...' : 'Connecting...'}
                  </p>
                </div>
              )}

              {/* Error state */}
              {state.error && isVisible && (
                <div className={cn(
                  'absolute inset-0 flex flex-col items-center justify-center gap-3 z-20',
                  isDark ? 'bg-[#1a1a1a]' : 'bg-card',
                )}>
                  <TabIcon className={cn('w-8 h-8', isDark ? 'text-gray-600' : 'text-text-muted/30')} />
                  <p className={cn('text-sm', isDark ? 'text-gray-400' : 'text-text-muted')}>
                    Connection failed
                  </p>
                  <button
                    type="button"
                    onClick={() => handleRetry(tab.id)}
                    className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/90 font-medium transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Retry
                  </button>
                </div>
              )}

              {/* iframe */}
              {url && (
                <iframe
                  key={state.key}
                  title={`Sandbox ${tab.label}`}
                  src={url}
                  sandbox="allow-scripts allow-same-origin allow-forms"
                  onLoad={() => handleLoad(tab.id)}
                  onError={() => handleError(tab.id)}
                  className={cn('w-full h-full border-0', isDark ? 'bg-[#1a1a1a]' : 'bg-card')}
                  allow="clipboard-write; fullscreen"
                  allowFullScreen
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
