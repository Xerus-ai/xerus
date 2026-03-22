// ACE Reflection Trigger
// Triggers async ACE reflection pipeline (Generator -> Reflector -> Curator)
// after execution completes. Non-blocking - fires via setImmediate().
//
// NOTE: This file implements the TRIGGER MECHANISM only (execution domain).
// The actual ACE services (ReflectorService, CuratorService, Generator, etc.)
// are part of the ACE domain which is separate scope and not yet implemented.
// When ACE domain is built, provide implementations of the interfaces below.

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Parameters for triggering reflection
 */
export interface ACEReflectionTriggerParams {
    /** Database agent ID */
    agent_id: number;
    /** Session ID for tracking */
    session_id: string;
    /** Final response from agent (optional) */
    response?: string;
    /** Tool calls made during execution (optional) */
    tool_calls?: unknown[];
}

/**
 * Quality scores from reflector analysis
 */
export interface QualityScores {
    overall: number;
    relevance?: number;
    completeness?: number;
    clarity?: number;
    accuracy?: number;
}

/**
 * Insight extracted from reflection
 */
export interface ReflectorInsight {
    type: string;
    content?: string;
    confidence?: number;
    helpfulness?: string;
    domain?: string;
    keywords?: string[];
}

/**
 * Error detected during reflection
 */
export interface ReflectorError {
    type: string;
    severity: string;
    description: string;
    prevention?: string;
}

/**
 * Analysis result from Reflector
 */
export interface ReflectorAnalysis {
    qualityScores: QualityScores;
    insights: ReflectorInsight[];
    errors: ReflectorError[];
    patterns?: {
        domain?: string;
        intent?: string;
        responseLength?: number;
        usedPlaybookEntries?: boolean;
    };
    timestamp?: string;
}

/**
 * Playbook change entry from curator (add/update/deprecate)
 * Change entry from curator (add/update/deprecate)
 */
export interface CuratorPlaybookChange {
    id: string;
    content?: string;
    newHelpfulness?: number;
    reason?: string;
}

/**
 * Changes made by Curator
 */
export interface CuratorChanges {
    added: CuratorPlaybookChange[];
    updated: CuratorPlaybookChange[];
    deprecated: CuratorPlaybookChange[];
}

/**
 * Result of ACE reflection trigger
 */
export interface ACEReflectionTriggerResult {
    /** Whether the operation completed (even if skipped) */
    success: boolean;
    /** Whether reflection was performed */
    reflected: boolean;
    /** Whether curation was performed */
    curated?: boolean;
    /** Reason for skipping (if skipped) */
    skipped_reason?: string;
    /** Error message (if failed) */
    error?: string;
    /** Reflector analysis (if successful) */
    analysis?: ReflectorAnalysis;
    /** Curator changes (if successful) */
    changes?: CuratorChanges;
}

// -----------------------------------------------------------------------------
// Dependency Interfaces
// -----------------------------------------------------------------------------

/**
 * Interface for Reflector service - analyzes response quality
 */
export interface ReflectorService {
    analyze(params: {
        agent_id: number;
        session_id: string;
        response?: string;
        tool_calls?: unknown[];
    }): Promise<ReflectorAnalysis>;
}

/**
 * Interface for Curator service - updates playbook
 */
export interface CuratorService {
    curate(agentId: number, analysis: ReflectorAnalysis): Promise<CuratorChanges>;
}

/**
 * Interface for rate limiting reflections
 */
export interface ReflectionRateLimiter {
    /** Check if agent is rate limited */
    isLimited(agentId: number): boolean;
    /** Record a reflection attempt */
    recordAttempt(agentId: number): void;
}

/**
 * Interface for event emitter
 */
export interface EventEmitter {
    emit(event: string, data: unknown): void;
}

/**
 * Interface for ACE state repository
 */
export interface ACEStateRepository {
    incrementReflectionCount(agentId: number): Promise<void>;
}

/**
 * Dependencies required by ACEReflectionTrigger
 */
export interface ACEReflectionTriggerDeps {
    reflector: ReflectorService;
    curator: CuratorService;
    rateLimiter: ReflectionRateLimiter;
    eventEmitter: EventEmitter;
    aceStateRepository: ACEStateRepository;
}

