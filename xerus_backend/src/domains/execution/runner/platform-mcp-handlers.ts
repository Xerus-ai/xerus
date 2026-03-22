// Platform MCP Tool Handlers
// Workspace filesystem operations for the Xerus master Platform MCP server
// Each handler scaffolds directories, writes configs, and emits metadata_sync events
//
// Split: helpers/list handlers moved to platform-mcp-router.ts
// Reference: EXECUTION_ARCHITECTURE_v2.md Section 4, Section 10

import fs from 'fs/promises';
import path from 'path';
import { buildAllSoulFiles, type SoulFileContext } from '../workspace/soul-file-templates';
import { generateChannelClaudeMd } from '../workspace/channel-claude-md.template';
import { scaffoldAgent } from '../scaffold/scaffold-writer';
import { getWorkspacePath, ensureDir, writeJsonFile, readJsonFile, fileExists } from './platform-mcp-utils';
import type { MetadataSyncFn } from './platform-mcp-utils';
export type { MetadataSyncFn } from './platform-mcp-utils';

// Import and re-export helpers from router module
import {
    assertSafeSegment,
    updateAgentsIndex,
    removeFromAgentsIndex,
    resolveAgentChannelPath,
} from './platform-mcp-router';
import { DEFAULT_SDK_MODEL } from '../../agents/types';

// Re-export everything from router for existing consumers
export {
    handleListAgents,
    handleListDomains,
    handleSendNotification,
} from './platform-mcp-router';

// -----------------------------------------------------------------------------
// Tool Handlers
// -----------------------------------------------------------------------------

export async function handleCreateWorkspace(args: Record<string, unknown>, emitSync: MetadataSyncFn): Promise<string> {
    const slug = args.slug as string;
    assertSafeSegment(slug, 'workspace slug');
    const name = args.name as string;
    const description = (args.description as string) || '';

    const projectsPath = path.join(getWorkspacePath(), 'projects');
    await ensureDir(projectsPath);

    emitSync('workspace', 'create', { slug, name, description });
    return `Created workspace '${name}' (${slug}). Use platform.create_domain to add departments.`;
}

export async function handleCreateDomain(args: Record<string, unknown>, emitSync: MetadataSyncFn): Promise<string> {
    const slug = args.slug as string;
    assertSafeSegment(slug, 'domain slug');
    const name = args.name as string;
    const description = (args.description as string) || '';

    const domainPath = path.join(getWorkspacePath(), 'projects', slug);
    if (await fileExists(domainPath)) {
        throw new Error(`Domain '${slug}' already exists at ${domainPath}`);
    }

    await ensureDir(path.join(domainPath, 'channels'));
    await ensureDir(path.join(domainPath, 'data'));
    await ensureDir(path.join(domainPath, 'knowledge'));

    const claudeMd = `# ${name}\n\n${description}\n\n## Team\n\n## Priorities\n\n## Resources\n`;
    await fs.writeFile(path.join(domainPath, 'CLAUDE.md'), claudeMd);

    const memoryPath = path.join(getWorkspacePath(), '.memory', 'projects', slug);
    await ensureDir(memoryPath);
    await fs.writeFile(path.join(memoryPath, 'context.md'), `# ${name} Context\n\n`);

    emitSync('domain', 'create', { slug, name, description });
    return `Created domain '${name}' at projects/${slug}/`;
}

export async function handleCreateChannel(args: Record<string, unknown>, emitSync: MetadataSyncFn): Promise<string> {
    const domain = args.domain as string;
    const slug = args.slug as string;
    assertSafeSegment(domain, 'domain slug');
    assertSafeSegment(slug, 'channel slug');
    const name = args.name as string;
    const description = (args.description as string) || '';

    const domainPath = path.join(getWorkspacePath(), 'projects', domain);
    if (!(await fileExists(domainPath))) {
        throw new Error(`Domain '${domain}' does not exist. Create it first.`);
    }

    const channelPath = path.join(domainPath, 'channels', slug);
    if (await fileExists(channelPath)) {
        throw new Error(`Channel '${slug}' already exists in domain '${domain}'`);
    }

    await ensureDir(path.join(channelPath, '.beads'));
    await ensureDir(path.join(channelPath, 'data'));
    await ensureDir(path.join(channelPath, 'output', 'deliverables'));
    await ensureDir(path.join(channelPath, 'scratch'));

    const domainClaudeMdPath = path.join(domainPath, 'CLAUDE.md');
    let projectDescription = '';
    if (await fileExists(domainClaudeMdPath)) {
        projectDescription = await fs.readFile(domainClaudeMdPath, 'utf-8');
    }

    const claudeMd = generateChannelClaudeMd({
        projectName: domain,
        projectDescription,
        channelName: `${domain}-${slug}`,
        channelPurpose: description,
        agentRole: '',
    });
    await fs.writeFile(path.join(channelPath, 'CLAUDE.md'), claudeMd);
    await fs.writeFile(path.join(channelPath, '.beads', 'issues.jsonl'), '');
    await fs.writeFile(path.join(channelPath, 'output', 'posts.jsonl'), '');

    const memoryPath = path.join(getWorkspacePath(), '.memory', 'projects', domain, slug);
    await ensureDir(memoryPath);
    await fs.writeFile(path.join(memoryPath, 'context.md'), `# ${name} Context\n\n`);

    emitSync('channel', 'create', { domain, slug, name, description });
    return `Created channel '#${domain}-${slug}' at projects/${domain}/channels/${slug}/`;
}

