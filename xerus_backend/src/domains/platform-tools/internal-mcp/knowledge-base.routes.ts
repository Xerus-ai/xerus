// Knowledge Base Routes
// Handles search_kb, upload_kb, assign_kb MCP tools
// Queries workspace.db (SQLite) on sandbox via executeWorkspaceJsonQuery.

import { Router, Response, NextFunction } from 'express';
import { BadRequestError } from '../../../utils/errors';
import { InternalMcpRequest, McpToolResult } from './types';
import { escapeSQL, escapeLikePattern, executeWorkspaceJsonQuery, executeWorkspaceQuery } from '../../conversations/workspace-db.helpers';
import { requireRunningSandbox, getDaytonaProvider } from '../../sandbox-infra/sandbox/sandbox-route-helpers';
import type { SandboxService } from '../../sandbox-infra/sandbox/sandbox.service';

const MAX_RESULTS = 100;
const MAX_CONTENT_SIZE = 1_048_576; // 1MB
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const KB_HEREDOC_DELIM = 'XERUS_KB_EOF_9a2c';

// ---------------------------------------------------------------------------
// Dependencies (injected at startup)
// ---------------------------------------------------------------------------

let _sandboxService: SandboxService | null = null;

export function setKnowledgeBaseRoutesDeps(deps: { sandboxService: SandboxService }): void {
    _sandboxService = deps.sandboxService;
}

function getSandboxService(): SandboxService {
    if (!_sandboxService) {
        throw new Error('Knowledge base routes dependencies not initialized');
    }
    return _sandboxService;
}

// ---------------------------------------------------------------------------
// workspace.db row types
// ---------------------------------------------------------------------------

interface AgentKbRow {
    id: number;
    agent_slug: string;
    kb_id: string;
    access_level: string;
    added_at: string;
}

interface AgentRow {
    slug: string;
    name: string;
}

const router = Router();

