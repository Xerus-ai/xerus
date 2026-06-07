// Agent Management Routes
// Handles search_agents, clone_agent, create_agent, update_agent, delete_agent, list_agents
// Queries workspace.db (SQLite) on sandbox via executeWorkspaceJsonQuery.

import { Router, Response, NextFunction } from 'express';
import { BadRequestError } from '../../../utils/errors';
import { InternalMcpRequest, McpToolResult } from './types';
import { escapeSQL, escapeLikePattern, executeWorkspaceJsonQuery, executeWorkspaceQuery } from '../../conversations/workspace-db.helpers';
import { requireRunningSandbox, getDaytonaProvider } from '../../sandbox-infra/sandbox/sandbox-route-helpers';
import type { SandboxService } from '../../sandbox-infra/sandbox/sandbox.service';
import { buildScaffoldFilesFromRow } from '../../sandbox-infra/scaffold/scaffold-payload.service';
import { SANDBOX_CONFIG } from '../../sandbox-infra/sandbox/sandbox.config';
import { workspaceSSEBroadcaster } from '../../drive';

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const MAX_RESULTS = 100;

// ---------------------------------------------------------------------------
// Dependencies (injected at startup)
// ---------------------------------------------------------------------------

let _sandboxService: SandboxService | null = null;

export function setAgentManagementRoutesDeps(deps: { sandboxService: SandboxService }): void {
    _sandboxService = deps.sandboxService;
}

function getSandboxService(): SandboxService {
    if (!_sandboxService) {
        throw new Error('Agent management routes dependencies not initialized');
    }
    return _sandboxService;
}

async function writeScaffoldFilesToSandbox(
    provider: ReturnType<typeof getDaytonaProvider>,
    sandboxId: string,
    files: Array<{ path: string; content: string }>,
): Promise<void> {
    const basePath = SANDBOX_CONFIG.workspacePath;
    const HEREDOC = 'XERUS_SCAFFOLD_EOF_9c1a';
    for (const file of files) {
        if (file.content.includes(HEREDOC)) {
            throw new Error(`Scaffold file content for ${file.path} contains reserved heredoc delimiter`);
        }
        const fullPath = `${basePath}/${file.path}`;
        const dirPath = fullPath.substring(0, fullPath.lastIndexOf('/'));
        const writeCmd = `mkdir -p ${dirPath} && cat > ${fullPath} << '${HEREDOC}'\n${file.content}\n${HEREDOC}`;
        const { exitCode } = await provider.executeCommand(sandboxId, writeCmd);
        if (exitCode !== 0) {
            throw new Error(`Failed to write scaffold file ${file.path} to sandbox (exit ${exitCode})`);
        }
    }
}

// ---------------------------------------------------------------------------
// workspace.db row types
// ---------------------------------------------------------------------------

interface WorkspaceAgentRow {
    slug: string;
    name: string;
    adapter_type: string;
    role: string | null;
    autonomy_level: string;
    status: string;
    config: string | null;
    marketplace_ref: string | null;
    installed_at: string;
    updated_at: string;
}

function formatAgentListResult(rows: WorkspaceAgentRow[]): McpToolResult {
    return {
        success: true,
        data: {
            agents: rows.map(row => ({
                slug: row.slug, name: row.name, adapter_type: row.adapter_type,
                role: row.role, autonomy_level: row.autonomy_level,
                status: row.status, installed_at: row.installed_at,
            })),
            total: rows.length,
        },
    };
}

const router = Router();

// POST /mcp/search_agents
router.post('/search_agents', async (req: InternalMcpRequest, res: Response, next: NextFunction) => {
    try {
        const { query: searchQuery } = req.body;
        const userId = req.sandbox!.userId;
        if (!searchQuery || typeof searchQuery !== 'string') {
            throw new BadRequestError('query is required');
        }
        const sandboxService = getSandboxService();
        const sandboxId = await requireRunningSandbox(sandboxService, userId);
        const provider = getDaytonaProvider(sandboxService);
        const escaped = escapeLikePattern(searchQuery);
        const sql = `SELECT slug, name, adapter_type, role, autonomy_level, status, installed_at
                   FROM agents
                   WHERE slug LIKE '%${escaped}%' ESCAPE '\\' OR name LIKE '%${escaped}%' ESCAPE '\\'
                   ORDER BY slug LIMIT ${MAX_RESULTS}`;
        const rows = await executeWorkspaceJsonQuery<WorkspaceAgentRow>(provider, sandboxId, sql);
        res.json(formatAgentListResult(rows));
    } catch (error) {
        next(error);
    }
});

