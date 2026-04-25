// Agent Domain Routes
// REST API endpoints for agent CRUD operations.
// Source of truth: filesystem (config.json) + agent_registry (ID/slug mapping).
// Split into sub-routers: agent-crud, agent-tools, agent-import.
// Knowledge base assignment is unified under /workspace/connections (file_connections table).

import { Router } from 'express';
import { agentService, agentToolsService, agentMarketplaceService } from './service';
import type { SandboxService } from '../sandbox-infra/sandbox/sandbox.service';
import { DriveService } from '../drive/drive.service';
import { AgentFilesystemRepository } from './agent-filesystem.repository';

import agentCrudRouter from './agent-crud.routes';
import agentToolsRouter from './agent-tools.routes';
import agentImportRouter from './agent-import.routes';

// -----------------------------------------------------------------------------
// Dependency Injection for Workspace Sync
// -----------------------------------------------------------------------------

export interface AgentRoutesDeps {
    sandboxService: SandboxService;
}

let sharedFsRepo: AgentFilesystemRepository | null = null;

export function getSharedFsRepo(): AgentFilesystemRepository {
    if (!sharedFsRepo) {
        throw new Error('AgentFilesystemRepository not initialized. Call setAgentRoutesDeps() first.');
    }
    return sharedFsRepo;
}

export function setAgentRoutesDeps(d: AgentRoutesDeps): void {
    // Initialize the shared filesystem repository for all agent services
    const driveService = new DriveService(d.sandboxService);
    sharedFsRepo = new AgentFilesystemRepository(driveService);
    agentService.setFilesystemRepo(sharedFsRepo);
    agentToolsService.setFilesystemRepo(sharedFsRepo);
    agentMarketplaceService.setFilesystemRepo(sharedFsRepo);
}

// -----------------------------------------------------------------------------
// Mount Sub-Routers
// -----------------------------------------------------------------------------

const router = Router();

router.use('/', agentCrudRouter);
router.use('/', agentToolsRouter);
router.use('/', agentImportRouter);

export default router;
