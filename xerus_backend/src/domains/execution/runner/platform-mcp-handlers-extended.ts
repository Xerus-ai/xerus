// Platform MCP Extended Handlers — Agent, KB, Skills, Tools
// Handlers for: search_agents, clone_agent, get_status, search_kb, upload_kb,
// assign_kb, create_skill, search_skills, search_tools, connect_tool
//
// Reference: platform-tool.schemas.ts (canonical schemas)

import fs from 'fs/promises';
import path from 'path';
import type { MetadataSyncFn } from './platform-mcp-handlers';
import { getWorkspacePath, fileExists, ensureDir, readJsonFile, writeJsonFile } from './platform-mcp-utils';

// ---------------------------------------------------------------------------
// Agent Management
// ---------------------------------------------------------------------------

export async function handleSearchAgents(args: Record<string, unknown>): Promise<string> {
    const query = ((args.query as string) || '').toLowerCase();
    const scope = (args.scope as string) || 'all';
    const ws = getWorkspacePath();
    const results: unknown[] = [];

    if (scope === 'mine' || scope === 'all') {
        const indexPath = path.join(ws, 'agents', 'index.json');
        if (await fileExists(indexPath)) {
            const index = (await readJsonFile(indexPath)) as Record<string, unknown>;
            const agents = (index.agents || {}) as Record<string, Record<string, unknown>>;
            for (const [slug, agent] of Object.entries(agents)) {
                const name = ((agent.name as string) || '').toLowerCase();
                const role = ((agent.role as string) || '').toLowerCase();
                if (name.includes(query) || role.includes(query) || slug.includes(query)) {
                    results.push({ slug, ...agent, source: 'workspace' });
                }
            }
        }
    }

    if (scope === 'marketplace' || scope === 'all') {
        const mpPath = path.join(ws, 'marketplace', 'agents');
        if (await fileExists(mpPath)) {
            const entries = await fs.readdir(mpPath, { withFileTypes: true });
            for (const entry of entries) {
                if (!entry.isDirectory()) continue;
                if (entry.name.includes(query)) {
                    results.push({ slug: entry.name, source: 'marketplace' });
                }
            }
        }
    }

    return JSON.stringify({ agents: results, count: results.length }, null, 2);
}