export async function handleCreateAgent(args: Record<string, unknown>, emitSync: MetadataSyncFn): Promise<string> {
    const slug = args.slug as string;
    assertSafeSegment(slug, 'agent slug');
    const name = args.name as string;
    const domain = args.domain as string;
    assertSafeSegment(domain, 'domain slug');
    const primaryChannel = args.primary_channel as string;
    const channels = (args.channels as string[]) || [primaryChannel];
    const role = (args.role as string) || '';
    const personalityType = (args.personality_type as string) || '';
    const model = (args.model as string) || DEFAULT_SDK_MODEL;
    const heartbeatCron = (args.heartbeat_cron as string) || '';

    const agentPath = path.join(getWorkspacePath(), 'agents', slug);
    if (await fileExists(agentPath)) {
        throw new Error(`Agent '${slug}' already exists at agents/${slug}/`);
    }

    const config = {
        slug, name, domain,
        primary_channel: primaryChannel, channels, model, role,
        tools: [] as string[],
        heartbeat_cron: heartbeatCron,
        autonomy_level: 'supervised',
        created_at: new Date().toISOString(),
    };

    const heartbeatMd = heartbeatCron
        ? `# ${name} Heartbeat\n\n## Scheduled\n\nCron: ${heartbeatCron}\n\n## Events\n`
        : `# ${name} Heartbeat\n\n## Scheduled\n\nNo schedule configured.\n\n## Events\n`;

    const soulFiles = buildAllSoulFiles({
        name, role, domain, personalityType,
        identity: args.identity as SoulFileContext['identity'],
        goals: args.goals as SoulFileContext['goals'],
        guidelines: args.guidelines as SoulFileContext['guidelines'],
        constraints: args.constraints as SoulFileContext['constraints'],
        personality: args.personality as SoulFileContext['personality'],
        description: (args.description as string) || '',
        slug,
        autonomyLevel: 'supervised',
        primaryChannel: '',
        tools: [],
    });

    const files: Array<{ path: string; content: string }> = [
        { path: `agents/${slug}/config.json`, content: JSON.stringify(config, null, 2) + '\n' },
        { path: `agents/${slug}/HEARTBEAT.md`, content: heartbeatMd },
        { path: `agents/${slug}/SOUL.md`, content: soulFiles.soul },
        { path: `agents/${slug}/STATUS.md`, content: soulFiles.status },
        { path: `agents/${slug}/USER.md`, content: soulFiles.user },
        { path: `agents/${slug}/RELATIONSHIPS.md`, content: soulFiles.relationships },
        { path: `agents/${slug}/BOOTSTRAP.md`, content: soulFiles.bootstrap },
    ];

    const memoryPath = path.join(getWorkspacePath(), '.memory', 'agents', slug);
    await ensureDir(memoryPath);
    await fs.writeFile(path.join(memoryPath, 'working.md'), `# ${name} Working Context\n\n`);
    await fs.writeFile(path.join(memoryPath, 'expertise.md'), `# ${name} Expertise\n\n`);

    await scaffoldAgent(getWorkspacePath(), files);

    emitSync('agent', 'create', {
        slug, name, domain, primary_channel: primaryChannel, channels, model, heartbeat_cron: heartbeatCron,
    });

    if (heartbeatCron) {
        emitSync('heartbeat', 'configure', {
            agent_slug: slug,
            enabled: true,
            cron_expression: heartbeatCron,
        });
    }

    return `Created agent '${name}' (${slug}) in domain '${domain}', primary channel '${primaryChannel}'.`;
}

export async function handleUpdateAgent(args: Record<string, unknown>, emitSync: MetadataSyncFn): Promise<string> {
    const slug = args.slug as string;
    assertSafeSegment(slug, 'agent slug');
    const configPath = path.join(getWorkspacePath(), 'agents', slug, 'config.json');

    if (!(await fileExists(configPath))) {
        throw new Error(`Agent '${slug}' does not exist.`);
    }

    const config = (await readJsonFile(configPath)) as Record<string, unknown>;
    const updatableFields = ['name', 'domain', 'primary_channel', 'channels', 'role', 'model', 'tools', 'heartbeat_cron'];
    const changes: Record<string, unknown> = {};
    for (const field of updatableFields) {
        if (args[field] !== undefined) {
            config[field] = args[field];
            changes[field] = args[field];
        }
    }
    config.updated_at = new Date().toISOString();

    await writeJsonFile(configPath, config);
    await updateAgentsIndex(slug, config);

    emitSync('agent', 'update', { slug, changes });

    if (changes.heartbeat_cron !== undefined) {
        emitSync('heartbeat', 'configure', {
            agent_slug: slug,
            enabled: !!changes.heartbeat_cron,
            cron_expression: (changes.heartbeat_cron as string) || '',
        });
    }

    return `Updated agent '${slug}': ${Object.keys(changes).join(', ')}`;
}

