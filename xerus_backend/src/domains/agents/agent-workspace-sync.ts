// Agent Workspace Sync
// Daytona-first file operations for agent CRUD lifecycle:
// - scaffoldAgent: Generate template files for a new agent in Daytona workspace
// - cloneAgent: Copy workspace files from source agent to clone
// - deleteAgent: Cleanup agent files from workspace
// - syncFileToWorkspace: Sync a single file to sandbox workspace
// - syncConfigToWorkspace: Sync config.json after behaviour field changes
// - syncHeartbeatToWorkspace: Sync HEARTBEAT.md after heartbeat config save
//
// Reference: docs/planning/execution/git-native-simplification.md

import type { SandboxService } from '../execution/sandbox/sandbox.service';
import type { DaytonaProvider } from '../execution/sandbox/providers/daytona.provider';
import { SANDBOX_CONFIG } from '../execution/sandbox/sandbox.config';
import { generateHeartbeatMd } from '../heartbeat/heartbeat-md-parser';
import { ModuleClaudeMdGenerator } from '../execution/workspace/module-claude-md.generator';
import type { QueryResultRow } from 'pg';
import type { UpdateAgentDTO, Agent } from './types';
import { validateSlug } from '../../shared/slugify';
import { shellEscapePath } from '../../utils/shell-safety';

// -----------------------------------------------------------------------------
// Dependency Injection
// -----------------------------------------------------------------------------

export interface WorkspaceSyncDeps {
    sandboxService: SandboxService;
    db: { query<T extends QueryResultRow>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> };
}

// -----------------------------------------------------------------------------
// Behaviour Change Detection
// -----------------------------------------------------------------------------

const BEHAVIOUR_FIELDS: (keyof UpdateAgentDTO)[] = ['ai_model', 'thinking_level', 'autonomy_level'];

export function hasBehaviourChanges(data: UpdateAgentDTO): boolean {
    return BEHAVIOUR_FIELDS.some((field) => data[field] !== undefined);
}

// -----------------------------------------------------------------------------
// Daytona Provider Helper
// -----------------------------------------------------------------------------

async function getRunningProvider(
    sandboxService: SandboxService,
    userId: string,
): Promise<{ provider: DaytonaProvider; sandboxId: string } | null> {
    const status = await sandboxService.getSandboxStatus(userId);
    if (status.status !== 'running' || !status.sandboxId) return null;
    const provider = sandboxService.getProvider() as DaytonaProvider;
    if (typeof provider.writeFile !== 'function') return null;
    return { provider, sandboxId: status.sandboxId };
}


// -----------------------------------------------------------------------------
// File Sync (write to Daytona workspace)
// -----------------------------------------------------------------------------

export async function syncFileToWorkspace(
    userId: string,
    slug: string,
    relativePath: string,
    content: string,
    deps: WorkspaceSyncDeps,
): Promise<void> {
    const filePath = `${SANDBOX_CONFIG.workspacePath}/agents/${slug}/${relativePath}`;

    const running = await getRunningProvider(deps.sandboxService, userId);
    if (!running) {
        throw new Error(`Cannot sync to workspace: no running sandbox for user '${userId}'`);
    }

    await running.provider.writeFile(running.sandboxId, filePath, content);
}

// -----------------------------------------------------------------------------
// Config Sync (after DB update)
// -----------------------------------------------------------------------------

export async function syncConfigToWorkspace(
    userId: string,
    agent: Agent,
    updatedFields: UpdateAgentDTO,
    deps: WorkspaceSyncDeps,
): Promise<void> {
    if (!hasBehaviourChanges(updatedFields)) return;

    const slug = agent.slug;
    if (!slug) return;

    // Read existing config from sandbox and merge
    let configContent: Record<string, unknown> = {};
    const configFilePath = `${SANDBOX_CONFIG.workspacePath}/agents/${slug}/config.json`;
    const running = await getRunningProvider(deps.sandboxService, userId);
    if (running) {
        try {
            const existing = await running.provider.readFile(running.sandboxId, configFilePath);
            configContent = JSON.parse(existing);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            const isFileNotFound = /not found|no such file|enoent|does not exist|404/i.test(msg);
            if (isFileNotFound) {
                console.warn(`[agents] Config not found for ${slug}, starting fresh`);
            } else {
                throw err;
            }
        }
    }

    const configPatch: Record<string, unknown> = {};
    if (updatedFields.ai_model !== undefined) configPatch.model = agent.ai_model;
    if (updatedFields.autonomy_level !== undefined) configPatch.autonomy_level = agent.autonomy_level;
    if (updatedFields.thinking_level !== undefined) configPatch.thinking_level = agent.thinking_level;

    Object.assign(configContent, configPatch);
    const configJson = JSON.stringify(configContent, null, 2);

    // If no sandbox is running, skip workspace sync entirely
    if (!running) return;

    await syncFileToWorkspace(userId, slug, 'config.json', configJson, deps);

    // H5: Regenerate Module CLAUDE.md when behaviour fields change (autonomy_level affects autonomy rules)
    await syncModuleClaudeMdToWorkspace(userId, agent.id, deps, slug);
}