export async function handleCloneAgent(args: Record<string, unknown>, emitSync: MetadataSyncFn): Promise<string> {
    const sourceId = args.source_agent_id as string;
    const name = args.name as string;
    const customizations = (args.customizations || {}) as Record<string, unknown>;
    const ws = getWorkspacePath();

    const sourcePath = path.join(ws, 'agents', sourceId);
    const mpSourcePath = path.join(ws, 'marketplace', 'agents', sourceId);

    let actualSource: string;
    if (await fileExists(sourcePath)) {
        actualSource = sourcePath;
    } else if (await fileExists(mpSourcePath)) {
        actualSource = mpSourcePath;
    } else {
        throw new Error(`Source agent '${sourceId}' not found in workspace or marketplace.`);
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const destPath = path.join(ws, 'agents', slug);
    if (await fileExists(destPath)) {
        throw new Error(`Agent '${slug}' already exists.`);
    }

    await fs.cp(actualSource, destPath, { recursive: true });

    const configPath = path.join(destPath, 'config.json');
    if (await fileExists(configPath)) {
        const config = (await readJsonFile(configPath)) as Record<string, unknown>;
        config.name = name;
        config.slug = slug;
        config.cloned_from = sourceId;
        config.created_at = new Date().toISOString();
        if (customizations.model_id) config.model = customizations.model_id;
        if (customizations.autonomy_level) config.autonomy_level = customizations.autonomy_level;
        if (customizations.description) config.description = customizations.description;
        await writeJsonFile(configPath, config);
    }

    const memoryPath = path.join(ws, '.memory', 'agents', slug);
    await ensureDir(memoryPath);
    await fs.writeFile(path.join(memoryPath, 'working.md'), `# ${name} Working Context\n\n`);

    const indexPath = path.join(ws, 'agents', 'index.json');
    let index: Record<string, unknown> = {};
    if (await fileExists(indexPath)) {
        index = (await readJsonFile(indexPath)) as Record<string, unknown>;
    }
    const agents = (index.agents || {}) as Record<string, unknown>;
    agents[slug] = { name, cloned_from: sourceId };
    index.agents = agents;
    index.updated_at = new Date().toISOString();
    await writeJsonFile(indexPath, index);

    emitSync('agent', 'clone', { slug, name, source: sourceId, customizations });
    return `Cloned '${sourceId}' as '${name}' (${slug}).`;
}

export async function handleGetStatus(args: Record<string, unknown>): Promise<string> {
    const scope = args.scope as string;
    const id = args.id as string | undefined;
    const ws = getWorkspacePath();

    if (scope === 'agent' && id) {
        const statusPath = path.join(ws, 'agents', id, 'STATUS.md');
        const configPath = path.join(ws, 'agents', id, 'config.json');
        const parts: string[] = [];
        if (await fileExists(statusPath)) parts.push(await fs.readFile(statusPath, 'utf-8'));
        if (await fileExists(configPath)) {
            const config = await readJsonFile(configPath);
            parts.push(`\n## Config\n\`\`\`json\n${JSON.stringify(config, null, 2)}\n\`\`\``);
        }
        return parts.join('\n') || `Agent '${id}' not found.`;
    }

    if (scope === 'workspace') {
        const indexPath = path.join(ws, 'agents', 'index.json');
        const index = (await fileExists(indexPath)) ? await readJsonFile(indexPath) : { agents: {} };
        return JSON.stringify(index, null, 2);
    }

    return JSON.stringify({ scope, id, status: 'ok' });
}

// ---------------------------------------------------------------------------
// Knowledge Base
// ---------------------------------------------------------------------------

export async function handleSearchKb(args: Record<string, unknown>): Promise<string> {
    const query = ((args.query as string) || '').toLowerCase();
    const ws = getWorkspacePath();
    const results: Array<{ path: string; title: string }> = [];

    const kbDirs = [
        path.join(ws, 'shared', 'knowledge'),
    ];

    for (const dir of kbDirs) {
        if (!(await fileExists(dir))) continue;
        const files = await fs.readdir(dir, { recursive: true });
        for (const file of files) {
            const fileName = String(file).toLowerCase();
            if (fileName.includes(query)) {
                results.push({ path: `shared/knowledge/${file}`, title: String(file) });
            }
        }
    }

    return JSON.stringify({ results, count: results.length }, null, 2);
}

export async function handleUploadKb(args: Record<string, unknown>, emitSync: MetadataSyncFn): Promise<string> {
    const title = args.title as string;
    const content = args.content as string | undefined;
    const filePath = args.file_path as string | undefined;
    const ws = getWorkspacePath();

    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const kbDir = path.join(ws, 'shared', 'knowledge');
    await ensureDir(kbDir);

    const destPath = path.join(kbDir, `${slug}.md`);

    if (content) {
        await fs.writeFile(destPath, `# ${title}\n\n${content}`);
    } else if (filePath) {
        const absPath = path.isAbsolute(filePath) ? filePath : path.join(ws, filePath);
        if (!(await fileExists(absPath))) throw new Error(`File not found: ${filePath}`);
        await fs.cp(absPath, destPath);
    } else {
        await fs.writeFile(destPath, `# ${title}\n\n`);
    }

    emitSync('kb', 'upload', { title, slug, path: `shared/knowledge/${slug}.md` });
    return `Uploaded '${title}' to shared/knowledge/${slug}.md`;
}

export async function handleAssignKb(args: Record<string, unknown>, emitSync: MetadataSyncFn): Promise<string> {
    const agentId = args.agent_id as string;
    const documentId = args.document_id as string | undefined;
    const collectionId = args.collection_id as string | undefined;
    const ws = getWorkspacePath();

    const agentKbDir = path.join(ws, 'agents', agentId, 'knowledge');
    if (!(await fileExists(path.join(ws, 'agents', agentId)))) {
        throw new Error(`Agent '${agentId}' does not exist.`);
    }
    await ensureDir(agentKbDir);

    if (documentId) {
        const srcPath = path.join(ws, 'shared', 'knowledge', documentId);
        if (!(await fileExists(srcPath))) throw new Error(`Document '${documentId}' not found.`);
        await fs.cp(srcPath, path.join(agentKbDir, path.basename(documentId)));
        emitSync('kb', 'assign', { agent_id: agentId, kb_id: documentId });
        return `Assigned document '${documentId}' to agent '${agentId}'.`;
    }

    if (collectionId) {
        const srcDir = path.join(ws, 'shared', 'knowledge', collectionId);
        if (!(await fileExists(srcDir))) throw new Error(`Collection '${collectionId}' not found.`);
        await fs.cp(srcDir, path.join(agentKbDir, collectionId), { recursive: true });
        emitSync('kb', 'assign', { agent_id: agentId, kb_id: collectionId });
        return `Assigned collection '${collectionId}' to agent '${agentId}'.`;
    }

    return 'No document_id or collection_id provided.';
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

export async function handleCreateSkill(args: Record<string, unknown>, emitSync: MetadataSyncFn): Promise<string> {
    const name = args.name as string;
    const description = args.description as string;
    const instructions = args.instructions as string;
    const ws = getWorkspacePath();

    const skillDir = path.join(ws, '.claude', 'skills', name);
    if (await fileExists(skillDir)) throw new Error(`Skill '${name}' already exists.`);

    await ensureDir(skillDir);
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), instructions);
    await writeJsonFile(path.join(skillDir, 'metadata.json'), { name, description });

    emitSync('skill', 'create', { name, description });
    return `Created skill '${name}' at .claude/skills/${name}/`;
}

