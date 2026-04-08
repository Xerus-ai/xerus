// Stream Parser
// Converts CLI NDJSON output to RunnerEvent format via StdoutEmitter
// Claude Code: --output-format stream-json (NDJSON with type field)
// Codex: --json (JSONL output)
// Reference: Ductor stream_events.py, Paperclip execute.ts

import type { StdoutEmitter } from './stdout-emitter';

// --- Claude Code stream-json event shapes ---

interface ClaudeAssistantEvent {
    type: 'assistant';
    message: {
        id: string;
        role: 'assistant';
        content: Array<{
            type: 'text' | 'tool_use' | 'thinking';
            text?: string;
            id?: string;
            name?: string;
            input?: Record<string, unknown>;
            thinking?: string;
        }>;
        model?: string;
        usage?: { input_tokens: number; output_tokens: number };
    };
}

interface ClaudeResultEvent {
    type: 'result';
    subtype?: string;
    cost_usd?: number;
    total_cost_usd?: number;
    duration_ms?: number;
    duration_api_ms?: number;
    num_turns?: number;
    result?: string;
    is_error?: boolean;
    session_id?: string;
    usage?: { input_tokens: number; output_tokens: number };
}

interface ClaudeSystemEvent {
    type: 'system';
    subtype: string;
    message?: string;
    session_id?: string;
}

type ClaudeStreamEvent = ClaudeAssistantEvent | ClaudeResultEvent | ClaudeSystemEvent;

// --- Token tracking state per session ---

interface TokenAccumulator {
    inputTokens: number;
    outputTokens: number;
    toolCalls: number;
    createdAt: number;
}

const sessionTokens = new Map<string, TokenAccumulator>();

/** Maximum number of tracked sessions before evicting oldest entries */
const MAX_SESSION_ACCUMULATORS = 10_000;

/** Maximum age of an accumulator before it is considered stale (1 hour) */
const ACCUMULATOR_TTL_MS = 60 * 60 * 1000;

/** Interval for periodic TTL sweep (5 minutes) */
const TTL_SWEEP_INTERVAL_MS = 5 * 60 * 1000;

/** Estimated characters per token for rough token counting */
const CHARS_PER_TOKEN_ESTIMATE = 4;

/** Periodic sweep: prune accumulators older than ACCUMULATOR_TTL_MS */
function sweepStaleAccumulators(): void {
    const now = Date.now();
    for (const [key, acc] of sessionTokens) {
        if (now - acc.createdAt > ACCUMULATOR_TTL_MS) {
            sessionTokens.delete(key);
        }
    }
}

// Start periodic TTL sweep. unref() ensures the timer does not keep the process alive.
const sweepTimer = setInterval(sweepStaleAccumulators, TTL_SWEEP_INTERVAL_MS);
if (typeof sweepTimer === 'object' && 'unref' in sweepTimer) {
    sweepTimer.unref();
}

function findOrCreateAccumulator(sessionId: string): TokenAccumulator {
    let acc = sessionTokens.get(sessionId);
    if (!acc) {
        // Evict oldest entries when map exceeds bounds (prevents leak from crashed sessions)
        if (sessionTokens.size >= MAX_SESSION_ACCUMULATORS) {
            const oldestKey = sessionTokens.keys().next().value;
            if (oldestKey !== undefined) {
                sessionTokens.delete(oldestKey);
            }
        }
        acc = { inputTokens: 0, outputTokens: 0, toolCalls: 0, createdAt: Date.now() };
        sessionTokens.set(sessionId, acc);
    }
    return acc;
}

export function clearAccumulator(sessionId: string): void {
    sessionTokens.delete(sessionId);
}

// --- Claude Code stream parser ---

