// Teammate Idle Hook
// Notifies the team lead when a teammate agent becomes idle after completing work
// Emits notification via StdoutEmitter for backend processing

import { TeammateIdleInput, HookResult } from './hooks.types';
import { StdoutEmitter } from '../runner/stdout-emitter';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface TeammateIdleContext {
    agent_slug: string;
    user_id: string;
    primary_channel_id?: string;
}

export interface TeammateIdleHandlerDeps {
    emitter: StdoutEmitter;
}

// -----------------------------------------------------------------------------
// Teammate Idle Handler
// -----------------------------------------------------------------------------

export class TeammateIdleHandler {
    private readonly deps: TeammateIdleHandlerDeps;
    private readonly context: TeammateIdleContext;

    constructor(deps: TeammateIdleHandlerDeps, context: TeammateIdleContext) {
        this.deps = deps;
        this.context = context;
    }

    async handle(input: TeammateIdleInput): Promise<HookResult> {
        const startMs = Date.now();

        // 1. Emit push notification so user knows teammate is idle
        this.emitIdleNotification(input);

        // 2. Emit inbox item for the channel
        this.emitInboxItem(input);

        // 3. Log hook execution
        const durationMs = Date.now() - startMs;
        this.deps.emitter.hookLog('TeammateIdle', this.context.agent_slug, durationMs, true);

        return { success: true };
    }

    // -------------------------------------------------------------------------
    // Private Methods
    // -------------------------------------------------------------------------

    private emitIdleNotification(input: TeammateIdleInput): void {
        const title = `${input.teammate_name} is idle`;
        const body = input.output_summary
            ? `Completed task and is now idle. Summary: ${input.output_summary}`
            : 'Completed task and is now available for new work.';

        this.deps.emitter.pushNotification(
            this.context.user_id,
            title,
            body,
            this.context.agent_slug,
        );
    }

    private emitInboxItem(input: TeammateIdleInput): void {
        if (!this.context.primary_channel_id) {
            throw new Error(`TeammateIdleHandler: primary_channel_id is required for agent ${this.context.agent_slug}`);
        }
        const channel = this.context.primary_channel_id;
        const content = input.output_summary
            ? `${input.teammate_name} is idle after completing task ${input.last_task_id ?? 'unknown'}. Output: ${input.output_summary}`
            : `${input.teammate_name} is idle and available for new work.`;

        this.deps.emitter.createInboxItem(
            this.context.agent_slug,
            channel,
            content,
            'low',
        );
    }
}