// POST /mcp/search_kb
router.post('/search_kb', async (req: InternalMcpRequest, res: Response, next: NextFunction) => {
    try {
        const { query: searchQuery, collection_id, limit } = req.body;
        const userId = req.sandbox!.userId;

        if (!searchQuery || typeof searchQuery !== 'string') {
            throw new BadRequestError('query is required');
        }

        const resultLimit = Math.min(limit || 10, MAX_RESULTS);

        const sandboxService = getSandboxService();
        const sandboxId = await requireRunningSandbox(sandboxService, userId);
        const provider = getDaytonaProvider(sandboxService);

        const escaped = escapeLikePattern(searchQuery);

        let sql = `SELECT akb.id, akb.agent_slug, akb.kb_id, akb.access_level, akb.added_at
                   FROM agent_knowledge_bases akb
                   WHERE akb.kb_id LIKE '%${escaped}%' ESCAPE '\\'`;

        if (collection_id) {
            sql += ` AND akb.agent_slug = '${escapeSQL(String(collection_id))}'`;
        }

        sql += ` ORDER BY akb.added_at DESC LIMIT ${resultLimit}`;

        const rows = await executeWorkspaceJsonQuery<AgentKbRow>(provider, sandboxId, sql);

        // Also search actual file content on the sandbox filesystem
        const safeQuery = escaped.replace(/'/g, "'\\''");
        const grepCmd = `grep -ril '${safeQuery}' /home/xerus/workspace/knowledge/ 2>/dev/null | head -20`;
        let contentMatches: string[] = [];
        try {
            const grepResult = await provider.executeCommand(sandboxId, grepCmd);
            if (grepResult.result) {
                contentMatches = grepResult.result.trim().split('\n').filter(Boolean);
            }
        } catch {
            // grep returns exit code 1 when no matches found - not an error
        }

        const mcpResult: McpToolResult = {
            success: true,
            data: {
                results: rows.map(row => ({
                    id: row.id,
                    agent_slug: row.agent_slug,
                    kb_id: row.kb_id,
                    access_level: row.access_level,
                    added_at: row.added_at,
                })),
                content_matches: contentMatches.map(filePath => ({
                    file_path: filePath.replace('/home/xerus/workspace/', ''),
                    source: 'filesystem',
                })),
                total: rows.length + contentMatches.length,
            },
        };

        res.json(mcpResult);
    } catch (error) {
        next(error);
    }
});

// POST /mcp/upload_kb
router.post('/upload_kb', async (req: InternalMcpRequest, res: Response, next: NextFunction) => {
    try {
        const { title, content, file_path, collection_id } = req.body;
        const userId = req.sandbox!.userId;

        if (!title || typeof title !== 'string') {
            throw new BadRequestError('title is required');
        }
        if (!content && !file_path) {
            throw new BadRequestError('Either content or file_path is required');
        }
        if (content && typeof content === 'string' && content.length > MAX_CONTENT_SIZE) {
            throw new BadRequestError(`Content exceeds maximum size of ${MAX_CONTENT_SIZE} bytes (1MB)`);
        }

        const sandboxService = getSandboxService();
        const sandboxId = await requireRunningSandbox(sandboxService, userId);
        const provider = getDaytonaProvider(sandboxService);

        const collection = collection_id || 'default';

        // Validate collection_id against path traversal and injection
        if (collection !== 'default' && !SLUG_PATTERN.test(collection)) {
            throw new BadRequestError('collection_id must be alphanumeric with hyphens only');
        }

        const safeTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        const kbId = `${collection}-${safeTitle}`;
        const kbPath = `knowledge/${collection}/${safeTitle}.md`;

        // Write the KB file to the sandbox filesystem
        if (content) {
            // Validate content doesn't contain heredoc delimiter to prevent command injection
            if (content.includes(KB_HEREDOC_DELIM)) {
                throw new BadRequestError('Content contains reserved delimiter sequence');
            }
            const writeCmd = `mkdir -p /home/xerus/workspace/knowledge/${escapeSQL(collection)} && cat > /home/xerus/workspace/${escapeSQL(kbPath)} << '${KB_HEREDOC_DELIM}'\n${content}\n${KB_HEREDOC_DELIM}`;
            await provider.executeCommand(sandboxId, writeCmd);
        } else if (file_path && typeof file_path === 'string') {
            // Validate file_path against path traversal
            if (file_path.includes('..') || file_path.startsWith('/')) {
                throw new BadRequestError('file_path must be a relative path without traversal');
            }
            // Verify the file exists and copy it to the knowledge directory
            const mkdirCmd = `mkdir -p /home/xerus/workspace/knowledge/${escapeSQL(collection)}`;
            await provider.executeCommand(sandboxId, mkdirCmd);
            const copyCmd = `test -f '/home/xerus/workspace/${escapeSQL(file_path)}' && cp '/home/xerus/workspace/${escapeSQL(file_path)}' '/home/xerus/workspace/${escapeSQL(kbPath)}'`;
            try {
                await provider.executeCommand(sandboxId, copyCmd);
            } catch {
                throw new BadRequestError(`File not found: ${file_path}`);
            }
        }

        const mcpResult: McpToolResult = {
            success: true,
            data: {
                document_id: kbId,
                title,
                path: kbPath,
                collection: collection,
                user_id: userId,
            },
        };

        res.json(mcpResult);
    } catch (error) {
        next(error);
    }
});

// POST /mcp/assign_kb
router.post('/assign_kb', async (req: InternalMcpRequest, res: Response, next: NextFunction) => {
    try {
        const { agent_id, document_id, collection_id, permission } = req.body;
        const userId = req.sandbox!.userId;

        if (!agent_id) {
            throw new BadRequestError('agent_id is required');
        }
        if (!document_id && !collection_id) {
            throw new BadRequestError('Either document_id or collection_id is required');
        }

        const sandboxService = getSandboxService();
        const sandboxId = await requireRunningSandbox(sandboxService, userId);
        const provider = getDaytonaProvider(sandboxService);

        // agent_id is treated as slug in workspace.db
        const agentSlug = escapeSQL(String(agent_id));
        const agentRows = await executeWorkspaceJsonQuery<AgentRow>(
            provider, sandboxId,
            `SELECT slug, name FROM agents WHERE slug = '${agentSlug}'`,
        );

        if (agentRows.length === 0) {
            throw new BadRequestError(`Agent not found: ${agent_id}`);
        }

        const kbId = document_id || collection_id;
        // Map MCP tool permission values to workspace.db CHECK constraint values (read, write, admin)
        const accessLevelMap: Record<string, string> = { 'read': 'read', 'read_write': 'write', 'write': 'write', 'admin': 'admin' };
        const accessLevel = accessLevelMap[permission] || 'read';

        const sql = `INSERT INTO agent_knowledge_bases (agent_slug, kb_id, access_level)
                     VALUES ('${agentSlug}', '${escapeSQL(String(kbId))}', '${escapeSQL(accessLevel)}')
                     ON CONFLICT(agent_slug, kb_id) DO UPDATE SET access_level = '${escapeSQL(accessLevel)}'`;

        await executeWorkspaceQuery(provider, sandboxId, sql);

        const mcpResult: McpToolResult = {
            success: true,
            data: {
                assigned: true,
                agent_slug: agentRows[0].slug,
                document_id: document_id || null,
                collection_id: collection_id || null,
                permission: accessLevel,
            },
        };

        res.json(mcpResult);
    } catch (error) {
        next(error);
    }
});

export { router as knowledgeBaseRoutes };