export function parseClaudeStreamLine(
    line: string,
    emitter: StdoutEmitter,
    agentSlug: string,
    sessionId: string,
): void {
    let event: ClaudeStreamEvent;
    try {
        event = JSON.parse(line);
    } catch {
        // Expected: NDJSON streams contain non-JSON lines (e.g. blank lines, progress markers)
        return;
    }

    if (!event.type) return;
    const acc = findOrCreateAccumulator(sessionId);

    switch (event.type) {
        case 'assistant': {
            const msg = (event as ClaudeAssistantEvent).message;
            if (!msg?.content) break;

            // Accumulate usage from message-level (guard against partial usage objects)
            if (msg.usage) {
                acc.inputTokens += msg.usage.input_tokens ?? 0;
                acc.outputTokens += msg.usage.output_tokens ?? 0;
            }

            for (const block of msg.content) {
                if (block.type === 'text' && block.text) {
                    emitter.sseForward(agentSlug, sessionId, 'token', {
                        text: block.text,
                        tokenCount: Math.ceil(block.text.length / CHARS_PER_TOKEN_ESTIMATE),
                    });
                } else if (block.type === 'tool_use' && block.name) {
                    acc.toolCalls++;
                    emitter.sseForward(agentSlug, sessionId, 'tool_call', {
                        toolName: block.name,
                        arguments: block.input || {},
                        callId: block.id || '',
                    });
                } else if (block.type === 'thinking' && block.thinking) {
                    emitter.sseForward(agentSlug, sessionId, 'reasoning', {
                        thought: block.thinking,
                    });
                }
            }
            break;
        }

        case 'result': {
            const r = event as ClaudeResultEvent;
            emitter.creditUsage(
                agentSlug,
                sessionId,
                r.usage?.input_tokens || acc.inputTokens,
                r.usage?.output_tokens || acc.outputTokens,
                r.total_cost_usd || r.cost_usd || 0,
                0,
            );
            emitter.sessionAnalytics(agentSlug, sessionId, {
                duration_ms: r.duration_ms || 0,
                tool_calls: acc.toolCalls,
                turns: r.num_turns || 0,
                model: '',
            });
            clearAccumulator(sessionId);
            break;
        }

        case 'system': {
            const s = event as ClaudeSystemEvent;
            if (s.subtype === 'init' && s.session_id) {
                // CLI reports its session ID
            }
            break;
        }
    }
}

// --- Codex stream parser ---

interface CodexEvent {
    type: 'message' | 'function_call' | 'function_call_output' | 'error' | 'completed';
    content?: string;
    name?: string;
    arguments?: string;
    call_id?: string;
    output?: string;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export function parseCodexStreamLine(
    line: string,
    emitter: StdoutEmitter,
    agentSlug: string,
    sessionId: string,
): void {
    let event: CodexEvent;
    try {
        event = JSON.parse(line);
    } catch {
        // Expected: NDJSON streams contain non-JSON lines (e.g. blank lines, progress markers)
        return;
    }

    if (!event.type) return;
    const acc = findOrCreateAccumulator(sessionId);

    switch (event.type) {
        case 'message':
            if (event.content) {
                emitter.sseForward(agentSlug, sessionId, 'token', {
                    text: event.content,
                    tokenCount: Math.ceil(event.content.length / CHARS_PER_TOKEN_ESTIMATE),
                });
            }
            break;

        case 'function_call': {
            acc.toolCalls++;
            let parsedArgs: Record<string, unknown> = {};
            if (event.arguments) {
                // Expected: arguments may be raw string rather than valid JSON
                try { parsedArgs = JSON.parse(event.arguments); } catch { /* raw string is fine */ }
            }
            emitter.sseForward(agentSlug, sessionId, 'tool_call', {
                toolName: event.name || 'unknown',
                arguments: parsedArgs,
                callId: event.call_id || '',
            });
            break;
        }

        case 'function_call_output':
            emitter.sseForward(agentSlug, sessionId, 'tool_result', {
                callId: event.call_id || '',
                result: event.output,
                durationMs: 0,
                success: true,
            });
            break;

        case 'completed':
            emitter.creditUsage(
                agentSlug,
                sessionId,
                event.usage?.prompt_tokens || acc.inputTokens,
                event.usage?.completion_tokens || acc.outputTokens,
                0,
                0,
            );
            clearAccumulator(sessionId);
            break;

        case 'error':
            emitter.error(
                event.content || 'Codex execution error',
                'CODEX_ERROR',
                agentSlug,
            );
            break;
    }
}
