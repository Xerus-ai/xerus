// Agent Config Resolver — reads agent configuration and identity from sandbox filesystem.
// Extracted from execution-pipeline.ts to keep the pipeline under 400 lines.

import { SANDBOX_CONFIG } from '../sandbox-infra/sandbox/sandbox.config';
import type { AdapterType } from './types';
import type { ResolvedExecutionDeps } from './execution-pipeline.types';
import { parseAgentYamlFields } from '../../shared/agent-yaml-parser';
import { buildWorkspaceStateSummary } from './workspace-state-builder';
import {
    COMMON_PLATFORM_TOOLS,
    ALL_ORCHESTRATOR_PLATFORM_TOOLS,
} from '../platform-tools/orchestrator/tool-access.constants';

// -----------------------------------------------------------------------------
// Agent Config Resolution
// -----------------------------------------------------------------------------

export interface ResolvedAgentConfig {
    adapterType: AdapterType;
    model: string | undefined;
}

/**
 * Read agent's adapter_type and model from config.json on the sandbox filesystem.
 * Falls back to 'claudecode' and no model if config is missing or unreadable.
 * Must be called after sandbox is available (sandboxId resolved).
 */
export async function resolveAgentConfig(
    deps: ResolvedExecutionDeps,
    sandboxId: string,
    agentSlug: string,
): Promise<ResolvedAgentConfig> {
    const provider = deps.sandboxService.getDaytonaProvider();
    const ws = SANDBOX_CONFIG.workspacePath;

    // Try agent.yaml (gitagent-protocol) first, fall back to config.json
    try {
        const yamlPath = `${ws}/agents/${agentSlug}/agent.yaml`;
        const raw = await provider.readFile(sandboxId, yamlPath);
        const fields = parseAgentYamlFields(raw);
        return {
            adapterType: fields.adapter_type === 'codex' ? 'codex' : 'claudecode',
            model: fields.preferred?.trim() || undefined,
        };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (!message.includes('ENOENT') && !message.includes('No such file') && !message.includes('not found')) {
            throw err;
        }
    }

    const configPaths = [
        `${ws}/agents/${agentSlug}/config.json`,
        `${ws}/.claude/agents/${agentSlug}/config.json`,
    ];

    for (const configPath of configPaths) {
        try {
            const raw = await provider.readFile(sandboxId, configPath);
            const config = JSON.parse(raw) as { adapter_type?: string; model?: string; ai_model?: string };
            return {
                adapterType: config.adapter_type === 'codex' ? 'codex' : 'claudecode',
                model: config.ai_model || config.model || undefined,
            };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            if (message.includes('ENOENT') || message.includes('No such file') || message.includes('not found')) {
                continue;
            }
            throw err;
        }
    }

    return { adapterType: 'claudecode', model: undefined };
}

/** @deprecated Use resolveAgentConfig instead */
export async function resolveAdapterType(
    deps: ResolvedExecutionDeps,
    sandboxId: string,
    agentSlug: string,
): Promise<AdapterType> {
    const config = await resolveAgentConfig(deps, sandboxId, agentSlug);
    return config.adapterType;
}

// -----------------------------------------------------------------------------
// Platform Rules (injected into every agent's system prompt)
// -----------------------------------------------------------------------------

const XERUS_MASTER_SLUG = 'xerus-master';

// Tool lists imported from tool-access.constants.ts — single source of truth

