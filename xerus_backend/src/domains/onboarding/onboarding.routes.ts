// Onboarding Routes
// REST endpoints for new user onboarding flow:
// - POST /start   -> Acknowledge readiness (no-op, kept for compatibility)
// - POST /handoff -> Create workspace + domain + channel + sandbox + seed conversation

import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../types';
import { sendResponse } from '../../utils/response';
import { authenticateFirebaseToken } from '../../middleware/auth';
import { UnauthorizedError, BadRequestError } from '../../utils/errors';
import { transaction } from '../../database/connection';
import { PoolClient } from 'pg';
import type { SandboxService } from '../execution';

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
// Creates workspace + domain + channel + provisions sandbox + seeds conversation.
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

        // Steps 1-5 in a single transaction — all-or-nothing
        const safeName = (req.user?.name || 'there').replace(/[<>&"']/g, '');
        const firstNameForGreeting = safeName.split(' ')[0] || 'there';
        const welcomeMessage = buildWelcomeMessage(firstNameForGreeting, workspaceName, projectDisplayName);

        const result = await transaction(async (client: PoolClient) => {
            // 1. Create workspace row
            const wsResult = await client.query(
                `INSERT INTO workspaces (user_id, slug, name)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (user_id) DO UPDATE SET
                     name = EXCLUDED.name, slug = EXCLUDED.slug, updated_at = NOW()
                 RETURNING id::text, slug, name`,
                [userId, workspaceSlug, workspaceName],
            );
            const workspace = wsResult.rows[0] as { id: string; slug: string; name: string };

            // 2. Create default domain
            const domainResult = await client.query(
                `INSERT INTO domains (user_id, workspace_id, slug, name, description)
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (workspace_id, slug) DO UPDATE SET
                     name = EXCLUDED.name, updated_at = NOW()
                 RETURNING id::text, slug, name`,
                [userId, workspace.id, projectSlug, projectDisplayName, `${projectDisplayName} department`],
            );
            const domain = domainResult.rows[0] as { id: string; slug: string; name: string };

            // 3. Create #general channel
            const channelResult = await client.query(
                `INSERT INTO channels (domain_id, user_id, slug, name, description)
                 VALUES ($1, $2, 'general', 'General', 'Default channel for team communication')
                 ON CONFLICT (domain_id, slug) DO UPDATE SET
                     name = EXCLUDED.name, updated_at = NOW()
                 RETURNING id::text`,
                [domain.id, userId],
            );
            const channel = channelResult.rows[0] as { id: string };

            // 4. Seed conversation with welcome message (idempotent — skip if exists)
            const existingConv = await client.query(
                `SELECT id::text FROM conversations WHERE user_id = $1 AND title = 'Onboarding' LIMIT 1`,
                [userId],
            );
            let conversationId: string;
            if (existingConv.rows.length > 0) {
                conversationId = (existingConv.rows[0] as { id: string }).id;
            } else {
                const convResult = await client.query(
                    `INSERT INTO conversations (user_id, agent_slug, title, message_count, last_message_at)
                     VALUES ($1, 'xerus-master', 'Onboarding', 1, NOW())
                     RETURNING id::text`,
                    [userId],
                );
                conversationId = (convResult.rows[0] as { id: string }).id;

                // 5. Single welcome message referencing BOOTSTRAP.md guidance
                await client.query(
                    `INSERT INTO execution_sessions
                     (id, workspace_id, agent_slug, status, trigger_type, conversation_id, agent_response, started_at, completed_at, created_at)
                     VALUES (gen_random_uuid(), $1, 'xerus-master', 'completed', NULL, $2, $3, NOW(), NOW(), NOW())`,
                    [workspace.id, conversationId, welcomeMessage],
                );
            }

            return { workspace, domain, channel, conversationId };
        });

        // 6. Provision sandbox (outside transaction — Screen 2 animation covers the wait)
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
            workspace: { id: result.workspace.id, slug: result.workspace.slug, name: result.workspace.name },
            domain: { id: result.domain.id, slug: result.domain.slug, name: result.domain.name },
            channel: { id: result.channel.id, slug: 'general', name: 'General' },
            conversation_id: result.conversationId,
            sandbox_provisioned: sandboxProvisioned,
        }, startTime);
    } catch (err) {
        next(err);
    }
});

export default router;
