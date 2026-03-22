// PostToolUse Hook
// Monitors context usage after each tool execution and injects steering messages
// Implements cc-context-awareness pattern with graduated thresholds

import { PostToolUseInput, HookResult, PostToolUseOutput } from './hooks.types';
import {
    ThresholdMonitor,
    ThresholdResult,
    createThresholdMonitor,
} from './threshold-monitor';
import { StreamEvent } from '../types';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface PostToolUseContext {
    execution_id: string;
    max_tokens: number;
    current_tokens: number;
}

export interface SSEEmitter {
    emit(event: StreamEvent): void;
}

export interface PostToolUseCreditTracker {
    recordToolUsage(userId: string, toolName: string, tokensUsed: number): Promise<void>;
}

export interface PostToolUseHandlerDeps {
    sseEmitter: SSEEmitter;
    creditTracker?: PostToolUseCreditTracker;
    onCreditFailure?: (error: string) => void;
}

// -----------------------------------------------------------------------------
// PostToolUse Handler
// -----------------------------------------------------------------------------

export class PostToolUseHandler {
    private readonly deps: PostToolUseHandlerDeps;
    private readonly context: PostToolUseContext;
    private readonly thresholdMonitor: ThresholdMonitor;

    constructor(
        deps: PostToolUseHandlerDeps,
        context: PostToolUseContext,
        thresholdMonitor?: ThresholdMonitor
    ) {
        this.deps = deps;
        this.context = context;
        this.thresholdMonitor = thresholdMonitor ?? createThresholdMonitor();
    }

    async handle(input: PostToolUseInput): Promise<HookResult> {
        // Track credit usage if tracker provided
        await this.trackCreditUsage(input);

        // Accumulate token usage from this tool call
        if (input.tokens_used && input.tokens_used > 0) {
            this.context.current_tokens += input.tokens_used;
        }

        // Calculate current context usage percentage
        const usedPercent = this.calculateUsagePercent();

        // Check thresholds - may throw ContextThresholdExceededError at 95%
        const thresholdResult = this.thresholdMonitor.checkThreshold(usedPercent);

        // No threshold crossed
        if (!thresholdResult) {
            return { success: true };
        }

        // Emit SSE event for frontend
        this.emitWarningEvent(thresholdResult);

        // Return result with additional context for agent injection
        return this.buildHookResult(thresholdResult, input.tokens_used);
    }

    /**
     * Reset threshold tracking after context compaction.
     * Allows tiers to fire again if usage increases.
     */
    resetOnCompaction(): void {
        this.thresholdMonitor.resetOnCompaction();
    }

    /**
     * Get the underlying threshold monitor for testing/inspection.
     */
    getThresholdMonitor(): ThresholdMonitor {
        return this.thresholdMonitor;
    }

    // -------------------------------------------------------------------------
    // Private Methods
    // -------------------------------------------------------------------------

    private async trackCreditUsage(input: PostToolUseInput): Promise<void> {
        if (!this.deps.creditTracker || !input.tokens_used) {
            return;
        }

        try {
            await this.deps.creditTracker.recordToolUsage(
                input.user_id,
                input.tool_name,
                input.tokens_used
            );
        } catch (error) {
            // Credit tracking must not block context monitoring (threshold checks below).
            // Emit failure event for backend observability instead of swallowing.
            const message = error instanceof Error ? error.message : 'Unknown error';
            if (this.deps.onCreditFailure) {
                this.deps.onCreditFailure(message);
            }
        }
    }

    private calculateUsagePercent(): number {
        // Fail-fast on invalid configuration
        if (this.context.max_tokens <= 0) {
            throw new Error(`Invalid max_tokens: ${this.context.max_tokens}. Must be positive.`);
        }
        return (this.context.current_tokens / this.context.max_tokens) * 100;
    }

    private emitWarningEvent(result: ThresholdResult): void {
        const event = this.thresholdMonitor.createSSEEvent(
            this.context.execution_id,
            result,
            this.context.current_tokens,
            this.context.max_tokens
        );

        this.deps.sseEmitter.emit(event);
    }

    private buildHookResult(result: ThresholdResult, tokensUsed?: number): HookResult {
        const output: PostToolUseOutput = {
            threshold_level: result.level,
            tokens_used: tokensUsed,
        };

        // Include additional context for agent steering (injected into conversation)
        if (result.additional_context) {
            output.additional_context = result.additional_context;
        }

        return {
            success: true,
            hook_specific_output: output,
        };
    }
}

