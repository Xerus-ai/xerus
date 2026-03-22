import {
    buildHealthCheckCommand,
    parseHookHealthOutput,
    checkHookHealth,
} from '../hook-health';

describe('hook-health', () => {
    const WORKSPACE = process.env.XERUS_WORKSPACE_ROOT || '/tmp/xerus-test-workspace';
    const NOW = Date.now();

    function makeAuditLine(hook: string, agent: string, tsOffset = 0): string {
        const ts = new Date(NOW + tsOffset).toISOString().replace(/\.\d{3}Z$/, 'Z');
        return JSON.stringify({ hook, agent, ts, ok: true });
    }

    function buildOutput(hooks: string, activityCount: number | string, dbTables: string): string {
        return [
            '---HOOKS---',
            hooks,
            '---ACTIVITY---',
            String(activityCount),
            '---DBTABLES---',
            dbTables,
        ].join('\n');
    }

    describe('buildHealthCheckCommand', () => {
        it('generates compound shell command with sentinels and escaped paths', () => {
            const cmd = buildHealthCheckCommand(WORKSPACE);
            expect(cmd).toContain("echo '---HOOKS---'");
            expect(cmd).toContain('.xerus/hook-audit.jsonl');
            expect(cmd).toContain("echo '---ACTIVITY---'");
            expect(cmd).toContain('shared/activity.jsonl');
            expect(cmd).toContain("echo '---DBTABLES---'");
            expect(cmd).toContain('data/company.db');
            // shellEscape wraps path in single quotes
            expect(cmd).toContain(`'${WORKSPACE}'`);
        });
    });

    describe('parseHookHealthOutput', () => {
        it('parses output with hooks fired', () => {
            const hooks = [
                makeAuditLine('SessionStart', 'test-agent'),
                makeAuditLine('UserPromptSubmit', 'test-agent'),
                makeAuditLine('PreToolUse', 'test-agent'),
                makeAuditLine('PostToolUse', 'test-agent'),
                makeAuditLine('SessionEnd', 'test-agent'),
            ].join('\n');

            const raw = buildOutput(hooks, 5, 'research_reports  topics  metrics');
            const result = parseHookHealthOutput(raw, NOW - 30_000, NOW + 1000);

            expect(result.hooks_fired).toContain('SessionStart');
            expect(result.hooks_fired).toContain('SessionEnd');
            expect(result.hooks_expected_missing).toHaveLength(0);
            expect(result.audit_entries).toBe(5);
            expect(result.activity_entries).toBe(5);
            expect(result.company_db_initialized).toBe(true);
            expect(result.checked_at).toBeDefined();
        });

        it('detects missing expected hooks', () => {
            const hooks = makeAuditLine('SessionStart', 'test-agent');
            const raw = buildOutput(hooks, 1, 'research_reports');
            const result = parseHookHealthOutput(raw, NOW - 30_000, NOW + 1000);

            expect(result.hooks_fired).toEqual(['SessionStart']);
            expect(result.hooks_expected_missing).toContain('UserPromptSubmit');
            expect(result.hooks_expected_missing).toContain('PreToolUse');
            expect(result.hooks_expected_missing).toContain('PostToolUse');
            expect(result.hooks_expected_missing).toContain('SessionEnd');
        });

        it('filters out audit entries older than execution window', () => {
            const oldEntry = makeAuditLine('SessionStart', 'test-agent', -120_000);
            const newEntry = makeAuditLine('SessionStart', 'test-agent', 0);
            const hooks = [oldEntry, newEntry].join('\n');
            const raw = buildOutput(hooks, 2, 'topics');
            const result = parseHookHealthOutput(raw, NOW - 30_000, NOW + 1000);

            expect(result.audit_entries).toBe(1);
            expect(result.hooks_fired).toEqual(['SessionStart']);
        });

        it('handles empty output gracefully', () => {
            const raw = buildOutput('', 0, '');
            const result = parseHookHealthOutput(raw, NOW, NOW + 1000);

            expect(result.hooks_fired).toEqual([]);
            expect(result.hooks_expected_missing).toEqual([
                'SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'SessionEnd',
            ]);
            expect(result.audit_entries).toBe(0);
            expect(result.activity_entries).toBe(0);
            expect(result.company_db_initialized).toBe(false);
        });

        it('handles malformed JSON lines without throwing', () => {
            const hooks = [
                'not json',
                makeAuditLine('SessionStart', 'test-agent'),
                '{bad json',
            ].join('\n');
            const raw = buildOutput(hooks, 1, 'topics');
            const result = parseHookHealthOutput(raw, NOW - 30_000, NOW + 1000);

            expect(result.hooks_fired).toEqual(['SessionStart']);
            expect(result.audit_entries).toBe(1);
        });

        it('handles missing sentinels', () => {
            const result = parseHookHealthOutput('garbage output', NOW, NOW + 1000);

            expect(result.hooks_fired).toEqual([]);
            expect(result.activity_entries).toBe(0);
            expect(result.company_db_initialized).toBe(false);
        });

        it('deduplicates repeated hook names', () => {
            const hooks = [
                makeAuditLine('PreToolUse', 'test-agent', -2000),
                makeAuditLine('PreToolUse', 'test-agent', -1000),
                makeAuditLine('PostToolUse', 'test-agent', 0),
            ].join('\n');
            const raw = buildOutput(hooks, 3, '');
            const result = parseHookHealthOutput(raw, NOW - 30_000, NOW + 1000);

            expect(result.hooks_fired).toEqual(['PreToolUse', 'PostToolUse']);
            expect(result.audit_entries).toBe(3);
        });

        it('detects company_db as not initialized when sqlite3 errors', () => {
            const raw = buildOutput('', 0, 'Error: unable to open database');
            const result = parseHookHealthOutput(raw, NOW, NOW + 1000);

            expect(result.company_db_initialized).toBe(false);
        });

        it('parses wc -l output with leading whitespace', () => {
            const raw = buildOutput('', '      7', 'topics');
            const result = parseHookHealthOutput(raw, NOW, NOW + 1000);

            expect(result.activity_entries).toBe(7);
        });

        it('filters out entries from future concurrent executions', () => {
            const currentEntry = makeAuditLine('SessionStart', 'test-agent', 0);
            const futureEntry = makeAuditLine('SessionStart', 'other-agent', 5000);
            const hooks = [currentEntry, futureEntry].join('\n');
            const raw = buildOutput(hooks, 1, '');
            // windowEnd is NOW + 1000, so futureEntry at NOW + 5000 is excluded
            const result = parseHookHealthOutput(raw, NOW - 30_000, NOW + 1000);

            expect(result.audit_entries).toBe(1);
        });
    });

    describe('checkHookHealth', () => {
        it('returns parsed health when command succeeds', async () => {
            const hooks = makeAuditLine('SessionStart', 'test-agent');
            const raw = buildOutput(hooks, 1, 'topics');

            const deps = {
                executeCommand: async () => ({ result: raw, exitCode: 0 }),
            };

            const result = await checkHookHealth('sandbox-1', WORKSPACE, NOW - 30_000, deps);

            expect(result).not.toBeNull();
            expect(result!.hooks_fired).toContain('SessionStart');
        });

        it('returns parsed result even when command exits non-zero (partial data)', async () => {
            const hooks = makeAuditLine('SessionStart', 'test-agent');
            const raw = buildOutput(hooks, 0, '');

            const deps = {
                executeCommand: async () => ({ result: raw, exitCode: 1 }),
            };

            const result = await checkHookHealth('sandbox-1', WORKSPACE, NOW - 30_000, deps);

            expect(result).not.toBeNull();
            expect(result!.hooks_fired).toContain('SessionStart');
        });

        it('returns null when executeCommand throws', async () => {
            const deps = {
                executeCommand: async () => { throw new Error('connection lost'); },
            };

            const result = await checkHookHealth('sandbox-1', WORKSPACE, NOW, deps);

            expect(result).toBeNull();
        });
    });
});