export async function handleDeleteAgent(args: Record<string, unknown>, emitSync: MetadataSyncFn): Promise<string> {
    const slug = args.slug as string;
    assertSafeSegment(slug, 'agent slug');
    const agentPath = path.join(getWorkspacePath(), 'agents', slug);

    if (!(await fileExists(agentPath))) {
        throw new Error(`Agent '${slug}' does not exist.`);
    }

    await fs.rm(agentPath, { recursive: true });
    await removeFromAgentsIndex(slug);

    const memoryPath = path.join(getWorkspacePath(), '.memory', 'agents', slug);
    if (await fileExists(memoryPath)) {
        await fs.rm(memoryPath, { recursive: true });
    }

    emitSync('agent', 'delete', { slug });
    return `Deleted agent '${slug}'`;
}

export async function handleAssignAgentToChannel(args: Record<string, unknown>, emitSync: MetadataSyncFn): Promise<string> {
    const slug = args.slug as string;
    const domain = args.domain as string;
    const channel = args.channel as string;
    assertSafeSegment(slug, 'agent slug');
    assertSafeSegment(domain, 'domain slug');
    assertSafeSegment(channel, 'channel slug');

    const configPath = path.join(getWorkspacePath(), 'agents', slug, 'config.json');
    if (!(await fileExists(configPath))) {
        throw new Error(`Agent '${slug}' does not exist.`);
    }

    const channelPath = path.join(getWorkspacePath(), 'projects', domain, 'channels', channel);
    if (!(await fileExists(channelPath))) {
        throw new Error(`Channel '${channel}' does not exist in domain '${domain}'.`);
    }

    const config = (await readJsonFile(configPath)) as Record<string, unknown>;
    const channels = (config.channels as string[]) || [];
    if (!channels.includes(channel)) {
        channels.push(channel);
        config.channels = channels;
        config.updated_at = new Date().toISOString();
        await writeJsonFile(configPath, config);
        await updateAgentsIndex(slug, config);
    }

    const domainPath = path.join(getWorkspacePath(), 'projects', domain);
    const domainClaudeMdPath = path.join(domainPath, 'CLAUDE.md');
    let projectDescription = '';
    if (await fileExists(domainClaudeMdPath)) {
        projectDescription = await fs.readFile(domainClaudeMdPath, 'utf-8');
    }

    const agentRole = (config.role as string) || (config.name as string) || slug;
    const claudeMd = generateChannelClaudeMd({
        projectName: domain,
        projectDescription,
        channelName: `${domain}-${channel}`,
        channelPurpose: '',
        agentRole,
    });
    await fs.writeFile(path.join(channelPath, 'CLAUDE.md'), claudeMd);

    emitSync('agent', 'update', { slug, changes: { channels } });
    return `Assigned agent '${slug}' to channel '${channel}' in domain '${domain}'`;
}

export async function handleInstallSkill(args: Record<string, unknown>, emitSync: MetadataSyncFn): Promise<string> {
    const skillName = args.skill_name as string;
    assertSafeSegment(skillName, 'skill name');
    const agentSlug = args.agent_slug as string | undefined;
    if (agentSlug) assertSafeSegment(agentSlug, 'agent slug');
    const scope = (args.scope as string) || 'channel';

    const sourcePath = path.join(getWorkspacePath(), 'marketplace', 'skills', skillName);
    if (!(await fileExists(sourcePath))) {
        throw new Error(`Skill '${skillName}' not found in marketplace.`);
    }

    let destPath: string;
    let channelPath = '';
    if (scope === 'global' || !agentSlug) {
        destPath = path.join(getWorkspacePath(), '.claude', 'skills', skillName);
    } else {
        channelPath = await resolveAgentChannelPath(agentSlug);
        destPath = path.join(getWorkspacePath(), channelPath, '.claude', 'skills', skillName);
    }

    if (await fileExists(destPath)) {
        return `Skill '${skillName}' is already installed at ${path.relative(getWorkspacePath(), destPath)}.`;
    }

    await fs.cp(sourcePath, destPath, { recursive: true });

    emitSync('skill', 'install', {
        skill_slug: skillName,
        agent_slug: agentSlug || null,
        scope,
        channel_path: channelPath || null,
    });

    const relPath = path.relative(getWorkspacePath(), destPath);
    return `Installed skill '${skillName}' to ${relPath}/`;
}
