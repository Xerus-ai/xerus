// Agent File API Routes
// REST endpoints for reading/writing agent workspace files (Daytona-only):
// - GET  /agents/:agentSlug/files         -> List files
// - GET  /agents/:agentSlug/files/*        -> Read file
// - PUT  /agents/:agentSlug/files/*        -> Write file
//
// All operations require a running Daytona sandbox. No S3 fallback.

import crypto from 'crypto';
import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../types';
import { sendResponse, extractWildcardPath } from '../../utils/response';
import { BadRequestError, UnauthorizedError, NotFoundError } from '../../utils/errors';
import { validateWorkspacePath } from '../../utils/path-validation';
import { validateSlug } from '../../shared/slugify';
import { authenticateFirebaseToken } from '../../middleware/auth';
import { query } from '../../database/connection';
import { SandboxService } from './sandbox/sandbox.service';
import { DaytonaProvider } from './sandbox/providers/daytona.provider';
import { SANDBOX_CONFIG } from './sandbox/sandbox.config';
import { AGENT_SUBDIRECTORIES } from './workspace/workspace.types';
import { shellEscapePath } from '../../utils/shell-safety';

// -----------------------------------------------------------------------------
// Path Validation (Two-Tier Security)
// -----------------------------------------------------------------------------

const ALLOWLISTED_FILES: readonly string[] = [
    'agent.md',
    AGENT_SUBDIRECTORIES.soul,
    AGENT_SUBDIRECTORIES.status,
    AGENT_SUBDIRECTORIES.user,
    AGENT_SUBDIRECTORIES.relationships,
    AGENT_SUBDIRECTORIES.bootstrap,
    AGENT_SUBDIRECTORIES.heartbeat,
    AGENT_SUBDIRECTORIES.config,
];

function validateFilePath(filePath: string): void {
    const result = validateWorkspacePath(filePath);
    if (!result.valid) {
        const messages: Record<string, string> = {
            empty: 'File path is required',
            null_byte: 'Invalid file path',
            decode_failed: 'Invalid file path encoding',
            traversal: 'Path traversal not allowed',
        };
        throw new BadRequestError(messages[result.reason]);
    }

    const normalized = result.normalized;

    if (ALLOWLISTED_FILES.includes(normalized)) {
        return;
    }

    if (normalized.startsWith('knowledge/') && normalized.length > 'knowledge/'.length) {
        return;
    }

    throw new BadRequestError(`File access denied: ${normalized}`);
}

function buildAgentFilePath(agentSlug: string, filePath: string): string {
    return `${SANDBOX_CONFIG.workspacePath}/agents/${agentSlug}/${filePath}`;
}

function getDaytonaProvider(sandboxService: SandboxService): DaytonaProvider {
    const provider = sandboxService.getProvider();
    if (!provider || typeof (provider as DaytonaProvider).readFile !== 'function') {
        throw new Error('Sandbox provider does not support file operations');
    }
    return provider as DaytonaProvider;
}

// -----------------------------------------------------------------------------
// Agent Ownership Verification
// -----------------------------------------------------------------------------

interface AgentRowRaw {
    id: number;
    user_id: string;
    slug: string | null;
    name: string;
    has_running_execution: boolean;
}

interface VerifiedAgent {
    id: number;
    user_id: string;
    slug: string;
    name: string;
    isRunning: boolean;
}

async function resolveAndVerifyAgent(
    userId: string,
    agentSlug: string,
): Promise<VerifiedAgent> {
    const result = await query<AgentRowRaw>(
        `SELECT a.id, a.user_id, a.slug, a.slug AS name,
                EXISTS(
                    SELECT 1 FROM execution_sessions es
                    JOIN workspaces w ON es.workspace_id = w.id
                    WHERE w.user_id = a.user_id AND es.agent_slug = a.slug AND es.status = 'running'
                ) AS has_running_execution
         FROM agent_registry a
         WHERE a.user_id = $1
         AND a.slug = $2
         LIMIT 1`,
        [userId, agentSlug],
    );

    if (result.rows.length === 0) {
        throw new NotFoundError('Agent');
    }

    const agent = result.rows[0];
    if (!agent.slug) {
        throw new BadRequestError('Agent has no slug — cannot access workspace files');
    }

    return {
        id: agent.id,
        user_id: agent.user_id,
        slug: agent.slug,
        name: agent.name,
        isRunning: agent.has_running_execution,
    };
}

// -----------------------------------------------------------------------------
// Sandbox Resolution (Daytona-only)
// -----------------------------------------------------------------------------

async function requireRunningSandbox(
    sandboxService: SandboxService,
    userId: string,
): Promise<string> {
    const status = await sandboxService.getSandboxStatus(userId);
    if (status.status !== 'running' || !status.sandboxId) {
        throw new BadRequestError('Sandbox not running — start a session first to access agent files');
    }
    return status.sandboxId;
}

// -----------------------------------------------------------------------------
// Dependency Injection
// -----------------------------------------------------------------------------

export interface AgentFilesDeps {
    sandboxService: SandboxService;
}

let deps: AgentFilesDeps | null = null;

export function setAgentFilesDeps(d: AgentFilesDeps): void {
    deps = d;
}

function getDeps(): AgentFilesDeps {
    if (!deps) {
        throw new Error('Agent files dependencies not initialized. Call setAgentFilesDeps() at startup.');
    }
    return deps;
}

// -----------------------------------------------------------------------------
// Router
// -----------------------------------------------------------------------------

const router = Router();
const auth = authenticateFirebaseToken;

