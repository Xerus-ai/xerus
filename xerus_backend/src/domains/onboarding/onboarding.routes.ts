// Onboarding Routes
// REST endpoints for new user onboarding flow:
// - POST /start   -> Acknowledge readiness (no-op, kept for compatibility)
// - POST /handoff -> Create workspace + sandbox + seed domain/channel/conversation in workspace-DB

import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../types';
import { sendResponse } from '../../utils/response';
import { authenticateFirebaseToken } from '../../middleware/auth';
import { UnauthorizedError, BadRequestError } from '../../utils/errors';
import { query } from '../../database/connection';
import type { SandboxService } from '../sandbox-infra';
import { createDomain, createChannel, createChannelMessage } from '../company/company-workspace-db.service';
import { createConversation } from '../conversations/workspace-db.service';

const router = Router();
const auth = authenticateFirebaseToken;

// Injected dependency — set by index.ts at startup
let sandboxService: SandboxService | null = null;

export function setOnboardingDeps(deps: { sandboxService: SandboxService }): void {
    sandboxService = deps.sandboxService;
}

import { slugify } from '../../shared/slugify';

// Single contextual welcome message seeded into /chat post-onboarding.
// References BOOTSTRAP.md checklist items so the agent can continue from here.
function buildWelcomeMessage(firstName: string, workspaceName: string, projectName: string): string {
    return `Hey ${firstName}! Welcome to **${workspaceName}** \u2014 your AI office is all set up.

I\u2019ve created your **${projectName}** project with a #general channel. Now I need to learn about your business so I can build the right team for you.

Here\u2019s what I\u2019ll do next:
\u2022 Learn about your business and top priorities
\u2022 Set up your company knowledge base
\u2022 Suggest the right AI agents for your needs
\u2022 Get your first deliverable rolling within 24 hours

**Tell me \u2014 what\u2019s your business about, and what are your top 3 goals for the next 90 days?**`;
}

// -------------------------------------------------------------------------
// POST /api/v1/onboarding/start
// Frontend calls this on mount. Returns ok so template flow can continue.
// -------------------------------------------------------------------------

router.post('/start', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const userId = req.user?.uid;
        if (!userId) {
            throw new UnauthorizedError('Authentication required');
        }

        sendResponse(res, 200, { status: 'ready' }, startTime);
    } catch (err) {
        next(err);
    }
});

// -------------------------------------------------------------------------
// POST /api/v1/onboarding/handoff
// Creates workspace (Neon) + provisions sandbox + seeds domain/channel/conversation (workspace-DB).
// Called when user submits the workspace name form.
// Screen 2 (visual progress animation) plays while this runs.
// Body: { workspace: string, project: string }
// -------------------------------------------------------------------------

router.post('/handoff', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const userId = req.user?.uid;
        if (!userId) {
            throw new UnauthorizedError('Authentication required');
        }

        // Block handoff until payment confirmed
        const userCheck = await query<{ subscription_status: string | null }>(
            'SELECT subscription_status FROM users WHERE user_id = $1',
            [userId],
        );
        const subStatus = userCheck.rows[0]?.subscription_status;
        if (subStatus !== 'active') {
            throw new BadRequestError('Payment required before workspace provisioning');
        }

        const workspaceName = (req.body.workspace as string || '').trim();
        const projectName = (req.body.project as string || '').trim();

        if (!workspaceName || workspaceName.length > 100) {
            throw new BadRequestError('workspace name is required (max 100 chars)');
        }
        if (projectName.length > 100) {
            throw new BadRequestError('project name too long (max 100 chars)');
        }

        const workspaceSlug = slugify(workspaceName);
        const projectSlug = projectName ? slugify(projectName) : 'default';
        const projectDisplayName = projectName || 'Default';

        const safeName = (req.user?.name || 'there').replace(/[<>&"']/g, '');
        const firstNameForGreeting = safeName.split(' ')[0] || 'there';
        const welcomeMessage = buildWelcomeMessage(firstNameForGreeting, workspaceName, projectDisplayName);

        // 1. Create workspace row in Neon (workspaces table stays in Neon)
        const wsResult = await query(
            `INSERT INTO workspaces (user_id, slug, name)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id) DO UPDATE SET
                 name = EXCLUDED.name, slug = EXCLUDED.slug, updated_at = NOW()
             RETURNING id::text, slug, name`,
            [userId, workspaceSlug, workspaceName],
        );
        const workspace = wsResult.rows[0] as { id: string; slug: string; name: string };

        // 2. Provision sandbox — required before workspace-DB writes
        if (!sandboxService) {
            throw new Error('SandboxService not initialized');
        }
        const session = await sandboxService.getOrCreateSandbox({ userId });
        const sandboxId = session.sandboxId;
        const provider = sandboxService.getDaytonaProvider();

        // 3. Seed workspace-DB: domain + channel + conversation + welcome message
        const domain = await createDomain(
            provider, sandboxId,
            projectSlug, projectDisplayName,
            `${projectDisplayName} department`,
        );

        const channel = await createChannel(
            provider, sandboxId,
            domain.slug, 'general', 'General',
            'Default channel for team communication',
        );

        const conversation = await createConversation(
            provider, sandboxId,
            'xerus-master', 'Onboarding',
        );

        // 4. Seed welcome message as a channel message
        await createChannelMessage(
            provider, sandboxId,
            channel.slug, 'agent', 'xerus-master',
            welcomeMessage, 'post', {},
        );

        sendResponse(res, 200, {
            workspace: { id: workspace.id, slug: workspace.slug, name: workspace.name },
            domain: { slug: domain.slug, name: domain.name },
            channel: { slug: channel.slug, name: channel.name },
            conversation_id: conversation.id,
            sandbox_provisioned: true,
        }, startTime);
    } catch (err) {
        next(err);
    }
});

export default router;
