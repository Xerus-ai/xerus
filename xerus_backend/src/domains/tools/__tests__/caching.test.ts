// Integration Tests: Pipedream Apps Caching System
// Tests database caching, pagination, search, and sync functionality

import { toolsRepository } from '../repository';
import { toolsService } from '../service';
import { query } from '../../../database/connection';

describe('Pipedream Apps Caching System', () => {
    beforeAll(async () => {
        const syncMetadata = await toolsRepository.getSyncMetadata();
        if (syncMetadata.sync_status !== 'success' || syncMetadata.total_apps === 0) {
            console.log('Running initial sync...');
            await toolsService.syncPipedreamApps();
        }
    });

    describe('Repository: listAppsFromDB', () => {
        it('should return paginated apps from database', async () => {
            const result = await toolsRepository.listAppsFromDB({
                page: 1,
                limit: 20,
            });

            expect(result.apps).toBeDefined();
            expect(result.apps.length).toBeGreaterThan(0);
            expect(result.apps.length).toBeLessThanOrEqual(20);

            expect(result.pagination).toBeDefined();
            expect(result.pagination.page).toBe(1);
            expect(result.pagination.limit).toBe(20);
            expect(result.pagination.total).toBeGreaterThan(0);
            expect(result.pagination.total_pages).toBeGreaterThan(0);

            const firstApp = result.apps[0];
            expect(firstApp.name_slug).toBeDefined();
            expect(firstApp.name).toBeDefined();
        });

        it('should support pagination', async () => {
            const page1 = await toolsRepository.listAppsFromDB({ page: 1, limit: 10 });
            const page2 = await toolsRepository.listAppsFromDB({ page: 2, limit: 10 });

            expect(page1.apps).toBeDefined();
            expect(page2.apps).toBeDefined();

            expect(page1.pagination.page).toBe(1);
            expect(page2.pagination.page).toBe(2);

            expect(page1.apps[0].name_slug).not.toBe(page2.apps[0].name_slug);
        });

        it('should support full-text search', async () => {
            const result = await toolsRepository.listAppsFromDB({
                page: 1,
                limit: 20,
                search: 'form',
            });

            expect(result.apps.length).toBeGreaterThan(0);

            const matchesSearch = result.apps.some(
                app =>
                    app.name.toLowerCase().includes('form') ||
                    (app.description && app.description.toLowerCase().includes('form'))
            );
            expect(matchesSearch).toBe(true);
        });

        it('should support category filtering', async () => {
            const allAppsResult = await toolsRepository.listAppsFromDB({
                page: 1,
                limit: 100,
            });

            const appWithCategories = allAppsResult.apps.find(app => app.categories && app.categories.length > 0);

            if (appWithCategories && appWithCategories.categories) {
                const testCategory = appWithCategories.categories[0];

                const result = await toolsRepository.listAppsFromDB({
                    page: 1,
                    limit: 20,
                    categories: [testCategory],
                });

                expect(result.apps.length).toBeGreaterThan(0);
                const hasCategory = result.apps.some(app => app.categories?.includes(testCategory));
                expect(hasCategory).toBe(true);
            }
        });

        it('should handle empty results gracefully', async () => {
            const result = await toolsRepository.listAppsFromDB({
                page: 1,
                limit: 20,
                search: 'nonexistentapp12345xyz',
            });

            expect(result.apps).toBeDefined();
            expect(result.apps.length).toBe(0);
            expect(result.pagination.total).toBe(0);
            expect(result.pagination.total_pages).toBe(0);
        });
    });

    describe('Repository: upsertApp', () => {
        const testApp = {
            name_slug: 'test-app-123',
            name: 'Test App',
            description: 'Test description',
            auth_type: 'oauth2',
            img_src: 'https://example.com/icon.png',
            categories: ['testing', 'development'],
            featured: true,
            featured_weight: 100,
        };

        afterEach(async () => {
            await query('DELETE FROM pipedream_apps WHERE name_slug = $1', [testApp.name_slug]);
        });

        it('should insert new app', async () => {
            await toolsRepository.upsertApp(testApp);

            const result = await query('SELECT * FROM pipedream_apps WHERE name_slug = $1', [testApp.name_slug]);

            expect(result.rows.length).toBe(1);
            expect(result.rows[0].name_slug).toBe(testApp.name_slug);
            expect(result.rows[0].name).toBe(testApp.name);
            expect(result.rows[0].description).toBe(testApp.description);
        });

        it('should update existing app on conflict', async () => {
            await toolsRepository.upsertApp(testApp);

            const updatedApp = {
                ...testApp,
                name: 'Updated Test App',
                description: 'Updated description',
            };

            await toolsRepository.upsertApp(updatedApp);

            const result = await query('SELECT * FROM pipedream_apps WHERE name_slug = $1', [testApp.name_slug]);

            expect(result.rows.length).toBe(1);
            expect(result.rows[0].name).toBe('Updated Test App');
            expect(result.rows[0].description).toBe('Updated description');
        });
    });

    describe('Repository: Sync Metadata', () => {
        it('should update sync metadata', async () => {
            await toolsRepository.updateSyncMetadata('syncing');
            let metadata = await toolsRepository.getSyncMetadata();
            expect(metadata.sync_status).toBe('syncing');

            await toolsRepository.updateSyncMetadata('success', 100);
            metadata = await toolsRepository.getSyncMetadata();
            expect(metadata.sync_status).toBe('success');
            expect(metadata.total_apps).toBe(100);
            expect(metadata.last_sync_at).not.toBeNull();
        });

        it('should handle failed sync status', async () => {
            await toolsRepository.updateSyncMetadata('failed', undefined, 'Test error');
            const metadata = await toolsRepository.getSyncMetadata();
            expect(metadata.sync_status).toBe('failed');
            expect(metadata.error).toBe('Test error');
        });

        it('should get sync metadata', async () => {
            const metadata = await toolsRepository.getSyncMetadata();
            expect(metadata).toBeDefined();
            expect(metadata.sync_status).toBeDefined();
            expect(['pending', 'syncing', 'success', 'failed']).toContain(metadata.sync_status);
        });
    });

    describe('Service: listAppsFromDB', () => {
        it('should return apps with pagination via service', async () => {
            const result = await toolsService.listAppsFromDB({
                page: 1,
                limit: 20,
            });

            expect(result.apps).toBeDefined();
            expect(result.pagination).toBeDefined();
            expect(result.apps.length).toBeGreaterThan(0);
        });

        it('should validate input parameters', async () => {
            await expect(
                toolsService.listAppsFromDB({
                    page: -1,
                    limit: 20,
                })
            ).rejects.toThrow();

            await expect(
                toolsService.listAppsFromDB({
                    page: 1,
                    limit: 200,
                })
            ).rejects.toThrow();
        });
    });

    describe('Service: syncPipedreamApps', () => {
        it('should sync apps and return statistics', async () => {
            const result = await toolsService.syncPipedreamApps();

            expect(result.synced).toBeGreaterThan(0);
            expect(result.failed).toBeGreaterThanOrEqual(0);
            expect(result.duration_ms).toBeGreaterThan(0);
        }, 180000);
    });

    describe('Performance: Database vs API', () => {
        it('should retrieve apps from database faster than API', async () => {
            const dbStart = Date.now();
            await toolsService.listAppsFromDB({ page: 1, limit: 20 });
            const dbDuration = Date.now() - dbStart;

            const apiStart = Date.now();
            await toolsService.listApps({ page: 1, limit: 20 });
            const apiDuration = Date.now() - apiStart;

            console.log(`Database: ${dbDuration}ms, API: ${apiDuration}ms`);
            expect(dbDuration).toBeLessThan(apiDuration);
            expect(dbDuration).toBeLessThan(1000);
        }, 180000);
    });
});
