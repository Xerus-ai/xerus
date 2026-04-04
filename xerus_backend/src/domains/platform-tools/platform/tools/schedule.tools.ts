// Schedule Tools
// CRUD operations for workspace.db schedules table (sandbox-local SQLite).
// workspace-schema.sql is loaded into workspace.db by init-db.sh (not company.db).
// Executes sqlite3 commands on the Daytona sandbox via provider.executeCommand().
// The 9to5 scheduler daemon polls this table every 30s and spawns CLI processes.

import { randomUUID } from 'crypto';
import { RRule } from 'rrule';
import { SANDBOX_CONFIG } from '../../../sandbox-infra/sandbox/sandbox.config';
import type { DaytonaProvider } from '../../../sandbox-infra/sandbox/providers/daytona.provider';
import type {
    CreateScheduleInput,
    ListSchedulesInput,
    UpdateScheduleInput,
    DeleteScheduleInput,
    CreateScheduleResult,
    ListSchedulesResult,
    UpdateScheduleResult,
    DeleteScheduleResult,
    ScheduleEntry,
} from '../platform-tool.inlined-types';

// -----------------------------------------------------------------------------
// Errors
// -----------------------------------------------------------------------------

export class ScheduleNotFoundError extends Error {
    constructor(scheduleId: string) {
        super(`Schedule '${scheduleId}' not found`);
        this.name = 'ScheduleNotFoundError';
    }
}

export class ScheduleConflictError extends Error {
    constructor(name: string) {
        super(`Schedule with name '${name}' already exists`);
        this.name = 'ScheduleConflictError';
    }
}

// -----------------------------------------------------------------------------
// Errors
// -----------------------------------------------------------------------------

export class InvalidRRuleError extends Error {
    constructor(rruleStr: string, cause: unknown) {
        super(`Invalid rrule '${rruleStr}': ${String(cause)}`);
        this.name = 'InvalidRRuleError';
    }
}

// -----------------------------------------------------------------------------
// RRule Helpers
// -----------------------------------------------------------------------------

function computeNextRunAt(rruleStr: string): number | null {
    try {
        const bare = rruleStr.startsWith('RRULE:') ? rruleStr.slice(6) : rruleStr;
        const rule = new RRule(RRule.parseString(bare));
        const next = rule.after(new Date());
        return next ? Math.floor(next.getTime() / 1000) : null;
    } catch (cause) {
        throw new InvalidRRuleError(rruleStr, cause);
    }
}

// -----------------------------------------------------------------------------
// SQLite Helpers (matches workspace-db.service.ts pattern)
// -----------------------------------------------------------------------------

const DB_PATH = `${SANDBOX_CONFIG.workspacePath}/data/workspace.db`;

