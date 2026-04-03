#!/usr/bin/env ts-node
// Pipedream Apps Sync Script
// Fetches all apps from Pipedream API and syncs to database
// Usage: ts-node src/scripts/syncPipedreamApps.ts

import dotenv from 'dotenv';
dotenv.config();

import { toolsService } from '../domains/tools/service';
import { toolsRepository } from '../domains/tools/repository';
import { testConnection, closePool } from '../database/connection';
import { logger } from '../utils/logger';

const log = logger('SyncPipedreamApps');

async function syncApps() {
    log.info('Starting Pipedream apps sync...');

    try {
        await testConnection();

        log.info('Syncing apps from Pipedream API to database...');
        const result = await toolsService.syncPipedreamApps();

        log.info('Sync completed successfully', {
            synced: result.synced,
            errors: result.failed,
            duration_ms: result.duration_ms,
        });
    } catch (error) {
        log.error('Sync failed', error instanceof Error ? error : new Error(String(error)));
        await toolsRepository.updateSyncMetadata('failed', undefined, error instanceof Error ? error.message : String(error));
        process.exit(1);
    } finally {
        await closePool();
    }
}

syncApps();
