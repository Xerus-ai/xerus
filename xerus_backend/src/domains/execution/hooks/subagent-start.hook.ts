// SubagentStart Hook
// Emits SSE event when an agent spawns a subagent, enabling frontend team observability

import { SubagentStartInput, HookResult } from './hooks.types';
import type { StdoutEmitter } from '../runner/stdout-emitter';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface SubagentStartContext {
    agent_slug: string;
    user_id: string;
}

export interface SubagentStartHandlerDeps {
    emitter: StdoutEmitter;
}

// -----------------------------------------------------------------------------
// SubagentStart Handler
// -----------------------------------------------------------------------------

export class SubagentStartHandler {
    private readonly deps: SubagentStartHandlerDeps;
    private readonly context: SubagentStartContext;

    constructor(deps: SubagentStartHandlerDeps, context: SubagentStartContext) {
        this.deps = deps;
        this.context = context;
    }

    async handle(input: SubagentStartInput): Promise<HookResult> {
        this.deps.emitter.sseForward(
            this.context.agent_slug,
            input.session_id,
            'subagent_start',
            {
                parentAgent: this.context.agent_slug,
                subagentType: input.subagent_type,
                taskDescription: input.task_description,
            },
        );
        return { success: true };
    }
}