function escapeSQL(value: string): string {
    return value.replace(/'/g, "''");
}

/** Pipe SQL via stdin using a single-quoted heredoc to prevent shell injection.
 *  <<'EOSQL' disables all shell expansion (no $(), backticks, variable interpolation). */
function buildSqliteCommand(sql: string): string {
    return `sqlite3 -json '${DB_PATH}' <<'EOSQL'\n${sql}\nEOSQL`;
}

function parseJsonResult<T>(output: string): T[] {
    const trimmed = output.trim();
    if (!trimmed || trimmed === '[]') return [];
    try {
        return JSON.parse(trimmed) as T[];
    } catch {
        throw new Error(`Workspace DB returned invalid JSON: ${trimmed.slice(0, 200)}`);
    }
}

// -----------------------------------------------------------------------------
// Service
// -----------------------------------------------------------------------------

export class ScheduleService {
    private provider: DaytonaProvider;

    constructor(provider: DaytonaProvider) {
        this.provider = provider;
    }

    async createSchedule(
        sandboxId: string,
        input: CreateScheduleInput,
    ): Promise<CreateScheduleResult> {
        const id = randomUUID();
        const now = Math.floor(Date.now() / 1000);
        const adapterType = input.adapter_type ?? 'claudecode';
        const allowedTools = input.allowed_tools ? `'${escapeSQL(JSON.stringify(input.allowed_tools))}'` : 'NULL';
        const model = input.model ? `'${escapeSQL(input.model)}'` : 'NULL';
        const maxBudget = input.max_budget_usd != null ? input.max_budget_usd : 'NULL';
        const systemPrompt = input.system_prompt ? `'${escapeSQL(input.system_prompt)}'` : 'NULL';
        const rrule = input.rrule ? `'${escapeSQL(input.rrule)}'` : 'NULL';

        // Compute next_run_at from rrule so the scheduler daemon picks it up
        const nextRunAt = input.rrule ? computeNextRunAt(input.rrule) : null;
        const nextRunAtSql = nextRunAt != null ? nextRunAt : 'NULL';

        const sql = `
            INSERT INTO schedules (id, agent_slug, name, prompt, rrule, adapter_type, model, status, max_budget_usd, allowed_tools, system_prompt, next_run_at, created_at, updated_at)
            VALUES ('${id}', '${escapeSQL(input.agent_slug)}', '${escapeSQL(input.name)}', '${escapeSQL(input.prompt)}', ${rrule}, '${adapterType}', ${model}, 'active', ${maxBudget}, ${allowedTools}, ${systemPrompt}, ${nextRunAtSql}, ${now}, ${now});
            SELECT * FROM schedules WHERE id = '${id}';
        `;

        const result = await this.provider.executeCommand(sandboxId, buildSqliteCommand(sql));
        const rows = parseJsonResult<ScheduleEntry>(result.result);
        if (!rows[0]) {
            throw new Error('Failed to create schedule — INSERT succeeded but SELECT returned no rows');
        }
        return { schedule: rows[0] };
    }

    async listSchedules(
        sandboxId: string,
        input: ListSchedulesInput,
    ): Promise<ListSchedulesResult> {
        const conditions: string[] = [];
        if (input.agent_slug) {
            conditions.push(`agent_slug = '${escapeSQL(input.agent_slug)}'`);
        }
        if (input.status) {
            conditions.push(`status = '${escapeSQL(input.status)}'`);
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const sql = `SELECT * FROM schedules ${where} ORDER BY created_at DESC;`;

        const result = await this.provider.executeCommand(sandboxId, buildSqliteCommand(sql));
        const schedules = parseJsonResult<ScheduleEntry>(result.result);
        return { schedules, total: schedules.length };
    }

    async updateSchedule(
        sandboxId: string,
        input: UpdateScheduleInput,
    ): Promise<UpdateScheduleResult> {
        const setClauses: string[] = [];
        if (input.name != null) setClauses.push(`name = '${escapeSQL(input.name)}'`);
        if (input.prompt != null) setClauses.push(`prompt = '${escapeSQL(input.prompt)}'`);
        if (input.rrule != null) setClauses.push(`rrule = '${escapeSQL(input.rrule)}'`);
        if (input.status != null) setClauses.push(`status = '${escapeSQL(input.status)}'`);
        if (input.model != null) setClauses.push(`model = '${escapeSQL(input.model)}'`);
        if (input.max_budget_usd != null) setClauses.push(`max_budget_usd = ${input.max_budget_usd}`);
        if (input.allowed_tools != null) setClauses.push(`allowed_tools = '${escapeSQL(JSON.stringify(input.allowed_tools))}'`);
        if (input.system_prompt != null) setClauses.push(`system_prompt = '${escapeSQL(input.system_prompt)}'`);

        // Recompute next_run_at when rrule changes or status is reactivated
        if (input.rrule != null) {
            const nextRunAt = computeNextRunAt(input.rrule);
            setClauses.push(`next_run_at = ${nextRunAt != null ? nextRunAt : 'NULL'}`);
        } else if (input.status === 'active') {
            // Reactivating without a new rrule — set NULL so the scheduler's
            // bootstrapOrphanedSchedules picks it up atomically (no TOCTOU race).
            setClauses.push(`next_run_at = NULL`);
        }

        const now = Math.floor(Date.now() / 1000);
        setClauses.push(`updated_at = ${now}`);

        const sql = `
            UPDATE schedules SET ${setClauses.join(', ')} WHERE id = '${escapeSQL(input.schedule_id)}';
            SELECT * FROM schedules WHERE id = '${escapeSQL(input.schedule_id)}';
        `;

        const result = await this.provider.executeCommand(sandboxId, buildSqliteCommand(sql));
        const rows = parseJsonResult<ScheduleEntry>(result.result);
        if (!rows[0]) {
            throw new ScheduleNotFoundError(input.schedule_id);
        }
        return { schedule: rows[0] };
    }

    async deleteSchedule(
        sandboxId: string,
        input: DeleteScheduleInput,
    ): Promise<DeleteScheduleResult> {
        // Verify schedule exists before deleting (fail-fast)
        const checkSql = `SELECT id FROM schedules WHERE id = '${escapeSQL(input.schedule_id)}';`;
        const checkResult = await this.provider.executeCommand(sandboxId, buildSqliteCommand(checkSql));
        const existing = parseJsonResult<{ id: string }>(checkResult.result);
        if (!existing[0]) {
            throw new ScheduleNotFoundError(input.schedule_id);
        }

        const deleteSql = `DELETE FROM schedules WHERE id = '${escapeSQL(input.schedule_id)}';`;
        await this.provider.executeCommand(sandboxId, buildSqliteCommand(deleteSql));
        return {
            schedule_id: input.schedule_id,
            deleted_at: new Date().toISOString(),
        };
    }
}