export async function handleSearchSkills(args: Record<string, unknown>): Promise<string> {
    const query = ((args.query as string) || '').toLowerCase();
    const scope = (args.scope as string) || 'all';
    const ws = getWorkspacePath();
    const results: Array<{ name: string; source: string; channelPath?: string }> = [];

    if (scope !== 'marketplace') {
        // Scan root .claude/skills/
        const installedDir = path.join(ws, '.claude', 'skills');
        if (await fileExists(installedDir)) {
            const entries = await fs.readdir(installedDir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory() && entry.name.toLowerCase().includes(query)) {
                    results.push({ name: entry.name, source: 'installed' });
                }
            }
        }

        // Scan channel-level .claude/skills/
        const projectsDir = path.join(ws, 'projects');
        if (await fileExists(projectsDir)) {
            const domains = await fs.readdir(projectsDir, { withFileTypes: true });
            for (const domain of domains) {
                if (!domain.isDirectory()) continue;
                const channelsDir = path.join(projectsDir, domain.name, 'channels');
                if (!(await fileExists(channelsDir))) continue;
                const channels = await fs.readdir(channelsDir, { withFileTypes: true });
                for (const channel of channels) {
                    if (!channel.isDirectory()) continue;
                    const chSkillsDir = path.join(channelsDir, channel.name, '.claude', 'skills');
                    if (!(await fileExists(chSkillsDir))) continue;
                    const chEntries = await fs.readdir(chSkillsDir, { withFileTypes: true });
                    for (const entry of chEntries) {
                        if (entry.isDirectory() && entry.name.toLowerCase().includes(query)) {
                            results.push({
                                name: entry.name,
                                source: 'installed',
                                channelPath: `projects/${domain.name}/channels/${channel.name}`,
                            });
                        }
                    }
                }
            }
        }
    }

    if (scope === 'marketplace' || scope === 'all') {
        const mpDir = path.join(ws, 'marketplace', 'skills');
        if (await fileExists(mpDir)) {
            const entries = await fs.readdir(mpDir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory() && entry.name.toLowerCase().includes(query)) {
                    results.push({ name: entry.name, source: 'marketplace' });
                }
            }
        }
    }

    return JSON.stringify({ skills: results, count: results.length }, null, 2);
}

// ---------------------------------------------------------------------------
// Tools & Integrations (backend-dependent — emit metadata_sync)
// ---------------------------------------------------------------------------

export async function handleSearchTools(args: Record<string, unknown>, _emitSync: MetadataSyncFn): Promise<string> {
    const queryStr = ((args.query as string) || '').toLowerCase();
    const agentSlug = args.agent_id as string | undefined;
    const ws = getWorkspacePath();
    const results: Array<{ name: string; description: string; agent: string }> = [];

    const agentsDir = path.join(ws, 'agents');
    if (await fileExists(agentsDir)) {
        const entries = await fs.readdir(agentsDir, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            if (agentSlug && entry.name !== agentSlug) continue;
            const configPath = path.join(agentsDir, entry.name, 'config.json');
            if (!(await fileExists(configPath))) continue;
            try {
                const raw = await fs.readFile(configPath, 'utf-8');
                const config = JSON.parse(raw) as Record<string, unknown>;
                const tools = (config.tools || config.connected_tools || []) as unknown[];
                for (const tool of tools) {
                    const name = typeof tool === 'string' ? tool : ((tool as Record<string, unknown>).name as string || (tool as Record<string, unknown>).app_slug as string || '');
                    const desc = typeof tool === 'object' && tool !== null ? ((tool as Record<string, unknown>).description as string || '') : '';
                    if (!queryStr || name.toLowerCase().includes(queryStr) || desc.toLowerCase().includes(queryStr)) {
                        results.push({ name, description: desc, agent: entry.name });
                    }
                }
            } catch {
                // Skip malformed config files
            }
        }
    }

    return JSON.stringify({ tools: results, count: results.length, query: queryStr }, null, 2);
}

export async function handleConnectTool(args: Record<string, unknown>, emitSync: MetadataSyncFn): Promise<string> {
    const agentId = args.agent_id as string | undefined;
    const appSlug = args.app_slug as string | undefined;
    if (!agentId || !appSlug) {
        throw new Error('connect_tool requires agent_id and app_slug');
    }

    emitSync('tool', 'connect', { agent_id: agentId, app_slug: appSlug });
    return `Connection request for '${appSlug}' submitted for agent '${agentId}'. The user will be prompted to authorize via OAuth.`;
}
