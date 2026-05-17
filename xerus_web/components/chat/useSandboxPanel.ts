'use client'

import { useState, useCallback } from 'react'
import type { SandboxTab } from './SandboxPanel'
import { startBrowser, startTerminal } from '@/lib/api/workspace'
import { toast } from '@/lib/toast'

export function useSandboxPanel() {
  const [browserUrl, setBrowserUrl] = useState<string | null>(null)
  const [isBrowserLoading, setIsBrowserLoading] = useState(false)
  const [terminalUrl, setTerminalUrl] = useState<string | null>(null)
  const [isTerminalLoading, setIsTerminalLoading] = useState(false)
  const [sandboxTab, setSandboxTab] = useState<SandboxTab>('terminal')

  const openBrowser = useCallback(async () => {
    if (browserUrl || isBrowserLoading) return
    setSandboxTab('browser')
    setIsBrowserLoading(true)
    try {
      const result = await startBrowser()
      setBrowserUrl(result.novnc_url)
    } catch {
      toast.error("Couldn't open the browser preview", { description: 'Your workspace may still be starting up.' })
    } finally {
      setIsBrowserLoading(false)
    }
  }, [browserUrl, isBrowserLoading])

  const openTerminal = useCallback(async () => {
    if (terminalUrl || isTerminalLoading) return
    setSandboxTab('terminal')
    setIsTerminalLoading(true)
    try {
      const result = await startTerminal()
      setTerminalUrl(result.terminal_url)
    } catch {
      toast.error("Couldn't open the terminal", { description: 'Your workspace may still be starting up.' })
    } finally {
      setIsTerminalLoading(false)
    }
  }, [terminalUrl, isTerminalLoading])

  const closePanel = useCallback(() => {
    setBrowserUrl(null)
    setTerminalUrl(null)
  }, [])

  return {
    browserUrl,
    isBrowserLoading,
    terminalUrl,
    isTerminalLoading,
    sandboxTab,
    setSandboxTab,
    openBrowser,
    openTerminal,
    closePanel,
  }
}