// POST /mcp/list_agents
router.post('/list_agents', async (req: InternalMcpRequest, res: Response, next: NextFunction) => {
    try {
        const userId = req.sandbox!.userId;
        const sandboxService = getSandboxService();
        const sandboxId = await requireRunningSandbox(sandboxService, userId);
        const provider = getDaytonaProvider(sandboxService);
        const sql = `SELECT slug, name, adapter_type, role, autonomy_level, status, installed_at
                     FROM agents ORDER BY status ASC, slug ASC LIMIT ${MAX_RESULTS}`;
        const rows = await executeWorkspaceJsonQuery<WorkspaceAgentRow>(provider, sandboxId, sql);
        res.json(formatAgentListResult(rows));
    } catch (error) {
        next(error);
    }
});

// POST /mcp/create_agent
router.post('/create_agent', async (req: InternalMcpRequest, res: Response, next: NextFunction) => {
    try {
        const { name, slug, description, system_prompt, model_id, autonomy_level } = req.body;
        const userId = req.sandbox!.userId;

        if (!name || typeof name !== 'string') {
            throw new BadRequestError('name is required');
        }
        if (!description || typeof description !== 'string') {
            throw new BadRequestError('description is required');
        }
        if (!system_prompt || typeof system_prompt !== 'string') {
            throw new BadRequestError('system_prompt is required');
        }

        const agentSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        if (!SLUG_PATTERN.test(agentSlug)) {
            throw new BadRequestError(`Invalid slug format: ${agentSlug}. Must match ${SLUG_PATTERN}`);
        }

        const sandboxService = getSandboxService();
        const sandboxId = await requireRunningSandbox(sandboxService, userId);
        const provider = getDaytonaProvider(sandboxService);

        const autonomy = autonomy_level || 'supervised';
        const model = model_id || 'claude-sonnet';
        const configJson = escapeSQL(JSON.stringify({ model, system_prompt, description }));

        const sql = `
            INSERT INTO agents (slug, name, adapter_type, role, autonomy_level, status, config)
            VALUES ('${escapeSQL(agentSlug)}', '${escapeSQL(name)}', 'claudecode', NULL, '${escapeSQL(autonomy)}', 'idle', '${configJson}');
            SELECT slug, name, adapter_type, role, autonomy_level, status, config, installed_at, updated_at
            FROM agents WHERE slug = '${escapeSQL(agentSlug)}';
        `;

        const rows = await executeWorkspaceJsonQuery<WorkspaceAgentRow>(provider, sandboxId, sql);

        if (rows.length === 0) {
            throw new BadRequestError(`Agent with slug "${agentSlug}" already exists`);
        }

        // Write scaffold files (config.json, SOUL.md, STATUS.md, etc.) to sandbox filesystem
        const scaffoldFiles = buildScaffoldFilesFromRow(
            {
                name,
                description,
                ai_model: model,
                autonomy_level: autonomy,
                thinking_level: null,
                personality_type: null,
                domain: null,
                primary_channel: null,
                channels: Array.isArray(req.body.channels) ? req.body.channels : [],
                slug: agentSlug,
            },
            agentSlug,
            [],
        );
        await writeScaffoldFilesToSandbox(provider, sandboxId, scaffoldFiles);

        // Write system_prompt as agent.md for the agent
        const PROMPT_HEREDOC = 'XERUS_PROMPT_EOF_8f3d';
        if (system_prompt.includes(PROMPT_HEREDOC)) {
            throw new BadRequestError('system_prompt contains reserved heredoc delimiter');
        }
        const promptPath = `${SANDBOX_CONFIG.workspacePath}/agents/${agentSlug}/agent.md`;
        const writePromptCmd = `cat > ${promptPath} << '${PROMPT_HEREDOC}'\n${system_prompt}\n${PROMPT_HEREDOC}`;
        const { exitCode: promptExitCode } = await provider.executeCommand(sandboxId, writePromptCmd);
        if (promptExitCode !== 0) {
            throw new Error(`Failed to write agent.md for ${agentSlug} (exit ${promptExitCode})`);
        }

        // Auto-populate channel_members for channels listed in the agent's config
        const channels: string[] = Array.isArray(req.body.channels) ? req.body.channels : [];
        if (channels.length > 0) {
            const memberInserts = channels.map((ch: string) =>
                `INSERT OR IGNORE INTO channel_members (channel_slug, agent_slug, role) VALUES ('${escapeSQL(String(ch))}', '${escapeSQL(agentSlug)}', 'member')`,
            );
            const leadUpdates = channels.map((ch: string) =>
                `UPDATE channels SET lead_agent_slug = '${escapeSQL(agentSlug)}' WHERE slug = '${escapeSQL(String(ch))}' AND lead_agent_slug IS NULL`,
            );
            await executeWorkspaceQuery(
                provider, sandboxId,
                `BEGIN;\n${memberInserts.join(';\n')};\n${leadUpdates.join(';\n')};\nCOMMIT;`,
            );
        }

        const row = rows[0];
        const mcpResult: McpToolResult = {
            success: true,
            data: {
                agent: {
                    slug: row.slug,
                    name: row.name,
                    description,
                    model_id: model,
                    autonomy_level: row.autonomy_level,
                    status: row.status,
                    installed_at: row.installed_at,
                },
            },
        };

        workspaceSSEBroadcaster.broadcastFileChanged(userId, {
            type: 'file_changed', path: `agents/${agentSlug}/config.json`, action: 'created',
            timestamp: new Date().toISOString(),
        });

        res.json(mcpResult);
    } catch (error) {
        next(error);
    }
});

