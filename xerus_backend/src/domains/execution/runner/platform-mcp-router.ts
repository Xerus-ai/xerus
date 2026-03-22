// Platform MCP Router Helpers
// Path safety, agents index management, and utility handlers
// Extracted from platform-mcp-handlers.ts

import fs from 'fs/promises';
import path from 'path';
import { getWorkspacePath, writeJsonFile, readJsonFile, fileExists } from './platform-mcp-utils';
import type { MetadataSyncFn } from './platform-mcp-utils';

// -----------------------------------------------------------------------------
// Path Safety
// -----------------------------------------------------------------------------

/**
 * Validate a slug or path segment does not allow path traversal.
 * Rejects '..', '/', '\' to prevent escaping workspace boundaries.
 */
export function assertSafeSegment(segment: string, label: string): void {
    if (!segment || segment.includes('..') || segment.includes('/') || segment.includes('\\') || segment.includes('\0')) {
        throw new Error(`Invalid ${label}: '${segment}' contains disallowed characters`);
    }
}

// -----------------------------------------------------------------------------
// Agents Index Management
// -----------------------------------------------------------------------------

export async function updateAgentsIndex(slug: string, config: Record<string, unknown>): Promise<void> {
    const indexPath = path.join(getWorkspacePath(), 'agents', 'index.json');
    let index: Record<string, unknown> = {};

    if (await fileExists(indexPath)) {
        index = (await readJsonFile(indexPath)) as Record<string, unknown>;
    }

    const agents = (index.agents || {}) as Record<string, unknown>;
    agents[slug] = {
        name: config.name,
        domain: config.domain,
        primary_channel: config.primary_channel,
        channels: config.channels,
        model: config.model,
        role: config.role,
    };
    index.agents = agents;
    index.updated_at = new Date().toISOString();

    await writeJsonFile(indexPath, index);
}

export async function removeFromAgentsIndex(slug: string): Promise<void> {
    const indexPath = path.join(getWorkspacePath(), 'agents', 'index.json');
    if (!(await fileExists(indexPath))) return;

    const index = (await readJsonFile(indexPath)) as Record<string, unknown>;
    const agents = (index.agents || {}) as Record<string, unknown>;
    delete agents[slug];
    index.agents = agents;
    index.updated_at = new Date().toISOString();

    await writeJsonFile(indexPath, index);
}

// -----------------------------------------------------------------------------
// Agent Channel Path Resolution
// -----------------------------------------------------------------------------

export async function resolveAgentChannelPath(agentSlug: string): Promise<string> {
    const indexPath = path.join(getWorkspacePath(), 'agents', 'index.json');
    if (!(await fileExists(indexPath))) {
        throw new Error(`agents/index.json not found - cannot resolve channel for agent '${agentSlug}'`);
    }
    const index = (await readJsonFile(indexPath)) as {
        agents?: Record<string, { domain?: string; primary_channel?: string }>;
    };
    const agents = index.agents || {};
    const agent = agents[agentSlug];
    if (!agent) {
        throw new Error(`Agent '${agentSlug}' not found in agents/index.json`);
    }
    if (!agent.domain || !agent.primary_channel) {
        return '';
    }
    return `projects/${agent.domain}/channels/${agent.primary_channel}`;
}

// -----------------------------------------------------------------------------
// List/Query Handlers
// -----------------------------------------------------------------------------

export async function handleListAgents(): Promise<string> {
    const indexPath = path.join(getWorkspacePath(), 'agents', 'index.json');
    if (!(await fileExists(indexPath))) {
        return JSON.stringify({ agents: [] });
    }
    const index = await readJsonFile(indexPath);
    return JSON.stringify(index, null, 2);
}

export async function handleListDomains(): Promise<string> {
    const projectsPath = path.join(getWorkspacePath(), 'projects');
    if (!(await fileExists(projectsPath))) {
        return JSON.stringify({ domains: [] });
    }

    const entries = await fs.readdir(projectsPath, { withFileTypes: true });
    const domains: Array<{ slug: string; has_claude_md: boolean }> = [];

    for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
            const claudeMdExists = await fileExists(path.join(projectsPath, entry.name, 'CLAUDE.md'));
            domains.push({ slug: entry.name, has_claude_md: claudeMdExists });
        }
    }

    return JSON.stringify({ domains }, null, 2);
}

export async function handleSendNotification(args: Record<string, unknown>, emitSync: MetadataSyncFn): Promise<string> {
    const message = args.message as string;
    const channel = (args.channel as string) || undefined;

    emitSync('notification', 'send', { message, channel });
    return `Notification sent: "${message}"`;
}
