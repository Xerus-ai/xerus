// Hook Builders
// Individual hook builder functions extracted from runtime-hook-factory.ts
// Covers: TeammateIdle, TaskCompleted, SubagentStop, SubagentStart, PermissionRequest

import crypto from 'crypto';
import type {
    HookHandlerMap,
    SubagentStopInput,
    TeammateIdleInput,
    TaskCompletedInput,
    PermissionRequestInput,
} from '../hooks/hooks.types';
import { TaskCompletedHandler } from '../hooks/task-completed.hook';
import { TeammateIdleHandler } from '../hooks/teammate-idle.hook';
import { SubagentStartHandler } from '../hooks/subagent-start.hook';
import { SubagentStopHandler } from '../hooks/subagent-stop.hook';
import { evaluateHitlRule, getHitlRequirement } from '../platform/hitl-rules';
import { DEFAULT_HITL_TIMEOUT_SECONDS } from '../hitl/hitl.types';
import { registerPause } from './hitl-pause-registry';
import type { StdoutEmitter } from './stdout-emitter';
import type { RuntimeHookContext } from './runtime-hook-factory';
import type { TeamMemoryCoordinatorService } from '../../memory/git-memory/team-memory-coordinator.service';
import type { StreamEvent } from '../types';

// -----------------------------------------------------------------------------
// Team Hooks (TeammateIdle + TaskCompleted)
// -----------------------------------------------------------------------------

export function buildTeamHooks(
    ctx: RuntimeHookContext,
    emitter: StdoutEmitter,
    teamCoordinator: TeamMemoryCoordinatorService,
    handlers: HookHandlerMap,
): void {
    const teamCtx = {
        agent_slug: ctx.agentSlug,
        user_id: ctx.userId,
        primary_channel_id: ctx.primaryChannelId,
    };

    const idleHandler = new TeammateIdleHandler({ emitter }, teamCtx);
    handlers.TeammateIdle = [
        input => idleHandler.handle(input),
        async (input) => {
            const idleInput = input as TeammateIdleInput;
            emitter.sseForward(ctx.agentSlug, idleInput.session_id, 'progress', {
                phase: 'teammate_idle',
                message: `Teammate idle: ${idleInput.teammate_name || 'unknown'}`,
                percent: -1,
            });
            return { success: true };
        },
    ];

    const taskHandler = new TaskCompletedHandler({ emitter }, teamCtx);
    handlers.TaskCompleted = [
        input => taskHandler.handle(input),
        async (input) => {
            const taskInput = input as TaskCompletedInput;
            emitter.sseForward(ctx.agentSlug, taskInput.session_id, 'progress', {
                phase: 'task_completed',
                message: `Task completed: ${taskInput.task_title || 'unknown'}`,
                percent: -1,
            });
            return { success: true };
        },
        async (input) => {
            const taskInput = input as TaskCompletedInput;
            await teamCoordinator.writeTeamParticipation({
                agentId: ctx.agentId,
                agentSlug: ctx.agentSlug,
                teamExecutionId: taskInput.session_id,
                role: 'team_member',
                taskReceived: taskInput.task_title || '',
                resultSummary: String(taskInput.deliverables || ''),
                outcome: 'success',
                teamGoal: '',
                coordinationMode: 'parallel',
                learnedLessons: [],
            });
            return { success: true };
        },
    ];
}

// -----------------------------------------------------------------------------
// SubagentStop + SubagentStart Hooks
// -----------------------------------------------------------------------------

