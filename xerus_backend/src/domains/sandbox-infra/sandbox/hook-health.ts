// Hook Health Check
// Post-execution verification of shell hook side effects.
// Reads .xerus/hook-audit.jsonl, data/activity.jsonl, and company.db status
// from the sandbox via a single compound shell command.
// See: docs/planning/execution/ (Shell Hook Observability)

import { logger } from '../../../utils/logger';
import type { HookHealth, HookHealthAuditEntry } from '../../execution/execution-pipeline.types';
import { shellEscape } from '../../../utils/shell-safety';

const log = logger('HookHealth');

export interface HookHealthDeps {
    executeCommand: (sandboxId: string, command: string) => Promise<{ result: string; exitCode: number }>;
}

// Hooks that should fire during a typical agent execution.
// SessionStart and SessionEnd are the minimum expected pair.
const EXPECTED_HOOKS = [
    'SessionStart',
    'UserPromptSubmit',
    'PreToolUse',
    'PostToolUse',
    'SessionEnd',
];

const SENTINEL_HOOKS = '---HOOKS---';
const SENTINEL_ACTIVITY = '---ACTIVITY---';
const SENTINEL_DBTABLES = '---DBTABLES---';

export function buildHealthCheckCommand(workspacePath: string): string {
    const base = shellEscape(workspacePath);
    const auditFile = `${base}/.xerus/hook-audit.jsonl`;
    const activityFile = `${base}/data/activity.jsonl`;
    const dbFile = `${base}/data/company.db`;

    return [
        `echo '${SENTINEL_HOOKS}'`,
        `tail -n 500 ${auditFile} 2>/dev/null || echo ''`,
        `echo '${SENTINEL_ACTIVITY}'`,
        `wc -l < ${activityFile} 2>/dev/null || echo '0'`,
        `echo '${SENTINEL_DBTABLES}'`,
        `sqlite3 ${dbFile} '.tables' 2>/dev/null || echo ''`,
    ].join(' ; ');
}

export function parseHookHealthOutput(
    raw: string,
    executionStartedAt: number,
    now: number = Date.now(),
): HookHealth {
    const sections = splitSections(raw);

    const auditLines = sections.hooks
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0);

    // Parse audit entries and filter to this execution window (60s tolerance)
    const toleranceMs = 60_000;
    const windowStart = executionStartedAt - toleranceMs;
    const windowEnd = now;
    const filteredEntries: HookHealthAuditEntry[] = [];

    for (const line of auditLines) {
        try {
            const entry = JSON.parse(line) as HookHealthAuditEntry;
            const entryTime = new Date(entry.ts).getTime();
            if (!isNaN(entryTime) && entryTime >= windowStart && entryTime <= windowEnd) {
                filteredEntries.push(entry);
            }
        } catch {
            const safe = line.slice(0, 120).replace(/[\n\r\t]/g, ' ');
            log.warn('Skipping malformed audit line', { line: safe });
        }
    }

    const hooksFired = [...new Set(filteredEntries.map(e => e.hook))];
    const hooksExpectedMissing = EXPECTED_HOOKS.filter(h => !hooksFired.includes(h));

    const activityCount = parseInt(sections.activity.trim(), 10) || 0;

    const dbTablesRaw = sections.dbtables.trim();
    const companyDbInitialized = dbTablesRaw.length > 0 && !dbTablesRaw.startsWith('Error');

    return {
        hooks_fired: hooksFired,
        hooks_expected_missing: hooksExpectedMissing,
        audit_entries: filteredEntries.length,
        activity_entries: activityCount,
        company_db_initialized: companyDbInitialized,
        checked_at: new Date(now).toISOString(),
    };
}

function splitSections(raw: string): { hooks: string; activity: string; dbtables: string } {
    const hooksIdx = raw.indexOf(SENTINEL_HOOKS);
    const activityIdx = raw.indexOf(SENTINEL_ACTIVITY);
    const dbtablesIdx = raw.indexOf(SENTINEL_DBTABLES);

    if (hooksIdx === -1 || activityIdx === -1 || dbtablesIdx === -1) {
        return { hooks: '', activity: '0', dbtables: '' };
    }

    return {
        hooks: raw.slice(hooksIdx + SENTINEL_HOOKS.length, activityIdx),
        activity: raw.slice(activityIdx + SENTINEL_ACTIVITY.length, dbtablesIdx),
        dbtables: raw.slice(dbtablesIdx + SENTINEL_DBTABLES.length),
    };
}

export async function checkHookHealth(
    sandboxId: string,
    workspacePath: string,
    executionStartedAt: number,
    deps: HookHealthDeps,
): Promise<HookHealth | null> {
    try {
        const command = buildHealthCheckCommand(workspacePath);
        const result = await deps.executeCommand(sandboxId, command);

        // With `;` chaining, sentinels are always emitted even if individual
        // steps fail. Parse whatever output we got — partial data is better
        // than no data. Only a genuine shell/connection failure throws.
        return parseHookHealthOutput(result.result, executionStartedAt);
    } catch (err) {
        log.warn('Health check failed', { error: (err as Error).message });
        return null;
    }
}
