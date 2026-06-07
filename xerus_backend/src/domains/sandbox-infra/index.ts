// Sandbox Infrastructure Domain - Public API (barrel)
// Extracted from execution domain: sandbox, workspace, scaffold, storage, metadata-sync

export * from './sandbox';
export * from './storage';
export * from './workspace';

export {
    MetadataSyncService,
    createMetadataSyncService,
    SYNC_ENTITY_TYPES,
} from './metadata-sync';
export type {
    SyncEntityType,
    MetadataSyncEvent,
    SyncResult as MetadataSyncResult,
    SyncDatabase as MetadataSyncDatabase,
    SyncQueryResult,
} from './metadata-sync';

// Scaffold exports
export {
    buildScaffoldPayload,
    buildScaffoldFilesFromRow,
} from './scaffold/scaffold-payload.service';
export type { ScaffoldPayloadDeps } from './scaffold/scaffold-payload.service';
export { scaffoldAgent } from './scaffold/scaffold-writer';
