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

        // Split on \r\n or \n — SSE uses double-newline as event separator
        const parts = buffer.split(/\r?\n/)
        buffer = parts.pop() ?? ''

        for (const line of parts) {
          if (line.startsWith('data:')) {
            const raw = line.slice(5).trim()
            if (!raw) continue
            try {
              const parsed = JSON.parse(raw)
              this.events.push({
                type: parsed.type || 'message',
                data: parsed,
                raw,
              })
              // Auto-disconnect on terminal events
              if (parsed.type === 'done' || parsed.type === 'session_complete' || parsed.type === 'error') {
                this.done = true
              }
            } catch {
              this.events.push({ type: 'message', data: { text: raw }, raw })
            }
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
}

export async function sendMessageAndCollectSSE(
  conversationId: string,
  content: string,
  token: string,
  timeoutMs = 90_000
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

  const connectPromise = client.connect(timeoutMs)

  await new Promise((r) => setTimeout(r, 1000))

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

  await connectPromise.catch(() => {})
  const events = client.getEvents()

  const agentMessages = events
    .filter((e) => ['agent_message', 'reasoning', 'progress'].includes(e.type))
    .map((e) => (e.data.content as string) || (e.data.text as string) || '')
    .filter(Boolean)
    .join('')

  return { events, agentMessage: agentMessages }
}
