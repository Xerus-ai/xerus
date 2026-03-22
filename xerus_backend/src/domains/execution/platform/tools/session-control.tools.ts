// Session Control Platform Tools
// Implements platform.pause_execution, platform.resume_execution, platform.get_session_state
// Source: docs/planning/execution/architecture.md

import { query, transaction } from '../../../../database/connection';
import type {
    PauseExecutionInput,
    ResumeExecutionInput,
    GetSessionStateInput,
    CompleteSessionInput,
    PauseExecutionResult,
    ResumeExecutionResult,
    SessionStateResult,
    CompleteSessionResult,
} from '../../agents/xerus-master.types';
import type { SessionControlServicePort } from '../platform-tool.types';

// -----------------------------------------------------------------------------
// Errors
// -----------------------------------------------------------------------------

export class SessionNotFoundError extends Error {
    constructor(sessionId: string) {
        super(`Execution session not found: ${sessionId}`);
        this.name = 'SessionNotFoundError';
    }
}

export class SessionNotPausedError extends Error {
    constructor(sessionId: string) {
        super(`Execution session is not paused: ${sessionId}`);
        this.name = 'SessionNotPausedError';
    }
}

export class SessionAlreadyPausedError extends Error {
    constructor(sessionId: string) {
        super(`Execution session is already paused: ${sessionId}`);
        this.name = 'SessionAlreadyPausedError';
    }
}

// -----------------------------------------------------------------------------
// Row Types
// -----------------------------------------------------------------------------

interface SessionRow {
    status: string;
}

interface PauseRow {
    id: string;
    paused_at: Date;
}

interface SessionStateRow {
    id: string;
    status: string;
    agent_id: number;
    trigger_type: string;
    started_at: Date | null;
    completed_at: Date | null;
    input_tokens: number | null;
    output_tokens: number | null;
    credits_used: string | null;
    pause_id: string | null;
    pause_reason: string | null;
    pause_request_data: Record<string, unknown> | null;
}

// -----------------------------------------------------------------------------
// Session Control Service
// -----------------------------------------------------------------------------

export class SessionControlService implements SessionControlServicePort {
    async pauseExecution(
        userId: string,
        input: PauseExecutionInput
    ): Promise<PauseExecutionResult> {
        // Default reason must match CHECK constraint: approval_required, budget_exceeded, error, manual, permission_denied
        const { sessionId, reason = 'manual', checkpoint } = input;

        const session = await this.getSession(sessionId, userId);
        if (!session) {
            throw new SessionNotFoundError(sessionId);
        }

        if (session.status === 'paused') {
            throw new SessionAlreadyPausedError(sessionId);
        }

        return transaction(async (client) => {
            const pauseResult = await client.query<PauseRow>(
                `INSERT INTO execution_pause_states (execution_id, reason, request_data)
                 VALUES ($1::uuid, $2, $3::jsonb)
                 RETURNING id, paused_at`,
                [sessionId, reason, JSON.stringify(checkpoint ?? {})]
            );

            const pauseRow = pauseResult.rows[0];
            if (!pauseRow) {
                throw new Error('Failed to pause execution: no row returned from INSERT');
            }

            await client.query(
                `UPDATE execution_sessions SET status = 'paused' WHERE id = $1::uuid`,
                [sessionId]
            );

            return {
                sessionId,
                pauseId: pauseRow.id,
                pausedAt: pauseRow.paused_at.toISOString(),
                reason,
            };
        });
    }

    async resumeExecution(
        userId: string,
        input: ResumeExecutionInput
    ): Promise<ResumeExecutionResult> {
        const { sessionId, approved, feedback } = input;

        const session = await this.getSession(sessionId, userId);
        if (!session) {
            throw new SessionNotFoundError(sessionId);
        }

        if (session.status !== 'paused') {
            throw new SessionNotPausedError(sessionId);
        }

        const pauseResult = await query<{ id: string }>(
            `SELECT id FROM execution_pause_states
             WHERE execution_id = $1::uuid AND resolved_at IS NULL
             ORDER BY paused_at DESC LIMIT 1`,
            [sessionId]
        );

        if (pauseResult.rows.length === 0) {
            throw new SessionNotPausedError(sessionId);
        }

        const pauseId = pauseResult.rows[0].id;
        const resolution = approved ? 'approved' : 'rejected';
        const resolvedAt = new Date();

        return transaction(async (client) => {
            await client.query(
                `UPDATE execution_pause_states
                 SET resolved_at = $1, resolution = $2, resolved_by = $3,
                     request_data = request_data || $4::jsonb
                 WHERE id = $5::uuid`,
                [resolvedAt, resolution, userId, JSON.stringify({ feedback: feedback ?? null }), pauseId]
            );

            // Only set session back to 'running' on approval.
            // On rejection, let the execution pipeline handle the final session status
            // to avoid conflicts with pipeline's own updateSessionRecord.
            if (approved) {
                await client.query(
                    `UPDATE execution_sessions SET status = 'running' WHERE id = $1::uuid`,
                    [sessionId]
                );
            }

            return {
                sessionId,
                pauseId,
                resolution,
                resumedAt: resolvedAt.toISOString(),
            };
        });
    }

