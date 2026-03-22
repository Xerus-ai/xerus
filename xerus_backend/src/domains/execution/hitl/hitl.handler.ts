// HITL Handler
// Manages pause/resume approval workflow for PreToolUse 'ask' decisions.
// Creates pause states in DB, emits guidance SSE events, resolves approvals.
//
// Flow:
//   1. PreToolUse hook returns decision='ask' -> runner calls requestApproval()
//   2. Handler creates pause state in DB + emits guidance SSE event
//   3. Frontend shows approval UI to user
//   4. User approves/rejects -> backend calls resolveApproval()
//   5. Handler updates DB + returns result to runner

import {
    HITLRequest,
    HITLResponse,
    HITLPauseState,
    HITLResult,
    HITLRequestData,
    HITLScenario,
    DEFAULT_HITL_TIMEOUT_SECONDS,
} from './hitl.types';
import type { PauseReason, PauseResolution } from '../../history/sessions/session.types';
import { StreamEvent, GuidanceEventContent } from '../types';
import {
    PauseStateNotFoundError,
    PauseStateAlreadyResolvedError,
    NoPendingApprovalError,
} from './hitl.errors';

// -----------------------------------------------------------------------------
// Dependency Interfaces
// -----------------------------------------------------------------------------

export interface HITLPauseRepository {
    createPauseState(
        executionId: string,
        reason: string,
        requestData: HITLRequestData
    ): Promise<{ id: string; paused_at: string }>;

    getPendingPauseState(pauseId: string): Promise<HITLPauseState | null>;

    getPendingForExecution(executionId: string): Promise<HITLPauseState | null>;

    resolvePauseState(
        pauseId: string,
        resolution: PauseResolution,
        resolvedBy: string,
        feedback?: string
    ): Promise<{ resolved_at: string }>;
}

export interface HITLSSEEmitter {
    emit(event: StreamEvent): void;
}

export interface HITLHandlerDeps {
    pauseRepository: HITLPauseRepository;
    sseEmitter: HITLSSEEmitter;
}

// -----------------------------------------------------------------------------
// Scenario-to-reason mapping
// -----------------------------------------------------------------------------

const INTERVENTION_SCENARIOS: ReadonlySet<HITLScenario> = new Set([
    'browser_captcha', 'browser_payment', 'browser_2fa', 'browser_auth', 'external_action',
]);

const APPROVAL_SCENARIOS: ReadonlySet<HITLScenario> = new Set([
    'content_approval', 'deliverable_review',
]);

export function resolveHitlReason(scenario: HITLScenario, requiresAuth?: boolean): PauseReason {
    if (requiresAuth) return 'permission_denied';
    if (INTERVENTION_SCENARIOS.has(scenario)) return 'intervention_required';
    if (APPROVAL_SCENARIOS.has(scenario)) return 'approval_required';
    return 'approval_required';
}

// -----------------------------------------------------------------------------
// HITL Handler
// -----------------------------------------------------------------------------

export class HITLHandler {
    private readonly deps: HITLHandlerDeps;

    constructor(deps: HITLHandlerDeps) {
        this.deps = deps;
    }

    /**
     * Request user approval for a tool call.
     * Creates a pause state in DB and emits a guidance SSE event.
     * Returns the pause ID that the runner should wait on.
     */
    async requestApproval(request: HITLRequest): Promise<string> {
        const requestData: HITLRequestData = {
            scenario: request.scenario,
            question: request.question,
            tool_name: request.tool_name,
            tool_input: request.tool_input,
            agent_slug: request.agent_slug,
            options: request.options,
            expanded_context: request.expanded_context,
            requires_auth: request.requires_auth,
            ui_hint: request.ui_hint,
            browser_url: request.browser_url,
            preview_url: request.preview_url,
            artifact_path: request.artifact_path,
        };

        const reason = resolveHitlReason(request.scenario, request.requires_auth);

        const { id: pauseId } = await this.deps.pauseRepository.createPauseState(
            request.execution_id,
            reason,
            requestData
        );

        this.emitGuidanceEvent(request, pauseId);

        return pauseId;
    }

    /**
     * Resolve a pending approval with user's decision.
     * Updates the pause state in DB and returns the result.
     */
    async resolveApproval(response: HITLResponse): Promise<HITLResult> {
        const pauseState = await this.deps.pauseRepository.getPendingPauseState(response.pause_id);

        if (!pauseState) {
            throw new PauseStateNotFoundError(response.pause_id);
        }

        if (pauseState.resolved_at !== null) {
            throw new PauseStateAlreadyResolvedError(
                response.pause_id,
                pauseState.resolution ?? 'unknown'
            );
        }

        const resolution: PauseResolution = response.approved ? 'approved' : 'rejected';

        const { resolved_at } = await this.deps.pauseRepository.resolvePauseState(
            response.pause_id,
            resolution,
            response.resolved_by,
            response.feedback
        );

        return {
            pause_id: response.pause_id,
            approved: response.approved,
            feedback: response.feedback,
            resolution,
            resolved_at,
        };
    }

    /**
     * Get the pending approval for an execution, if any.
     */
    async getPendingApproval(executionId: string): Promise<HITLPauseState> {
        const pauseState = await this.deps.pauseRepository.getPendingForExecution(executionId);

        if (!pauseState) {
            throw new NoPendingApprovalError(executionId);
        }

        return pauseState;
    }

    // -------------------------------------------------------------------------
    // Private
    // -------------------------------------------------------------------------

    private emitGuidanceEvent(request: HITLRequest, pauseId: string): void {
        const content: GuidanceEventContent = {
            question: request.question,
            options: request.options,
            timeout_seconds: request.timeout_seconds ?? DEFAULT_HITL_TIMEOUT_SECONDS,
            pause_id: pauseId,
            scenario: request.scenario,
            tool_name: request.tool_name,
            agent_slug: request.agent_slug,
            requires_auth: request.requires_auth ?? false,
            execution_id: request.execution_id,
            ui_hint: request.ui_hint,
            browser_url: request.browser_url,
            preview_url: request.preview_url,
            artifact_path: request.artifact_path,
        };

        const event: StreamEvent = {
            type: 'guidance',
            execution_id: request.execution_id,
            content,
            meta: {
                pause_id: pauseId,
                scenario: request.scenario,
                tool_name: request.tool_name,
                agent_slug: request.agent_slug,
                requires_auth: request.requires_auth ?? false,
            },
            timestamp: new Date().toISOString(),
        };

        this.deps.sseEmitter.emit(event);
    }
}
