// Skill Management Routes
// Handles search_skills, create_skill, install_skill, uninstall_skill, cancel_execution
// Skills routes query workspace.db (SQLite) on sandbox via executeWorkspaceJsonQuery.
// cancel_execution stays on Neon (needs backend execution session access).

import { Router, Response, NextFunction } from 'express';
import { query } from '../../../database/connection';
import { BadRequestError } from '../../../utils/errors';
import { InternalMcpRequest, McpToolResult } from './types';
import { escapeSQL, escapeLikePattern, executeWorkspaceJsonQuery, executeWorkspaceQuery } from '../../conversations/workspace-db.helpers';
import { requireRunningSandbox, getDaytonaProvider } from '../../sandbox-infra/sandbox/sandbox-route-helpers';
import type { SandboxService } from '../../sandbox-infra/sandbox/sandbox.service';
import { SANDBOX_CONFIG } from '../../sandbox-infra/sandbox/sandbox.config';
import { workspaceSSEBroadcaster } from '../../drive';

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

// ---------------------------------------------------------------------------
// Dependencies (injected at startup)
// ---------------------------------------------------------------------------

let _sandboxService: SandboxService | null = null;

export function setSkillManagementRoutesDeps(deps: { sandboxService: SandboxService }): void {
    _sandboxService = deps.sandboxService;
}

function getSandboxService(): SandboxService {
    if (!_sandboxService) {
        throw new Error('Skill management routes dependencies not initialized');
    }
    return _sandboxService;
}

// ---------------------------------------------------------------------------
// workspace.db row types
// ---------------------------------------------------------------------------

interface SkillRow {
    slug: string;
    name: string;
    version: string;
    source: string;
    source_ref: string | null;
    description: string | null;
    categories: string | null;
    installed_at: string;
    updated_at: string;
}

const router = Router();

// POST /mcp/search_skills
router.post('/search_skills', async (req: InternalMcpRequest, res: Response, next: NextFunction) => {
    try {
        const { query: searchQuery, scope } = req.body;
        const userId = req.sandbox!.userId;

        if (!searchQuery || typeof searchQuery !== 'string') {
            throw new BadRequestError('query is required');
        }

        const sandboxService = getSandboxService();
        const sandboxId = await requireRunningSandbox(sandboxService, userId);
        const provider = getDaytonaProvider(sandboxService);

        const escaped = escapeLikePattern(searchQuery);

        const sql = `SELECT slug, name, version, source, source_ref, description, categories, installed_at
                     FROM skills
                     WHERE slug LIKE '%${escaped}%' ESCAPE '\\'
                        OR name LIKE '%${escaped}%' ESCAPE '\\'
                        OR description LIKE '%${escaped}%' ESCAPE '\\'
                        OR categories LIKE '%${escaped}%' ESCAPE '\\'
                     ORDER BY slug
                     LIMIT 50`;

        const rows = await executeWorkspaceJsonQuery<SkillRow>(provider, sandboxId, sql);

        const mcpResult: McpToolResult = {
            success: true,
            data: {
                skills: rows.map(row => ({
                    slug: row.slug,
                    name: row.name,
                    version: row.version,
                    source: row.source,
                    description: row.description,
                    categories: row.categories,
                    installed_at: row.installed_at,
                })),
                total: rows.length,
                search_query: searchQuery,
                scope: scope || 'all',
            },
        };

        res.json(mcpResult);
    } catch (error) {
        next(error);
    }
});