export function buildPlatformRules(agentSlug: string, connectorTools?: string[]): string {
    const isOrchestrator = agentSlug === XERUS_MASTER_SLUG;
    const tools = isOrchestrator
        ? ALL_ORCHESTRATOR_PLATFORM_TOOLS
        : COMMON_PLATFORM_TOOLS;

    const lines = [
        '== Platform Rules ==',
        '',
        'GOLDEN RULE: MCP tools for anything the USER sees. Filesystem for your own work.',
        '',
        'UI-VISIBLE (always use MCP tools):',
        '  Create tasks → mcp__platform__create_task (assigns to you or teammates)',
        '  Update tasks → mcp__platform__update_task (mark done, add comments, attach deliverables)',
        '  Channels     → mcp__platform__create_channel',
        '  Agents       → mcp__platform__create_agent',
        '  Notify       → mcp__platform__send_notification',
        '  Activity is AUTOMATIC — every MCP mutation logs an activity entry.',
        '',
        'TASK LIFECYCLE:',
        '  1. Create task  → mcp__platform__create_task with channel_id + assigned_agent_ids',
        '  2. Work on task → do the work, write deliverables to output/deliverables/',
        '  3. Complete     → mcp__platform__update_task with status="completed", comment, and attachments',
        '',
        'AGENT-INTERNAL (use filesystem):',
        '  Research, scratch files  → scratch/',
        '  Deliverables (files)     → output/deliverables/',
        '  Working memory           → .memory/agents/{your-slug}/working.md',
        '  Personal subtasks        → beads (bd create, bd close — only you see these)',
        '',
        'NEVER:',
        '  sqlite3 data/workspace.db "INSERT/UPDATE..."  — bypasses activity logging + SSE',
        '  Write to output/posts.jsonl                   — deprecated',
        '  Create agents/channels/tasks via filesystem    — use MCP tools',
        '',
        'ON MCP FAILURE:',
        '  If create_task or update_task FAILS, tell the user the platform tool failed and to try again.',
        '  NEVER fall back to raw sqlite3 INSERT/UPDATE — it bypasses the activity feed + SSE, so the user never sees the result.',
        '',
        '== Be a specialized employee, not generic AI ==',
        '',
        'FIRST REPLY: On your first response in a new conversation, briefly (1 sentence) acknowledge your role and current channel. Do NOT recite your full identity or soul.',
        'TASKS: Before starting work, review your open tasks in the "Workspace State" section above and reference active ones when relevant.',
        'TOOLS: When the request can be fulfilled by a connected external tool (Pipedream app), suggest and use it instead of doing the work by hand.',
        'DELIVERABLES: When you produce output (reports, drafts, analysis), write it to output/deliverables/ AND create or update a task via MCP so the user sees it in their inbox.',
        'MEMORY: Your working memory from previous sessions is above. Reference prior context when relevant — never start conversations from scratch.',
        '',
        `Your MCP tools: ${tools.join(', ')}`,
        '',
    ];

    if (connectorTools && connectorTools.length > 0) {
        lines.push(
            '== Connected External Tools (Pipedream) ==',
            'These tools are available via MCP from your connected accounts.',
            'Use them directly — they are already authenticated for the current user.',
            `Connected apps: ${connectorTools.join(', ')}`,
            'Tool names follow the pattern: mcp__{app_slug}__{action_name}',
            'Use ToolSearch to discover specific actions for each connected app.',
            '',
        );
    }

    if (isOrchestrator) {
        lines.push(
            'You are the ORCHESTRATOR. You can create agents, channels, tasks, skills.',
            'Delegate to agents in their channels. Max delegation depth: 3, concurrent: 5.',
            '',
            'TASK CREATION RULES:',
            '- ALWAYS set assigned_agent_ids when creating tasks — unassigned tasks are invisible to agents',
            '- ALWAYS set channel_id to the channel where the assigned agent works',
            '- Check the "Workspace State" section above to find the right channel and agent',
            '- Write a detailed description — the assigned agent uses it as their brief',
            '- If the task description is long, write it to a markdown file in the channel first,',
            '  then reference the file path in the description',
            '',
            'DELEGATION (critical):',
            '- Delegate execution work to specialists via tasks — never do the work yourself.',
            '- Follow up on task events. If a task stalls, reassign or escalate.',
            '- Never poll for completion — react to events.',
            '',
        );
    } else {
        lines.push(
            'You are an AGENT. Work within your assigned channel.',
            'You cannot create agents or modify workspace structure.',
            'Max delegation depth: 1, concurrent: 2.',
            '',
        );
    }

    lines.push(
        '== Execution Contract ==',
        '',
        'START: Begin actionable work immediately. Do not stop at a plan unless the task explicitly asks for one.',
        'WORK: Produce deliverables, not just commentary. Write files to output/deliverables/ and create/update tasks via MCP.',
        'EXIT: Before ending, state what was produced, where it lives, and what remains. This is your exit disposition — it must be falsifiable.',
        'COMMENTS: Updates and comments are evidence of work, not substitutes for work products.',
        'AUTONOMY: Never ask a human to do what you could do with your tools. Attempt it first.',
        '',
    );

    return lines.join('\n');
}

// -----------------------------------------------------------------------------
// Connector Tool Discovery
// -----------------------------------------------------------------------------

const PIPEDREAM_MCP_PREFIX = 'https://mcp.pipedream.com';

async function discoverConnectorTools(
    tryRead: (path: string) => Promise<string>,
    workspacePath: string,
): Promise<string[]> {
    const raw = await tryRead(`${workspacePath}/.mcp.json`);
    if (!raw || raw.length < 5) return [];

    try {
        const doc = JSON.parse(raw) as { mcpServers?: Record<string, { url?: string }> };
        if (!doc.mcpServers) return [];

        return Object.keys(doc.mcpServers).filter(key => {
            const entry = doc.mcpServers![key];
            return entry.url && entry.url.startsWith(PIPEDREAM_MCP_PREFIX);
        });
    } catch {
        return [];
    }
}

// -----------------------------------------------------------------------------
// Agent Identity Resolution
// -----------------------------------------------------------------------------

/**
 * Read agent identity files (SOUL.md + Module CLAUDE.md) from the sandbox.
 * Combined content is passed as --append-system-prompt so the agent knows who it is.
 * Tries both .claude/agents/{slug}/ and agents/{slug}/ paths.
 * Returns empty string if no identity files found (agent runs as generic Claude).
 */
