// Onboarding Routes
// REST endpoints for new user onboarding flow:
// - POST /start   -> Acknowledge readiness (near no-op)
// - POST /handoff -> Create workspace, provision sandbox, scaffold, create default domain + channel

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
// Frontend calls this on mount. Returns ok so template flow can continue.
// -------------------------------------------------------------------------

router.post('/start', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const userId = req.user?.uid;
        if (!userId) {
            res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
            return;
        }

        sendResponse(res, 200, { status: 'ready' }, startTime);
    } catch (err) {
        next(err);
    }
});

// -------------------------------------------------------------------------
// POST /api/v1/onboarding/handoff
// Heavy lifting: create workspace row, provision sandbox, create default domain + channel.
// Body: { workspace: string, project: string, choice?: string }
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

        // 1. Create workspace row (idempotent via ON CONFLICT)
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

        // 5. Create #general channel in the domain
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

        // 6. Provision sandbox (async — don't block response if slow)
        // The sandbox will be created on first execution if not ready yet.
        let sandboxProvisioned = false;
        if (sandboxService) {
            try {
                await sandboxService.getOrCreateSandbox({ userId });
                sandboxProvisioned = true;
            } catch (err) {
                console.warn(`[Onboarding] Sandbox provisioning deferred for user ${userId}: ${(err as Error).message}`);
                sandboxProvisioned = false;
            }
        }

        sendResponse(res, 200, {
            workspace: { id: workspace.id, slug: workspace.slug, name: workspace.name },
            domain: { id: domain.id, slug: domain.slug, name: domain.name },
            channel: { id: channel.id, slug: 'general', name: 'General' },
            sandbox_provisioned: sandboxProvisioned,
        }, startTime);
    } catch (err) {
        next(err);
    }
});

export default router;