// GET /agents/:agentSlug/files - List files in agent directory
router.get(
    '/:agentSlug/files',
    auth,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        const startTime = res.locals.startTime || Date.now();
        try {
            if (!req.user) throw new UnauthorizedError();

            const { agentSlug } = req.params;
            validateSlug(agentSlug);
            const agent = await resolveAndVerifyAgent(req.user.uid, agentSlug);
            const { sandboxService } = getDeps();

            const sandboxId = await requireRunningSandbox(sandboxService, req.user.uid);
            const provider = getDaytonaProvider(sandboxService);
            const agentDir = buildAgentFilePath(agent.slug, '');
            const files = await provider.listFiles(sandboxId, agentDir);

            if (agent.isRunning) {
                res.setHeader('X-Agent-Running', 'true');
            }

            sendResponse(res, 200, { files }, startTime);
        } catch (err) {
            next(err);
        }
    },
);

// GET /agents/:agentSlug/files/* - Read a specific file
router.get(
    '/:agentSlug/files/*filePath',
    auth,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        const startTime = res.locals.startTime || Date.now();
        try {
            if (!req.user) throw new UnauthorizedError();

            const { agentSlug } = req.params;
            validateSlug(agentSlug);
            const filePath = extractWildcardPath(req.params as Record<string, unknown>);
            if (!filePath) {
                throw new BadRequestError('File path is required');
            }

            validateFilePath(filePath);
            const agent = await resolveAndVerifyAgent(req.user.uid, agentSlug);
            const { sandboxService } = getDeps();

            const sandboxId = await requireRunningSandbox(sandboxService, req.user.uid);
            const provider = getDaytonaProvider(sandboxService);
            const fullPath = buildAgentFilePath(agent.slug, filePath);
            const content = await provider.readFile(sandboxId, fullPath);

            if (agent.isRunning) {
                res.setHeader('X-Agent-Running', 'true');
            }

            sendResponse(res, 200, { path: filePath, content }, startTime);
        } catch (err) {
            next(err);
        }
    },
);

// POST /agents/:agentSlug/files/batch - Read multiple files in one request
router.post(
    '/:agentSlug/files/batch',
    auth,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        const startTime = res.locals.startTime || Date.now();
        try {
            if (!req.user) throw new UnauthorizedError();

            const { agentSlug } = req.params;
            validateSlug(agentSlug);

            const { fileNames } = req.body;
            if (!Array.isArray(fileNames) || fileNames.length === 0) {
                throw new BadRequestError('fileNames is required and must be a non-empty array');
            }
            if (fileNames.length > 10) {
                throw new BadRequestError('Maximum 10 files per batch request');
            }

            // Validate each file name
            for (const fileName of fileNames) {
                if (typeof fileName !== 'string') {
                    throw new BadRequestError('Each fileName must be a string');
                }
                validateFilePath(fileName);
            }

            // Single DB call to verify agent ownership
            const agent = await resolveAndVerifyAgent(req.user.uid, agentSlug);
            const { sandboxService } = getDeps();

            // Single DB call to check sandbox status
            const sandboxId = await requireRunningSandbox(sandboxService, req.user.uid);
            const provider = getDaytonaProvider(sandboxService);

            // Single SSH call: read all files with per-request UUID separator
            const separator = `__XERUS_SEP_${crypto.randomUUID().replace(/-/g, '')}__`;
            const catCommands = fileNames.map((fileName: string) => {
                const fullPath = buildAgentFilePath(agent.slug, fileName);
                return `cat ${shellEscapePath(fullPath)} 2>/dev/null || true`;
            });
            const command = catCommands.join(`; printf '%s' '${separator}'; `);
            const result = await provider.executeCommand(sandboxId, command);

            // Parse the combined output back into individual files
            const parts = result.result.split(separator);
            const files: Record<string, string | null> = {};
            for (let i = 0; i < fileNames.length; i++) {
                const raw = parts[i] ?? null;
                // Strip only the trailing newline from the previous echo/cat, not all whitespace
                const content = raw !== null ? raw.replace(/^\n/, '').replace(/\n$/, '') : null;
                files[fileNames[i]] = content !== null && content !== '' ? content : null;
            }

            if (agent.isRunning) {
                res.setHeader('X-Agent-Running', 'true');
            }

            sendResponse(res, 200, { files, isRunning: agent.isRunning }, startTime);
        } catch (err) {
            next(err);
        }
    },
);

// PUT /agents/:agentSlug/files/* - Write a file (Daytona-only)
router.put(
    '/:agentSlug/files/*filePath',
    auth,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        const startTime = res.locals.startTime || Date.now();
        try {
            if (!req.user) throw new UnauthorizedError();

            const { agentSlug } = req.params;
            validateSlug(agentSlug);
            const filePath = extractWildcardPath(req.params as Record<string, unknown>);
            if (!filePath) {
                throw new BadRequestError('File path is required');
            }

            validateFilePath(filePath);

            const { content } = req.body;
            if (typeof content !== 'string') {
                throw new BadRequestError('content is required and must be a string');
            }

            const agent = await resolveAndVerifyAgent(req.user.uid, agentSlug);
            const { sandboxService } = getDeps();

            const sandboxId = await requireRunningSandbox(sandboxService, req.user.uid);
            const provider = getDaytonaProvider(sandboxService);
            const fullPath = buildAgentFilePath(agent.slug, filePath);
            await provider.writeFile(sandboxId, fullPath, content);

            if (agent.isRunning) {
                res.setHeader('X-Agent-Running', 'true');
            }

            sendResponse(res, 200, { path: filePath, written: true }, startTime);
        } catch (err) {
            next(err);
        }
    },
);

export default router;
