import './config/env'; // Must be first — loads .env.local or .env.production

import express, { Application } from 'express';
import helmet from 'helmet';

import { logger } from './utils/logger';
import { requestMeta } from './middleware/request-meta';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { generalRateLimit } from './middleware/rate-limit';
import { shutdownSseAuth } from './middleware/sse-auth';
import { testConnection, warmPool } from './database/connection';
import { startAllJobs } from './jobs';
import { StorageService } from './domains/sandbox-infra/storage/storage.service';
import { S3BackupService } from './domains/sandbox-infra/storage/s3-backup.service';

import usersRoutes, { setUserRoutesDeps } from './domains/users/routes';
import adminRoutes from './routes/admin.routes';
import agentRoutes, { setAgentRoutesDeps } from './domains/agents/routes';
import { toolsRouter } from './domains/tools/routes';
import executeRoutes, { setExecutionService, setExecutionRoutesDeps } from './domains/execution/execution.routes';
import { internalMcpRouter } from './domains/platform-tools/internal-mcp';
import { setAgentFilesDeps } from './domains/execution/agent-files.routes';
import { setConversationRoutesDeps } from './domains/conversations/conversation.routes';
import { setScheduleRoutesDeps } from './domains/platform-tools/internal-mcp/schedule.routes';
import { setAgentManagementRoutesDeps } from './domains/platform-tools/internal-mcp/agent-management.routes';
import { setSessionControlRoutesDeps } from './domains/platform-tools/internal-mcp/session-control.routes';
import { setKnowledgeBaseRoutesDeps } from './domains/platform-tools/internal-mcp/knowledge-base.routes';
import { setChannelTaskRoutesDeps } from './domains/platform-tools/internal-mcp/channel-task.routes';
import { setSkillManagementRoutesDeps } from './domains/platform-tools/internal-mcp/skill-management.routes';
import { setSearchOutputsRoutesDeps } from './domains/platform-tools/internal-mcp/search-outputs.routes';
import { webhookReceiverRouter } from './domains/triggers';
import { ExecutionService, setExecutionApiKeyLookup } from './domains/execution/execution.service';
import { apiKeyService } from './domains/users/api-key-service';
import { query } from './database/connection';
import { PricingService } from './domains/execution/sdk/pricing.service';
import { SandboxService } from './domains/sandbox-infra/sandbox/sandbox.service';
import type { SandboxProvider } from './domains/sandbox-infra/sandbox/providers';
import { ExecutionQueueService } from './domains/execution/queue/execution-queue.service';
import { createCreditTracker } from './domains/credits/credit-tracker.service';
import { CreditService } from './domains/users/credit-service';
import { DatabaseUsageStore } from './domains/credits/usage-store';
import { inboxRoutes, setInboxRoutesDeps } from './domains/inbox';
import { companyRoutes, setCompanyRoutesDeps, taskRoutes, setTaskRoutesDeps } from './domains/company';
import { onboardingRoutes, setOnboardingDeps } from './domains/onboarding';
import { memoryRoutes } from './domains/memory';
import { modelsRoutes } from './domains/models';
import { driveRouter, setDriveDeps, DriveService } from './domains/drive';
import skillRoutes, { setSkillRoutesDeps, agentSkillsRouter } from './domains/skills/routes';
import { agentChannelsRouter, setAgentChannelsDeps } from './domains/agents/agent-channels.routes';
import inviteCodeRoutes from './domains/invite-codes/routes';
import { billingRoutes } from './domains/billing';
import { createMessageBridgeService } from './domains/inbox/messaging/message-bridge.service';
import { HITLHandler } from './domains/execution/hitl/hitl.handler';
import { HITLPauseRepositoryImpl } from './domains/execution/hitl/hitl-pause.repository';
import { ActiveStreamEmitter } from './domains/execution/hitl/active-stream-emitter';
import { sseRegistry } from './domains/execution/streaming/sse-registry';
import { createMemorySearchIndexService } from './domains/memory/git-memory/memory-search-index.service';

const log = logger('Server');

const app: Application = express();

// CORS configuration - must come before other middleware
if (!process.env.ALLOWED_ORIGINS && process.env.NODE_ENV === 'production') {
    throw new Error('ALLOWED_ORIGINS must be set in production');
}
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()) || ['http://localhost:3002'];