// -----------------------------------------------------------------------------
// Heartbeat Sync (after heartbeat config save)
// -----------------------------------------------------------------------------

export async function syncHeartbeatToWorkspace(
    userId: string,
    agentId: number,
    heartbeatConfig: { cron_expression: string; timezone: string; prompt: string | null; enabled: boolean },
    deps: WorkspaceSyncDeps,
): Promise<void> {
    const agentResult = await deps.db.query<{ slug: string | null }>(
        'SELECT slug FROM agent_registry WHERE id = $1 AND user_id = $2',
        [agentId, userId],
    );
    const slug = agentResult.rows[0]?.slug;
    if (!slug) return;

    const triggerResult = await deps.db.query<{ app_slug: string; event_type: string }>(
        'SELECT app_slug, event_type FROM agent_triggers WHERE agent_id = $1 AND enabled = true',
        [agentId],
    );

    const heartbeatMd = generateHeartbeatMd({
        cron_expression: heartbeatConfig.cron_expression,
        timezone: heartbeatConfig.timezone,
        prompt: heartbeatConfig.prompt,
        enabled: heartbeatConfig.enabled,
        events: triggerResult.rows,
    });

    await syncFileToWorkspace(userId, slug, 'HEARTBEAT.md', heartbeatMd, deps);
}

// -----------------------------------------------------------------------------
// Module CLAUDE.md Sync (after tool/KB mutations)
// -----------------------------------------------------------------------------

export async function syncModuleClaudeMdToWorkspace(
    userId: string,
    agentId: number,
    deps: WorkspaceSyncDeps,
    knownSlug?: string,
): Promise<void> {
    let slug = knownSlug;
    if (!slug) {
        const agentResult = await deps.db.query<{ slug: string | null }>(
            'SELECT slug FROM agent_registry WHERE id = $1 AND user_id = $2',
            [agentId, userId],
        );
        slug = agentResult.rows[0]?.slug ?? undefined;
    }
    if (!slug) return;

    const running = await getRunningProvider(deps.sandboxService, userId);
    if (!running) {
        throw new Error(`Cannot sync to workspace: no running sandbox for user '${userId}'`);
    }

    const sandboxFs = await deps.sandboxService.getSandboxFs(running.sandboxId);
    const generator = new ModuleClaudeMdGenerator();
    const content = await generator.generateForAgent(slug, sandboxFs, SANDBOX_CONFIG.workspacePath);

    await syncFileToWorkspace(userId, slug, 'CLAUDE.md', content, deps);
}

// -----------------------------------------------------------------------------
// Clone Agent (copy workspace files from source to clone)
// -----------------------------------------------------------------------------

export async function cloneAgent(
    userId: string,
    sourceSlug: string,
    cloneSlug: string,
    deps: WorkspaceSyncDeps,
): Promise<void> {
    validateSlug(sourceSlug, 'source');
    validateSlug(cloneSlug, 'clone');

    const running = await getRunningProvider(deps.sandboxService, userId);
    if (!running) {
        throw new Error(`No running sandbox for user ${userId} — cannot clone agent ${sourceSlug}`);
    }

    const { provider, sandboxId } = running;
    const basePath = SANDBOX_CONFIG.workspacePath;

    // Copy agent dir: agents/{source}/ -> agents/{clone}/
    const sourceDir = `${basePath}/agents/${sourceSlug}`;
    const cloneDir = `${basePath}/agents/${cloneSlug}`;
    await provider.executeCommand(
        sandboxId,
        `cp -r ${shellEscapePath(sourceDir)} ${shellEscapePath(cloneDir)}`,
    );

    // Copy memory dir: .memory/agents/{source}/ -> .memory/agents/{clone}/
    const memSourceDir = `${basePath}/.memory/agents/${sourceSlug}`;
    const memCloneDir = `${basePath}/.memory/agents/${cloneSlug}`;
    await provider.executeCommand(
        sandboxId,
        `cp -r ${shellEscapePath(memSourceDir)} ${shellEscapePath(memCloneDir)} 2>/dev/null || true`,
    );
}

// -----------------------------------------------------------------------------
// Delete Agent (cleanup from workspace)
// -----------------------------------------------------------------------------

export async function deleteAgent(
    userId: string,
    agentSlug: string,
    deps: WorkspaceSyncDeps,
): Promise<void> {
    validateSlug(agentSlug, 'agent');

    const running = await getRunningProvider(deps.sandboxService, userId);
    if (!running) {
        throw new Error(`Cannot sync to workspace: no running sandbox for user '${userId}'`);
    }

    const { provider, sandboxId } = running;
    const basePath = SANDBOX_CONFIG.workspacePath;

    const agentDir = `${basePath}/agents/${agentSlug}`;
    const memoryDir = `${basePath}/.memory/agents/${agentSlug}`;
    const sdkDef = `${basePath}/.claude/agents/${agentSlug}.md`;

    await provider.executeCommand(
        sandboxId,
        `rm -rf ${shellEscapePath(agentDir)} ${shellEscapePath(memoryDir)} ${shellEscapePath(sdkDef)}`,
    );
}
