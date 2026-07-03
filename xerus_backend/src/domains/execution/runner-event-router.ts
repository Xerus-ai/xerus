// Runner Event Router
// Routes runner stdout events to backend services (DB writes, SSE, logging).
// Handler implementations live in runner-event-handlers.ts.

import { logger } from '../../utils/logger';
import type { PipelineContext, ResolvedExecutionDeps } from './execution-pipeline.types';
import { STREAM_EVENT_TYPES, type RunnerEventType } from './types';
import { handleMetadataSync } from './metadata-sync-router';
import { handleTriggerIndexing } from './indexing-event-handler';
import { handleCliStreamEvent } from './cli-stream-router';
import { handleSseForward, handleAgentOutput } from './sse-forward-handler';
import { handleScaffoldComplete } from './scaffold-complete-handler';
import {
    handleToolCall,
    handleToolResult,
    handleSessionStarted,
    handleSessionEnded,
    handleSessionCompleted,
    handleCreditUsage,
    handleCreateInboxItem,
    handleAgentMessage,
    handleHookLog,
    handleSubagentFailure,
    handleSandboxLifecycle,
    handlePushNotificationForward,
    handleDelegationForward,
    handleHitlRequest,
    logEvent,
} from './runner-event-handlers';

const log = logger('EventRouter');

export { EVENT_ROUTER_LOG_PREFIX } from './runner-event-handlers';

// Canonical allowlist: only events the frontend knows how to handle (from STREAM_EVENT_TYPES)
export const VALID_SSE_FORWARD_EVENTS: ReadonlySet<string> = new Set(STREAM_EVENT_TYPES);

/**
 * Merge raw.data into root level for consistent field access.
 * StdoutEmitter wraps all payloads in a `data` field; handlers expect fields at root.
 */
function extractData(raw: Record<string, unknown>): Record<string, unknown> {
    const data = raw.data as Record<string, unknown> | undefined;
    return data && typeof data === 'object' ? { ...raw, ...data } : raw;
}

export async function routeEventToBackend(
    eventType: RunnerEventType | string,
    raw: Record<string, unknown>,
    ctx: PipelineContext,
    deps: ResolvedExecutionDeps,
): Promise<void> {
    const d = extractData(raw);

    switch (eventType) {
        // ----- Category A: Core execution events -----
        case 'tool_call':
            handleToolCall(d, ctx);
            break;
        case 'tool_result':
            handleToolResult(d, ctx, deps);
            break;
        case 'session_ended':
        case 'done':
            handleSessionEnded(d, ctx);
            break;
        case 'session_completed':
            await handleSessionCompleted(d, ctx, deps);
            break;
        case 'credit_usage':
            handleCreditUsage(d, ctx);
            break;
        case 'update_agent_run':
            log.warn('update_agent_run: deprecated event still being emitted');
            break;
        case 'sse_forward':
            await handleSseForward(d, ctx, deps);
            break;
        case 'metadata_sync':
            await handleMetadataSync(d, ctx, deps);
            break;

        // ----- Category B: DB write handlers -----
        case 'create_inbox_item':
            await handleCreateInboxItem(d, ctx, deps);
            break;
        case 'agent_message':
            await handleAgentMessage(d, ctx, deps);
            break;
        case 'hook_log':
            await handleHookLog(d, ctx, deps);
            break;
        case 'subagent_failure':
            await handleSubagentFailure(d, ctx);
            break;
        case 'sandbox_lifecycle':
            await handleSandboxLifecycle(d, ctx, deps);
            break;

        // ----- Category C: Structured log / forward handlers -----
        case 'error':
            log.error('Runner error event', { code: d.code || 'unknown', message: d.message || '' });
            break;
        case 'agent_output':
            handleAgentOutput(d, ctx);
            break;
        case 'trigger_indexing':
            await handleTriggerIndexing(d, ctx, deps);
            break;
        case 'session_started':
            await handleSessionStarted(d, ctx, deps);
            break;
        case 'scaffold_complete':
            await handleScaffoldComplete(d, ctx, deps);
            break;
        case 'session_analytics':
        case 'health':
        case 'sessions':
        case 'credit_check':
        case 'ace_reflection':
        case 'skill_suggestion':
            logEvent(eventType, d);
            break;
        case 'push_notification':
            handlePushNotificationForward(d, ctx);
            break;
        case 'delegation_record':
            handleDelegationForward(d, ctx);
            break;
        case 'hitl_request':
            await handleHitlRequest(d, ctx, deps);
            break;
        // ----- CLI stream-json events — delegated to cli-stream-router.ts -----
        case 'user':
        case 'stream_event':
        case 'system':
        case 'assistant':
        case 'result': {
            const handled = await handleCliStreamEvent(eventType, d, ctx, deps);
            if (!handled) log.warn('CLI stream handler returned false', { event_type: eventType });
            break;
        }

        default:
            log.warn('Unknown event type', { event_type: eventType });
            break;
    }
}