app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-User-ID, X-Firebase-UID, x-user-id, x-firebase-uid');
    res.setHeader('Access-Control-Expose-Headers', 'X-Agent-Running, X-Workspace-Path, X-Workspace-Editability, X-Workspace-Source');
    res.setHeader('Access-Control-Max-Age', '86400');

    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }
    next();
});

app.use(helmet());
// Webhook route needs raw body as Buffer for HMAC signature verification.
// Must come BEFORE express.json() which would parse the body into an object.
app.use('/api/v1/billing/webhooks/polar', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(requestMeta);

if (process.env.NODE_ENV !== 'test') {
    app.use(generalRateLimit);
}

app.get('/health', (_req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
    });
});

// API v1 routes
app.use('/api/v1/users', usersRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/agents', agentRoutes);
app.use('/api/v1/agents', agentSkillsRouter);
app.use('/api/v1/agents', agentChannelsRouter);
app.use('/api/v1/tools', toolsRouter);
app.use('/api/v1/execute', executeRoutes);
app.use('/api/v1/webhooks/triggers', webhookReceiverRouter);
app.use('/api/v1/inbox', inboxRoutes);
app.use('/api/v1/company', companyRoutes);
app.use('/api/v1/company', taskRoutes);
app.use('/api/v1', taskRoutes);
app.use('/api/v1/onboarding', onboardingRoutes);
app.use('/api/v1/memory', memoryRoutes);
app.use('/api/v1/models', modelsRoutes);
app.use('/api/v1/workspace', driveRouter);
app.use('/api/v1/skills', skillRoutes);
app.use('/api/v1/invite-codes', inviteCodeRoutes);
app.use('/api/v1/billing', billingRoutes);
app.use('/api/v1/internal/mcp', internalMcpRouter);

app.use(notFoundHandler);
app.use(errorHandler);

const PORT = parseInt(process.env.PORT || '5001', 10);

async function startServer(): Promise<void> {
    await testConnection();
    await warmPool();

    const server = app.listen(PORT, () => {
        log.info('Server running', { port: PORT });
        log.info('Environment', { env: process.env.NODE_ENV || 'development' });
    });

    // SSE streams are long-lived — disable Node.js timeouts that kill idle connections.
    // keepAliveTimeout=0 prevents Node from closing SSE streams after 5s of no data.
    // headersTimeout must be >= keepAliveTimeout.
    server.keepAliveTimeout = 0;
    server.headersTimeout = 0;

    // Crash diagnostics — capture unhandled rejections before they kill the process
    process.on('unhandledRejection', (reason, promise) => {
        log.error('Unhandled promise rejection', { reason: String(reason), promise: String(promise) });
    });

    process.on('uncaughtException', (err) => {
        log.error('Uncaught exception', err);
        process.exit(1);
    });

    // Graceful shutdown: clean up SSE sweep timer and close server
    process.on('SIGTERM', () => {
        log.info('SIGTERM received, cleaning up...');
        shutdownSseAuth();
        sseRegistry.shutdown();
        server.close();
    });

    // Initialize ExecutionService with production dependencies
    let sandboxProvider: SandboxProvider | undefined;
    try {
        const executionDb = {
            query: async <T>(sql: string, params?: unknown[]) => {
                const result = await query(sql, params);
                return { rows: result.rows as T[] };
            },
        };

        const sdkService = new PricingService(executionDb);
        await sdkService.loadPricing();
        const queueService = new ExecutionQueueService();
        queueService.startPeriodicCleanup();

        // Build S3 backup service if env vars are present (needed by SandboxService + DriveService)
        // Env vars: S3_BUCKET_NAME (bucket), S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY
        let backupService: S3BackupService | undefined;
        const s3Bucket = process.env.S3_BUCKET_NAME || process.env.S3_BUCKET;
        const s3Region = process.env.S3_REGION;
        if (s3Bucket && s3Region) {
            const storageService = new StorageService({
                bucket: s3Bucket,
                region: s3Region,
                accessKeyId: process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY,
                endpointUrl: process.env.S3_ENDPOINT_URL,
            });
            backupService = new S3BackupService({
                upload: storageService.upload.bind(storageService),
                download: storageService.download.bind(storageService),
                delete: storageService.delete.bind(storageService),
                list: storageService.list.bind(storageService),
                head: storageService.headObjectWithMetadata.bind(storageService),
            });
            log.info('S3BackupService initialized');
        } else {
            log.warn('S3_BUCKET or S3_REGION not set - S3 backup disabled');
        }

        const sandboxService = new SandboxService(executionDb, undefined, backupService);

        const usersCreditService = new CreditService();
        const creditTracker = createCreditTracker({
            creditService: {
                checkCredits: (userId: string, required: number) =>
                    usersCreditService.checkCredits(userId, required),
                deduct: async (userId: string, input: { amount: number }) => {
                    const result = await usersCreditService.deduct(userId, input);
                    return { balance: result.balance };
                },
                refund: async (userId: string, amount: number, description?: string) => {
                    const result = await usersCreditService.refund(userId, amount, description);
                    return { balance: result.balance };
                },
                getBalance: async (userId: string) => {
                    const result = await usersCreditService.getBalance(userId);
                    return { balance: result.balance };
                },
            },
            usageStore: new DatabaseUsageStore(),
        });

        // Memory search index (pgvector) - optional, requires OPENAI_API_KEY
        let memorySearchIndex = null;
        if (process.env.OPENAI_API_KEY) {
            memorySearchIndex = createMemorySearchIndexService();
            log.info('MemorySearchIndexService initialized (pgvector indexing enabled)');
        } else {
            log.warn('OPENAI_API_KEY not set - memory pgvector indexing disabled');
        }

        const messageBridge = createMessageBridgeService();

        // Wire SessionDispatcher: bridges inbox messaging -> execution sandbox sessions
        messageBridge.setSessionDispatcher({
            async sendToAgent(userId: string, agentSlug: string, message: string): Promise<boolean> {
                const handle = sandboxService.getAgentHandle(userId, agentSlug);
                if (!handle) return false;
                await handle.sendInput(message + '\n');
                return true;
            },
        });

        const activeStreamEmitter = new ActiveStreamEmitter();
        const hitlHandler = new HITLHandler({
            pauseRepository: new HITLPauseRepositoryImpl(),
            sseEmitter: activeStreamEmitter,
        });

        // Wire cross-domain API key lookup (execution -> users)
        setExecutionApiKeyLookup(apiKeyService);

        const executionService = new ExecutionService({
            sdkService,
            sandboxService,
            queueService,
            creditTracker,
            db: executionDb,
            memorySearchIndex,
            messageBridge,
            hitlHandler,
            activeStreamEmitter,
        });
        setExecutionService(executionService);
        setExecutionRoutesDeps({ sandboxService });
        setAgentFilesDeps({ sandboxService });
        setConversationRoutesDeps({ sandboxService });
        setInboxRoutesDeps({ sandboxService });
        setScheduleRoutesDeps({ sandboxService });
        setAgentManagementRoutesDeps({ sandboxService });
        setSessionControlRoutesDeps({ sandboxService });
        setKnowledgeBaseRoutesDeps({ sandboxService });
        setChannelTaskRoutesDeps({ sandboxService });
        setSkillManagementRoutesDeps({ sandboxService });
        setSearchOutputsRoutesDeps({ sandboxService });
        setAgentRoutesDeps({ sandboxService });
        setAgentChannelsDeps({ sandboxService });
        setTaskRoutesDeps({ sandboxService, executionService });
        setCompanyRoutesDeps({ sandboxService, messageBridge, executionService });
        setOnboardingDeps({ sandboxService });
        setUserRoutesDeps({ sandboxService });

        setDriveDeps(new DriveService(sandboxService, backupService), sandboxService);

        setSkillRoutesDeps({ sandboxService });

        // Wire billing revocation → sandbox pause
        const { billingService } = await import('./domains/billing');
        billingService.setRevocationHandler(async (userId: string) => {
            log.info('Pausing sandbox for revoked subscription', { user_id: userId });
            await sandboxService.pauseSandbox(userId);
        });

        sandboxProvider = sandboxService.getProvider();
        log.info('ExecutionService initialized');

        // Start background jobs with full dependencies
        try {
            startAllJobs({
                provider: sandboxProvider,
                sandboxService,
                backupService,
                db: executionDb,
            });
        } catch (error) {
            log.error('Failed to start background jobs', error instanceof Error ? error : new Error(String(error)));
            throw error;
        }
    } catch (error) {
        log.error('Failed to initialize ExecutionService', error instanceof Error ? error : new Error(String(error)));
        throw error;
    }
}

if (process.env.NODE_ENV !== 'test') {
    startServer();
}

export { app };
