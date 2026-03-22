// Tools Domain Repository Tests - Real Database
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

import { query } from '../../src/database/connection';
import { toolsRepository, ToolsRepository } from '../../src/domains/tools/repository';

const TEST_USER_ID = 'test_tools_repo_user';

async function createTestUser(userId: string): Promise<void> {
    const uniqueEmail = `${userId}_${Date.now()}_${Math.random().toString(36).substring(7)}@test.com`;
    await query(
        `
    INSERT INTO users (user_id, email, display_name)
    VALUES ($1, $2, $3)
    ON CONFLICT (user_id) DO UPDATE SET
      email = EXCLUDED.email,
      display_name = EXCLUDED.display_name
  `,
        [userId, uniqueEmail, 'Test User']
    );
}

async function cleanupTestData(): Promise<void> {
    await query("DELETE FROM connected_accounts WHERE app_slug LIKE 'test_%' OR user_id = $1", [TEST_USER_ID]);
    await query("DELETE FROM pipedream_apps WHERE name_slug LIKE 'test_%'");
}

async function seedTestApps(): Promise<void> {
    const testApps = [
        {
            name_slug: 'test_gmail',
            name: 'Gmail Test',
            description: 'Email management and automation tool for testing',
            auth_type: 'oauth2',
            img_src: 'https://example.com/gmail.png',
            categories: ['email', 'productivity'],
            featured: true,
            featured_weight: 100,
        },
        {
            name_slug: 'test_slack',
            name: 'Slack Test',
            description: 'Team communication platform for testing',
            auth_type: 'oauth2',
            img_src: 'https://example.com/slack.png',
            categories: ['communication', 'productivity'],
            featured: true,
            featured_weight: 90,
        },
        {
            name_slug: 'test_github',
            name: 'GitHub Test',
            description: 'Version control and collaboration platform',
            auth_type: 'oauth2',
            img_src: 'https://example.com/github.png',
            categories: ['developer-tools', 'productivity'],
            featured: false,
            featured_weight: null,
        },
        {
            name_slug: 'test_shopify',
            name: 'Shopify Test',
            description: 'E-commerce platform for online stores',
            auth_type: 'api_key',
            img_src: 'https://example.com/shopify.png',
            categories: ['ecommerce', 'sales'],
            featured: false,
            featured_weight: null,
        },
        {
            name_slug: 'test_stripe',
            name: 'Stripe Test',
            description: 'Payment processing and financial infrastructure',
            auth_type: 'api_key',
            img_src: 'https://example.com/stripe.png',
            categories: ['payment', 'finance'],
            featured: true,
            featured_weight: 85,
        },
    ];

    for (const app of testApps) {
        await query(
            `INSERT INTO pipedream_apps (name_slug, name, description, auth_type, img_src, categories, featured, featured_weight, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (name_slug) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         auth_type = EXCLUDED.auth_type,
         img_src = EXCLUDED.img_src,
         categories = EXCLUDED.categories,
         featured = EXCLUDED.featured,
         featured_weight = EXCLUDED.featured_weight,
         updated_at = NOW()`,
            [app.name_slug, app.name, app.description, app.auth_type, app.img_src, app.categories, app.featured, app.featured_weight]
        );
    }
}

