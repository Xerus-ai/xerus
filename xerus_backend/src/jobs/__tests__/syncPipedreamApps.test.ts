// Test: Pipedream Apps Sync Job
// Validates sync functionality and error handling

import { toolsService } from '../../domains/tools/service';
import { toolsRepository } from '../../domains/tools/repository';

describe('Pipedream Apps Sync', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should sync apps successfully', async () => {
        const result = await toolsService.syncPipedreamApps();

        expect(result.synced).toBeGreaterThan(0);
        expect(result.failed).toBe(0);
        expect(result.duration_ms).toBeGreaterThan(0);

        const metadata = await toolsRepository.getSyncMetadata();
        expect(metadata.sync_status).toBe('success');
        expect(metadata.total_apps).toBe(result.synced);
        expect(metadata.last_sync_at).not.toBeNull();
    }, 120000);

    it('should update sync metadata during sync', async () => {
        const metadataBefore = await toolsRepository.getSyncMetadata();

        await toolsService.syncPipedreamApps();

        const metadataAfter = await toolsRepository.getSyncMetadata();
        expect(metadataAfter.last_sync_at).not.toEqual(metadataBefore.last_sync_at);
        expect(metadataAfter.sync_status).toBe('success');
    }, 120000);
});
