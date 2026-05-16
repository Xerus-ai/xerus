// Task Completed Hook
// Tracks task completion and notifies the team when a teammate finishes a task
// Emits update + notification events via StdoutEmitter for backend processing

import { TaskCompletedInput, HookResult } from './hooks.types';
import { StdoutEmitter } from '../runner/stdout-emitter';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface TaskCompletedContext {
    agent_slug: string;
    user_id: string;
    primary_channel_id?: string;
}

export interface TaskCompletedHandlerDeps {
    emitter: StdoutEmitter;
}

// -----------------------------------------------------------------------------
// Task Completed Handler
// -----------------------------------------------------------------------------

export class TaskCompletedHandler {
    private readonly deps: TaskCompletedHandlerDeps;
    private readonly context: TaskCompletedContext;

    constructor(deps: TaskCompletedHandlerDeps, context: TaskCompletedContext) {
        this.deps = deps;
        this.context = context;
    }

    async handle(input: TaskCompletedInput): Promise<HookResult> {
        const startMs = Date.now();

        // 1. Emit inbox item with task completion details
        this.emitCompletionInboxItem(input);

        // 2. Emit push notification for task completion
        this.emitCompletionNotification(input);

        // 3. Index deliverables if present
        if (input.deliverables?.length) {
            this.emitDeliverableIndex(input);
        }

        // 4. Log hook execution
        const durationMs = Date.now() - startMs;
        this.deps.emitter.hookLog('TaskCompleted', this.context.agent_slug, durationMs, true);

        return { success: true };
    }

    // -------------------------------------------------------------------------
    // Private Methods
    // -------------------------------------------------------------------------

    private emitCompletionInboxItem(input: TaskCompletedInput): void {
        if (!this.context.primary_channel_id) {
            throw new Error(`TaskCompletedHandler: primary_channel_id is required for agent ${this.context.agent_slug}`);
        }
        const channel = this.context.primary_channel_id;
        const deliverablesList = input.deliverables?.length
            ? ` Deliverables: ${input.deliverables.join(', ')}`
            : '';

        const content = `${input.completed_by} completed "${input.task_title}" (${input.task_id}).${deliverablesList}`;

        this.deps.emitter.createInboxItem(
            this.context.agent_slug,
            channel,
            content,
            'medium',
        );
    }

    private emitDeliverableIndex(input: TaskCompletedInput): void {
        const date = new Date().toISOString().slice(0, 10);
        for (const deliverable of input.deliverables ?? []) {
            const filename = `${date}-${deliverable.replace(/[^a-zA-Z0-9._-]/g, '-')}`;
            this.deps.emitter.emit({
                event: 'agent_output',
                agent_slug: this.context.agent_slug,
                data: {
                    output_type: 'deliverable',
                    task_id: input.task_id,
                    task_title: input.task_title,
                    file_path: deliverable,
                    output_filename: filename,
                    channel_id: this.context.primary_channel_id,
                },
            });
        }
    }

    private emitCompletionNotification(input: TaskCompletedInput): void {
        const title = `Task completed: ${input.task_title}`;
        const body = input.deliverables?.length
            ? `${input.completed_by} finished with ${input.deliverables.length} deliverable(s).`
            : `${input.completed_by} finished the task.`;

        this.deps.emitter.pushNotification(
            this.context.user_id,
            title,
            body,
            this.context.agent_slug,
        );
    }
}
