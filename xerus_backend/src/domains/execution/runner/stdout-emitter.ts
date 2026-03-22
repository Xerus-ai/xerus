// Stdout Emitter
// Writes JSON events to stdout (captured by backend via Daytona log streaming)
// All runner output goes through this module for consistent formatting
// Uses unified RunnerEventType with 'event' field (canonical protocol)

import type { RunnerEventType } from './runner.types';

export interface StdoutEvent {
    event: RunnerEventType;
    agent_slug?: string;
    session_id?: string;
    timestamp: string;
    data?: unknown;
}

export class StdoutEmitter {
    private output: NodeJS.WritableStream;

    constructor(output: NodeJS.WritableStream = process.stdout) {
        this.output = output;
    }

    emit(event: Omit<StdoutEvent, 'timestamp'>): void {
        const full: StdoutEvent = {
            ...event,
            timestamp: new Date().toISOString(),
        };
        this.output.write(JSON.stringify(full) + '\n');
    }

    sessionStarted(agentSlug: string, sessionId: string, model: string, cwd: string): void {
        this.emit({
            event: 'session_started',
            agent_slug: agentSlug,
            session_id: sessionId,
            data: { model, cwd },
        });
    }

    sessionEnded(
        agentSlug: string,
        sessionId: string,
        success: boolean,
        durationMs: number,
        usage?: { input_tokens: number; output_tokens: number; total_tokens: number },
    ): void {
        this.emit({
            event: 'session_ended',
            agent_slug: agentSlug,
            session_id: sessionId,
            data: { success, usage, duration_ms: durationMs },
        });
    }

    agentOutput(agentSlug: string, sessionId: string, messageType: string, content: unknown): void {
        this.emit({
            event: 'agent_output',
            agent_slug: agentSlug,
            session_id: sessionId,
            data: { message_type: messageType, content },
        });
    }

    heartbeatFired(agentSlug: string): void {
        this.emit({
            event: 'heartbeat_fired',
            agent_slug: agentSlug,
        });
    }

    heartbeatSkipped(agentSlug: string, reason: string): void {
        this.emit({
            event: 'heartbeat_skipped',
            agent_slug: agentSlug,
            data: { reason },
        });
    }

    agentMessage(agentSlug: string, project: string, channel: string, content: string): void {
        this.emit({
            event: 'agent_message',
            agent_slug: agentSlug,
            data: { project, channel, content },
        });
    }

    health(uptimeMs: number, activeSessions: number): void {
        this.emit({
            event: 'health',
            data: { status: 'ok', uptime_ms: uptimeMs, active_sessions: activeSessions },
        });
    }

    sessionsList(
        sessions: Array<{
            agent_slug: string;
            session_id: string;
            started_at: string;
            status: 'active' | 'idle';
        }>,
    ): void {
        this.emit({
            event: 'sessions',
            data: { sessions },
        });
    }

    error(message: string, code?: string, agentSlug?: string): void {
        this.emit({
            event: 'error',
            data: { message, code, agent_slug: agentSlug },
        });
    }

    // --- Hook adapter event methods (13 new event types) ---

    sseForward(agentSlug: string, sessionId: string, sseEvent: string, payload: unknown): void {
        this.emit({
            event: 'sse_forward',
            agent_slug: agentSlug,
            session_id: sessionId,
            data: { sse_event: sseEvent, payload },
        });
    }

    creditUsage(
        agentSlug: string,
        sessionId: string,
        inputTokens: number,
        outputTokens: number,
        costUsd: number,
        creditsConsumed: number,
    ): void {
        this.emit({
            event: 'credit_usage',
            agent_slug: agentSlug,
            session_id: sessionId,
            data: { input_tokens: inputTokens, output_tokens: outputTokens, cost_usd: costUsd, credits_consumed: creditsConsumed },
        });
    }

    sessionAnalytics(
        agentSlug: string,
        sessionId: string,
        metrics: { duration_ms: number; tool_calls: number; turns: number; model: string },
    ): void {
        this.emit({
            event: 'session_analytics',
            agent_slug: agentSlug,
            session_id: sessionId,
            data: metrics,
        });
    }

