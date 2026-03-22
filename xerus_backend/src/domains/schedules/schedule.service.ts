// Schedule Service
// User-friendly facade over heartbeat_configs
// Maps "schedule" concepts to heartbeat configuration

import { query } from '../../database/connection';
import { heartbeatConfigRepository } from '../heartbeat/heartbeat-config.repository';
import { heartbeatConfigService } from '../heartbeat/heartbeat-config.service';
import { HeartbeatConfig, UpdateHeartbeatConfigDTO } from '../heartbeat/types';
import { AppError } from '../../utils/errors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScheduleResponse {
    id: number;
    name: string;
    description: string | null;
    agent_id: number;
    schedule_type: 'once' | 'daily' | 'weekly' | 'monthly' | 'cron';
    schedule_config: Record<string, unknown>;
    timezone: string;
    enabled: boolean;
    task_prompt: string | null;
    task_context: Record<string, unknown> | null;
    workflow_config: Record<string, unknown> | null;
    last_run_at: string | null;
    next_run_at: string | null;
    run_count: number;
    last_status: 'success' | 'failed' | 'running' | null;
    last_error: string | null;
    last_execution_output: string | null;
    created_at: Date;
    updated_at: Date;
}

export interface CreateScheduleDTO {
    name: string;
    description?: string;
    agent_id: number;
    schedule_type: 'once' | 'daily' | 'weekly' | 'monthly' | 'cron';
    schedule_config: Record<string, unknown>;
    timezone?: string;
    enabled?: boolean;
    task_prompt?: string;
    task_context?: Record<string, unknown>;
    workflow_config?: Record<string, unknown>;
}

