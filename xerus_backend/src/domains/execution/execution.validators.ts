// Execution Route Validators
// Input validation for execution API endpoints.

import { BadRequestError } from '../../utils/errors';
import { COORDINATION_MODES, CoordinationMode } from './types';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateUUID(id: string, label: string): void {
    if (!id || !UUID_REGEX.test(id)) {
        throw new BadRequestError(`${label} must be a valid UUID`);
    }
}

export interface ValidatedMessageBody {
    task: string;
    coordination_mode?: CoordinationMode;
    context?: Record<string, unknown>;
}

export function validateMessageBody(body: Record<string, unknown>): ValidatedMessageBody {
    const { task, coordination_mode, context } = body;

    if (typeof task !== 'string' || !task.trim()) {
        throw new BadRequestError('task is required and must be a non-empty string');
    }

    if (task.length > 10_000) {
        throw new BadRequestError('task must not exceed 10000 characters');
    }

    if (coordination_mode !== undefined) {
        if (!COORDINATION_MODES.includes(coordination_mode as CoordinationMode)) {
            throw new BadRequestError(
                `coordination_mode must be one of: ${COORDINATION_MODES.join(', ')}`,
            );
        }
    }

    if (context !== undefined) {
        if (typeof context !== 'object' || context === null || Array.isArray(context)) {
            throw new BadRequestError('context must be a plain object');
        }
    }

    return {
        task: task.trim(),
        coordination_mode: coordination_mode as CoordinationMode | undefined,
        context: context as Record<string, unknown> | undefined,
    };
}

export interface ValidatedRespondBody {
    guidance_id: string;
    accepted: boolean;
    response_value?: string;
}

export function validateRespondBody(body: Record<string, unknown>): ValidatedRespondBody {
    const { guidance_id, accepted, response_value } = body;

    if (typeof guidance_id !== 'string' || !guidance_id.trim()) {
        throw new BadRequestError('guidance_id is required and must be a non-empty string');
    }

    if (typeof accepted !== 'boolean') {
        throw new BadRequestError('accepted is required and must be a boolean');
    }

    if (response_value !== undefined && typeof response_value !== 'string') {
        throw new BadRequestError('response_value must be a string');
    }

    return {
        guidance_id: guidance_id.trim(),
        accepted,
        response_value: typeof response_value === 'string' ? response_value : undefined,
    };
}

export interface ValidatedCancelBody {
    reason?: string;
    method: 'graceful' | 'forced';
}

export function validateCancelBody(body: Record<string, unknown>): ValidatedCancelBody {
    const { reason, method } = body;

    if (reason !== undefined && typeof reason !== 'string') {
        throw new BadRequestError('reason must be a string');
    }

    const resolvedMethod = method ?? 'graceful';
    if (resolvedMethod !== 'graceful' && resolvedMethod !== 'forced') {
        throw new BadRequestError('method must be "graceful" or "forced"');
    }

    return {
        reason: typeof reason === 'string' ? reason : undefined,
        method: resolvedMethod as 'graceful' | 'forced',
    };
}