// POST /mcp/create_skill
router.post('/create_skill', async (req: InternalMcpRequest, res: Response, next: NextFunction) => {
    try {
        const { name, description, instructions, agent_id, category } = req.body;
        const userId = req.sandbox!.userId;

        if (!name || typeof name !== 'string') {
            throw new BadRequestError('name is required');
        }
        if (!description || typeof description !== 'string') {
            throw new BadRequestError('description is required');
        }
        if (!instructions || typeof instructions !== 'string') {
            throw new BadRequestError('instructions is required');
        }

        const skillSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        if (!SLUG_PATTERN.test(skillSlug)) {
            throw new BadRequestError(`Invalid skill name: ${name}. Slug must match ${SLUG_PATTERN}`);
        }

        const sandboxService = getSandboxService();
        const sandboxId = await requireRunningSandbox(sandboxService, userId);
        const provider = getDaytonaProvider(sandboxService);

        const cat = category || 'custom';
        const categoriesJson = escapeSQL(JSON.stringify([cat]));
        const descEscaped = escapeSQL(description);
        const skillPath = `.claude/skills/${skillSlug}/SKILL.md`;

        // Idempotent creation: if a skill with this slug already exists, return it
        // instead of erroring or overwriting. Prevents duplicate-skill attempts from
        // the agent calling create_skill twice with the same name.
        const existingSkillRows = await executeWorkspaceJsonQuery<SkillRow>(
            provider, sandboxId,
            `SELECT slug, name, version, source, source_ref, description, categories, installed_at, updated_at
             FROM skills WHERE slug = '${escapeSQL(skillSlug)}'`,
        );
        if (existingSkillRows.length > 0) {
            const existing = existingSkillRows[0];
            let existingCategory = cat;
            if (existing.categories) {
                try {
                    const parsed = JSON.parse(existing.categories) as string[];
                    if (Array.isArray(parsed) && typeof parsed[0] === 'string') {
                        existingCategory = parsed[0];
                    }
                } catch {
                    // categories not JSON — fall back to request category
                }
            }
            const existingResult: McpToolResult = {
                success: true,
                data: {
                    skill: {
                        slug: existing.slug,
                        name: existing.name,
                        description: existing.description || description,
                        category: existingCategory,
                        agent_id: agent_id || null,
                        user_id: userId,
                        path: existing.source_ref || skillPath,
                        created_at: existing.installed_at || new Date().toISOString(),
                    },
                },
            };
            res.json(existingResult);
            return;
        }

        const sql = `
            INSERT INTO skills (slug, name, version, source, source_ref, description, categories)
            VALUES ('${escapeSQL(skillSlug)}', '${escapeSQL(name)}', '1.0.0', 'local', '${escapeSQL(skillPath)}', '${descEscaped}', '${categoriesJson}');
            SELECT slug, name, version, source, description, categories, installed_at
            FROM skills WHERE slug = '${escapeSQL(skillSlug)}';
        `;

        const rows = await executeWorkspaceJsonQuery<SkillRow>(provider, sandboxId, sql);

        // Write the SKILL.md file to the sandbox filesystem
        const SKILL_HEREDOC = 'XERUS_SKILL_EOF_4b7e';
        if (instructions.includes(SKILL_HEREDOC)) {
            throw new BadRequestError('instructions content contains reserved heredoc delimiter');
        }
        const skillDir = `${SANDBOX_CONFIG.workspacePath}/.claude/skills/${skillSlug}`;
        const writeCmd = `mkdir -p ${skillDir} && cat > ${skillDir}/SKILL.md << '${SKILL_HEREDOC}'\n${instructions}\n${SKILL_HEREDOC}`;
        const { exitCode: skillWriteExitCode } = await provider.executeCommand(sandboxId, writeCmd);
        if (skillWriteExitCode !== 0) {
            throw new Error(`Failed to write SKILL.md for ${skillSlug} (exit ${skillWriteExitCode})`);
        }

        // If agent_id specified, also create the agent_skills link
        if (agent_id) {
            const agentSlug = escapeSQL(String(agent_id));
            await executeWorkspaceQuery(
                provider, sandboxId,
                `INSERT OR IGNORE INTO agent_skills (agent_slug, skill_slug, enabled) VALUES ('${agentSlug}', '${escapeSQL(skillSlug)}', 1)`,
            );
        }

        const row = rows[0];
        if (!row) {
            throw new BadRequestError('Failed to create skill — database insert returned no result');
        }
        const mcpResult: McpToolResult = {
            success: true,
            data: {
                skill: {
                    slug: row.slug,
                    name: row.name,
                    description: row.description || description,
                    category: cat,
                    agent_id: agent_id || null,
                    user_id: userId,
                    path: skillPath,
                    created_at: row.installed_at || new Date().toISOString(),
                },
            },
        };

        workspaceSSEBroadcaster.broadcastFileChanged(userId, {
            type: 'file_changed', path: `.claude/skills/${skillSlug}/SKILL.md`, action: 'created',
            timestamp: new Date().toISOString(),
        });

        res.json(mcpResult);
    } catch (error) {
        next(error);
    }
});

