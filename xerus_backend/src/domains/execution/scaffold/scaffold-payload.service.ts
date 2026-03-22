// Scaffold Payload Builder
// Builds the file payload for the scaffold_agent runner command
// Reads agent metadata from DB (thin cache) and generates files from templates.
// S3 priority chain eliminated — workspace filesystem is the source of truth.
// Reference: docs/planning/execution/git-native-simplification.md

import type { ScaffoldFile } from '../runner/runner.types';
import { buildAllSoulFiles } from '../workspace/soul-file-templates';
import { generateOperatingMd } from '../workspace/operating-md.template';
import { AUTONOMY_RULES } from '../workspace/autonomy-rules';
import { DEFAULT_SDK_MODEL } from '../../agents/types';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface ScaffoldPayloadDeps {
    db: { query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> };
}

interface AgentRow {
    name: string;
    description: string;
    ai_model: string | null;
    autonomy_level: string | null;
    thinking_level: string | null;
    personality_type: string | null;
    domain: string | null;
    primary_channel: string | null;
    channels: string[] | null;
    slug: string | null;
}

interface HeartbeatExistsRow {
    exists: boolean;
}

// -----------------------------------------------------------------------------
// Config Builder
// -----------------------------------------------------------------------------

function buildConfigJson(agent: AgentRow, agentSlug: string, tools: string[]): string {
    const config = {
        slug: agentSlug,
        name: agent.name,
        description: agent.description,
        domain: agent.domain || '',
        primary_channel: agent.primary_channel || '',
        channels: agent.channels || [],
        model: agent.ai_model || DEFAULT_SDK_MODEL,
        thinking_level: agent.thinking_level || 'medium',
        role: agent.personality_type || '',
        tools,
        heartbeat_cron: '',
        autonomy_level: agent.autonomy_level || 'supervised',
        created_at: new Date().toISOString(),
    };
    return JSON.stringify(config, null, 2) + '\n';
}

// -----------------------------------------------------------------------------
// Initial Module CLAUDE.md (scaffold-time, no filesystem available)
// Runtime re-generation uses ModuleClaudeMdGenerator with SandboxFileSystem.
// -----------------------------------------------------------------------------