describe('ToolsRepository - Real Database', () => {
    let repository: ToolsRepository;

    beforeAll(async () => {
        repository = toolsRepository;
        await cleanupTestData();
        await createTestUser(TEST_USER_ID);
        await seedTestApps();
    });

    afterAll(async () => {
        await cleanupTestData();
    });

    describe('saveConnection', () => {
        it('should insert a new connection and return it', async () => {
            const input = {
                user_id: TEST_USER_ID,
                pipedream_account_id: 'apn_test_' + Date.now(),
                app_slug: 'test_gmail',
                app_name: 'Gmail Test',
            };

            const result = await repository.saveConnection(input);

            expect(result.id).toBeDefined();
            expect(result.user_id).toBe(TEST_USER_ID);
            expect(result.app_slug).toBe('test_gmail');
            expect(result.app_name).toBe('Gmail Test');
            expect(result.pipedream_account_id).toBe(input.pipedream_account_id);
            expect(result.created_at).toBeInstanceOf(Date);
            expect(result.last_used_at).toBeNull();
        });
    });

    describe('getConnections', () => {
        it('should return all connections for a user', async () => {
            const timestamp = Date.now();
            const conn1 = await repository.saveConnection({
                user_id: TEST_USER_ID,
                pipedream_account_id: `apn_test_conn1_${timestamp}`,
                app_slug: 'test_gmail',
                app_name: 'Gmail Test',
            });

            const conn2 = await repository.saveConnection({
                user_id: TEST_USER_ID,
                pipedream_account_id: `apn_test_conn2_${timestamp}`,
                app_slug: 'test_slack',
                app_name: 'Slack Test',
            });

            const result = await repository.getConnections(TEST_USER_ID);

            expect(result.length).toBeGreaterThanOrEqual(2);
            const savedIds = [conn1.id, conn2.id];
            const foundConnections = result.filter(c => savedIds.includes(c.id));
            expect(foundConnections).toHaveLength(2);
        });

        it('should return empty array when user has no connections', async () => {
            const result = await repository.getConnections('user_nonexistent_' + Date.now());
            expect(result).toEqual([]);
        });
    });

    describe('getConnectionByPipedreamId', () => {
        it('should return connection by pipedream_account_id', async () => {
            const pipedreamId = 'apn_test_lookup_' + Date.now();
            const saved = await repository.saveConnection({
                user_id: TEST_USER_ID,
                pipedream_account_id: pipedreamId,
                app_slug: 'test_gmail',
                app_name: 'Gmail Test',
            });

            const result = await repository.getConnectionByPipedreamId(pipedreamId);

            expect(result).toBeDefined();
            expect(result?.id).toBe(saved.id);
            expect(result?.pipedream_account_id).toBe(pipedreamId);
        });

        it('should return null when connection not found', async () => {
            const result = await repository.getConnectionByPipedreamId('apn_notfound_' + Date.now());
            expect(result).toBeNull();
        });
    });

    describe('removeConnection', () => {
        it('should delete connection by pipedream_account_id', async () => {
            const pipedreamId = 'apn_test_delete_' + Date.now();
            await repository.saveConnection({
                user_id: TEST_USER_ID,
                pipedream_account_id: pipedreamId,
                app_slug: 'test_gmail',
                app_name: 'Gmail Test',
            });

            await repository.removeConnection(pipedreamId);

            const result = await repository.getConnectionByPipedreamId(pipedreamId);
            expect(result).toBeNull();
        });
    });

    describe('updateLastUsed', () => {
        it('should update last_used_at timestamp', async () => {
            const pipedreamId = 'apn_test_update_' + Date.now();
            const saved = await repository.saveConnection({
                user_id: TEST_USER_ID,
                pipedream_account_id: pipedreamId,
                app_slug: 'test_gmail',
                app_name: 'Gmail Test',
            });

            expect(saved.last_used_at).toBeNull();

            await repository.updateLastUsed(pipedreamId);

            const updated = await repository.getConnectionByPipedreamId(pipedreamId);
            expect(updated?.last_used_at).toBeInstanceOf(Date);
            expect(updated?.last_used_at).not.toBeNull();
        });
    });

    describe('listAppsFromDB - Search and Pagination', () => {
        describe('pagination', () => {
            it('should return apps with default pagination', async () => {
                const result = await repository.listAppsFromDB({});

                expect(result.apps).toBeDefined();
                expect(Array.isArray(result.apps)).toBe(true);
                expect(result.apps.length).toBeGreaterThan(0);
                expect(result.pagination).toBeDefined();
                expect(result.pagination.page).toBe(1);
                expect(result.pagination.limit).toBe(20);
                expect(result.pagination.total).toBeGreaterThanOrEqual(5);
                expect(result.pagination.total_pages).toBeGreaterThanOrEqual(1);
                expect(typeof result.pagination.has_more).toBe('boolean');
            });

            it('should paginate results correctly', async () => {
                const page1 = await repository.listAppsFromDB({ page: 1, limit: 2 });
                const page2 = await repository.listAppsFromDB({ page: 2, limit: 2 });

                expect(page1.apps).toHaveLength(2);
                expect(page2.apps).toHaveLength(2);
                expect(page1.apps[0].name_slug).not.toBe(page2.apps[0].name_slug);
                expect(page1.pagination.page).toBe(1);
                expect(page2.pagination.page).toBe(2);
                expect(page1.pagination.total).toBe(page2.pagination.total);
            });

            it('should handle custom page size', async () => {
                const result = await repository.listAppsFromDB({ page: 1, limit: 3 });

                expect(result.apps.length).toBeLessThanOrEqual(3);
                expect(result.pagination.limit).toBe(3);
            });

            it('should return empty array for page beyond total pages', async () => {
                const result = await repository.listAppsFromDB({ page: 999, limit: 20 });

                expect(result.apps).toHaveLength(0);
                expect(result.pagination.page).toBe(999);
                expect(result.pagination.has_more).toBe(false);
            });
        });

        describe('search functionality', () => {
            it('should search apps by name using full-text search', async () => {
                const result = await repository.listAppsFromDB({ search: 'gmail' });

                expect(result.apps.length).toBeGreaterThan(0);
                const gmailApp = result.apps.find(app => app.name_slug === 'test_gmail');
                expect(gmailApp).toBeDefined();
                expect(gmailApp?.name).toContain('Gmail');
            });

            it('should search apps by description using full-text search', async () => {
                const result = await repository.listAppsFromDB({ search: 'payment' });

                expect(result.apps.length).toBeGreaterThan(0);
                const stripeApp = result.apps.find(app => app.name_slug === 'test_stripe');
                expect(stripeApp).toBeDefined();
                expect(stripeApp?.description?.toLowerCase()).toContain('payment');
            });

            it('should return empty results for non-matching search', async () => {
                const result = await repository.listAppsFromDB({ search: 'nonexistentapp12345' });

                expect(result.apps).toHaveLength(0);
                expect(result.pagination.total).toBe(0);
            });

            it('should handle search with pagination', async () => {
                const result = await repository.listAppsFromDB({ search: 'test', page: 1, limit: 2 });

                expect(result.apps.length).toBeLessThanOrEqual(2);
                expect(result.pagination.limit).toBe(2);
            });
        });

        describe('category filtering', () => {
            it('should filter apps by category', async () => {
                const result = await repository.listAppsFromDB({ category: 'productivity' });

                expect(result.apps.length).toBeGreaterThan(0);
                result.apps.forEach(app => {
                    expect(app.categories).toContain('productivity');
                });
            });

            it('should filter apps by payment category', async () => {
                const result = await repository.listAppsFromDB({ category: 'payment' });

                expect(result.apps.length).toBeGreaterThan(0);
                const stripeApp = result.apps.find(app => app.name_slug === 'test_stripe');
                expect(stripeApp).toBeDefined();
            });

            it('should return empty results for non-existing category', async () => {
                const result = await repository.listAppsFromDB({ category: 'nonexistent_category' });

                expect(result.apps).toHaveLength(0);
                expect(result.pagination.total).toBe(0);
            });
        });

        describe('combined filters', () => {
            it('should combine search and category filters', async () => {
                const result = await repository.listAppsFromDB({ search: 'platform', category: 'productivity' });

                expect(result.apps.length).toBeGreaterThan(0);
                result.apps.forEach(app => {
                    expect(app.categories).toContain('productivity');
                });
            });

            it('should combine search, category, and pagination', async () => {
                const result = await repository.listAppsFromDB({
                    search: 'test',
                    category: 'productivity',
                    page: 1,
                    limit: 2,
                });

                expect(result.apps.length).toBeLessThanOrEqual(2);
                expect(result.pagination.limit).toBe(2);
                result.apps.forEach(app => {
                    expect(app.categories).toContain('productivity');
                });
            });
        });

        describe('sorting', () => {
            it('should sort featured apps first, then by name', async () => {
                const result = await repository.listAppsFromDB({});

                const testApps = result.apps.filter(app => app.name_slug.startsWith('test_'));
                if (testApps.length > 1) {
                    const featuredApps = testApps.filter(app => app.featured_weight !== undefined && app.featured_weight !== null);
                    const nonFeaturedApps = testApps.filter(app => app.featured_weight === undefined || app.featured_weight === null);

                    if (featuredApps.length > 0) {
                        const firstFeaturedIndex = testApps.findIndex(app => featuredApps.includes(app));
                        const firstNonFeaturedIndex = testApps.findIndex(app => nonFeaturedApps.includes(app));

                        if (firstFeaturedIndex >= 0 && firstNonFeaturedIndex >= 0) {
                            expect(firstFeaturedIndex).toBeLessThan(firstNonFeaturedIndex);
                        }
                    }
                }
            });
        });
    });
});
