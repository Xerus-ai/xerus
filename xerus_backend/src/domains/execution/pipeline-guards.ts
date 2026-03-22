// Pipeline Guards
// Type-narrowing helpers for PipelineContext fields that start null
// and get resolved during pipeline execution.

import type { AgentRow, PipelineContext } from './execution-pipeline.types';
import { DomainError } from '../../utils/errors';

/**
 * Asserts that ctx.agent has been resolved. Call at any pipeline step that
 * runs after loadAgent(). Throws DomainError if agent is still null
 * (indicates a pipeline ordering bug, not a user error).
 */
export function requireAgent(ctx: PipelineContext): AgentRow {
    if (!ctx.agent) {
        throw new DomainError('Agent not resolved in pipeline', 500, 'AGENT_NOT_RESOLVED');
    }
    return ctx.agent;
}
