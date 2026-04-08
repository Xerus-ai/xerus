/**
 * Quick smoke test: verifies agent execution doesn't crash with
 * "Invalid shell argument: contains control characters" error.
 *
 * Usage: npx tsx e2e/api/test-execution.ts
 */
import path from 'path'
import dotenv from 'dotenv'

// Load env BEFORE any module that reads process.env at import time
const BACKEND_DIR = path.resolve(__dirname, '../../xerus_backend')
dotenv.config({ path: path.resolve(BACKEND_DIR, '.env.local') })
dotenv.config({ path: path.resolve(__dirname, '../../xerus_web/.env.local') })

// Resolve relative GOOGLE_APPLICATION_CREDENTIALS to absolute
if (process.env.GOOGLE_APPLICATION_CREDENTIALS && !path.isAbsolute(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(BACKEND_DIR, process.env.GOOGLE_APPLICATION_CREDENTIALS)
}

const API = process.env.E2E_API_URL || 'http://localhost:5001/api/v1'
const TIMEOUT_MS = 30_000

async function run() {
    // Dynamic imports so config.ts reads env vars AFTER dotenv.config()
    const { getFirebaseIdToken, authHeader } = await import('../shared/auth')

    console.log('[1/4] Getting Firebase ID token...')
    const token = await getFirebaseIdToken()
    const headers = authHeader(token)
    console.log('  OK')

    console.log('[2/4] Creating conversation...')
    const createResp = await fetch(`${API}/execute/conversations`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ agent_slug: 'xerus-master', title: '[E2E] Execution smoke test' }),
    })
    const createBody = await createResp.json()
    if (!createBody.success) {
        throw new Error(`Failed to create conversation: ${JSON.stringify(createBody)}`)
    }
    const conversationId = createBody.data.id
    console.log(`  OK — conversation ${conversationId}`)

    console.log('[3/4] Opening SSE stream...')
    // Get short-lived SSE token (EventSource can't send Authorization headers)
    const sseTokenResp = await fetch(`${API}/execute/sse-token`, {
        method: 'POST',
        headers,
    })
    const sseTokenBody = await sseTokenResp.json()
    if (!sseTokenBody.success) {
        throw new Error(`Failed to get SSE token: ${JSON.stringify(sseTokenBody)}`)
    }
    const sseToken = sseTokenBody.data.token

    const abortController = new AbortController()
    const sseEvents: string[] = []
    let sawError = false
    let errorMessage = ''

    const ssePromise = fetch(`${API}/execute/conversations/${conversationId}/stream?token=${sseToken}`, {
        signal: abortController.signal,
    }).then(async (resp) => {
        if (!resp.ok) {
            throw new Error(`SSE stream failed: ${resp.status} ${await resp.text()}`)
        }
        const reader = resp.body!.getReader()
        const decoder = new TextDecoder()
        while (true) {
            const { done, value } = await reader.read()
            if (done) break
            const chunk = decoder.decode(value, { stream: true })
            for (const line of chunk.split('\n')) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6)
                    sseEvents.push(data)
                    try {
                        const parsed = JSON.parse(data)
                        if (parsed.type === 'error') {
                            sawError = true
                            errorMessage = parsed.message || JSON.stringify(parsed)
                        }
                        if (data.includes('control characters')) {
                            sawError = true
                            errorMessage = data
                        }
                    } catch { /* non-JSON SSE data */ }
                }
            }
        }
    }).catch((err: Error) => {
        if (err.name !== 'AbortError') throw err
    })

    // Give SSE time to connect
    await new Promise(r => setTimeout(r, 1500))
    console.log('  OK — SSE connected')

    console.log('[4/4] Sending message to agent...')
    const msgResp = await fetch(`${API}/execute/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ task: 'Hello, just a quick test. Reply with one word.', agent_slug: 'xerus-master' }),
    })
    console.log(`  Response status: ${msgResp.status}`)

    if (msgResp.status === 400) {
        const body = await msgResp.json()
        if (JSON.stringify(body).includes('No active stream')) {
            console.log('  WARN: stream not registered yet — retrying after 2s...')
            await new Promise(r => setTimeout(r, 2000))
            const retryResp = await fetch(`${API}/execute/conversations/${conversationId}/messages`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ task: 'Hello, just a quick test. Reply with one word.', agent_slug: 'xerus-master' }),
            })
            console.log(`  Retry status: ${retryResp.status}`)
        }
    }

    // Wait for execution events or timeout
    console.log('\nWaiting for agent response (up to 30s)...')
    const deadline = Date.now() + TIMEOUT_MS
    while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 2000))

        const hasCompletion = sseEvents.some(e => {
            try {
                const p = JSON.parse(e)
                return p.type === 'result' || p.type === 'complete' || p.type === 'error'
            } catch { return false }
        })

        console.log(`  Events: ${sseEvents.length}${hasCompletion ? ' — completed' : ''}`)

        if (hasCompletion || sseEvents.length > 5) break
    }

    // Abort SSE
    abortController.abort()
    await ssePromise.catch(() => {})

    // Report results
    console.log('\n--- Results ---')
    console.log(`Total SSE events: ${sseEvents.length}`)

    if (sawError) {
        console.log(`\nFAILED — Error detected: ${errorMessage}`)
        if (errorMessage.includes('control characters')) {
            console.log('BUG STILL PRESENT: shellEscape still rejecting system prompt newlines')
        }
        process.exit(1)
    }

    const controlCharError = sseEvents.find(e => e.includes('control characters'))
    if (controlCharError) {
        console.log(`\nFAILED — "control characters" error found in events`)
        console.log(controlCharError)
        process.exit(1)
    }

    const meaningfulEvents = sseEvents.filter(e => {
        try {
            const p = JSON.parse(e)
            return p.type !== 'heartbeat'
        } catch { return false }
    })

    if (meaningfulEvents.length > 0) {
        console.log(`\nPASSED — ${meaningfulEvents.length} meaningful events, no shell escape errors`)
        console.log('\nEvents:')
        meaningfulEvents.slice(0, 10).forEach((e, i) => {
            try {
                const p = JSON.parse(e)
                const msg = p.message ? String(p.message).slice(0, 80) : ''
                const phase = p.phase || ''
                console.log(`  ${i + 1}. type=${p.type} ${phase} ${msg}`)
            } catch {
                console.log(`  ${i + 1}. ${e.slice(0, 100)}`)
            }
        })
    } else {
        console.log('\nWARN — No meaningful events received (may need longer timeout)')
    }

    // Cleanup
    await fetch(`${API}/execute/conversations/${conversationId}`, {
        method: 'DELETE',
        headers,
    }).catch(() => {})

    process.exit(0)
}

run().catch(err => {
    console.error('\nFATAL:', err.message)
    process.exit(1)
})
