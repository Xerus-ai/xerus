// Real in-memory test implementations for ACE reflection trigger dependencies
// These are NOT mocks - they are real implementations that track calls for verification

import {
    ACEReflectionTriggerDeps,
    ReflectorAnalysis,
    CuratorChanges,
    ReflectorService,
    CuratorService,
    ReflectionRateLimiter,
    EventEmitter,
    ACEStateRepository,
} from '../ace-reflection.trigger';

// -----------------------------------------------------------------------------
// Call Tracker - records method calls for verification
// -----------------------------------------------------------------------------

export interface MethodCall<TArgs extends unknown[] = unknown[], TResult = unknown> {
    args: TArgs;
    result: TResult;
    timestamp: number;
}

export class CallTracker<TArgs extends unknown[] = unknown[], TResult = unknown> {
    private calls: MethodCall<TArgs, TResult>[] = [];

    record(args: TArgs, result: TResult): void {
        this.calls.push({ args, result, timestamp: Date.now() });
    }

    getCalls(): MethodCall<TArgs, TResult>[] {
        return [...this.calls];
    }

    getLastCall(): MethodCall<TArgs, TResult> | undefined {
        return this.calls[this.calls.length - 1];
    }

    wasCalled(): boolean {
        return this.calls.length > 0;
    }

    wasCalledWith(...expectedArgs: TArgs): boolean {
        return this.calls.some(
            (call) => {
                // For single arg, compare directly
                if (expectedArgs.length === 1) {
                    return JSON.stringify(call.args[0]) === JSON.stringify(expectedArgs[0]);
                }
                return JSON.stringify(call.args) === JSON.stringify(expectedArgs);
            }
        );
    }

    callCount(): number {
        return this.calls.length;
    }

    clear(): void {
        this.calls = [];
    }
}

// -----------------------------------------------------------------------------
// InMemoryReflector
// -----------------------------------------------------------------------------

export class InMemoryReflector implements ReflectorService {
    private analysisResult: ReflectorAnalysis = {
        qualityScores: { overall: 0.75, relevance: 0.8, completeness: 0.7 },
        insights: [{ type: 'default', content: 'Default insight' }],
        errors: [],
    };
    readonly analyzeCalls = new CallTracker<
        [{ agent_id: number; session_id: string; response?: string; tool_calls?: unknown[] }],
        ReflectorAnalysis
    >();
    private shouldFail = false;
    private failureError: Error | null = null;

    setAnalysisResult(result: ReflectorAnalysis): void {
        this.analysisResult = result;
    }

    setFailure(error: Error): void {
        this.shouldFail = true;
        this.failureError = error;
    }

    clearFailure(): void {
        this.shouldFail = false;
        this.failureError = null;
    }

    async analyze(params: {
        agent_id: number;
        session_id: string;
        response?: string;
        tool_calls?: unknown[];
    }): Promise<ReflectorAnalysis> {
        this.analyzeCalls.record([params], this.analysisResult);
        if (this.shouldFail && this.failureError) {
            throw this.failureError;
        }
        return this.analysisResult;
    }
}

// -----------------------------------------------------------------------------
// InMemoryCurator
// -----------------------------------------------------------------------------

export class InMemoryCurator implements CuratorService {
    private curationResult: CuratorChanges = {
        added: [],
        updated: [],
        deprecated: [],
    };
    readonly curateCalls = new CallTracker<[number, ReflectorAnalysis], CuratorChanges>();
    private shouldFail = false;
    private failureError: Error | null = null;

    setCurationResult(result: CuratorChanges): void {
        this.curationResult = result;
    }

    setFailure(error: Error): void {
        this.shouldFail = true;
        this.failureError = error;
    }

    clearFailure(): void {
        this.shouldFail = false;
        this.failureError = null;
    }

    async curate(agentId: number, analysis: ReflectorAnalysis): Promise<CuratorChanges> {
        this.curateCalls.record([agentId, analysis], this.curationResult);
        if (this.shouldFail && this.failureError) {
            throw this.failureError;
        }
        return this.curationResult;
    }
}

// -----------------------------------------------------------------------------
// InMemoryRateLimiter
// -----------------------------------------------------------------------------

export class InMemoryRateLimiter implements ReflectionRateLimiter {
    private limited = false;
    private attempts: Map<number, number[]> = new Map();
    readonly isLimitedCalls = new CallTracker<[number], boolean>();
    readonly recordAttemptCalls = new CallTracker<[number], void>();

    setLimited(limited: boolean): void {
        this.limited = limited;
    }

    isLimited(agentId: number): boolean {
        this.isLimitedCalls.record([agentId], this.limited);
        return this.limited;
    }

    recordAttempt(agentId: number): void {
        this.recordAttemptCalls.record([agentId], undefined);
        const current = this.attempts.get(agentId) || [];
        current.push(Date.now());
        this.attempts.set(agentId, current);
    }

    getAttemptCount(agentId: number): number {
        return this.attempts.get(agentId)?.length || 0;
    }
}

// -----------------------------------------------------------------------------
// InMemoryEventEmitter
// -----------------------------------------------------------------------------

export class InMemoryEventEmitter implements EventEmitter {
    private events: Array<{ event: string; data: unknown }> = [];
    readonly emitCalls = new CallTracker<[string, unknown], void>();

    emit(event: string, data: unknown): void {
        this.emitCalls.record([event, data], undefined);
        this.events.push({ event, data });
    }

    getEvents(): typeof this.events {
        return [...this.events];
    }

    getEventsByName(event: string): unknown[] {
        return this.events.filter((e) => e.event === event).map((e) => e.data);
    }

    getLastEmittedData(event: string): unknown {
        const events = this.getEventsByName(event);
        return events[events.length - 1];
    }

    wasCalledWith(event: string): boolean {
        return this.events.some((e) => e.event === event);
    }
}

// -----------------------------------------------------------------------------
// InMemoryACEStateRepository
// -----------------------------------------------------------------------------

export class InMemoryACEStateRepository implements ACEStateRepository {
    private states: Map<number, { total_reflections: number; last_reflection_at: Date }> = new Map();
    readonly incrementReflectionCountCalls = new CallTracker<[number], void>();

    async incrementReflectionCount(agentId: number): Promise<void> {
        this.incrementReflectionCountCalls.record([agentId], undefined);
        const current = this.states.get(agentId) || { total_reflections: 0, last_reflection_at: new Date() };
        this.states.set(agentId, {
            total_reflections: current.total_reflections + 1,
            last_reflection_at: new Date(),
        });
    }

    getState(agentId: number): { total_reflections: number; last_reflection_at: Date } | undefined {
        return this.states.get(agentId);
    }
}

// -----------------------------------------------------------------------------
// Factory Functions
// -----------------------------------------------------------------------------

export interface TestACEReflectionDeps extends ACEReflectionTriggerDeps {
    reflector: InMemoryReflector;
    curator: InMemoryCurator;
    rateLimiter: InMemoryRateLimiter;
    eventEmitter: InMemoryEventEmitter;
    aceStateRepository: InMemoryACEStateRepository;
}

export function createTestACEReflectionDeps(): TestACEReflectionDeps {
    return {
        reflector: new InMemoryReflector(),
        curator: new InMemoryCurator(),
        rateLimiter: new InMemoryRateLimiter(),
        eventEmitter: new InMemoryEventEmitter(),
        aceStateRepository: new InMemoryACEStateRepository(),
    };
}
