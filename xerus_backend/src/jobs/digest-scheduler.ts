// Digest Scheduler Job
// Runs standup (AM) and report (PM) digests on per-user cron schedules.
// Uses DigestDispatcher to prepare prompts, then dispatches to Xerus agent
// via HeartbeatRunnerService and records execution via DailyDigestService.
//
// Architecture: Digest is a separate job — it has its own
// cron schedules (standup_cron, report_cron) per user, independent of
// agent heartbeat intervals.

import { randomUUID } from 'crypto';
import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import { DailyDigestService } from '../domains/execution/background/daily-digest.service';
import { DigestDispatcher } from '../domains/execution/background/digest-dispatcher';
import type { DailyDigestConfig, DigestVariant, DigestActivityData, ActivityDataCollector } from '../domains/execution/background/daily-digest.types';
import type { ExecutionDatabase } from '../domains/execution/execution-pipeline.types';
import { logger } from '../utils/logger';

const log = logger('DigestScheduler');

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface DigestDispatchFn {
    (request: {
        agent_id: number;
        user_id: string;
        prompt: string;
        variant: DigestVariant;
    }): Promise<{ tokens_used: number; outcome: string }>;
}

interface ScheduledDigest {
    standupTask: ScheduledTask | null;
    reportTask: ScheduledTask | null;
    config: DailyDigestConfig;
}

// -----------------------------------------------------------------------------
// Digest Scheduler
// -----------------------------------------------------------------------------

export class DigestScheduler {
    private schedules: Map<string, ScheduledDigest> = new Map();
    private running = false;
    private dispatcher: DigestDispatcher;
    private digestService: DailyDigestService;
    private dispatchFn: DigestDispatchFn | null = null;

    constructor(
        digestService: DailyDigestService,
        activityCollector: ActivityDataCollector,
    ) {
        this.digestService = digestService;
        this.dispatcher = new DigestDispatcher({
            formatter: digestService,
            activityCollector,
        });
    }

    async start(dispatchFn: DigestDispatchFn, configs: DailyDigestConfig[]): Promise<void> {
        if (this.running) return;

        this.dispatchFn = dispatchFn;
        this.running = true;

        for (const config of configs) {
            if (config.enabled) {
                this.registerUser(config);
            }
        }
    }

    stop(): void {
        if (!this.running) return;

        for (const [, scheduled] of this.schedules) {
            scheduled.standupTask?.stop();
            scheduled.reportTask?.stop();
        }
        this.schedules.clear();
        this.running = false;
        this.dispatchFn = null;
    }

    isRunning(): boolean {
        return this.running;
    }

    getRegisteredUserIds(): string[] {
        return Array.from(this.schedules.keys());
    }

    registerUser(config: DailyDigestConfig): void {
        this.unregisterUser(config.user_id);

        if (!config.enabled) return;

        const scheduled: ScheduledDigest = {
            standupTask: null,
            reportTask: null,
            config,
        };

        if (cron.validate(config.standup_cron)) {
            scheduled.standupTask = cron.schedule(
                config.standup_cron,
                () => this.onDigestTick(config.user_id, 'standup'),
                { timezone: config.timezone },
            );
        }

        if (cron.validate(config.report_cron)) {
            scheduled.reportTask = cron.schedule(
                config.report_cron,
                () => this.onDigestTick(config.user_id, 'report'),
                { timezone: config.timezone },
            );
        }

        this.schedules.set(config.user_id, scheduled);
    }

    unregisterUser(userId: string): void {
        const existing = this.schedules.get(userId);
        if (!existing) return;

        existing.standupTask?.stop();
        existing.reportTask?.stop();
        this.schedules.delete(userId);
    }

    private onDigestTick(userId: string, variant: DigestVariant): void {
        this.runDigest(userId, variant).catch((err) => {
            log.error('Digest failed', {
                variant,
                user_id: userId,
                error: err instanceof Error ? err.message : String(err),
            });
        });
    }