// POST /mcp/clone_agent
router.post('/clone_agent', async (req: InternalMcpRequest, res: Response, next: NextFunction) => {
    try {
        const { source_agent_id, name } = req.body;
        const userId = req.sandbox!.userId;

        if (!source_agent_id) {
            throw new BadRequestError('source_agent_id is required');
        }
        if (!name || typeof name !== 'string') {
            throw new BadRequestError('name is required');
        }

        const sandboxService = getSandboxService();
        const sandboxId = await requireRunningSandbox(sandboxService, userId);
        const provider = getDaytonaProvider(sandboxService);

        // source_agent_id is treated as a slug in workspace.db (agents table uses slug as PK)
        const sourceSlug = escapeSQL(String(source_agent_id));
        const sourceRows = await executeWorkspaceJsonQuery<WorkspaceAgentRow>(
            provider, sandboxId,
            `SELECT slug, name, adapter_type, role, autonomy_level, config FROM agents WHERE slug = '${sourceSlug}'`,
        );

        if (sourceRows.length === 0) {
            throw new BadRequestError(`Source agent not found: ${source_agent_id}`);
        }

        const source = sourceRows[0];
        const cloneSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        if (!SLUG_PATTERN.test(cloneSlug)) {
            throw new BadRequestError(`Invalid slug generated from name: ${cloneSlug}`);
        }

        const configValue = source.config ? `'${escapeSQL(source.config)}'` : 'NULL';
        const roleValue = source.role ? `'${escapeSQL(source.role)}'` : 'NULL';

        const sql = `
            INSERT INTO agents (slug, name, adapter_type, role, autonomy_level, status, config, marketplace_ref)
            VALUES ('${escapeSQL(cloneSlug)}', '${escapeSQL(name)}', '${escapeSQL(source.adapter_type)}', ${roleValue}, '${escapeSQL(source.autonomy_level)}', 'idle', ${configValue}, NULL);
            SELECT slug, name, adapter_type, role, autonomy_level, status, installed_at
            FROM agents WHERE slug = '${escapeSQL(cloneSlug)}';
        `;

        const rows = await executeWorkspaceJsonQuery<WorkspaceAgentRow>(provider, sandboxId, sql);

        if (rows.length === 0) {
            throw new BadRequestError(`Agent with slug "${cloneSlug}" already exists`);
        }

        // Write scaffold files for the cloned agent
        const sourceConfig = source.config ? JSON.parse(source.config) : {};
        const scaffoldFiles = buildScaffoldFilesFromRow(
            {
                name,
                description: sourceConfig.description || '',
                ai_model: sourceConfig.model || null,
                autonomy_level: source.autonomy_level,
                thinking_level: null,
                personality_type: null,
                domain: null,
                primary_channel: null,
                channels: [],
                slug: cloneSlug,
            },
            cloneSlug,
            [],
        );
        await writeScaffoldFilesToSandbox(provider, sandboxId, scaffoldFiles);

        const row = rows[0];
        const mcpResult: McpToolResult = {
            success: true,
            data: {
                agent: {
                    slug: row.slug,
                    name: row.name,
                    adapter_type: row.adapter_type,
                    autonomy_level: row.autonomy_level,
                    installed_at: row.installed_at,
                },
                cloned_from: source.slug,
            },
        };

        workspaceSSEBroadcaster.broadcastFileChanged(userId, {
            type: 'file_changed', path: `agents/${cloneSlug}/config.json`, action: 'created',
            timestamp: new Date().toISOString(),
        });

        res.json(mcpResult);
    } catch (error) {
        next(error);
    }
});

