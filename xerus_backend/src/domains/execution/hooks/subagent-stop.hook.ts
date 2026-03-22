// SubagentStop Hook
// Delegation tracking when a subagent completes execution
// Tracks analytics, updates credit usage, and notifies on failure

import { SubagentStopInput, HookResult } from './hooks.types';
import { StreamEvent, ProgressEventContent } from '../types';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface SubagentStopContext {
    agent_id: number;
    agent_slug: string;
    user_id: string;
    execution_id: string;
}

export interface DelegationRecord {
    parent_agent_id: number;
    subagent_type: string;
    success: boolean;
    duration_ms: number;
    timestamp: Date;
}

export interface DelegationTracker {
    record(delegation: DelegationRecord): Promise<void>;
}

export interface SubagentCreditTracker {
    recordDelegation(userId: string, subagentType: string, tokensUsed: number): Promise<void>;
}

export interface SubagentNotificationService {
    notifyAgentFailure(params: {
        parent_agent_id: number;
        subagent_type: string;
        error?: string;
    }): Promise<void>;
}

export interface SubagentSSEEmitter {
    emit(event: StreamEvent): void;
}

export interface SubagentStopHandlerDeps {
    delegationTracker: DelegationTracker;
    creditTracker: SubagentCreditTracker;
    notificationService: SubagentNotificationService;
    sseEmitter: SubagentSSEEmitter;
}

export interface SubagentStopHandlerResult extends HookResult {
    subagent_type: string;
    subagent_success: boolean;
    duration_ms: number;
}

// -----------------------------------------------------------------------------
// SubagentStop Handler
// -----------------------------------------------------------------------------

export class SubagentStopHandler {
    private readonly deps: SubagentStopHandlerDeps;
    private readonly context: SubagentStopContext;

    constructor(deps: SubagentStopHandlerDeps, context: SubagentStopContext) {
        this.deps = deps;
        this.context = context;
    }

    async handle(input: SubagentStopInput): Promise<SubagentStopHandlerResult> {
        // 1. Track delegation for analytics
        await this.trackDelegation(input);

        // 2. Update credit usage for subagent execution
        await this.trackCredits(input);

        // 3. Notify on failure
        if (!input.success) {
            await this.notifyFailure(input);
        }

        // 4. Emit SSE event for frontend
        this.emitSubagentCompletedEvent(input);

        return {
            success: true,
            subagent_type: input.subagent_type,
            subagent_success: input.success,
            duration_ms: input.duration_ms,
        };
    }

    // -------------------------------------------------------------------------
    // Private Methods
    // -------------------------------------------------------------------------

    private async trackDelegation(input: SubagentStopInput): Promise<void> {
        const record: DelegationRecord = {
            parent_agent_id: this.context.agent_id,
            subagent_type: input.subagent_type,
            success: input.success,
            duration_ms: input.duration_ms,
            timestamp: new Date(),
        };

        await this.deps.delegationTracker.record(record);
    }

    private async trackCredits(input: SubagentStopInput): Promise<void> {
        if (input.tokens_used === undefined) {
            return;
        }

        await this.deps.creditTracker.recordDelegation(
            this.context.user_id,
            input.subagent_type,
            input.tokens_used,
        );
    }

    private async notifyFailure(input: SubagentStopInput): Promise<void> {
        await this.deps.notificationService.notifyAgentFailure({
            parent_agent_id: this.context.agent_id,
            subagent_type: input.subagent_type,
            error: input.error,
        });
    }

    private emitSubagentCompletedEvent(input: SubagentStopInput): void {
        const message = input.success
            ? `Subagent ${input.subagent_type} completed in ${input.duration_ms}ms`
            : `Subagent ${input.subagent_type} failed: ${input.error ?? 'unknown error'}`;

        const content: ProgressEventContent = {
            phase: 'subagent_completed',
            message,
            percent: -1,
        };

        const event: StreamEvent = {
            type: 'progress',
            execution_id: this.context.execution_id,
            content,
            timestamp: new Date().toISOString(),
        };

        this.deps.sseEmitter.emit(event);
    }
}

// -----------------------------------------------------------------------------
// Factory Function
// -----------------------------------------------------------------------------

/**
 * Create a hook handler function for SubagentStop events.
 * This function matches the HookHandler signature expected by the hooks system.
 */
export function createSubagentStopHandler(
    deps: SubagentStopHandlerDeps,
    context: SubagentStopContext,
): (input: SubagentStopInput) => Promise<SubagentStopHandlerResult> {
    const handler = new SubagentStopHandler(deps, context);
    return (input: SubagentStopInput) => handler.handle(input);
}
