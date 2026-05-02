// SSE Forward Handler
// Processes sse_forward and agent_output events, forwarding them to the client SSE stream.

import { logger } from '../../utils/logger';
import type { PipelineContext, ResolvedExecutionDeps } from './execution-pipeline.types';
import { type StreamEventType } from './types';
import {
    assertSseForwardData,
    assertToolCallData,
    assertToolResultData,
    isTextContentBlock,
    resolveContentBlocks,
} from './runner-event-router.guards';
import { VALID_SSE_FORWARD_EVENTS } from './runner-event-router';

const log = logger('SSEForward');

export async function handleSseForward(
    d: Record<string, unknown>,
    ctx: PipelineContext,
    deps: ResolvedExecutionDeps,
): Promise<void> {
    const fwd = assertSseForwardData(d);
    if (!VALID_SSE_FORWARD_EVENTS.has(fwd.sse_event)) return;

    let payloadToForward: Record<string, unknown> | undefined = fwd.payload;
    if (fwd.sse_event === 'preview') {
        payloadToForward = await resolvePreviewPayload(fwd.payload, ctx, deps);
        if (!payloadToForward) return;
    }

    ctx.stream.send(fwd.sse_event as StreamEventType, payloadToForward, fwd.meta);
    const payload = fwd.payload;

    if (fwd.sse_event === 'token' && payload) {
        if (typeof payload.text === 'string') {
            ctx.responseChunks.push(payload.text);
        }
    }
    if (fwd.sse_event === 'reasoning' && payload) {
        if (typeof payload.thought === 'string') {
            ctx.thinkingChunks.push(payload.thought);
        }
    }
    if (fwd.sse_event === 'tool_call' && payload) {
        const tc = assertToolCallData(payload);
        const callId = tc.call_id || `tc-${ctx.toolCallCount + 1}`;
        if (!ctx.toolCallMap.has(callId)) {
            ctx.toolCallCount++;
            const detail = {
                call_id: callId,
                tool_name: tc.tool_name,
                arguments: tc.arguments,
                started_at: Date.now(),
            };
            ctx.toolCallDetails.push(detail);
            ctx.toolCallMap.set(callId, detail);
        }
    }
    if (fwd.sse_event === 'tool_result' && payload) {
        const tr = assertToolResultData(payload);
        if (tr.call_id) {
            const entry = ctx.toolCallMap.get(tr.call_id);
            if (entry) {
                entry.result = tr.result;
                entry.success = tr.success ?? true;
                entry.duration_ms = Date.now() - entry.started_at;
            }
        }
    }
}

export function handleAgentOutput(d: Record<string, unknown>, ctx: PipelineContext): void {
    const text = extractTextFromAgentOutput(d);
    if (text.length > 0) {
        if (ctx.responseChunks.length === 0) {
            ctx.responseChunks.push(text);
            ctx.stream.send('token' as StreamEventType, { text, tokenCount: 0 });
        }
    }
}

function extractTextFromAgentOutput(d: Record<string, unknown>): string {
    if (typeof d.content === 'string') {
        return d.content;
    }
    const blocks = resolveContentBlocks(d.content);
    if (!blocks) return '';
    const parts: string[] = [];
    for (const block of blocks) {
        if (isTextContentBlock(block)) {
            parts.push(block.text);
        }
    }
    return parts.join('');
}

async function resolvePreviewPayload(
    payload: Record<string, unknown> | undefined,
    ctx: PipelineContext,
    deps: ResolvedExecutionDeps,
): Promise<Record<string, unknown> | undefined> {
    if (!payload || typeof payload !== 'object') return undefined;

    const port = typeof payload.port === 'number' ? payload.port : Number(payload.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        log.warn('preview event: invalid port', { port: payload.port });
        return undefined;
    }

    if (typeof payload.url === 'string' && payload.url.length > 0) {
        return { ...payload, port };
    }

    if (!ctx.sandboxId) {
        log.warn('preview event: no sandboxId on context, cannot resolve URL');
        return undefined;
    }

    try {
        const provider = deps.sandboxService.getDaytonaProvider();
        const url = await provider.getPreviewUrl(ctx.sandboxId, port);
        return { ...payload, port, url };
    } catch (err) {
        log.warn('preview event: failed to resolve Daytona URL', { port, error: (err as Error).message });
        return undefined;
    }
}
