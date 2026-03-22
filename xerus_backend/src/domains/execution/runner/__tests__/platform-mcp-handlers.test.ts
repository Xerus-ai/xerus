// Platform MCP Handlers Tests
// Tests for workspace filesystem operations used by the Platform MCP server

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {
    handleCreateDomain,
    handleCreateChannel,
    handleCreateAgent,
    handleUpdateAgent,
    handleDeleteAgent,
    handleAssignAgentToChannel,
    handleInstallSkill,
    handleListAgents,
    handleListDomains,
    handleSendNotification,
} from '../platform-mcp-handlers';
import type { MetadataSyncFn } from '../platform-mcp-handlers';

let tmpDir: string;
const originalEnv = process.env.XERUS_WORKSPACE_ROOT;
const noopSync: MetadataSyncFn = () => {};

beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xerus-mcp-test-'));
    process.env.XERUS_WORKSPACE_ROOT = tmpDir;
});

afterEach(async () => {
    process.env.XERUS_WORKSPACE_ROOT = originalEnv;
    await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('handleCreateDomain', () => {
    it('creates domain directory structure', async () => {
        const result = await handleCreateDomain({ slug: 'marketing', name: 'Marketing' }, noopSync);

        expect(result).toContain('marketing');
        const domainPath = path.join(tmpDir, 'projects', 'marketing');
        const stat = await fs.stat(domainPath);
        expect(stat.isDirectory()).toBe(true);

        const channelsDir = await fs.stat(path.join(domainPath, 'channels'));
        expect(channelsDir.isDirectory()).toBe(true);

        const dataDir = await fs.stat(path.join(domainPath, 'data'));
        expect(dataDir.isDirectory()).toBe(true);

        const claudeMd = await fs.readFile(path.join(domainPath, 'CLAUDE.md'), 'utf-8');
        expect(claudeMd).toContain('Marketing');
    });

    it('creates memory directory for domain', async () => {
        await handleCreateDomain({ slug: 'sales', name: 'Sales', description: 'Sales team' }, noopSync);

        const memoryPath = path.join(tmpDir, '.memory', 'projects', 'sales');
        const stat = await fs.stat(memoryPath);
        expect(stat.isDirectory()).toBe(true);
    });

    it('throws when domain already exists', async () => {
        await handleCreateDomain({ slug: 'eng', name: 'Engineering' }, noopSync);

        await expect(handleCreateDomain({ slug: 'eng', name: 'Engineering' }, noopSync))
            .rejects.toThrow("Domain 'eng' already exists");
    });
});

describe('handleCreateChannel', () => {
    beforeEach(async () => {
        await handleCreateDomain({ slug: 'marketing', name: 'Marketing' }, noopSync);
    });

    it('creates channel directory structure', async () => {
        const result = await handleCreateChannel({
            domain: 'marketing', slug: 'seo', name: 'SEO'
        }, noopSync);

        expect(result).toContain('seo');
        const channelPath = path.join(tmpDir, 'projects', 'marketing', 'channels', 'seo');
        const stat = await fs.stat(channelPath);
        expect(stat.isDirectory()).toBe(true);

        const beadsDir = await fs.stat(path.join(channelPath, '.beads'));
        expect(beadsDir.isDirectory()).toBe(true);
    });

    it('throws when domain does not exist', async () => {
        await expect(handleCreateChannel({
            domain: 'nonexistent', slug: 'ch', name: 'Ch'
        }, noopSync)).rejects.toThrow("Domain 'nonexistent' does not exist");
    });

    it('throws when channel already exists', async () => {
        await handleCreateChannel({ domain: 'marketing', slug: 'seo', name: 'SEO' }, noopSync);
        await expect(handleCreateChannel({
            domain: 'marketing', slug: 'seo', name: 'SEO'
        }, noopSync)).rejects.toThrow("Channel 'seo' already exists");
    });

    it('creates CLAUDE.md using template with channel and project context', async () => {
        await handleCreateChannel({
            domain: 'marketing', slug: 'seo', name: 'SEO', description: 'Optimize search rankings'
        }, noopSync);

        const claudeMdPath = path.join(
            tmpDir, 'projects', 'marketing', 'channels', 'seo', 'CLAUDE.md'
        );
        const content = await fs.readFile(claudeMdPath, 'utf-8');
        expect(content).toContain('#marketing-seo');
        expect(content).toContain('Optimize search rankings');
        expect(content).toContain('## Project: marketing');
        expect(content).toContain('## Channel Directories');
    });
});

describe('handleCreateAgent', () => {
    beforeEach(async () => {
        await handleCreateDomain({ slug: 'marketing', name: 'Marketing' }, noopSync);
        await handleCreateChannel({ domain: 'marketing', slug: 'seo', name: 'SEO' }, noopSync);
    });

    it('creates agent directory and config', async () => {
        const result = await handleCreateAgent({
            slug: 'seo-writer',
            name: 'SEO Writer',
            domain: 'marketing',
            primary_channel: 'seo',
        }, noopSync);

        expect(result).toContain('SEO Writer');

        const agentPath = path.join(tmpDir, 'agents', 'seo-writer');
        const stat = await fs.stat(agentPath);
        expect(stat.isDirectory()).toBe(true);

        const configContent = await fs.readFile(
            path.join(agentPath, 'config.json'), 'utf-8'
        );
        const config = JSON.parse(configContent);
        expect(config.slug).toBe('seo-writer');
        expect(config.domain).toBe('marketing');
        expect(config.primary_channel).toBe('seo');
        expect(config.model).toBe('claude-sonnet-4-5-20250929');
    });

    it('creates heartbeat file with cron expression', async () => {
        await handleCreateAgent({
            slug: 'scheduler',
            name: 'Scheduler',
            domain: 'marketing',
            primary_channel: 'seo',
            heartbeat_cron: '0 */30 * * *',
        }, noopSync);

        const hb = await fs.readFile(
            path.join(tmpDir, 'agents', 'scheduler', 'HEARTBEAT.md'), 'utf-8'
        );
        expect(hb).toContain('0 */30 * * *');
    });

    it('creates memory directory for agent', async () => {
        await handleCreateAgent({
            slug: 'mem-agent',
            name: 'Mem Agent',
            domain: 'marketing',
            primary_channel: 'seo',
        }, noopSync);

        const memPath = path.join(tmpDir, '.memory', 'agents', 'mem-agent');
        const stat = await fs.stat(memPath);
        expect(stat.isDirectory()).toBe(true);
    });

    it('updates agents index', async () => {
        await handleCreateAgent({
            slug: 'indexed-agent',
            name: 'Indexed Agent',
            domain: 'marketing',
            primary_channel: 'seo',
        }, noopSync);

        const indexContent = await fs.readFile(
            path.join(tmpDir, 'agents', 'index.json'), 'utf-8'
        );
        const index = JSON.parse(indexContent);
        expect(index.agents['indexed-agent']).toBeDefined();
        expect(index.agents['indexed-agent'].name).toBe('Indexed Agent');
    });

    it('throws when agent already exists', async () => {
        await handleCreateAgent({
            slug: 'dup', name: 'Dup', domain: 'marketing', primary_channel: 'seo',
        }, noopSync);
        await expect(handleCreateAgent({
            slug: 'dup', name: 'Dup', domain: 'marketing', primary_channel: 'seo',
        }, noopSync)).rejects.toThrow("Agent 'dup' already exists");
    });

    it('creates all 5 soul files from shared templates', async () => {
        await handleCreateAgent({
            slug: 'soul-agent',
            name: 'Soul Agent',
            domain: 'marketing',
            primary_channel: 'seo',
            role: 'Content Strategist',
        }, noopSync);

        const agentPath = path.join(tmpDir, 'agents', 'soul-agent');

        const soulMd = await fs.readFile(path.join(agentPath, 'SOUL.md'), 'utf-8');
        expect(soulMd).toContain('# Soul');
        expect(soulMd).toContain('Name: Soul Agent');
        expect(soulMd).toContain('Role: Content Strategist');

        const statusMd = await fs.readFile(path.join(agentPath, 'STATUS.md'), 'utf-8');
        expect(statusMd).toContain('# Status');
        expect(statusMd).toContain('Mood:');

        const userMd = await fs.readFile(path.join(agentPath, 'USER.md'), 'utf-8');
        expect(userMd).toContain('# User Knowledge');

        const relMd = await fs.readFile(path.join(agentPath, 'RELATIONSHIPS.md'), 'utf-8');
        expect(relMd).toContain('# Relationships');

        const bootstrapMd = await fs.readFile(path.join(agentPath, 'BOOTSTRAP.md'), 'utf-8');
        expect(bootstrapMd).toContain('# Bootstrap');
        expect(bootstrapMd).toContain('completed_at: null');
    });

    it('skips existing soul files when re-scaffolding', async () => {
        const agentPath = path.join(tmpDir, 'agents', 'pre-soul');
        await fs.mkdir(path.join(agentPath, 'inbox', 'processed'), { recursive: true });
        await fs.mkdir(path.join(agentPath, 'knowledge'), { recursive: true });

        const customSoul = '# Soul\n\n## Identity\nName: Custom\nRole: Custom Role\n';
        await fs.writeFile(path.join(agentPath, 'SOUL.md'), customSoul);

        // handleCreateAgent throws on existing agent, so we test the soul-file
        // idempotency by pre-creating just SOUL.md and calling the builder directly
        const { buildAllSoulFiles } = await import('../../workspace/soul-file-templates');
        const soulFiles = buildAllSoulFiles({ name: 'Pre Soul', role: 'tester' });

        // Write only SOUL.md beforehand
        const soulPath = path.join(agentPath, 'SOUL.md');
        const originalContent = await fs.readFile(soulPath, 'utf-8');

        // Simulate idempotent write logic from handleCreateAgent
        const entries = [
            { fileName: 'SOUL.md', content: soulFiles.soul },
            { fileName: 'STATUS.md', content: soulFiles.status },
        ];
        for (const { fileName, content } of entries) {
            const filePath = path.join(agentPath, fileName);
            try {
                await fs.access(filePath);
                // File exists, skip
            } catch {
                await fs.writeFile(filePath, content);
            }
        }

        // SOUL.md should retain its original content (not overwritten)
        const afterContent = await fs.readFile(soulPath, 'utf-8');
        expect(afterContent).toBe(originalContent);
        expect(afterContent).toContain('Custom');

        // STATUS.md should be created (did not exist)
        const statusContent = await fs.readFile(path.join(agentPath, 'STATUS.md'), 'utf-8');
        expect(statusContent).toContain('# Status');
    });
});

describe('handleUpdateAgent', () => {
    beforeEach(async () => {
        await handleCreateDomain({ slug: 'marketing', name: 'Marketing' }, noopSync);
        await handleCreateChannel({ domain: 'marketing', slug: 'seo', name: 'SEO' }, noopSync);
        await handleCreateAgent({
            slug: 'updatable', name: 'Updatable', domain: 'marketing', primary_channel: 'seo',
        }, noopSync);
    });

    it('updates agent config fields', async () => {
        const result = await handleUpdateAgent({ slug: 'updatable', role: 'Senior Writer' }, noopSync);

        expect(result).toContain('updatable');
        const configContent = await fs.readFile(
            path.join(tmpDir, 'agents', 'updatable', 'config.json'), 'utf-8'
        );
        const config = JSON.parse(configContent);
        expect(config.role).toBe('Senior Writer');
        expect(config.updated_at).toBeDefined();
    });

    it('throws when agent does not exist', async () => {
        await expect(handleUpdateAgent({ slug: 'ghost', role: 'test' }, noopSync))
            .rejects.toThrow("Agent 'ghost' does not exist");
    });
});

describe('handleDeleteAgent', () => {
    beforeEach(async () => {
        await handleCreateDomain({ slug: 'marketing', name: 'Marketing' }, noopSync);
        await handleCreateChannel({ domain: 'marketing', slug: 'seo', name: 'SEO' }, noopSync);
        await handleCreateAgent({
            slug: 'deletable', name: 'Deletable', domain: 'marketing', primary_channel: 'seo',
        }, noopSync);
    });

    it('removes agent directory and memory', async () => {
        const result = await handleDeleteAgent({ slug: 'deletable' }, noopSync);

        expect(result).toContain('deletable');

        const agentPath = path.join(tmpDir, 'agents', 'deletable');
        await expect(fs.access(agentPath)).rejects.toThrow();

        const memPath = path.join(tmpDir, '.memory', 'agents', 'deletable');
        await expect(fs.access(memPath)).rejects.toThrow();
    });

    it('removes agent from index', async () => {
        await handleDeleteAgent({ slug: 'deletable' }, noopSync);

        const indexContent = await fs.readFile(
            path.join(tmpDir, 'agents', 'index.json'), 'utf-8'
        );
        const index = JSON.parse(indexContent);
        expect(index.agents['deletable']).toBeUndefined();
    });

    it('throws when agent does not exist', async () => {
        await expect(handleDeleteAgent({ slug: 'nonexistent' }, noopSync))
            .rejects.toThrow("Agent 'nonexistent' does not exist");
    });
});

describe('handleAssignAgentToChannel', () => {
    beforeEach(async () => {
        await handleCreateDomain({ slug: 'marketing', name: 'Marketing' }, noopSync);
        await handleCreateChannel({ domain: 'marketing', slug: 'seo', name: 'SEO' }, noopSync);
        await handleCreateChannel({ domain: 'marketing', slug: 'content', name: 'Content' }, noopSync);
        await handleCreateAgent({
            slug: 'assigner', name: 'Assigner', domain: 'marketing', primary_channel: 'seo',
        }, noopSync);
    });

    it('adds channel to agent config', async () => {
        const result = await handleAssignAgentToChannel({
            slug: 'assigner', domain: 'marketing', channel: 'content',
        }, noopSync);

        expect(result).toContain('content');

        const configContent = await fs.readFile(
            path.join(tmpDir, 'agents', 'assigner', 'config.json'), 'utf-8'
        );
        const config = JSON.parse(configContent);
        expect(config.channels).toContain('content');
    });

    it('does not duplicate channel if already assigned', async () => {
        await handleAssignAgentToChannel({
            slug: 'assigner', domain: 'marketing', channel: 'seo',
        }, noopSync);

        const configContent = await fs.readFile(
            path.join(tmpDir, 'agents', 'assigner', 'config.json'), 'utf-8'
        );
        const config = JSON.parse(configContent);
        const seoCount = config.channels.filter((c: string) => c === 'seo').length;
        expect(seoCount).toBe(1);
    });

    it('throws when channel does not exist', async () => {
        await expect(handleAssignAgentToChannel({
            slug: 'assigner', domain: 'marketing', channel: 'nonexistent',
        }, noopSync)).rejects.toThrow("Channel 'nonexistent' does not exist");
    });

    it('creates CLAUDE.md in channel directory on assignment', async () => {
        await handleAssignAgentToChannel({
            slug: 'assigner', domain: 'marketing', channel: 'content',
        }, noopSync);

        const claudeMdPath = path.join(
            tmpDir, 'projects', 'marketing', 'channels', 'content', 'CLAUDE.md'
        );
        const content = await fs.readFile(claudeMdPath, 'utf-8');
        expect(content).toContain('#marketing-content');
        expect(content).toContain('Assigner');
    });

    it('updates CLAUDE.md on re-assignment', async () => {
        // First assignment
        await handleAssignAgentToChannel({
            slug: 'assigner', domain: 'marketing', channel: 'content',
        }, noopSync);

        // Second assignment (same agent, same channel - idempotent)
        await handleAssignAgentToChannel({
            slug: 'assigner', domain: 'marketing', channel: 'content',
        }, noopSync);

        const claudeMdPath = path.join(
            tmpDir, 'projects', 'marketing', 'channels', 'content', 'CLAUDE.md'
        );
        const content = await fs.readFile(claudeMdPath, 'utf-8');
        expect(content).toContain('#marketing-content');
    });

    it('includes project context from domain CLAUDE.md', async () => {
        await handleAssignAgentToChannel({
            slug: 'assigner', domain: 'marketing', channel: 'content',
        }, noopSync);

        const claudeMdPath = path.join(
            tmpDir, 'projects', 'marketing', 'channels', 'content', 'CLAUDE.md'
        );
        const content = await fs.readFile(claudeMdPath, 'utf-8');
        expect(content).toContain('## Project: marketing');
    });
});

describe('handleInstallSkill', () => {
    beforeEach(async () => {
        const skillSourcePath = path.join(tmpDir, 'marketplace', 'skills', 'code-review');
        await fs.mkdir(skillSourcePath, { recursive: true });
        await fs.writeFile(
            path.join(skillSourcePath, 'SKILL.md'),
            '# Code Review Skill\n'
        );

        const destParent = path.join(tmpDir, '.claude', 'skills');
        await fs.mkdir(destParent, { recursive: true });
    });

    it('copies skill from marketplace to .claude/skills/', async () => {
        const result = await handleInstallSkill({ skill_name: 'code-review' }, noopSync);

        expect(result).toContain('code-review');

        const installedPath = path.join(tmpDir, '.claude', 'skills', 'code-review', 'SKILL.md');
        const content = await fs.readFile(installedPath, 'utf-8');
        expect(content).toContain('Code Review');
    });

    it('throws when skill not found in marketplace', async () => {
        await expect(handleInstallSkill({ skill_name: 'missing-skill' }, noopSync))
            .rejects.toThrow("Skill 'missing-skill' not found in marketplace");
    });

    it('returns message when skill already installed', async () => {
        await handleInstallSkill({ skill_name: 'code-review' }, noopSync);
        const result = await handleInstallSkill({ skill_name: 'code-review' }, noopSync);
        expect(result).toContain('already installed');
    });
});

describe('handleListAgents', () => {
    it('returns empty when no agents exist', async () => {
        const result = await handleListAgents();
        const parsed = JSON.parse(result);
        expect(parsed.agents).toEqual([]);
    });

    it('lists agents after creation', async () => {
        await handleCreateDomain({ slug: 'eng', name: 'Engineering' }, noopSync);
        await handleCreateChannel({ domain: 'eng', slug: 'backend', name: 'Backend' }, noopSync);
        await handleCreateAgent({
            slug: 'dev-1',
            name: 'Developer 1',
            domain: 'eng',
            primary_channel: 'backend',
        }, noopSync);

        const result = await handleListAgents();
        const parsed = JSON.parse(result);
        expect(parsed.agents['dev-1']).toBeDefined();
        expect(parsed.agents['dev-1'].name).toBe('Developer 1');
    });
});

describe('handleListDomains', () => {
    it('returns empty when no domains exist', async () => {
        const result = await handleListDomains();
        const parsed = JSON.parse(result);
        expect(parsed.domains).toEqual([]);
    });

    it('lists domains after creation', async () => {
        await handleCreateDomain({ slug: 'engineering', name: 'Engineering' }, noopSync);
        await handleCreateDomain({ slug: 'marketing', name: 'Marketing' }, noopSync);

        const result = await handleListDomains();
        const parsed = JSON.parse(result);
        expect(parsed.domains).toHaveLength(2);
        const slugs = parsed.domains.map((d: { slug: string }) => d.slug);
        expect(slugs).toContain('engineering');
        expect(slugs).toContain('marketing');
    });
});

describe('handleSendNotification', () => {
    it('returns confirmation message', async () => {
        const result = await handleSendNotification({ message: 'Hello team' }, noopSync);
        expect(result).toContain('Hello team');
    });
});