// POST /mcp/install_skill
router.post('/install_skill', async (req: InternalMcpRequest, res: Response, next: NextFunction) => {
    try {
        const { skill_slug, agent_id } = req.body;
        const userId = req.sandbox!.userId;

        if (!skill_slug || typeof skill_slug !== 'string') {
            throw new BadRequestError('skill_slug is required');
        }
        if (!SLUG_PATTERN.test(skill_slug)) {
            throw new BadRequestError(`Invalid skill_slug format: ${skill_slug}`);
        }

        const sandboxService = getSandboxService();
        const sandboxId = await requireRunningSandbox(sandboxService, userId);
        const provider = getDaytonaProvider(sandboxService);

        // Copy skill files from marketplace to .claude/skills/ on sandbox
        const basePath = SANDBOX_CONFIG.workspacePath;
        const marketplaceSrc = `${basePath}/marketplace/skills/${skill_slug}`;
        const destDir = `${basePath}/.claude/skills/${skill_slug}`;
        const { result: checkResult } = await provider.executeCommand(sandboxId, `test -d "${marketplaceSrc}" && echo EXISTS || echo MISSING`);
        if (checkResult.trim() !== 'EXISTS') {
            throw new BadRequestError(`Skill "${skill_slug}" not found in marketplace`);
        }
        const copyCmd = `mkdir -p "${destDir}" && cp -r "${marketplaceSrc}/." "${destDir}/"`;
        const { exitCode: copyExitCode } = await provider.executeCommand(sandboxId, copyCmd);
        if (copyExitCode !== 0) {
            throw new Error(`Failed to copy skill files for ${skill_slug} (exit ${copyExitCode})`);
        }

        // Also ensure the skill is registered in workspace.db
        const skillEscaped = escapeSQL(skill_slug);
        const skillPath = `.claude/skills/${skill_slug}/SKILL.md`;
        await executeWorkspaceQuery(
            provider, sandboxId,
            `INSERT OR IGNORE INTO skills (slug, name, version, source, source_ref) VALUES ('${skillEscaped}', '${skillEscaped}', '1.0.0', 'marketplace', '${escapeSQL(skillPath)}')`,
        );

        if (agent_id) {
            // Verify agent exists in workspace.db
            const agentSlug = escapeSQL(String(agent_id));
            const agentRows = await executeWorkspaceJsonQuery<{ slug: string }>(
                provider, sandboxId,
                `SELECT slug FROM agents WHERE slug = '${agentSlug}'`,
            );
            if (agentRows.length === 0) {
                throw new BadRequestError(`Agent not found: ${agent_id}`);
            }

            // Install skill for this agent
            await executeWorkspaceQuery(
                provider, sandboxId,
                `INSERT OR IGNORE INTO agent_skills (agent_slug, skill_slug, enabled) VALUES ('${agentSlug}', '${skillEscaped}', 1)`,
            );
        }

        const mcpResult: McpToolResult = {
            success: true,
            data: {
                installed: true,
                skill_slug,
                agent_id: agent_id || null,
                user_id: userId,
                files_copied_from: `marketplace/skills/${skill_slug}`,
                installed_to: `.claude/skills/${skill_slug}`,
            },
        };

        workspaceSSEBroadcaster.broadcastFileChanged(userId, {
            type: 'file_changed', path: `.claude/skills/${skill_slug}`, action: 'created',
            timestamp: new Date().toISOString(),
        });

        res.json(mcpResult);
    } catch (error) {
        next(error);
    }
});

// POST /mcp/uninstall_skill
router.post('/uninstall_skill', async (req: InternalMcpRequest, res: Response, next: NextFunction) => {
    try {
        const { skill_slug, agent_id } = req.body;
        const userId = req.sandbox!.userId;

        if (!skill_slug || typeof skill_slug !== 'string') {
            throw new BadRequestError('skill_slug is required');
        }
        if (!SLUG_PATTERN.test(skill_slug)) {
            throw new BadRequestError(`Invalid skill_slug format: ${skill_slug}`);
        }

        const sandboxService = getSandboxService();
        const sandboxId = await requireRunningSandbox(sandboxService, userId);
        const provider = getDaytonaProvider(sandboxService);

        if (agent_id) {
            // Verify agent exists in workspace.db
            const agentSlug = escapeSQL(String(agent_id));
            const agentRows = await executeWorkspaceJsonQuery<{ slug: string }>(
                provider, sandboxId,
                `SELECT slug FROM agents WHERE slug = '${agentSlug}'`,
            );
            if (agentRows.length === 0) {
                throw new BadRequestError(`Agent not found: ${agent_id}`);
            }

            // Remove skill assignment for this agent
            await executeWorkspaceQuery(
                provider, sandboxId,
                `DELETE FROM agent_skills WHERE agent_slug = '${agentSlug}' AND skill_slug = '${escapeSQL(skill_slug)}'`,
            );
        } else {
            // Remove skill entirely from the workspace
            await executeWorkspaceQuery(
                provider, sandboxId,
                `DELETE FROM skills WHERE slug = '${escapeSQL(skill_slug)}'`,
            );
        }

        const mcpResult: McpToolResult = {
            success: true,
            data: {
                uninstalled: true,
                skill_slug,
                agent_id: agent_id || null,
                user_id: userId,
            },
        };

        res.json(mcpResult);
    } catch (error) {
        next(error);
    }
});

// POST /mcp/cancel_execution — stays on Neon (needs backend execution session access)
router.post('/cancel_execution', async (req: InternalMcpRequest, res: Response, next: NextFunction) => {
    try {
        const { session_id } = req.body;
        const userId = req.sandbox!.userId;

        if (!session_id || typeof session_id !== 'string') {
            throw new BadRequestError('session_id is required');
        }

        const sessionResult = await query<{ id: string; status: string }>(
            `SELECT es.id, es.status
             FROM execution_sessions es
             JOIN user_workspaces uw ON es.workspace_id = uw.id
             WHERE es.id = $1::uuid AND uw.user_id = $2`,
            [session_id, userId],
        );
        if (sessionResult.rows.length === 0) {
            throw new BadRequestError(`Session not found: ${session_id}`);
        }

        const session = sessionResult.rows[0];
        if (session.status === 'completed' || session.status === 'cancelled' || session.status === 'failed') {
            throw new BadRequestError(`Session already in terminal state: ${session.status}`);
        }

        await query(
            `UPDATE execution_sessions SET status = 'cancelled', completed_at = NOW() WHERE id = $1::uuid`,
            [session_id],
        );

        const mcpResult: McpToolResult = {
            success: true,
            data: {
                cancelled: true,
                session_id,
                cancelled_at: new Date().toISOString(),
            },
        };

        res.json(mcpResult);
    } catch (error) {
        next(error);
    }
});

export { router as skillManagementRoutes };