export interface UpdateScheduleDTO {
    name?: string;
    description?: string;
    agent_id?: number;
    schedule_type?: 'once' | 'daily' | 'weekly' | 'monthly' | 'cron';
    schedule_config?: Record<string, unknown>;
    timezone?: string;
    enabled?: boolean;
    task_prompt?: string;
    task_context?: Record<string, unknown>;
    workflow_config?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deriveCronExpression(
    scheduleType: string,
    scheduleConfig: Record<string, unknown>
): string {
    switch (scheduleType) {
        case 'cron': {
            const expr = scheduleConfig.expression as string | undefined;
            if (!expr) throw new Error("schedule_config.expression is required for schedule_type 'cron'");
            return expr;
        }
        case 'daily': {
            const hour = (scheduleConfig.hour as number) ?? 9;
            const minute = (scheduleConfig.minute as number) ?? 0;
            return `${minute} ${hour} * * *`;
        }
        case 'weekly': {
            const hour = (scheduleConfig.hour as number) ?? 9;
            const minute = (scheduleConfig.minute as number) ?? 0;
            const day = (scheduleConfig.dayOfWeek as number) ?? 1;
            return `${minute} ${hour} * * ${day}`;
        }
        case 'monthly': {
            const hour = (scheduleConfig.hour as number) ?? 9;
            const minute = (scheduleConfig.minute as number) ?? 0;
            const dayOfMonth = (scheduleConfig.dayOfMonth as number) ?? 1;
            return `${minute} ${hour} ${dayOfMonth} * *`;
        }
        case 'once':
            return '0 0 31 2 *'; // Never fires via cron; manual trigger only
        default:
            throw new Error(`Unsupported schedule type: '${scheduleType}'`);
    }
}

function deriveScheduleType(cronExpression: string): 'once' | 'daily' | 'weekly' | 'monthly' | 'cron' {
    if (cronExpression === '0 0 31 2 *') return 'once';
    const parts = cronExpression.split(' ');
    if (parts.length !== 5) return 'cron';
    const [, , dayOfMonth, month, dayOfWeek] = parts;
    if (month !== '*') return 'cron';
    if (dayOfWeek !== '*' && dayOfMonth === '*') return 'weekly';
    if (dayOfMonth !== '*' && dayOfWeek === '*') return 'monthly';
    if (dayOfMonth === '*' && dayOfWeek === '*') return 'daily';
    return 'cron';
}

function deriveScheduleConfig(cronExpression: string): Record<string, unknown> {
    const parts = cronExpression.split(' ');
    if (parts.length !== 5) return { expression: cronExpression };
    const [minute, hour, dayOfMonth, , dayOfWeek] = parts;
    const type = deriveScheduleType(cronExpression);
    switch (type) {
        case 'daily':
            return { hour: parseInt(hour, 10), minute: parseInt(minute, 10) };
        case 'weekly':
            return { hour: parseInt(hour, 10), minute: parseInt(minute, 10), dayOfWeek: parseInt(dayOfWeek, 10) };
        case 'monthly':
            return { hour: parseInt(hour, 10), minute: parseInt(minute, 10), dayOfMonth: parseInt(dayOfMonth, 10) };
        case 'cron':
            return { expression: cronExpression };
        case 'once':
            return {};
        default:
            return { expression: cronExpression };
    }
}

async function getHeartbeatStateForAgent(agentId: number): Promise<{
    last_run_at: string | null;
    next_run_at: string | null;
    last_outcome: string | null;
    last_error: string | null;
    consecutive_failures: number;
}> {
    const result = await query<{
        last_run_at: Date | null;
        next_scheduled_at: Date | null;
        last_outcome: string | null;
        last_error: string | null;
        consecutive_failures: number | null;
    }>(
        `SELECT last_run_at, next_scheduled_at, last_outcome, last_error, consecutive_failures
         FROM heartbeat_state WHERE agent_id = $1`,
        [agentId]
    );
    if (result.rows.length === 0) {
        return { last_run_at: null, next_run_at: null, last_outcome: null, last_error: null, consecutive_failures: 0 };
    }
    const row = result.rows[0];
    return {
        last_run_at: row.last_run_at?.toISOString() ?? null,
        next_run_at: row.next_scheduled_at?.toISOString() ?? null,
        last_outcome: row.last_outcome,
        last_error: row.last_error,
        consecutive_failures: row.consecutive_failures ?? 0,
    };
}

async function getExecutionCount(configId: number): Promise<number> {
    const result = await query<{ count: number }>(
        'SELECT COUNT(*)::int AS count FROM heartbeat_executions WHERE heartbeat_config_id = $1',
        [configId]
    );
    return result.rows[0]?.count ?? 0;
}

function mapOutcomeToStatus(outcome: string | null): 'success' | 'failed' | 'running' | null {
    if (!outcome) return null;
    if (outcome === 'success' || outcome === 'suppressed' || outcome === 'skipped') return 'success';
    if (outcome === 'failure' || outcome === 'timeout') return 'failed';
    return null;
}

async function mapConfigToSchedule(config: HeartbeatConfig): Promise<ScheduleResponse> {
    const [state, runCount] = await Promise.all([
        getHeartbeatStateForAgent(config.agent_id),
        getExecutionCount(config.id),
    ]);

    return {
        id: config.id,
        name: config.prompt?.split('\n')[0] || `Schedule for agent ${config.agent_id}`,
        description: null,
        agent_id: config.agent_id,
        schedule_type: deriveScheduleType(config.cron_expression),
        schedule_config: deriveScheduleConfig(config.cron_expression),
        timezone: config.timezone,
        enabled: config.enabled,
        task_prompt: config.prompt,
        task_context: null,
        workflow_config: null,
        last_run_at: state.last_run_at,
        next_run_at: state.next_run_at,
        run_count: runCount,
        last_status: mapOutcomeToStatus(state.last_outcome),
        last_error: state.last_error,
        last_execution_output: null,
        created_at: config.created_at,
        updated_at: config.updated_at,
    };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ScheduleService {
    async listByUser(userId: string, filters?: { agentId?: number; enabled?: boolean }): Promise<ScheduleResponse[]> {
        const configs = await heartbeatConfigRepository.listByUserId(userId);
        let filtered = configs;
        if (filters?.agentId !== undefined) {
            filtered = filtered.filter(c => c.agent_id === filters.agentId);
        }
        if (filters?.enabled !== undefined) {
            filtered = filtered.filter(c => c.enabled === filters.enabled);
        }
        return Promise.all(filtered.map(mapConfigToSchedule));
    }

    async getById(id: number, userId: string): Promise<ScheduleResponse> {
        const config = await heartbeatConfigRepository.getById(id);
        if (!config) {
            throw new AppError(`Schedule not found: ${id}`, 404, 'SCHEDULE_NOT_FOUND');
        }
        if (config.user_id !== userId) {
            throw new AppError(`Access denied to schedule ${id}`, 403, 'SCHEDULE_ACCESS_DENIED');
        }
        return mapConfigToSchedule(config);
    }

    async create(dto: CreateScheduleDTO, userId: string): Promise<ScheduleResponse> {
        const cronExpression = deriveCronExpression(dto.schedule_type, dto.schedule_config);
        const config = await heartbeatConfigService.upsert(
            {
                agent_id: dto.agent_id,
                enabled: dto.enabled ?? true,
                cron_expression: cronExpression,
                timezone: dto.timezone || 'UTC',
                prompt: dto.task_prompt || null,
                weekdays_only: (dto.schedule_config?.weekdaysOnly as boolean) ?? false,
                active_hours_start: (dto.schedule_config?.activeHoursStart as string) ?? null,
                active_hours_end: (dto.schedule_config?.activeHoursEnd as string) ?? null,
            },
            userId
        );
        return mapConfigToSchedule(config);
    }

    async update(id: number, dto: UpdateScheduleDTO, userId: string): Promise<ScheduleResponse> {
        const existing = await heartbeatConfigRepository.getById(id);
        if (!existing) {
            throw new AppError(`Schedule not found: ${id}`, 404, 'SCHEDULE_NOT_FOUND');
        }
        if (existing.user_id !== userId) {
            throw new AppError(`Access denied to schedule ${id}`, 403, 'SCHEDULE_ACCESS_DENIED');
        }

        const updateData: UpdateHeartbeatConfigDTO = {};

        if (dto.schedule_type !== undefined || dto.schedule_config !== undefined) {
            const scheduleType = dto.schedule_type || deriveScheduleType(existing.cron_expression);
            const scheduleConfig = dto.schedule_config || deriveScheduleConfig(existing.cron_expression);
            updateData.cron_expression = deriveCronExpression(scheduleType, scheduleConfig);
        }

        if (dto.timezone !== undefined) updateData.timezone = dto.timezone;
        if (dto.enabled !== undefined) updateData.enabled = dto.enabled;
        if (dto.task_prompt !== undefined) updateData.prompt = dto.task_prompt;

        const updated = await heartbeatConfigService.update(existing.agent_id, updateData, userId);
        return mapConfigToSchedule(updated);
    }

    async delete(id: number, userId: string): Promise<void> {
        const existing = await heartbeatConfigRepository.getById(id);
        if (!existing) {
            throw new AppError(`Schedule not found: ${id}`, 404, 'SCHEDULE_NOT_FOUND');
        }
        if (existing.user_id !== userId) {
            throw new AppError(`Access denied to schedule ${id}`, 403, 'SCHEDULE_ACCESS_DENIED');
        }
        await heartbeatConfigService.delete(existing.agent_id, userId);
    }

    async enable(id: number, userId: string): Promise<ScheduleResponse> {
        const existing = await heartbeatConfigRepository.getById(id);
        if (!existing) {
            throw new AppError(`Schedule not found: ${id}`, 404, 'SCHEDULE_NOT_FOUND');
        }
        if (existing.user_id !== userId) {
            throw new AppError(`Access denied to schedule ${id}`, 403, 'SCHEDULE_ACCESS_DENIED');
        }
        const updated = await heartbeatConfigService.enable(existing.agent_id, userId);
        return mapConfigToSchedule(updated);
    }

    async disable(id: number, userId: string): Promise<ScheduleResponse> {
        const existing = await heartbeatConfigRepository.getById(id);
        if (!existing) {
            throw new AppError(`Schedule not found: ${id}`, 404, 'SCHEDULE_NOT_FOUND');
        }
        if (existing.user_id !== userId) {
            throw new AppError(`Access denied to schedule ${id}`, 403, 'SCHEDULE_ACCESS_DENIED');
        }
        const updated = await heartbeatConfigService.disable(existing.agent_id, userId);
        return mapConfigToSchedule(updated);
    }

    async trigger(id: number, userId: string): Promise<{ execution_id: string; status: string }> {
        const existing = await heartbeatConfigRepository.getById(id);
        if (!existing) {
            throw new AppError(`Schedule not found: ${id}`, 404, 'SCHEDULE_NOT_FOUND');
        }
        if (existing.user_id !== userId) {
            throw new AppError(`Access denied to schedule ${id}`, 403, 'SCHEDULE_ACCESS_DENIED');
        }

        // Insert a manual heartbeat execution
        const result = await query<{ id: string; status: string }>(
            `INSERT INTO heartbeat_executions (heartbeat_config_id, agent_id, trigger_type, scheduled_at, status)
             VALUES ($1, $2, 'manual', NOW(), 'queued')
             RETURNING id, status`,
            [existing.id, existing.agent_id]
        );

        return {
            execution_id: result.rows[0].id,
            status: result.rows[0].status,
        };
    }

    async listExecutions(id: number, userId: string, limit = 10): Promise<unknown[]> {
        const existing = await heartbeatConfigRepository.getById(id);
        if (!existing) {
            throw new AppError(`Schedule not found: ${id}`, 404, 'SCHEDULE_NOT_FOUND');
        }
        if (existing.user_id !== userId) {
            throw new AppError(`Access denied to schedule ${id}`, 403, 'SCHEDULE_ACCESS_DENIED');
        }

        const result = await query(
            `SELECT id, status, outcome, trigger_type, scheduled_at, started_at, completed_at,
                    duration_ms, tokens_used, error_message, run_id, created_at
             FROM heartbeat_executions
             WHERE heartbeat_config_id = $1
             ORDER BY created_at DESC
             LIMIT $2`,
            [existing.id, limit]
        );

        return result.rows;
    }
}

export const scheduleService = new ScheduleService();
