// Module CLAUDE.md Generator (Layer 2)
// Generates agent-specific CLAUDE.md with identity, KB, skills, tools, colleagues, autonomy.
// Placed at /workspace/agents/{slug}/CLAUDE.md - SDK loads via settingSources descendant pattern.
// Spec: docs/planning/execution/agent-module-claude-md.md
// Data source: workspace filesystem (config.json, knowledge/, .claude/skills/, agents/index.json)
// Zero DB queries — all data is on the filesystem.

import type { SandboxFileSystem } from './workspace.manager';
import { AUTONOMY_RULES } from './autonomy-rules';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface AgentConfig {
    name: string;
    description?: string;
    autonomy_level?: string;
    tools?: string[];
    channels?: string[];
    domain?: string;
}

interface AgentsIndex {
    agents: Record<string, { name: string; role?: string; description?: string; is_master?: boolean }>;
}

// -----------------------------------------------------------------------------
// Template
// -----------------------------------------------------------------------------

const MODULE_TEMPLATE = `## Identity

You are {agent_name}, {agent_description}.

## Knowledge Base

Your assigned documents (read with Read tool):
{kb_documents}

Always check your knowledge base before doing external web research. Browse the knowledge folders listed above using Glob/Read tools.

## Skills

Auto-activated expertise available to you:
{skills}

## Connected Tools

Integrations available to you (via MCP):
{connected_tools}

If a tool action fails with "NOT_CONNECTED", ask @human to authenticate the integration.

## Colleagues

Agents you can @mention for help in task threads:
{colleagues}

To delegate work to a colleague, describe what you need in a task comment with @mention. The orchestrator will route it.

## Autonomy

Level: {autonomy_level}
{autonomy_rules}

## Context

Read \`context/index.md\` at the start of each session for available context files.
Update \`context/memory/working.md\` as you make progress.

## Delegation

You have SDK-native subagent types to keep your context lean:
- \`Task({ subagent_type: "Explore", prompt: "..." })\` -- Read-only codebase research
- \`Task({ subagent_type: "Plan", prompt: "..." })\` -- Design implementation plans
- \`Task({ subagent_type: "general-purpose", prompt: "..." })\` -- Full capability agent

Use Explore before reading >5 files. Use general-purpose to verify deliverables.
Channel teammates are also available as subagent types (by slug).
`;

// -----------------------------------------------------------------------------
// Filesystem Readers
// -----------------------------------------------------------------------------

async function readAgentConfig(slug: string, sandboxFs: SandboxFileSystem, workspacePath: string): Promise<AgentConfig> {
    const configPath = `${workspacePath}/agents/${slug}/config.json`;
    const raw = await sandboxFs.readFile(configPath);
    return JSON.parse(raw) as AgentConfig;
}

async function listKbDocs(slug: string, sandboxFs: SandboxFileSystem, workspacePath: string): Promise<string[]> {
    const knowledgePath = `${workspacePath}/agents/${slug}/knowledge`;
    const exists = await sandboxFs.exists(knowledgePath);
    if (!exists) return [];
    const entries = await sandboxFs.list(knowledgePath);
    return entries.filter((e) => !e.startsWith('.'));
}

async function listInstalledSkills(
    sandboxFs: SandboxFileSystem,
    workspacePath: string,
    agentChannelPaths: string[],
): Promise<Array<{ name: string; scope: 'global' | 'channel'; channelPath?: string }>> {
    const skills: Array<{ name: string; scope: 'global' | 'channel'; channelPath?: string }> = [];

    // Global skills at root .claude/skills/
    const globalPath = `${workspacePath}/.claude/skills`;
    const globalExists = await sandboxFs.exists(globalPath);
    if (globalExists) {
        const entries = await sandboxFs.list(globalPath);
        for (const e of entries) {
            if (!e.startsWith('.')) skills.push({ name: e, scope: 'global' });
        }
    }

    // Channel-scoped skills for each of the agent's channels
    for (const chPath of agentChannelPaths) {
        const chSkillsPath = `${workspacePath}/${chPath}/.claude/skills`;
        const chExists = await sandboxFs.exists(chSkillsPath);
        if (!chExists) continue;
        const entries = await sandboxFs.list(chSkillsPath);
        for (const e of entries) {
            if (!e.startsWith('.')) skills.push({ name: e, scope: 'channel', channelPath: chPath });
        }
    }

    return skills;
}

