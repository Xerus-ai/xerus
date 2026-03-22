#!/usr/bin/env ts-node
// Pipedream Apps Sync Script
// Fetches all apps from Pipedream API and syncs to database
// Usage: ts-node src/scripts/syncPipedreamApps.ts

import dotenv from 'dotenv';
dotenv.config();

import { toolsService } from '../domains/tools/service';
import { toolsRepository } from '../domains/tools/repository';
import { testConnection, closePool } from '../database/connection';

async function syncApps() {
    console.log('Starting Pipedream apps sync...');

    try {
        await testConnection();

        console.log('Syncing apps from Pipedream API to database...');
        const result = await toolsService.syncPipedreamApps();

        console.log(`\nSync completed successfully!`);
        console.log(`Total apps synced: ${result.synced}`);
        console.log(`Errors: ${result.failed}`);
        console.log(`Duration: ${result.duration_ms}ms`);
    } catch (error) {
        console.error('Sync failed:', error);
        await toolsRepository.updateSyncMetadata('failed', undefined, error instanceof Error ? error.message : String(error));
        process.exit(1);
    } finally {
        await closePool();
    }
}

syncApps();
