import { useState, useRef, useCallback } from 'react'
import type { OnboardingMessage } from '@/components/onboarding/types'
import { getApiHeaders, getApiBaseUrl } from '@/lib/api'
import { createConversationApi, getStreamUrl, sendConversationMessage } from '@/lib/api/execute'

interface UseOnboardingStreamOptions {
  userId: string
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
  startProvisioning: () => Promise<void>
  handoff: (choice: string, history: OnboardingMessage[]) => Promise<void>
  createWorkspace: (workspace: string, project: string) => Promise<OnboardingHandoffResult | null>
  sendMessage: (content: string) => Promise<void>
  streamedMessages: OnboardingMessage[]
  completeOnboarding: () => Promise<void>
}

/**
 * Manages the onboarding lifecycle:
 * 1. Provision sandbox (POST /onboarding/start)
 * 2. Handoff to real agent (POST /onboarding/handoff -> SSE stream)
 * 3. Send subsequent messages (POST /execute)
 * 4. Mark onboarding complete (PATCH /users/me)
 */
export function useOnboardingStream({ userId }: UseOnboardingStreamOptions): UseOnboardingStreamReturn {
  const [sandboxReady, setSandboxReady] = useState(false)
  const [mode, setMode] = useState<'provisioning' | 'ready' | 'streaming' | 'complete'>('provisioning')
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [streamedMessages, setStreamedMessages] = useState<OnboardingMessage[]>([])
  const abortRef = useRef<AbortController | null>(null)

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
      return data.data as OnboardingHandoffResult
    } catch (err) {
      console.error('[useOnboardingStream] createWorkspace failed:', err)
      throw err
    }
  }, [])

  const handoff = useCallback(async (choice: string, history: OnboardingMessage[]) => {
    setMode('streaming')
    abortRef.current = new AbortController()

    // 1. Create conversation with the onboarding agent (agent_id=null uses Xerus master)
    const conversation = await createConversationApi(null, 'Onboarding')
    setConversationId(conversation.id)

    // 2. Connect SSE stream for real-time events
    const headers = await getApiHeaders()
    const token = (headers as Record<string, string>)['Authorization']?.replace('Bearer ', '') ?? ''
    const streamUrl = await getStreamUrl(conversation.id)
    const separator = streamUrl.includes('?') ? '&' : '?'
    const urlWithAuth = `${streamUrl}${separator}token=${encodeURIComponent(token)}`

    const es = new EventSource(urlWithAuth)

    es.onmessage = (msgEvent: MessageEvent) => {
      try {
        const data = JSON.parse(msgEvent.data)
        if (data.type === 'token' && data.content?.text) {
          setStreamedMessages((prev) => {
            const last = prev[prev.length - 1]
            if (last && last.streaming) {
              return prev.map((m, i) =>
                i === prev.length - 1 ? { ...m, content: m.content + data.content.text } : m
              )
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
      if (es.readyState === EventSource.CLOSED) {
        setStreamedMessages((prev) =>
          prev.map((m) => m.streaming ? { ...m, streaming: false } : m)
        )
      }
    }

    // 3. Send the onboarding message to kick off the agent
    const prompt = choice === 'fresh'
      ? 'I want to start fresh. Help me set up my workspace.'
      : 'I want to bring my company in. Help me set up my workspace with my company context.'

    await sendConversationMessage(conversation.id, { task: prompt, context: { onboarding: true, choice } })
  }, [])

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
    setMode('complete')
    try {
      const baseUrl = await getApiBaseUrl()
      const headers = await getApiHeaders()
      await fetch(`${baseUrl}/users/me`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ onboarding_completed: true }),
      })
    } catch (err) {
      console.error('[useOnboardingStream] completeOnboarding failed:', err)
    }
  }, [])

  return {
    sandboxReady,
    mode,
    conversationId,
    startProvisioning,
    handoff,
    createWorkspace,
    sendMessage,
    streamedMessages,
    completeOnboarding,
  }
}
