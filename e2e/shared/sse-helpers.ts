import { CONFIG } from './config'

export interface SSEEvent {
  type: string
  data: Record<string, unknown>
  raw: string
}

export class SSEClient {
  private events: SSEEvent[] = []
  private controller: AbortController | null = null
  private done = false

  constructor(
    private url: string,
    private headers: Record<string, string> = {}
  ) {}

  async connect(timeoutMs = 60_000): Promise<void> {
    this.controller = new AbortController()
    const timeout = setTimeout(() => this.controller?.abort(), timeoutMs)

    try {
      const resp = await fetch(this.url, {
        headers: { ...this.headers, Accept: 'text/event-stream' },
        signal: this.controller.signal,
      })

      if (!resp.ok) {
        throw new Error(`SSE connect failed: ${resp.status} ${resp.statusText}`)
      }

      const reader = resp.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let buffer = ''

      while (!this.done) {
        const { value, done: streamDone } = await reader.read()
        if (streamDone) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        let currentEvent = ''
        let currentData = ''

        for (const line of lines) {
          if (line.startsWith('event:')) {
            currentEvent = line.slice(6).trim()
          } else if (line.startsWith('data:')) {
            currentData += line.slice(5).trim()
          } else if (line === '') {
            if (currentData) {
              try {
                const parsed = JSON.parse(currentData)
                this.events.push({
                  type: currentEvent || parsed.type || 'message',
                  data: parsed,
                  raw: currentData,
                })
              } catch {
                this.events.push({
                  type: currentEvent || 'message',
                  data: { text: currentData },
                  raw: currentData,
                })
              }
            }
            currentEvent = ''
            currentData = ''
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return
      throw err
    } finally {
      clearTimeout(timeout)
    }
  }

  disconnect(): void {
    this.done = true
    this.controller?.abort()
  }

  getEvents(): SSEEvent[] {
    return [...this.events]
  }

  getEventsByType(type: string): SSEEvent[] {
    return this.events.filter((e) => e.type === type)
  }

  hasEvent(type: string): boolean {
    return this.events.some((e) => e.type === type)
  }

  waitForEvent(type: string, timeoutMs = 30_000): Promise<SSEEvent> {
    return new Promise((resolve, reject) => {
      const existing = this.events.find((e) => e.type === type)
      if (existing) {
        resolve(existing)
        return
      }

      const interval = setInterval(() => {
        const found = this.events.find((e) => e.type === type)
        if (found) {
          clearInterval(interval)
          clearTimeout(timeout)
          resolve(found)
        }
      }, 200)

      const timeout = setTimeout(() => {
        clearInterval(interval)
        reject(new Error(`Timeout waiting for SSE event "${type}" after ${timeoutMs}ms`))
      }, timeoutMs)
    })
  }
}

export async function collectSSEEvents(
  url: string,
  headers: Record<string, string>,
  durationMs = 10_000
): Promise<SSEEvent[]> {
  const client = new SSEClient(url, headers)
  const connectPromise = client.connect(durationMs)
  setTimeout(() => client.disconnect(), durationMs)
  await connectPromise
  return client.getEvents()
}

export async function sendMessageAndCollectSSE(
  conversationId: string,
  content: string,
  token: string,
  timeoutMs = 60_000
): Promise<{ events: SSEEvent[]; agentMessage: string }> {
  const API = CONFIG.apiURL
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }

  const sseTokenResp = await fetch(`${API}/execute/sse-token`, {
    method: 'POST',
    headers,
  })
  const sseTokenData = await sseTokenResp.json()
  const sseToken = sseTokenData.data?.token || sseTokenData.token

  const client = new SSEClient(
    `${API}/execute/conversations/${conversationId}/stream?token=${sseToken}`,
    headers
  )

  // Start stream connection (runs in background collecting events)
  const connectPromise = client.connect(timeoutMs)

  // Give the SSE stream a moment to establish before sending message
  await new Promise((r) => setTimeout(r, 1000))

  // Send message — API expects { task, agent_slug }
  const msgResp = await fetch(`${API}/execute/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ task: content, agent_slug: 'xerus-master' }),
  })

  if (!msgResp.ok) {
    const err = await msgResp.json().catch(() => ({}))
    client.disconnect()
    throw new Error(`Message send failed: ${msgResp.status} ${JSON.stringify(err)}`)
  }

  // Wait for stream to complete or timeout
  await connectPromise.catch(() => {})
  const events = client.getEvents()
  const agentMessages = events
    .filter((e) => e.type === 'agent_message' || e.data?.type === 'agent_message')
    .map((e) => (e.data.content as string) || (e.data.text as string) || '')
    .join('')

  return { events, agentMessage: agentMessages }
}