// -----------------------------------------------------------------------------
// ACEReflectionTrigger Class
// -----------------------------------------------------------------------------

/**
 * Triggers async ACE reflection pipeline after execution completes.
 *
 * Pipeline:
 * 1. Rate limit check - not every execution needs reflection
 * 2. Reflector analyzes response quality, identifies insights/failures
 * 3. Curator updates playbook (new entries, updates, deprecations)
 * 4. Events emitted for monitoring
 *
 * Key principle: Reflection failure should never affect user response.
 * The pipeline is non-blocking and all errors are caught.
 */
export class ACEReflectionTrigger {
    private readonly deps: ACEReflectionTriggerDeps;

    constructor(deps: ACEReflectionTriggerDeps) {
        this.deps = deps;
    }

    /**
     * Trigger reflection pipeline synchronously (for testing/direct use)
     * Returns result with reflection and curation status
     */
    async trigger(params: ACEReflectionTriggerParams): Promise<ACEReflectionTriggerResult> {
        const { agent_id, session_id, response, tool_calls } = params;

        // 1. Check rate limit
        if (this.deps.rateLimiter.isLimited(agent_id)) {
            return {
                success: true,
                reflected: false,
                skipped_reason: 'rate_limited',
            };
        }

        // 2. Record attempt for rate limiting
        this.deps.rateLimiter.recordAttempt(agent_id);

        let analysis: ReflectorAnalysis | undefined;
        let changes: CuratorChanges | undefined;

        try {
            // 3. Run Reflector
            analysis = await this.deps.reflector.analyze({
                agent_id,
                session_id,
                response,
                tool_calls,
            });

            // 4. Emit ace:reflected event
            this.deps.eventEmitter.emit('ace:reflected', {
                agent_id,
                session_id,
                quality_score: analysis.qualityScores.overall,
                insights_count: analysis.insights.length,
            });

            try {
                // 5. Run Curator
                changes = await this.deps.curator.curate(agent_id, analysis);

                // 6. Emit ace:curated event
                this.deps.eventEmitter.emit('ace:curated', {
                    agent_id,
                    session_id,
                    added: changes.added.length,
                    updated: changes.updated.length,
                    deprecated: changes.deprecated.length,
                });

                // 7. Update ace_state
                await this.deps.aceStateRepository.incrementReflectionCount(agent_id);

                return {
                    success: true,
                    reflected: true,
                    curated: true,
                    analysis,
                    changes,
                };
            } catch (curatorError) {
                // Curator failed but reflection succeeded
                this.emitError(agent_id, curatorError);
                return {
                    success: false,
                    reflected: true,
                    curated: false,
                    error: curatorError instanceof Error ? curatorError.message : String(curatorError),
                    analysis,
                };
            }
        } catch (reflectorError) {
            // Reflector failed
            this.emitError(agent_id, reflectorError);
            return {
                success: false,
                reflected: false,
                error: reflectorError instanceof Error ? reflectorError.message : String(reflectorError),
            };
        }
    }

    /**
     * Trigger reflection pipeline asynchronously (non-blocking)
     * Uses setImmediate to not block the caller
     */
    triggerAsync(params: ACEReflectionTriggerParams): void {
        setImmediate(async () => {
            try {
                await this.trigger(params);
            } catch (error) {
                // Catch any unexpected errors to prevent unhandled rejections
                this.emitError(params.agent_id, error);
            }
        });
    }

    /**
     * Emit error event for monitoring
     */
    private emitError(agentId: number, error: unknown): void {
        this.deps.eventEmitter.emit('ace:reflection_error', {
            agent_id: agentId,
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString(),
        });
    }
}

// -----------------------------------------------------------------------------
// Factory Function
// -----------------------------------------------------------------------------

/**
 * Create a trigger function for ACE reflection.
 * Matches the interface expected by SessionEndHandler.
 */
export function createACEReflectionTrigger(
    deps: ACEReflectionTriggerDeps
): (params: ACEReflectionTriggerParams) => Promise<ACEReflectionTriggerResult> {
    const trigger = new ACEReflectionTrigger(deps);
    return (params: ACEReflectionTriggerParams) => trigger.trigger(params);
}