    async runDigest(userId: string, variant: DigestVariant): Promise<void> {
        const scheduled = this.schedules.get(userId);
        if (!scheduled) {
            throw new Error(`No digest config registered for user ${userId}`);
        }

        if (!this.dispatchFn) {
            throw new Error('DigestScheduler has no dispatch function configured');
        }

        const config = scheduled.config;
        const result = await this.dispatcher.prepareDigest(variant, config);

        if (result.skipped) {
            await this.digestService.recordDigestExecution({
                agent_id: config.xerus_agent_id,
                heartbeat_config_id: null,
                variant,
                outcome: 'skipped',
                tokens_used: 0,
                inbox_posts: 0,
            });
            return;
        }

        const dispatchResult = await this.dispatchFn({
            agent_id: config.xerus_agent_id,
            user_id: config.user_id,
            prompt: result.prompt!,
            variant,
        });

        await this.digestService.recordDigestExecution({
            agent_id: config.xerus_agent_id,
            heartbeat_config_id: null,
            variant,
            outcome: dispatchResult.outcome as 'success' | 'failure',
            tokens_used: dispatchResult.tokens_used,
            inbox_posts: 1,
        });
    }
}

// -----------------------------------------------------------------------------
// Activity Data Collector (queries execution DB)
// -----------------------------------------------------------------------------

function createActivityCollector(db: ExecutionDatabase): ActivityDataCollector {
    return {
        async collectForUser(userId: string, since: Date): Promise<DigestActivityData> {
            // Completed tasks: execution sessions completed since `since`
            const completedResult = await db.query<{
                agent_id: number; agent_name: string; title: string;
                channel_id: string | null; completed_at: Date | null;
            }>(
                `SELECT COALESCE(ar.id, 0) AS agent_id, COALESCE(es.agent_slug, 'unknown') AS agent_name,
                        COALESCE(es.user_prompt, 'Untitled task') AS title,
                        es.conversation_id AS channel_id, es.completed_at
                 FROM execution_sessions es
                 LEFT JOIN agent_registry ar ON ar.slug = es.agent_slug
                 WHERE es.workspace_id IN (SELECT id FROM workspaces WHERE user_id = $1)
                   AND es.status = 'completed' AND es.completed_at >= $2
                 ORDER BY es.completed_at DESC LIMIT 50`,
                [userId, since],
            );

            // In-progress tasks
            const inProgressResult = await db.query<{
                agent_id: number; agent_name: string; title: string; channel_id: string | null;
            }>(
                `SELECT COALESCE(ar.id, 0) AS agent_id, COALESCE(es.agent_slug, 'unknown') AS agent_name,
                        COALESCE(es.user_prompt, 'Untitled task') AS title,
                        es.conversation_id AS channel_id
                 FROM execution_sessions es
                 LEFT JOIN agent_registry ar ON ar.slug = es.agent_slug
                 WHERE es.workspace_id IN (SELECT id FROM workspaces WHERE user_id = $1)
                   AND es.status = 'running'
                 ORDER BY es.started_at DESC LIMIT 20`,
                [userId],
            );

            // Credit usage from credit_transactions (migration 065)
            let creditsUsed = 0;
            let creditsRemaining = 0;

            const creditResult = await db.query<{ total: string }>(
                `SELECT COALESCE(SUM(ABS(amount)), 0)::text AS total
                 FROM credit_transactions WHERE user_id = $1 AND amount < 0 AND created_at >= $2`,
                [userId, since],
            );
            creditsUsed = parseInt(creditResult.rows[0]?.total || '0', 10);

            const balanceResult = await db.query<{ balance: string }>(
                `SELECT COALESCE(SUM(amount), 0)::text AS balance FROM credit_transactions WHERE user_id = $1`,
                [userId],
            );
            creditsRemaining = parseInt(balanceResult.rows[0]?.balance || '0', 10);

            return {
                completed_tasks: completedResult.rows.map(r => ({
                    agent_id: r.agent_id, agent_name: r.agent_name,
                    title: r.title, channel_id: r.channel_id, completed_at: r.completed_at,
                })),
                in_progress_tasks: inProgressResult.rows.map(r => ({
                    agent_id: r.agent_id, agent_name: r.agent_name,
                    title: r.title, channel_id: r.channel_id, completed_at: null,
                })),
                blocked_items: [],
                heartbeat_alerts: [],
                credit_usage: {
                    credits_used: creditsUsed,
                    credits_remaining: creditsRemaining,
                    top_consumers: [],
                },
            };
        },
    };
}