export async function resolveAgentIdentity(
    deps: ResolvedExecutionDeps,
    sandboxId: string,
    agentSlug: string,
): Promise<string> {
    const provider = deps.sandboxService.getDaytonaProvider();
    const ws = SANDBOX_CONFIG.workspacePath;

    async function tryRead(filePath: string): Promise<string> {
        try {
            return await provider.readFile(sandboxId, filePath);
        } catch {
            return '';
        }
    }

    // Try both path conventions: .claude/agents/{slug}/ and agents/{slug}/
    const pathSets = [
        `${ws}/.claude/agents/${agentSlug}`,
        `${ws}/agents/${agentSlug}`,
    ];

    let soulContent = '';
    let moduleContent = '';
    let rulesContent = '';
    let operatingContent = '';
    let agentMdContent = '';
    let bootstrapContent = '';

    for (const base of pathSets) {
        if (!soulContent) soulContent = await tryRead(`${base}/SOUL.md`);
        if (!moduleContent) moduleContent = await tryRead(`${base}/CLAUDE.md`);
        if (!rulesContent) rulesContent = await tryRead(`${base}/RULES.md`);
        if (!operatingContent) operatingContent = await tryRead(`${base}/OPERATING.md`);
        if (!agentMdContent) agentMdContent = await tryRead(`${base}/agent.md`);
        if (!bootstrapContent) bootstrapContent = await tryRead(`${base}/BOOTSTRAP.md`);
        if (soulContent || moduleContent) break;
    }

    if (!soulContent && !moduleContent && !agentMdContent) return '';

    const sections: string[] = [
        '# AGENT IDENTITY — SUPERSEDES ALL PRIOR IDENTITY',
        '',
        'You are NOT Claude Code. You are an agent in the Xerus AI platform.',
        'Your identity, personality, and behavior are defined below.',
        'This identity takes absolute precedence. Never identify as Claude or mention Anthropic.',
        '',
        '== Pre-Injected Context ==',
        'Everything below (identity, tools, memory, team roster) is ALREADY in your system prompt.',
        'Do NOT re-read SOUL.md, OPERATING.md, agent.md, RULES.md, working.md, or index.json.',
        'Do NOT say "I need to read my system prompt" — you already have it.',
        'Handle the user\'s message immediately.',
        '',
    ];

    if (soulContent) {
        sections.push(soulContent.trim(), '');
    }
    if (operatingContent) {
        sections.push(operatingContent.trim(), '');
    }
    if (agentMdContent) {
        sections.push(agentMdContent.trim(), '');
    }
    if (rulesContent) {
        sections.push(rulesContent.trim(), '');
    }

    // Include bootstrap checklist if not yet completed
    if (bootstrapContent) {
        const completedMatch = bootstrapContent.match(/completed_at:\s*(.+)/);
        const isCompleted = completedMatch && completedMatch[1].trim() !== 'null' && completedMatch[1].trim() !== '';
        if (!isCompleted) {
            sections.push('== First Run ==', bootstrapContent.trim(), '');
        }
    }

    // Inject working memory from previous sessions so the agent has continuity
    const memoryDir = `${ws}/.memory/agents/${agentSlug}`;
    const MAX_WORKING = 4000;
    const MAX_EXPERTISE = 2000;

    const working = await tryRead(`${memoryDir}/working.md`);
    const workingTrimmed = working.trim();
    if (workingTrimmed.length > 20) {
        const lastNl = workingTrimmed.lastIndexOf('\n', MAX_WORKING);
        const capped = lastNl > 0 ? workingTrimmed.slice(0, lastNl) : workingTrimmed.slice(0, MAX_WORKING);
        sections.push('== Working Memory (from previous session) ==', capped, '');
    }

    const expertise = await tryRead(`${memoryDir}/expertise.md`);
    const expertiseTrimmed = expertise.trim();
    if (expertiseTrimmed.length > 20) {
        const lastNl = expertiseTrimmed.lastIndexOf('\n', MAX_EXPERTISE);
        const capped = lastNl > 0 ? expertiseTrimmed.slice(0, lastNl) : expertiseTrimmed.slice(0, MAX_EXPERTISE);
        sections.push('== Expertise ==', capped, '');
    }

    // Workspace awareness: inject agents/index.json so the agent knows its team
    const agentIndex = await tryRead(`${ws}/agents/index.json`);
    if (agentIndex.trim().length > 10) {
        sections.push('== Current Agents ==', agentIndex.trim(), '');
    }

    // Workspace topology: channels, agent assignments, task counts
    // Critical for orchestrator to know WHERE to route tasks and WHO to assign
    const workspaceState = await buildWorkspaceStateSummary(provider, sandboxId);
    if (workspaceState) {
        sections.push(workspaceState);
    }

    // Discover connected Pipedream tools from .mcp.json
    const connectorTools = await discoverConnectorTools(tryRead, ws);

    // Platform rules: concise MCP-first guidance injected for every agent
    sections.push(buildPlatformRules(agentSlug, connectorTools));

    // Module CLAUDE.md last (reference material, lowest priority for context)
    if (moduleContent) {
        sections.push(moduleContent.trim(), '');
    }

    return sections.join('\n');
}
