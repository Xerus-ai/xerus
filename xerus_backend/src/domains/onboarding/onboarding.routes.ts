// Onboarding Routes
// REST endpoints for new user onboarding flow:
// - POST /start   -> Acknowledge readiness (no-op, kept for compatibility)
// - POST /handoff -> Create workspace + domain + channel + sandbox + seed conversation

import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../types';
import { sendResponse } from '../../utils/response';
import { authenticateFirebaseToken } from '../../middleware/auth';
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

// Template messages seeded into the first conversation so /chat shows the Xerus intro
function buildTemplateMessages(firstName: string): Array<{ role: 'assistant'; content: string }> {
    return [
        { role: 'assistant', content: `Hey ${firstName}! I\u2019m Xerus \u2014 think of me as your co-CEO.` },
        { role: 'assistant', content: `Quick intro to how this place works \u2014 you and I run a virtual office together. I manage a team of AI agents, each one like a dedicated employee. Researchers, writers, social media managers, data analysts\u2026 you pick who you need from the marketplace, connect them to apps you already use \u2014 Gmail, Slack, Notion, Sheets \u2014 and they get to work.\n\nThe best part? They don\u2019t just sit around waiting for instructions. They check in on their own, spot things that need your attention, and post updates in your channels. Your workspace keeps everything organized into projects so you always know what\u2019s happening across the board.` },
        { role: 'assistant', content: `Now let\u2019s build your office. I\u2019ll walk you through it step by step \u2014 just a few questions so I can set things up right for you.\n\nAre you starting fresh, or bringing an existing company onboard?` },
    ];
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

        // Steps 1-5 in a single transaction — all-or-nothing
        const userName = req.user?.name || 'there';
        const firstNameForGreeting = userName.split(' ')[0] || 'there';
        const templateMsgs = buildTemplateMessages(firstNameForGreeting);

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

            // 4. Seed conversation with template messages (shows in /chat)
            const convResult = await client.query(
                `INSERT INTO conversations (user_id, agent_slug, title, message_count, last_message_at)
                 VALUES ($1, 'xerus-master', 'Onboarding', $2, NOW())
                 RETURNING id::text`,
                [userId, templateMsgs.length],
            );
            const conversationId = (convResult.rows[0] as { id: string }).id;

            // 5. Batch insert template messages (trigger_type NULL — these are seed data, not real executions)
            const msgValues: unknown[] = [];
            const msgPlaceholders: string[] = [];
            templateMsgs.forEach((msg, i) => {
                const offset = i * 3;
                msgPlaceholders.push(
                    `(gen_random_uuid(), $${offset + 1}, 'xerus-master', 'completed', NULL, $${offset + 2}, $${offset + 3}, NOW(), NOW(), NOW())`
                );
                msgValues.push(workspace.id, conversationId, msg.content);
            });
            await client.query(
                `INSERT INTO execution_sessions
                 (id, workspace_id, agent_slug, status, trigger_type, conversation_id, agent_response, started_at, completed_at, created_at)
                 VALUES ${msgPlaceholders.join(', ')}`,
                msgValues,
            );

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