// -----------------------------------------------------------------------------
// Job Entry Point (called from jobs/index.ts)
// -----------------------------------------------------------------------------

let digestSchedulerInstance: DigestScheduler | null = null;

export function startDigestSchedulerJob(db?: ExecutionDatabase): void {
    if (!db) {
        log.warn('Digest scheduler skipped (no DB dependency provided)');
        return;
    }

    const digestService = new DailyDigestService();
    const activityCollector = createActivityCollector(db);
    digestSchedulerInstance = new DigestScheduler(digestService, activityCollector);

    const dispatchFn: DigestDispatchFn = async (request) => {
        log.info('Dispatching digest', {
            variant: request.variant,
            user_id: request.user_id,
            agent_id: request.agent_id,
        });

        // Resolve agent slug from integer agent_id (execution_sessions uses agent_slug, not agent_id)
        const agentResult = await db.query<{ slug: string }>(
            'SELECT slug FROM agent_registry WHERE id = $1',
            [request.agent_id],
        );
        if (agentResult.rows.length === 0) {
            throw new Error(`Agent ${request.agent_id} not found in registry (digest dispatch)`);
        }
        const agentSlug = agentResult.rows[0].slug;

        // Digest dispatch creates an execution_sessions record
        const sessionId = randomUUID();
        const result = await db.query(
            `INSERT INTO execution_sessions
             (id, workspace_id, agent_slug, status, trigger_type, user_prompt, started_at, created_at)
             SELECT $1, w.id, $2, 'completed', 'heartbeat', $3, NOW(), NOW()
             FROM workspaces w WHERE w.user_id = $4 LIMIT 1
             RETURNING id`,
            [sessionId, agentSlug, request.prompt.slice(0, 500), request.user_id],
        );
        if (result.rows.length === 0) {
            throw new Error(`Digest dispatch failed: no workspace found for user ${request.user_id}`);
        }
        return { tokens_used: 0, outcome: 'success' };
    };

    // Load digest configs from DB (user_preferences or digest_configs table)
    loadDigestConfigs(db).then((configs) => {
        if (configs.length === 0) {
            log.info('Digest scheduler started (no digest configs found)');
            return;
        }
        return digestSchedulerInstance!.start(dispatchFn, configs);
    }).then(() => {
        log.info('Digest scheduler started');
    }).catch((err) => {
        log.error('Digest scheduler failed to start', { error: err instanceof Error ? err.message : String(err) });
    });
}

async function loadDigestConfigs(db: ExecutionDatabase): Promise<DailyDigestConfig[]> {
    // Query for users with digest preferences enabled
    // Falls back to empty array if table doesn't exist yet
    try {
        const result = await db.query<{
            user_id: string; enabled: boolean;
            standup_cron: string; report_cron: string;
            timezone: string; skip_on_no_activity: boolean;
            xerus_agent_id: number; default_channel_id: string | null;
        }>(
            `SELECT user_id, enabled, standup_cron, report_cron, timezone,
                    skip_on_no_activity, xerus_agent_id, default_channel_id
             FROM digest_configs WHERE enabled = true`,
        );
        return result.rows;
    } catch (err: unknown) {
        const pgCode = (err as { code?: string })?.code;
        if (pgCode === '42P01') {
            // digest_configs table does not exist yet
            return [];
        }
        throw err;
    }
}