async function readColleagues(
    slug: string,
    sandboxFs: SandboxFileSystem,
    workspacePath: string,
): Promise<Array<{ slug: string; description: string }>> {
    const indexPath = `${workspacePath}/agents/index.json`;
    const exists = await sandboxFs.exists(indexPath);
    if (!exists) return [];

    const raw = await sandboxFs.readFile(indexPath);
    const index = JSON.parse(raw) as AgentsIndex;

    const colleagues: Array<{ slug: string; description: string }> = [];
    for (const [agentSlug, info] of Object.entries(index.agents)) {
        // Exclude self and master orchestrator
        if (agentSlug === slug || info.is_master) continue;

        // Filter by same domain or shared channel membership (best-effort from index)
        // Index doesn't store channels, so include all non-master colleagues in same domain
        // If domain is empty, include all (no filtering possible without DB)
        colleagues.push({
            slug: agentSlug,
            description: info.description || info.role || info.name,
        });
    }
    return colleagues;
}

// -----------------------------------------------------------------------------
// Formatters
// -----------------------------------------------------------------------------

function formatKbDocs(docs: string[], slug: string): string {
    if (docs.length === 0) return 'No documents assigned yet. Use external research tools for information gathering.';
    return docs.map((d) => `- agents/${slug}/knowledge/${d}`).join('\n');
}

function formatSkills(skills: Array<{ name: string; scope: 'global' | 'channel'; channelPath?: string }>): string {
    if (skills.length === 0) return 'No specialized skills assigned. Use your general capabilities.';
    return skills.map((s) => {
        if (s.scope === 'channel' && s.channelPath) {
            return `- ${s.name} (see ${s.channelPath}/.claude/skills/${s.name}/SKILL.md) [channel]`;
        }
        return `- ${s.name} (see .claude/skills/${s.name}/SKILL.md)`;
    }).join('\n');
}

function formatConnectedTools(tools: string[]): string {
    if (tools.length === 0) return 'No tool integrations assigned. Use code-first approach for external API calls.';
    return tools.map((t) => `- ${t} [status: check Pipedream MCP]`).join('\n');
}

function formatColleagues(colleagues: Array<{ slug: string; description: string }>): string {
    if (colleagues.length === 0) return 'No colleagues in your current channels. Work independently.';
    return colleagues.map((c) => `- @${c.slug}: ${c.description}`).join('\n');
}

// -----------------------------------------------------------------------------
// Generator
// -----------------------------------------------------------------------------

export class ModuleClaudeMdGenerator {
    /**
     * Derive channel workspace paths from agent config.
     * config.channels is ["domain/channel", ...], config.domain is the default domain.
     * Returns paths like "projects/marketing/channels/seo".
     */
    private resolveAgentChannelPaths(config: AgentConfig): string[] {
        const paths: string[] = [];
        if (config.channels && config.channels.length > 0) {
            for (const ch of config.channels) {
                const parts = ch.split('/');
                if (parts.length === 2 && parts[0] && parts[1]) {
                    paths.push(`projects/${parts[0]}/channels/${parts[1]}`);
                } else if (parts.length === 1 && config.domain) {
                    paths.push(`projects/${config.domain}/channels/${parts[0]}`);
                }
            }
        }
        return paths;
    }

    async generateForAgent(slug: string, sandboxFs: SandboxFileSystem, workspacePath: string): Promise<string> {
        const config = await readAgentConfig(slug, sandboxFs, workspacePath);

        // Resolve agent's channel paths for channel-scoped skill discovery
        const agentChannelPaths = this.resolveAgentChannelPaths(config);

        const [kbDocs, skills, colleagues] = await Promise.all([
            listKbDocs(slug, sandboxFs, workspacePath),
            listInstalledSkills(sandboxFs, workspacePath, agentChannelPaths),
            readColleagues(slug, sandboxFs, workspacePath),
        ]);

        const agentName = config.name || slug;
        const agentDescription = config.description || '';
        const autonomyLevel = config.autonomy_level || 'supervised';
        const tools = config.tools || [];

        return MODULE_TEMPLATE
            .replaceAll('{agent_name}', agentName)
            .replaceAll('{agent_description}', agentDescription)
            .replaceAll('{kb_documents}', formatKbDocs(kbDocs, slug))
            .replaceAll('{skills}', formatSkills(skills))
            .replaceAll('{connected_tools}', formatConnectedTools(tools))
            .replaceAll('{colleagues}', formatColleagues(colleagues))
            .replaceAll('{autonomy_level}', autonomyLevel)
            .replaceAll('{autonomy_rules}', AUTONOMY_RULES[autonomyLevel] || AUTONOMY_RULES.supervised);
    }
}