    updateAgentRun(
        agentSlug: string,
        sessionId: string,
        updates: { run_id: string; status: 'running' | 'completed' | 'failed' | 'cancelled'; metadata?: Record<string, unknown> },
    ): void {
        this.emit({
            event: 'update_agent_run',
            agent_slug: agentSlug,
            session_id: sessionId,
            data: updates,
        });
    }

    createInboxItem(
        agentSlug: string,
        channel: string,
        content: string,
        priority?: 'low' | 'medium' | 'high' | 'critical',
    ): void {
        this.emit({
            event: 'create_inbox_item',
            agent_slug: agentSlug,
            data: { channel, content, priority },
        });
    }

    pushNotification(
        userId: string,
        title: string,
        body: string,
        agentSlug?: string,
        actionUrl?: string,
    ): void {
        this.emit({
            event: 'push_notification',
            agent_slug: agentSlug,
            data: { user_id: userId, title, body, action_url: actionUrl },
        });
    }

    delegationRecord(fromAgent: string, toAgent: string, task: string, reason: string): void {
        this.emit({
            event: 'delegation_record',
            agent_slug: fromAgent,
            data: { from_agent: fromAgent, to_agent: toAgent, task, reason },
        });
    }

    hookLog(hookName: string, agentSlug: string, durationMs: number, success: boolean, error?: string): void {
        this.emit({
            event: 'hook_log',
            agent_slug: agentSlug,
            data: { hook_event: hookName, duration_ms: durationMs, success, error },
        });
    }

    aceReflection(agentSlug: string, reflectionType: string, content: string, confidence: number): void {
        this.emit({
            event: 'ace_reflection',
            agent_slug: agentSlug,
            data: { reflection_type: reflectionType, content, confidence },
        });
    }

    skillSuggestion(agentSlug: string, skillName: string, reason: string, autoApply: boolean): void {
        this.emit({
            event: 'skill_suggestion',
            agent_slug: agentSlug,
            data: { skill_name: skillName, reason, auto_apply: autoApply },
        });
    }

    sandboxLifecycle(
        action: 'start' | 'stop' | 'archive' | 'delete' | 'restore',
        sandboxId: string,
        previousState?: string,
    ): void {
        this.emit({
            event: 'sandbox_lifecycle',
            data: { sandbox_id: sandboxId, action, previous_state: previousState },
        });
    }

    triggerIndexing(agentSlug: string, contentType: string, contentPath: string, operation: 'index' | 'reindex' | 'delete', workspaceId?: string): void {
        this.emit({
            event: 'trigger_indexing',
            agent_slug: agentSlug,
            data: { content_type: contentType, content_path: contentPath, operation, workspace_id: workspaceId },
        });
    }

    subagentFailure(
        agentSlug: string,
        subagentType: string,
        errorMessage: string,
        recoverable: boolean,
        errorCode?: string,
    ): void {
        this.emit({
            event: 'subagent_failure',
            agent_slug: agentSlug,
            data: { subagent_type: subagentType, error_message: errorMessage, recoverable, error_code: errorCode },
        });
    }

    scaffoldComplete(agentSlug: string, filesWritten: number): void {
        this.emit({
            event: 'scaffold_complete',
            agent_slug: agentSlug,
            data: { files_written: filesWritten },
        });
    }

    hitlRequest(
        agentSlug: string,
        sessionId: string,
        pauseId: string,
        request: {
            scenario: string;
            question: string;
            tool_name: string;
            tool_input: Record<string, unknown>;
            options?: string[];
            requires_auth?: boolean;
            timeout_seconds: number;
            ui_hint?: string;
            browser_url?: string;
            preview_url?: string;
            artifact_path?: string;
        },
    ): void {
        this.emit({
            event: 'hitl_request',
            agent_slug: agentSlug,
            session_id: sessionId,
            data: { pause_id: pauseId, ...request },
        });
    }

    metadataSync(agentSlug: string, entity: string, action: string, data: unknown): void {
        this.emit({
            event: 'metadata_sync',
            agent_slug: agentSlug,
            session_id: '',
            data: { entity, action, data },
        });
    }
}
