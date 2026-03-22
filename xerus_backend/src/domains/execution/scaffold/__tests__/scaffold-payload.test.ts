// Scaffold Payload Builder Tests
// Tests for buildScaffoldPayload: DB query + template generation (no S3 priority chain)

import { buildScaffoldPayload, ScaffoldPayloadDeps } from '../scaffold-payload.service';

// In-memory DB that routes queries by SQL pattern
function createTestDb(agentRows: unknown[] = [], heartbeatExists: boolean = false) {
    return {
        query<T>(sql: string, _params?: unknown[]): Promise<{ rows: T[] }> {
            if (sql.includes('heartbeat_configs')) {
                return Promise.resolve({ rows: [{ exists: heartbeatExists }] as T[] });
            }
            return Promise.resolve({ rows: agentRows as T[] });
        },
    };
}

const TEST_AGENT_ID = 1;

const BASE_AGENT_ROW = {
    name: 'SEO Writer',
    description: 'Writes SEO content',
    ai_model: 'claude-sonnet-4-5-20250929',
    autonomy_level: 'supervised',
    thinking_level: 'medium',
    personality_type: 'analytical',
    domain: 'marketing',
    primary_channel: 'seo',
    channels: ['seo', 'content'],
    slug: 'seo-writer',
};

describe('buildScaffoldPayload', () => {
    it('throws when agent not found in DB', async () => {
        const deps: ScaffoldPayloadDeps = {
            db: createTestDb([]),
        };

        await expect(
            buildScaffoldPayload(TEST_AGENT_ID, 'nonexistent', deps),
        ).rejects.toThrow('Agent ID 1 not found');
    });

    it('returns expected files from DB + templates (agent.md comes from marketplace, not scaffold)', async () => {
        const deps: ScaffoldPayloadDeps = {
            db: createTestDb([BASE_AGENT_ROW]),
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

    it('generates config.json with role from personality_type and empty tools at scaffold time', async () => {
        const deps: ScaffoldPayloadDeps = {
            db: createTestDb([BASE_AGENT_ROW]),
        };

        const files = await buildScaffoldPayload(TEST_AGENT_ID, 'seo-writer', deps);
        const configFile = files.find(f => f.path === 'agents/seo-writer/config.json')!;
        const config = JSON.parse(configFile.content);

        expect(config.slug).toBe('seo-writer');
        expect(config.name).toBe('SEO Writer');
        expect(config.domain).toBe('marketing');
        expect(config.primary_channel).toBe('seo');
        expect(config.channels).toEqual(['seo', 'content']);
        expect(config.model).toBe('claude-sonnet-4-5-20250929');
        expect(config.thinking_level).toBe('medium');
        expect(config.role).toBe('analytical');
        expect(config.tools).toEqual([]);
        expect(config.autonomy_level).toBe('supervised');
    });

    it('generates soul files from template defaults', async () => {
        const deps: ScaffoldPayloadDeps = {
            db: createTestDb([BASE_AGENT_ROW]),
        };

        const files = await buildScaffoldPayload(TEST_AGENT_ID, 'seo-writer', deps);
        const soulFile = files.find(f => f.path === 'agents/seo-writer/SOUL.md')!;

        expect(soulFile.content).toContain('Name: SEO Writer');
        expect(soulFile.content).toContain('Domain: marketing');
        expect(soulFile.content).toContain('Personality Type: analytical');
    });

    it('generates memory files with agent name', async () => {
        const deps: ScaffoldPayloadDeps = {
            db: createTestDb([BASE_AGENT_ROW]),
        };

        const files = await buildScaffoldPayload(TEST_AGENT_ID, 'seo-writer', deps);

        const working = files.find(f => f.path === '.memory/agents/seo-writer/working.md')!;
        expect(working.content).toBe('# SEO Writer Working Context\n\n');

        const expertise = files.find(f => f.path === '.memory/agents/seo-writer/expertise.md')!;
        expect(expertise.content).toBe('# SEO Writer Expertise\n\n');
    });

    it('generates initial Module CLAUDE.md with agent info (no tools at scaffold time)', async () => {
        const deps: ScaffoldPayloadDeps = {
            db: createTestDb([BASE_AGENT_ROW]),
        };

        const files = await buildScaffoldPayload(TEST_AGENT_ID, 'seo-writer', deps);
        const claudeFile = files.find(f => f.path === 'agents/seo-writer/CLAUDE.md')!;

        expect(claudeFile.content).toContain('SEO Writer');
        expect(claudeFile.content).toContain('Writes SEO content');
        expect(claudeFile.content).toContain('## Identity');
        expect(claudeFile.content).toContain('## Autonomy');
        expect(claudeFile.content).toContain('supervised');
        expect(claudeFile.content).toContain('No tool integrations assigned');
    });

    it('handles agent with minimal DB data gracefully', async () => {
        const minimalAgent = {
            name: 'Minimal Agent',
            description: '',
            ai_model: '',
            autonomy_level: '',
            thinking_level: 'medium',
            personality_type: null,
            domain: null,
            primary_channel: null,
            channels: null,
            slug: 'minimal',
        };

        const deps: ScaffoldPayloadDeps = {
            db: createTestDb([minimalAgent]),
        };

        const files = await buildScaffoldPayload(TEST_AGENT_ID, 'minimal', deps);

        const configFile = files.find(f => f.path === 'agents/minimal/config.json')!;
        const config = JSON.parse(configFile.content);
        expect(config.name).toBe('Minimal Agent');
        expect(config.model).toBe('claude-sonnet-4-5-20250929');
        expect(config.thinking_level).toBe('medium');
        expect(config.domain).toBe('');
        expect(config.channels).toEqual([]);
        expect(config.tools).toEqual([]);
        expect(config.role).toBe('');
    });

    it('generates HEARTBEAT.md with agent name', async () => {
        const deps: ScaffoldPayloadDeps = {
            db: createTestDb([BASE_AGENT_ROW]),
        };

        const files = await buildScaffoldPayload(TEST_AGENT_ID, 'seo-writer', deps);
        const heartbeat = files.find(f => f.path === 'agents/seo-writer/HEARTBEAT.md')!;

        expect(heartbeat.content).toContain('# SEO Writer Heartbeat');
        expect(heartbeat.content).toContain('## Scheduled');
        expect(heartbeat.content).toContain('## Events');
    });

    it('generates OPERATING.md with agent metadata', async () => {
        const deps: ScaffoldPayloadDeps = {
            db: createTestDb([BASE_AGENT_ROW]),
        };

        const files = await buildScaffoldPayload(TEST_AGENT_ID, 'seo-writer', deps);
        const operating = files.find(f => f.path === 'agents/seo-writer/OPERATING.md')!;

        expect(operating.content).toContain('seo-writer');
    });

    it('uses heartbeat_configs to determine proactive agent type', async () => {
        const deps: ScaffoldPayloadDeps = {
            db: createTestDb([BASE_AGENT_ROW], true),
        };

        const files = await buildScaffoldPayload(TEST_AGENT_ID, 'seo-writer', deps);
        const operating = files.find(f => f.path === 'agents/seo-writer/OPERATING.md')!;

        expect(operating.content).toContain('Proactive');
    });
});
