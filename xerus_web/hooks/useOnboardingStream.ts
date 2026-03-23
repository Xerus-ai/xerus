import { useState, useRef, useCallback, useEffect } from 'react'
import type { OnboardingMessage } from '@/components/onboarding/types'
import { getApiHeaders, getApiBaseUrl } from '@/lib/api/client'
import { createConversationApi, getStreamUrl, sendConversationMessage, fetchSseToken } from '@/lib/api/execute'

interface UseOnboardingStreamOptions {
  userId: string
  onWorkspaceCreated?: () => void
}

interface OnboardingHandoffResult {
  workspace: { id: string; slug: string; name: string }
  domain: { id: string; slug: string; name: string }
  channel: { id: string; slug: string; name: string }
}

interface UseOnboardingStreamReturn {
  sandboxReady: boolean
  mode: 'provisioning' | 'ready' | 'streaming' | 'complete'
  conversationId: string | null
  error: string | null
  startProvisioning: () => Promise<void>
  handoff: (choice: string, history: OnboardingMessage[]) => Promise<void>
  createWorkspace: (workspace: string, project: string) => Promise<OnboardingHandoffResult | null>
  sendMessage: (content: string) => Promise<void>
  streamedMessages: OnboardingMessage[]
  completeOnboarding: () => Promise<void>
  retryHandoff: () => void
}

/**
 * Manages the onboarding lifecycle:
 * 1. Provision sandbox (POST /onboarding/start)
 * 2. Handoff to real agent via SSE stream with xerus-master
 * 3. Send subsequent messages (POST /execute/conversations/:id/messages)
 * 4. Signal workspace creation via onWorkspaceCreated callback
 */