// POST /mcp/update_agent
router.post('/update_agent', async (req: InternalMcpRequest, res: Response, next: NextFunction) => {
    try {
        const { agent_id, name, description, system_prompt, model_id, autonomy_level } = req.body;
        const userId = req.sandbox!.userId;

        if (!agent_id) {
            throw new BadRequestError('agent_id is required');
        }

        const sandboxService = getSandboxService();
        const sandboxId = await requireRunningSandbox(sandboxService, userId);
        const provider = getDaytonaProvider(sandboxService);

        // agent_id is treated as slug in workspace.db
        const agentSlug = escapeSQL(String(agent_id));

        const existing = await executeWorkspaceJsonQuery<WorkspaceAgentRow>(
            provider, sandboxId,
            `SELECT slug, name, adapter_type, role, autonomy_level, status FROM agents WHERE slug = '${agentSlug}'`,
        );

        if (existing.length === 0) {
            throw new BadRequestError(`Agent not found or access denied: ${agent_id}`);
        }

        const now = new Date().toISOString();

        // Build dynamic SET clause from provided fields
        const updates: string[] = [`updated_at = '${now}'`];
        if (name) updates.push(`name = '${escapeSQL(String(name))}'`);
        if (autonomy_level) updates.push(`autonomy_level = '${escapeSQL(String(autonomy_level))}'`);
        if (description !== undefined) updates.push(`description = '${escapeSQL(String(description))}'`);
        if (model_id) updates.push(`model_id = '${escapeSQL(String(model_id))}'`);

        const sql = `UPDATE agents SET ${updates.join(', ')} WHERE slug = '${agentSlug}'`;
        await executeWorkspaceQuery(provider, sandboxId, sql);

        // system_prompt goes to the agent.md file on the sandbox filesystem
        if (system_prompt && typeof system_prompt === 'string') {
            const PROMPT_HEREDOC = 'XERUS_PROMPT_EOF_8f3d';
            if (system_prompt.includes(PROMPT_HEREDOC)) {
                throw new BadRequestError('system_prompt contains reserved heredoc delimiter');
            }
            const agentDir = `${SANDBOX_CONFIG.workspacePath}/agents/${agentSlug}`;
            const writeCmd = `mkdir -p ${agentDir} && cat > ${agentDir}/agent.md << '${PROMPT_HEREDOC}'\n${system_prompt}\n${PROMPT_HEREDOC}`;
            const { exitCode: writeExitCode } = await provider.executeCommand(sandboxId, writeCmd);
            if (writeExitCode !== 0) {
                throw new Error(`Failed to write agent.md for ${agentSlug} (exit ${writeExitCode})`);
            }
        }

        const row = existing[0];
        const mcpResult: McpToolResult = {
            success: true,
            data: {
                agent: {
                    slug: row.slug,
                    name: name || row.name,
                    adapter_type: row.adapter_type,
                    updated_at: now,
                },
            },
        };

        res.json(mcpResult);
    } catch (error) {
        next(error);
    }
});

// POST /mcp/delete_agent
router.post('/delete_agent', async (req: InternalMcpRequest, res: Response, next: NextFunction) => {
    try {
        const { agent_id, agent_slug } = req.body;
        const userId = req.sandbox!.userId;

        if (!agent_id && !agent_slug) {
            throw new BadRequestError('agent_id or agent_slug is required');
        }

        const sandboxService = getSandboxService();
        const sandboxId = await requireRunningSandbox(sandboxService, userId);
        const provider = getDaytonaProvider(sandboxService);

        // In workspace.db, agents are identified by slug
        const slug = agent_slug || String(agent_id);
        const escapedSlug = escapeSQL(slug);

        const existing = await executeWorkspaceJsonQuery<WorkspaceAgentRow>(
            provider, sandboxId,
            `SELECT slug, name, status FROM agents WHERE slug = '${escapedSlug}'`,
        );

        if (existing.length === 0) {
            throw new BadRequestError('Agent not found or access denied');
        }

        // workspace.db agents table has ON DELETE CASCADE for related tables
        await executeWorkspaceQuery(
            provider, sandboxId,
            `DELETE FROM agents WHERE slug = '${escapedSlug}'`,
        );

        const mcpResult: McpToolResult = {
            success: true,
            data: {
                deleted: true,
                agent_slug: existing[0].slug,
            },
        };

        workspaceSSEBroadcaster.broadcastFileChanged(userId, {
            type: 'file_changed', path: `agents/${existing[0].slug}`, action: 'deleted',
            timestamp: new Date().toISOString(),
        });

        res.json(mcpResult);
    } catch (error) {
        next(error);
    }
});

export { router as agentManagementRoutes };
