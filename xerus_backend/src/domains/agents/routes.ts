// Agent Domain Routes
// REST API endpoints for agent CRUD operations.
// Source of truth: filesystem (config.json) + agent_registry (ID/slug mapping).
// Split into sub-routers: agent-crud, agent-tools, agent-kb, agent-heartbeat.

import { Router } from 'express';
import { agentService, agentToolsService, agentKBService, agentMarketplaceService } from './service';
import type { SandboxService } from '../execution/sandbox/sandbox.service';
import { DriveService } from '../drive/drive.service';
import { AgentFilesystemRepository } from './agent-filesystem.repository';
import { query } from '../../database/connection';
import type { WorkspaceSyncDeps } from './agent-workspace-sync';

import agentCrudRouter from './agent-crud.routes';
import agentToolsRouter from './agent-tools.routes';
import agentKbRouter from './agent-kb.routes';
import agentHeartbeatRouter from './agent-heartbeat.routes';
import agentImportRouter from './agent-import.routes';

// -----------------------------------------------------------------------------
// Dependency Injection for Workspace Sync
// -----------------------------------------------------------------------------

export interface AgentRoutesDeps {
    sandboxService: SandboxService;
}

let routesDeps: AgentRoutesDeps | null = null;

let sharedFsRepo: AgentFilesystemRepository | null = null;

export function getSharedFsRepo(): AgentFilesystemRepository {
    if (!sharedFsRepo) {
        throw new Error('AgentFilesystemRepository not initialized. Call setAgentRoutesDeps() first.');
    }
    return sharedFsRepo;
}

export function setAgentRoutesDeps(d: AgentRoutesDeps): void {
    routesDeps = d;

    // Initialize the shared filesystem repository for all agent services
    const driveService = new DriveService(d.sandboxService);
    sharedFsRepo = new AgentFilesystemRepository(driveService);
    agentService.setFilesystemRepo(sharedFsRepo);
    agentToolsService.setFilesystemRepo(sharedFsRepo);
    agentKBService.setFilesystemRepo(sharedFsRepo);
    agentMarketplaceService.setFilesystemRepo(sharedFsRepo);
}

export function getSyncDeps(): WorkspaceSyncDeps {
    if (!routesDeps) {
        throw new Error('Agent routes dependencies not initialized. Call setAgentRoutesDeps() at startup.');
    }
    return {
        sandboxService: routesDeps.sandboxService,
        db: { query },
    };
}

// -----------------------------------------------------------------------------
// Mount Sub-Routers
// -----------------------------------------------------------------------------

const router = Router();

router.use('/', agentCrudRouter);
router.use('/', agentToolsRouter);
router.use('/', agentKbRouter);
router.use('/', agentHeartbeatRouter);
router.use('/', agentImportRouter);

export default router;
