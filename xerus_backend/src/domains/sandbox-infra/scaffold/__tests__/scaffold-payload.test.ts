// Scaffold Payload Builder Tests
// Tests for buildScaffoldPayload: slug-derived defaults + template generation (no DB dependency)

import { buildScaffoldPayload, ScaffoldPayloadDeps } from '../scaffold-payload.service';

// Stub DB — buildScaffoldPayload ignores it (agent metadata derived from slug)
function createTestDb() {
    return {
        query<T>(_sql: string, _params?: unknown[]): Promise<{ rows: T[] }> {
            return Promise.resolve({ rows: [] as T[] });
        },
    };
}

const TEST_AGENT_ID = 1;

describe('buildScaffoldPayload', () => {
    it('returns expected files from slug-derived defaults + templates', async () => {
        const deps: ScaffoldPayloadDeps = {
            db: createTestDb(),
        };

        const files = await buildScaffoldPayload(TEST_AGENT_ID, 'seo-writer', deps);

        const paths = files.map(f => f.path);
        expect(paths).toContain('agents/seo-writer/config.json');
        expect(paths).toContain('agents/seo-writer/SOUL.md');
        expect(paths).toContain('agents/seo-writer/STATUS.md');
        expect(paths).toContain('agents/seo-writer/USER.md');
        expect(paths).toContain('agents/seo-writer/RELATIONSHIPS.md');
        expect(paths).toContain('agents/seo-writer/BOOTSTRAP.md');
        expect(paths).toContain('agents/seo-writer/CLAUDE.md');
        expect(paths).toContain('agents/seo-writer/HEARTBEAT.md');
        expect(paths).toContain('agents/seo-writer/OPERATING.md');
        expect(paths).toContain('.memory/agents/seo-writer/working.md');
        expect(paths).toContain('.memory/agents/seo-writer/expertise.md');
        // agent.md comes from marketplace clone, not scaffold
        expect(paths).not.toContain('agents/seo-writer/agent.md');
    });

    it('generates config.json with slug-derived defaults and empty tools at scaffold time', async () => {
        const deps: ScaffoldPayloadDeps = {
            db: createTestDb(),
        };

        const files = await buildScaffoldPayload(TEST_AGENT_ID, 'seo-writer', deps);
        const configFile = files.find(f => f.path === 'agents/seo-writer/config.json')!;
        const config = JSON.parse(configFile.content);

        expect(config.slug).toBe('seo-writer');
        expect(config.name).toBe('seo-writer');
        expect(config.domain).toBe('');
        expect(config.primary_channel).toBe('');
        expect(config.channels).toEqual([]);
        // Default model when ai_model is null
        expect(config.model).toBe('anthropic/claude-sonnet-4');
        expect(config.thinking_level).toBe('medium');
        expect(config.role).toBe('');
        expect(config.tools).toEqual([]);
        expect(config.autonomy_level).toBe('supervised');
    });

    it('generates soul files from template defaults', async () => {
        const deps: ScaffoldPayloadDeps = {
            db: createTestDb(),
        };

        const files = await buildScaffoldPayload(TEST_AGENT_ID, 'seo-writer', deps);
        const soulFile = files.find(f => f.path === 'agents/seo-writer/SOUL.md')!;

        expect(soulFile.content).toContain('seo-writer');
    });

    it('generates memory files with agent name (slug)', async () => {
        const deps: ScaffoldPayloadDeps = {
            db: createTestDb(),
        };

        const files = await buildScaffoldPayload(TEST_AGENT_ID, 'seo-writer', deps);

        const working = files.find(f => f.path === '.memory/agents/seo-writer/working.md')!;
        expect(working.content).toBe('# seo-writer Working Context\n\n');

        const expertise = files.find(f => f.path === '.memory/agents/seo-writer/expertise.md')!;
        expect(expertise.content).toBe('# seo-writer Expertise\n\n');
    });

    it('generates initial Module CLAUDE.md with agent info (no tools at scaffold time)', async () => {
        const deps: ScaffoldPayloadDeps = {
            db: createTestDb(),
        };

        const files = await buildScaffoldPayload(TEST_AGENT_ID, 'seo-writer', deps);
        const claudeFile = files.find(f => f.path === 'agents/seo-writer/CLAUDE.md')!;

        expect(claudeFile.content).toContain('seo-writer');
        expect(claudeFile.content).toContain('## Identity');
        expect(claudeFile.content).toContain('## Autonomy');
        expect(claudeFile.content).toContain('supervised');
        expect(claudeFile.content).toContain('No tool integrations assigned');
    });

    it('generates HEARTBEAT.md with agent name (slug)', async () => {
        const deps: ScaffoldPayloadDeps = {
            db: createTestDb(),
        };

        const files = await buildScaffoldPayload(TEST_AGENT_ID, 'seo-writer', deps);
        const heartbeat = files.find(f => f.path === 'agents/seo-writer/HEARTBEAT.md')!;

        expect(heartbeat.content).toContain('# seo-writer Heartbeat');
        expect(heartbeat.content).toContain('## Scheduled');
        expect(heartbeat.content).toContain('## Events');
    });

    it('generates OPERATING.md with agent metadata', async () => {
        const deps: ScaffoldPayloadDeps = {
            db: createTestDb(),
        };

        const files = await buildScaffoldPayload(TEST_AGENT_ID, 'seo-writer', deps);
        const operating = files.find(f => f.path === 'agents/seo-writer/OPERATING.md')!;

        expect(operating.content).toContain('seo-writer');
    });

    it('defaults to reactive behavior mode at scaffold time', async () => {
        const deps: ScaffoldPayloadDeps = {
            db: createTestDb(),
        };

        const files = await buildScaffoldPayload(TEST_AGENT_ID, 'seo-writer', deps);
        const operating = files.find(f => f.path === 'agents/seo-writer/OPERATING.md')!;

        expect(operating.content).toContain('Reactive');
        expect(operating.content).not.toContain('Proactive');
    });
});