    async getSessionState(
        userId: string,
        input: GetSessionStateInput
    ): Promise<SessionStateResult> {
        const { sessionId, includeCheckpoint = false } = input;

        const result = await query<SessionStateRow>(
            `SELECT
                es.id, es.status, es.agent_id, es.trigger_type,
                es.started_at, es.completed_at, es.input_tokens,
                es.output_tokens, es.credits_used,
                eps.id as pause_id, eps.reason as pause_reason,
                eps.request_data as pause_request_data
             FROM execution_sessions es
             JOIN workspaces w ON es.workspace_id = w.id
             LEFT JOIN execution_pause_states eps ON es.id = eps.execution_id AND eps.resolved_at IS NULL
             WHERE es.id = $1::uuid AND w.user_id = $2`,
            [sessionId, userId]
        );

        if (result.rows.length === 0) {
            throw new SessionNotFoundError(sessionId);
        }

        const row = result.rows[0];

        const state: SessionStateResult = {
            sessionId: row.id,
            status: row.status as SessionStateResult['status'],
            agentId: row.agent_id,
            triggerType: row.trigger_type,
            startedAt: row.started_at?.toISOString(),
            completedAt: row.completed_at?.toISOString(),
            inputTokens: row.input_tokens ?? 0,
            outputTokens: row.output_tokens ?? 0,
            creditsUsed: parseFloat(row.credits_used ?? '0'),
        };

        if (row.pause_id) {
            state.pendingApproval = {
                pauseId: row.pause_id,
                reason: row.pause_reason ?? '',
                requestData: row.pause_request_data ?? {},
            };
        }

        if (includeCheckpoint && row.pause_request_data) {
            state.checkpoint = row.pause_request_data;
        }

        return state;
    }

    async completeSession(
        userId: string,
        input: CompleteSessionInput
    ): Promise<CompleteSessionResult> {
        const { reason, status = 'success', summary } = input;

        // Find the active session for this user
        const sessionResult = await query<{ id: string }>(
            `SELECT es.id FROM execution_sessions es
             JOIN workspaces w ON es.workspace_id = w.id
             WHERE w.user_id = $1 AND es.status = 'running'
             ORDER BY es.started_at DESC LIMIT 1`,
            [userId]
        );

        if (sessionResult.rows.length === 0) {
            throw new SessionNotFoundError('no active session');
        }

        const sessionId = sessionResult.rows[0].id;
        const completedAt = new Date();

        await query(
            `UPDATE execution_sessions
             SET status = $1, completed_at = $2,
                 agent_response = $3
             WHERE id = $4::uuid`,
            [status === 'failure' ? 'failed' : 'completed', completedAt, summary ?? reason ?? null, sessionId]
        );

        return {
            acknowledged: true,
            session_id: sessionId,
            completed_at: completedAt.toISOString(),
        };
    }

    private async getSession(sessionId: string, userId: string): Promise<SessionRow | null> {
        const result = await query<SessionRow>(
            `SELECT es.status FROM execution_sessions es
             JOIN workspaces w ON es.workspace_id = w.id
             WHERE es.id = $1::uuid AND w.user_id = $2`,
            [sessionId, userId]
        );
        return result.rows[0] ?? null;
    }
}

// -----------------------------------------------------------------------------
// Singleton
// -----------------------------------------------------------------------------

let serviceInstance: SessionControlService | null = null;

export function getSessionControlService(): SessionControlService {
    if (!serviceInstance) {
        serviceInstance = new SessionControlService();
    }
    return serviceInstance;
}

export function resetSessionControlService(): void {
    serviceInstance = null;
}