export function useOnboardingStream({ userId, onWorkspaceCreated }: UseOnboardingStreamOptions): UseOnboardingStreamReturn {
  const [sandboxReady, setSandboxReady] = useState(false)
  const [mode, setMode] = useState<'provisioning' | 'ready' | 'streaming' | 'complete'>('provisioning')
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [streamedMessages, setStreamedMessages] = useState<OnboardingMessage[]>([])
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const lastHandoffRef = useRef<{ choice: string; history: OnboardingMessage[] } | null>(null)
  const sseTimeoutRef = useRef<ReturnType<typeof setTimeout>>()

  // Clean up EventSource, abort pending requests, and clear timers on unmount
  useEffect(() => {
    return () => {
      eventSourceRef.current?.close()
      abortRef.current?.abort()
      clearTimeout(sseTimeoutRef.current)
    }
  }, [])

  const startProvisioning = useCallback(async () => {
    try {
      const baseUrl = await getApiBaseUrl()
      const headers = await getApiHeaders()
      const res = await fetch(`${baseUrl}/onboarding/start`, {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
      })
      if (res.ok) {
        setSandboxReady(true)
        setMode('ready')
      }
    } catch (err) {
      console.error('[useOnboardingStream] startProvisioning failed:', err)
      throw err
    }
  }, [])

  const createWorkspace = useCallback(async (workspace: string, project: string): Promise<OnboardingHandoffResult | null> => {
    try {
      const baseUrl = await getApiBaseUrl()
      const headers = await getApiHeaders()
      const res = await fetch(`${baseUrl}/onboarding/handoff`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ workspace, project }),
      })

      if (!res.ok) return null

      const data = await res.json()
      const result = data.data
      if (!result?.workspace?.id || !result?.domain?.id || !result?.channel?.id) {
        throw new Error('Invalid handoff response: missing workspace, domain, or channel')
      }
      return result as OnboardingHandoffResult
    } catch (err) {
      console.error('[useOnboardingStream] createWorkspace failed:', err)
      throw err
    }
  }, [])

  const handoff = useCallback(async (choice: string, history: OnboardingMessage[]) => {
    setMode('streaming')
    setError(null)
    lastHandoffRef.current = { choice, history }
    abortRef.current = new AbortController()

    try {
      // 1. Create conversation + fetch SSE token in parallel (independent operations)
      const [conversation, token] = await Promise.all([
        createConversationApi('xerus-master', 'Onboarding'),
        fetchSseToken(),
      ])
      setConversationId(conversation.id)

      // 2. Stream URL depends on conversation ID (must be sequential)
      const streamUrl = await getStreamUrl(conversation.id)
      const separator = streamUrl.includes('?') ? '&' : '?'
      const urlWithAuth = `${streamUrl}${separator}token=${encodeURIComponent(token)}`

      const es = new EventSource(urlWithAuth)
      eventSourceRef.current = es

      // 30s timeout — if no data arrives, surface error with retry
      const resetTimeout = () => {
        clearTimeout(sseTimeoutRef.current)
        sseTimeoutRef.current = setTimeout(() => {
          es.close()
          setStreamedMessages((prev) =>
            prev.map((m) => m.streaming ? { ...m, streaming: false } : m)
          )
          setMode('ready')
          setError('Response took too long. Please try again.')
        }, 30_000)
      }
      resetTimeout()

      es.onmessage = (msgEvent: MessageEvent) => {
        try {
          resetTimeout() // Reset timeout on each message
          const data = JSON.parse(msgEvent.data)
          if (data.type === 'token' && data.content?.text) {
            setStreamedMessages((prev) => {
              const last = prev[prev.length - 1]
              if (last && last.streaming) {
                return [...prev.slice(0, -1), { ...last, content: last.content + data.content.text }]
              }
              return [...prev, {
                id: `stream-${Date.now()}`,
                role: 'assistant' as const,
                content: data.content.text,
                source: 'stream' as const,
                streaming: true,
              }]
            })
          } else if (data.type === 'done' || data.type === 'stop') {
            clearTimeout(sseTimeoutRef.current)
            setStreamedMessages((prev) =>
              prev.map((m) => m.streaming ? { ...m, streaming: false } : m)
            )
            es.close()
          }
        } catch (parseErr) {
          console.warn('[useOnboardingStream] Failed to parse SSE data:', parseErr)
        }
      }

      es.onerror = () => {
        clearTimeout(sseTimeoutRef.current)
        if (es.readyState === EventSource.CLOSED) {
          setStreamedMessages((prev) =>
            prev.map((m) => m.streaming ? { ...m, streaming: false } : m)
          )
          setMode('ready')
          setError('Connection lost. Please try again.')
        }
      }

      // 3. Send the onboarding message to kick off the agent
      const prompt = choice === 'fresh'
        ? 'I want to start fresh. Help me set up my workspace.'
        : 'I want to bring my company in. Help me set up my workspace with my company context.'

      await sendConversationMessage(conversation.id, { task: prompt, context: { onboarding: true, choice } })
    } catch (err) {
      setError('Something went wrong. Please try again.')
      setMode('ready')
    }
  }, [])

  const retryHandoff = useCallback(() => {
    if (!lastHandoffRef.current) return
    setError(null)
    setStreamedMessages([])
    eventSourceRef.current?.close()
    handoff(lastHandoffRef.current.choice, lastHandoffRef.current.history)
  }, [handoff])

  const sendMessage = useCallback(async (content: string) => {
    if (!conversationId) return

    // Add a streaming placeholder message
    const msgId = `stream-${Date.now()}`
    setStreamedMessages((prev) => [
      ...prev,
      { id: msgId, role: 'assistant', content: '', source: 'stream', streaming: true },
    ])

    try {
      // Send via conversation messages API — response arrives on the existing SSE stream
      await sendConversationMessage(conversationId, { task: content, context: { onboarding: true } })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      // Mark streaming as done on error
      setStreamedMessages((prev) =>
        prev.map((m) => m.id === msgId ? { ...m, streaming: false, content: 'Failed to send message.' } : m)
      )
    }
  }, [conversationId])

  const completeOnboarding = useCallback(async () => {
    // Signal AuthContext first so hasWorkspace=true is in the same React batch
    onWorkspaceCreated?.()
    setMode('complete')
  }, [onWorkspaceCreated])

  return {
    sandboxReady,
    mode,
    conversationId,
    error,
    startProvisioning,
    handoff,
    createWorkspace,
    sendMessage,
    streamedMessages,
    completeOnboarding,
    retryHandoff,
  }
}
