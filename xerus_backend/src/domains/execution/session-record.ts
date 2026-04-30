// Session Record Management — creates, updates, and summarizes execution session records.
// Extracted from execution-pipeline.ts to keep the pipeline under 400 lines.

import { randomUUID } from 'crypto';
import { logger } from '../../utils/logger';
import { BillingType, ExecutionSummary } from './types';
import { SDKExecutionError } from './errors';
import { requireAgent } from './pipeline-guards';
import {
    resolveToolIcon,
    type PersistedToolIcon,
} from './execution-conversation.helpers';
import {
    incrementConversationMessageCount,
    writeChatExecution,
} from '../conversations/workspace-db.service';
import type { ResolvedExecutionDeps, PipelineContext } from './execution-pipeline.types';

const log = logger('SessionRecord');

// -----------------------------------------------------------------------------
// Persisted Message Part Types
// -----------------------------------------------------------------------------

type PersistedMessagePart =
    | { id: string; type: 'text'; text: string }
    | { id: string; type: 'reasoning'; text: string }
    | {
        id: string;
        type: 'tool';
        callId: string;
        name: string;
        state: 'done' | 'error';
        icon: PersistedToolIcon;
        args?: Record<string, unknown>;
        result?: unknown;
        target?: string;
        durationMs?: number;
    };

// -----------------------------------------------------------------------------
// Create Session Record
// -----------------------------------------------------------------------------

export async function createSessionRecord(
    deps: ResolvedExecutionDeps,
    ctx: PipelineContext,
): Promise<string> {
    const agent = requireAgent(ctx);
    const sessionId = randomUUID();

    await deps.db.query(
        `INSERT INTO execution_sessions (id, workspace_id, agent_slug, sandbox_id, status, trigger_type, conversation_id, user_prompt, key_source, started_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())`,
        [sessionId, agent.workspace_id, agent.slug, ctx.sandboxId, 'running', ctx.triggerType, ctx.conversationId, ctx.request.task, ctx.keySource],
    );

    deps.creditTracker.setSessionId(sessionId);
    deps.creditTracker.setAgentSlug(agent.slug);

    return sessionId;
}

// -----------------------------------------------------------------------------
// Update Session Record
// -----------------------------------------------------------------------------

export async function updateSessionRecord(
    deps: ResolvedExecutionDeps,
    ctx: PipelineContext,
): Promise<void> {
    if (!ctx.sessionId) {
        throw new SDKExecutionError('Cannot update session: sessionId is missing (pipeline invariant violated)');
    }

    // Join accumulated response chunks into final responseText (avoids O(n^2) string concat during streaming)
    if (ctx.responseChunks.length > 0 && !ctx.responseText) {
        ctx.responseText = ctx.responseChunks.join('');
    }

    // Build structured metadata for rich history reload
    const thinkingText = ctx.thinkingChunks.length > 0 ? ctx.thinkingChunks.join('\n') : null;
    const parts: PersistedMessagePart[] = [];

    if (thinkingText) {
        parts.push({
            id: 'reasoning-final',
            type: 'reasoning',
            text: thinkingText,
        });
    }

    for (const toolCall of ctx.toolCallDetails) {
        parts.push({
            id: `tool-${toolCall.call_id}`,
            type: 'tool',
            callId: toolCall.call_id,
            name: toolCall.tool_name,
            state: toolCall.success === false ? 'error' : 'done',
            icon: resolveToolIcon(toolCall.tool_name),
            args: toolCall.arguments,
            result: toolCall.result,
            target: toolCall.arguments ? String(Object.values(toolCall.arguments)[0] ?? '') : undefined,
            durationMs: toolCall.duration_ms,
        });
    }

    if (ctx.responseText) {
        parts.push({
            id: 'text-final',
            type: 'text',
            text: ctx.responseText,
        });
    }

    const messageMetadata = parts.length > 0 || ctx.toolCallDetails.length > 0
        ? JSON.stringify({ parts, tool_calls: ctx.toolCallDetails })
        : null;

    await deps.db.query(
        `UPDATE execution_sessions
         SET status = $2, input_tokens = $3, output_tokens = $4,
             credits_used = $5, agent_response = $6, thinking = $7, message_metadata = $8,
             setup_report = $9, events_filtered = $10, hook_health = $11,
             completed_at = NOW()
         WHERE id = $1`,
        [ctx.sessionId, ctx.status, ctx.inputTokens, ctx.outputTokens, ctx.creditsUsed,
         ctx.responseText || null, thinkingText, messageMetadata,
         ctx.setupReport ? JSON.stringify(ctx.setupReport) : null, ctx.eventsFiltered,
         ctx.hookHealth ? JSON.stringify(ctx.hookHealth) : null],
    );

    // Persist chat turn to workspace.db for conversation history reload.
    // Non-critical — don't fail the session if it errors.
    if (ctx.conversationId && ctx.sandboxId) {
        try {
            const provider = deps.sandboxService.getDaytonaProvider();
            await Promise.all([
                incrementConversationMessageCount(provider, ctx.sandboxId, ctx.conversationId),
                writeChatExecution(
                    provider,
                    ctx.sandboxId,
                    ctx.conversationId,
                    ctx.sessionId || null,
                    ctx.request.task,
                    ctx.responseText || null,
                    ctx.inputTokens + ctx.outputTokens,
                    Date.now() - ctx.startedAt,
                    messageMetadata,
                ),
            ]);
        } catch (err) {
            log.error('Failed to persist chat execution', { conversation_id: ctx.conversationId, error: (err as Error).message });
        }
    }
}

// -----------------------------------------------------------------------------
// Build Summary
// -----------------------------------------------------------------------------

export function buildSummary(ctx: PipelineContext): ExecutionSummary {
    return {
        totalTokens: ctx.inputTokens + ctx.outputTokens,
        durationMs: Date.now() - ctx.startedAt,
        toolCalls: ctx.toolCallCount,
        agentsUsed: Math.max(ctx.agentSessionCount, 1),
        billingType: ctx.keySource as BillingType | undefined,
    };
}
