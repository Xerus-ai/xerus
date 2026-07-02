// Continuation Engine — decides whether to continue an agent's execution.
// Ported from Kortix continuation engine: "Open todos are AUTHORITATIVE;
// we continue even if the agent's final message was a premature 'all done' claim."

import { classifyIntent, type IntentDisposition } from './intent-gate';
import { enforceTodos, type TrackedTodo, type TodoEnforcerResult } from './todo-enforcer';
import { logger } from '../../../../utils/logger';

const log = logger('ContinuationEngine');

export interface ContinuationDecision {
    shouldContinue: boolean;
    reason: string;
    intent: IntentDisposition;
    todoResult: TodoEnforcerResult;
    continuationCount: number;
}

export interface ContinuationState {
    continuationCount: number;
    lastContinuationAt: number;
    consecutiveAborts: number;
}

const MAX_CONTINUATIONS = 3;
const MIN_WORK_DURATION_MS = 5_000;
const COOLDOWN_MS = 2_000;
const MAX_CONSECUTIVE_ABORTS = 2;

export function createContinuationState(): ContinuationState {
    return {
        continuationCount: 0,
        lastContinuationAt: 0,
        consecutiveAborts: 0,
    };
}

export function evaluateContinuation(
    finalMessage: string,
    todos: TrackedTodo[],
    state: ContinuationState,
    executionDurationMs: number,
): ContinuationDecision {
    const intent = classifyIntent(finalMessage);
    const todoResult = enforceTodos(todos);

    const base = { intent, todoResult, continuationCount: state.continuationCount };

    if (state.continuationCount >= MAX_CONTINUATIONS) {
        log.info('Max continuations reached', { count: state.continuationCount });
        return { ...base, shouldContinue: false, reason: `Max continuations (${MAX_CONTINUATIONS}) reached` };
    }

    if (state.consecutiveAborts >= MAX_CONSECUTIVE_ABORTS) {
        log.info('Circuit breaker: consecutive aborts', { aborts: state.consecutiveAborts });
        return { ...base, shouldContinue: false, reason: `Circuit breaker: ${state.consecutiveAborts} consecutive aborts` };
    }

    if (executionDurationMs < MIN_WORK_DURATION_MS) {
        log.info('Execution too short for continuation', { duration_ms: executionDurationMs });
        return { ...base, shouldContinue: false, reason: 'Execution too short — may indicate a loop' };
    }

    const timeSinceLastContinuation = Date.now() - state.lastContinuationAt;
    if (state.lastContinuationAt > 0 && timeSinceLastContinuation < COOLDOWN_MS) {
        return { ...base, shouldContinue: false, reason: 'Cooldown period active' };
    }

    if (intent === 'blocked-human' || intent === 'blocked-external') {
        return { ...base, shouldContinue: false, reason: `Agent blocked: ${intent}` };
    }

    if (intent === 'completed' && !todoResult.hasUnfinishedWork) {
        return { ...base, shouldContinue: false, reason: 'Genuinely completed — no open todos' };
    }

    if (todoResult.hasUnfinishedWork) {
        return { ...base, shouldContinue: true, reason: `Unfinished work: ${todoResult.summary}` };
    }

    if (intent === 'planning') {
        return { ...base, shouldContinue: true, reason: 'Agent stopped at a plan — should execute' };
    }

    if (intent === 'premature-stop') {
        return { ...base, shouldContinue: true, reason: 'Premature stop without clear completion signal' };
    }

    return { ...base, shouldContinue: false, reason: 'No continuation trigger matched' };
}

export function buildContinuationPrompt(decision: ContinuationDecision): string {
    const parts = [
        'You have unfinished work. Continue from where you left off.',
        '',
    ];

    if (decision.todoResult.hasUnfinishedWork) {
        parts.push(
            `Open todos (${decision.todoResult.actionableCount} remaining):`,
            decision.todoResult.summary,
            '',
        );
    }

    parts.push(
        'Do not stop until every todo is completed or genuinely blocked on external dependencies.',
        `This is continuation ${decision.continuationCount + 1} of ${MAX_CONTINUATIONS}.`,
    );

    return parts.join('\n');
}

export function recordContinuation(state: ContinuationState, wasProductive: boolean): void {
    state.continuationCount++;
    state.lastContinuationAt = Date.now();
    if (wasProductive) {
        state.consecutiveAborts = 0;
    } else {
        state.consecutiveAborts++;
    }
}