function buildInitialModuleClaudeMd(opts: {
    name: string;
    description: string;
    tools: string[];
    autonomyLevel: string;
}): string {
    const toolsList = opts.tools.length > 0
        ? opts.tools.map((t) => `- ${t} [status: check Pipedream MCP]`).join('\n')
        : 'No tool integrations assigned. Use code-first approach for external API calls.';

    return `## Identity

You are ${opts.name}, ${opts.description}.

## Knowledge Base

No documents assigned yet. Use external research tools for information gathering.

## Skills

No specialized skills assigned. Use your general capabilities.

## Connected Tools

Integrations available to you (via MCP):
${toolsList}

If a tool action fails with "NOT_CONNECTED", ask @human to authenticate the integration.

## Colleagues

No colleagues configured yet. Work independently.

## Autonomy

Level: ${opts.autonomyLevel}
${AUTONOMY_RULES[opts.autonomyLevel] || AUTONOMY_RULES.supervised}

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
}

// -----------------------------------------------------------------------------
// DB Query Helpers
// -----------------------------------------------------------------------------

// agent_registry is a thin table (id, slug, user_id, agent_type, created_at).
// Agent metadata (name, ai_model, description, etc.) lives in config.json on the workspace filesystem.
// At scaffold time, config.json doesn't exist yet — we use slug-derived defaults.
// The generated config.json is then written to the workspace and becomes the source of truth.
const AGENT_ROW_QUERY = `
    SELECT a.id, a.slug AS name, a.slug AS slug, '' AS description,
           NULL AS ai_model, NULL AS autonomy_level, NULL AS thinking_level,
           NULL AS personality_type, NULL AS domain, NULL AS primary_channel,
           ARRAY[]::text[] AS channels
     FROM agent_registry a`;

/**
 * Batch-fetch agent rows for multiple agent IDs.
 * Used by workspace-health.ts to avoid N+1 queries during agent sync.
 */
export async function batchFetchAgentRows(
    agentIds: number[],
    deps: ScaffoldPayloadDeps,
): Promise<Map<number, AgentRow>> {
    if (agentIds.length === 0) return new Map();

    const { rows } = await deps.db.query<AgentRow & { id: number }>(
        `${AGENT_ROW_QUERY} WHERE a.id = ANY($1)`,
        [agentIds],
    );

    const map = new Map<number, AgentRow>();
    for (const row of rows) {
        map.set(row.id, row);
    }
    return map;
}

/**
 * Batch-fetch heartbeat existence flags for multiple agent IDs.
 * Returns map of agentId -> hasHeartbeat boolean.
 */
export async function batchFetchHeartbeatFlags(
    agentIds: number[],
    deps: ScaffoldPayloadDeps,
): Promise<Map<number, boolean>> {
    if (agentIds.length === 0) return new Map();

    const { rows } = await deps.db.query<{ agent_id: number }>(
        'SELECT DISTINCT agent_id FROM heartbeat_configs WHERE agent_id = ANY($1)',
        [agentIds],
    );

    const map = new Map<number, boolean>();
    for (const id of agentIds) {
        map.set(id, false);
    }
    for (const row of rows) {
        map.set(row.agent_id, true);
    }
    return map;
}

// -----------------------------------------------------------------------------
// Main Builder
// -----------------------------------------------------------------------------

export async function buildScaffoldPayload(
    agentId: number,
    agentSlug: string,
    deps: ScaffoldPayloadDeps,
): Promise<ScaffoldFile[]> {
    const { rows } = await deps.db.query<AgentRow>(
        `${AGENT_ROW_QUERY} WHERE a.id = $1`,
        [agentId],
    );

    if (rows.length === 0) {
        throw new Error(`Agent ID ${agentId} not found`);
    }

    // Tools now live in config.json (filesystem). At scaffold time, no tools yet.
    const tools: string[] = [];

    const heartbeatResult = await deps.db.query<HeartbeatExistsRow>(
        'SELECT EXISTS(SELECT 1 FROM heartbeat_configs WHERE agent_id = $1) AS exists',
        [agentId],
    );
    const hasHeartbeat = heartbeatResult.rows[0]?.exists ?? false;

    return buildScaffoldFilesFromRow(rows[0], agentSlug, tools, hasHeartbeat);
}

/**
 * Build scaffold files from a pre-fetched agent row.
 * Used by both single-agent scaffold and batch scaffold.
 */
export function buildScaffoldFilesFromRow(
    agent: AgentRow,
    agentSlug: string,
    tools: string[] = [],
    hasHeartbeat: boolean = false,
): ScaffoldFile[] {
    // Build soul file templates from agent metadata
    const soulFiles = buildAllSoulFiles({
        name: agent.name,
        role: agent.personality_type || '',
        domain: agent.domain || '',
        personalityType: agent.personality_type || '',
        description: agent.description,
        slug: agentSlug,
        autonomyLevel: agent.autonomy_level || 'supervised',
        primaryChannel: agent.primary_channel || '',
        tools,
    });

    // Build heartbeat template
    const heartbeatMd = `# ${agent.name} Heartbeat\n\n## Scheduled\n\nNo schedule configured.\n\n## Events\n`;

    // Assemble files (DB + template generation, no S3 priority chain)
    const files: ScaffoldFile[] = [];

    files.push({
        path: `agents/${agentSlug}/config.json`,
        content: buildConfigJson(agent, agentSlug, tools),
    });

    files.push({
        path: `agents/${agentSlug}/SOUL.md`,
        content: soulFiles.soul,
    });
    files.push({
        path: `agents/${agentSlug}/STATUS.md`,
        content: soulFiles.status,
    });
    files.push({
        path: `agents/${agentSlug}/USER.md`,
        content: soulFiles.user,
    });
    files.push({
        path: `agents/${agentSlug}/RELATIONSHIPS.md`,
        content: soulFiles.relationships,
    });
    files.push({
        path: `agents/${agentSlug}/BOOTSTRAP.md`,
        content: soulFiles.bootstrap,
    });

    // Module CLAUDE.md (agent's Layer 2 CLAUDE.md)
    // Initial scaffold uses DB data directly. Runtime re-generation uses
    // ModuleClaudeMdGenerator with SandboxFileSystem (reads from workspace).
    const autonomyLevel = agent.autonomy_level || 'supervised';
    const claudeMdContent = buildInitialModuleClaudeMd({
        name: agent.name,
        description: agent.description,
        tools,
        autonomyLevel,
    });
    files.push({
        path: `agents/${agentSlug}/CLAUDE.md`,
        content: claudeMdContent,
    });

    // HEARTBEAT.md
    files.push({
        path: `agents/${agentSlug}/HEARTBEAT.md`,
        content: heartbeatMd,
    });

    // OPERATING.md
    const operatingContent = generateOperatingMd({
        agentSlug,
        agentName: agent.name,
        agentType: hasHeartbeat ? 'proactive' : 'reactive',
        autonomyLevel: agent.autonomy_level || 'supervised',
        hasHeartbeat,
        channelSlug: agent.primary_channel || undefined,
        domainSlug: agent.domain || undefined,
    });

    files.push({
        path: `agents/${agentSlug}/OPERATING.md`,
        content: operatingContent,
    });

    // Memory files
    files.push({
        path: `.memory/agents/${agentSlug}/working.md`,
        content: `# ${agent.name} Working Context\n\n`,
    });
    files.push({
        path: `.memory/agents/${agentSlug}/expertise.md`,
        content: `# ${agent.name} Expertise\n\n`,
    });

    return files;
}