export function buildSubagentHooks(
    ctx: RuntimeHookContext,
    emitter: StdoutEmitter,
    forwarder: { emit: (event: StreamEvent) => void },
    handlers: HookHandlerMap,
): void {
    const subagentStopHandler = new SubagentStopHandler(
        {
            delegationTracker: {
                record: async (delegation) => {
                    emitter.emit({
                        event: 'delegation_record',
                        agent_slug: ctx.agentSlug,
                        data: delegation,
                    });
                },
            },
            creditTracker: {
                recordDelegation: async (userId, subagentType, tokensUsed) => {
                    emitter.emit({
                        event: 'credit_usage',
                        agent_slug: ctx.agentSlug,
                        data: { user_id: userId, subagent_type: subagentType, tokens_used: tokensUsed },
                    });
                },
            },
            notificationService: {
                notifyAgentFailure: async (params) => {
                    emitter.subagentFailure(
                        ctx.agentSlug,
                        params.subagent_type,
                        params.error ?? 'unknown error',
                        true,
                    );
                },
            },
            sseEmitter: forwarder,
        },
        { agent_id: ctx.agentId, agent_slug: ctx.agentSlug, user_id: ctx.userId, execution_id: '' },
    );
    handlers.SubagentStop = [
        input => subagentStopHandler.handle(input),
        async (input) => {
            const stopInput = input as SubagentStopInput;
            emitter.sseForward(ctx.agentSlug, stopInput.session_id, 'subagent_stop', {
                parentAgent: ctx.agentSlug,
                subagentType: stopInput.subagent_type,
                success: stopInput.success,
                durationMs: stopInput.duration_ms,
                error: stopInput.error,
            });
            return { success: true };
        },
    ];

    const subagentStartHandler = new SubagentStartHandler(
        { emitter },
        { agent_slug: ctx.agentSlug, user_id: ctx.userId },
    );
    handlers.SubagentStart = [input => subagentStartHandler.handle(input)];
}

// -----------------------------------------------------------------------------
// PermissionRequest Hook (HITL pause/resume)
// -----------------------------------------------------------------------------

export function buildPermissionRequestHook(
    ctx: RuntimeHookContext,
    emitter: StdoutEmitter,
    handlers: HookHandlerMap,
): void {
    handlers.PermissionRequest = [
        async (input) => {
            const permInput = input as PermissionRequestInput;
            const hitlResult = evaluateHitlRule({
                tool_name: permInput.tool_name,
                tool_input: permInput.tool_input,
                agent_id: String(ctx.agentId),
                user_id: ctx.userId,
                session_id: permInput.session_id,
                transcript_path: permInput.transcript_path,
                cwd: permInput.cwd,
            });

            // Auto-approve tools that don't require human review
            if (hitlResult.permission_decision === 'allow') {
                return { success: true, hook_specific_output: hitlResult };
            }

            // Deny tools that are explicitly forbidden
            if (hitlResult.permission_decision === 'deny') {
                return { success: true, hook_specific_output: hitlResult };
            }

            // 'ask': pause execution and wait for user approval
            const pauseId = crypto.randomUUID();
            const requirement = getHitlRequirement(permInput.tool_name);
            const scenario = requirement === 'always' ? 'approval_required' : 'conditional_approval';
            const timeoutMs = DEFAULT_HITL_TIMEOUT_SECONDS * 1000;

            // Register pause BEFORE emitting -- response can arrive via stdin
            // before registerPause() is called if emitted first (race condition).
            const pausePromise = registerPause(pauseId, permInput.tool_name, timeoutMs);

            emitter.hitlRequest(ctx.agentSlug, permInput.session_id, pauseId, {
                scenario,
                question: hitlResult.permission_decision_reason || `Approve ${permInput.tool_name}?`,
                tool_name: permInput.tool_name,
                tool_input: permInput.tool_input,
                requires_auth: hitlResult.requires_auth,
                timeout_seconds: DEFAULT_HITL_TIMEOUT_SECONDS,
            });

            const resolution = await pausePromise;

            return {
                success: true,
                hook_specific_output: {
                    hook_event_name: 'PreToolUse' as const,
                    permission_decision: resolution.approved ? 'allow' as const : 'deny' as const,
                    permission_decision_reason: resolution.feedback || (resolution.approved ? 'User approved' : 'User denied'),
                },
            };
        },
    ];
}
