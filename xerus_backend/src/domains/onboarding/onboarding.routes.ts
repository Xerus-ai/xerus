// Onboarding Routes
// REST endpoints for new user onboarding flow:
// - POST /start   -> Create default workspace + provision sandbox (must complete before AI conversation)
// - POST /handoff -> Rename workspace, create domain + channel (after AI guides user through naming)

import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../types';
import { sendResponse } from '../../utils/response';
import { authenticateFirebaseToken } from '../../middleware/auth';
import { query } from '../../database/connection';
import type { SandboxService } from '../execution';

const router = Router();
const auth = authenticateFirebaseToken;

// Injected dependency — set by index.ts at startup
let sandboxService: SandboxService | null = null;

export function setOnboardingDeps(deps: { sandboxService: SandboxService }): void {
    sandboxService = deps.sandboxService;
}

import { slugify } from '../../shared/slugify';

// -------------------------------------------------------------------------
// POST /api/v1/onboarding/start
// Creates a default workspace row + provisions sandbox so the AI conversation
// can run inside it. Called on mount — template messages play while this completes.
// -------------------------------------------------------------------------

router.post('/start', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const userId = req.user?.uid;
        if (!userId) {
            res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
            return;
        }

        // Check if workspace already exists (idempotent — safe to call multiple times)
        const existing = await query(
            'SELECT id::text FROM workspaces WHERE user_id = $1 LIMIT 1',
            [userId],
        );

        let workspaceId: string;
        if (existing.rows.length > 0) {
            workspaceId = String(existing.rows[0].id);
        } else {
            // Create default workspace row so execution pipeline can find it
            const wsResult = await query(
                `INSERT INTO workspaces (user_id, slug, name)
                 VALUES ($1, 'default', 'My Workspace')
                 ON CONFLICT (user_id) DO NOTHING
                 RETURNING id::text`,
                [userId],
            );
            workspaceId = String(wsResult.rows[0]?.id ?? '');
        }

        // Provision sandbox (this is the slow part — ~9s)
        let sandboxReady = false;
        if (sandboxService) {
            try {
                await sandboxService.getOrCreateSandbox({ userId });
                sandboxReady = true;
            } catch (err) {
                console.warn(`[Onboarding] Sandbox provisioning failed for user ${userId}: ${(err as Error).message}`);
            }
        }

        sendResponse(res, 200, {
            status: 'ready',
            workspace_id: workspaceId,
            sandbox_ready: sandboxReady,
        }, startTime);
    } catch (err) {
        next(err);
    }
});

// -------------------------------------------------------------------------
// POST /api/v1/onboarding/handoff
// Rename workspace, create default domain + channel.
// Workspace row + sandbox already exist from /start.
// Body: { workspace: string, project: string }
// -------------------------------------------------------------------------

router.post('/handoff', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const userId = req.user?.uid;
        if (!userId) {
            res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
            return;
        }

        const workspaceName = (req.body.workspace as string || '').trim();
        const projectName = (req.body.project as string || '').trim();

        if (!workspaceName) {
            res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'workspace name is required' } });
            return;
        }

        const workspaceSlug = slugify(workspaceName);
        const projectSlug = projectName ? slugify(projectName) : 'default';
        const projectDisplayName = projectName || 'Default';

        // 1. Update workspace name (row already created by /start)
        const wsResult = await query(
            `INSERT INTO workspaces (user_id, slug, name)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id) DO UPDATE SET
                 name = EXCLUDED.name,
                 slug = EXCLUDED.slug,
                 updated_at = NOW()
             RETURNING id::text, slug, name`,
            [userId, workspaceSlug, workspaceName],
        );
        const workspace = wsResult.rows[0] as { id: string; slug: string; name: string };

        // 2. Create default domain
        const domainResult = await query(
            `INSERT INTO domains (user_id, workspace_id, slug, name, description)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (workspace_id, slug) DO UPDATE SET
                 name = EXCLUDED.name,
                 updated_at = NOW()
             RETURNING id::text, slug, name`,
            [userId, workspace.id, projectSlug, projectDisplayName, `${projectDisplayName} department`],
        );
        const domain = domainResult.rows[0] as { id: string; slug: string; name: string };

        // 3. Create #general channel in the domain
        const channelResult = await query(
            `INSERT INTO channels (domain_id, user_id, slug, name, description)
             VALUES ($1, $2, 'general', 'General', 'Default channel for team communication')
             ON CONFLICT (domain_id, slug) DO UPDATE SET
                 name = EXCLUDED.name,
                 updated_at = NOW()
             RETURNING id::text`,
            [domain.id, userId],
        );
        const channel = channelResult.rows[0] as { id: string };

        sendResponse(res, 200, {
            workspace: { id: workspace.id, slug: workspace.slug, name: workspace.name },
            domain: { id: domain.id, slug: domain.slug, name: domain.name },
            channel: { id: channel.id, slug: 'general', name: 'General' },
        }, startTime);
    } catch (err) {
        next(err);
    }
});

export default router;
