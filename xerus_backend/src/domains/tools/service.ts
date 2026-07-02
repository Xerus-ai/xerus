// Tools Domain Service
// Business logic for Pipedream Connect integration

import { getPipedreamClient } from '../../shared/clients/pipedream';
import { toolsRepository } from './repository';
import { reconcileConnectedAccounts } from './connection-reconciler';
import { toolValidator } from './validators';
import { toolsCache } from '../../shared/cache/tools-cache';
import { ToolNotConnectedError, ToolExecutionError, UnauthorizedAccessError } from './errors';
import { NotFoundError } from '../../utils/errors';
import { logger } from '../../utils/logger';

const log = logger('ToolsService');
import type {
    ListAppsInput,
    ListAppsResponse,
    ListAppsFromDBInput,
    ListAppsFromDBResponse,
    StartConnectionInput,
    StartConnectionResponse,
    GetConnectedAccountsInput,
    DisconnectAccountInput,
    ListActionsInput,
    ListActionsResponse,
    GetActionInput,
    ExecuteActionInput,
    ExecuteActionResponse,
    GetActionOptionsInput,
    ConnectedAccount,
    PipedreamAction,
    PipedreamApp,
} from './types';

export class ToolsService {
    // Lazy accessor — Pipedream is optional infrastructure, so we don't want
    // a missing PIPEDREAM_* env var to prevent the entire API from booting.
    // The error surfaces on first connector-tool call instead.
    private get pipedream() {
        return getPipedreamClient();
    }

    async listApps(input?: ListAppsInput): Promise<ListAppsResponse> {
        const validated = input ? toolValidator.validateListApps(input) : {};

        const page = validated.page || 1;
        const limit = validated.limit || 50;

        const allApps = await this.fetchPaginatedApps(validated.query);

        const totalApps = allApps.length;
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const paginatedApps = allApps.slice(startIndex, endIndex);
        const totalPages = Math.ceil(totalApps / limit);

        return {
            apps: paginatedApps,
            pagination: {
                total: totalApps,
                page,
                limit,
                total_pages: totalPages,
                has_more: page < totalPages,
            },
        };
    }

    async listAppsFromDB(input: ListAppsFromDBInput): Promise<ListAppsFromDBResponse> {
        const validated = toolValidator.validateListAppsFromDB(input);

        return await toolsRepository.listAppsFromDB(validated);
    }

    async getAppBySlug(appSlug: string): Promise<PipedreamApp> {
        const app = await toolsRepository.getAppBySlug(appSlug);
        if (!app) {
            throw new NotFoundError('Tool');
        }
        return app;
    }

    async startConnection(input: StartConnectionInput): Promise<StartConnectionResponse> {
        const validated = toolValidator.validateStartConnection(input);

        try {
            // Build params object - only include webhook_uri if provided
            const connectTokenParams: {
                external_user_id: string;
                allowed_origins?: string[];
                webhook_uri?: string;
            } = {
                external_user_id: validated.user_id,
                allowed_origins: validated.allowed_origins,
            };

            if (validated.webhook_url) {
                connectTokenParams.webhook_uri = validated.webhook_url;
            }

            const token = await this.pipedream.createConnectToken(connectTokenParams);

            // Verify we got a valid token
            if (!token.token || !token.connect_link_url) {
                throw new Error('Invalid token response from Pipedream');
            }

            return {
                connect_url: token.connect_link_url,
                expires_at: token.expires_at,
                token: token.token,
            };
        } catch (error) {
            log.error('Failed to create connect token', error instanceof Error ? error : new Error(String(error)));
            throw error;
        }
    }

    async getConnectedAccounts(input: GetConnectedAccountsInput): Promise<ConnectedAccount[]> {
        const validated = toolValidator.validateGetConnectedAccounts(input);

        const connections = await toolsRepository.getConnections(validated.user_id);

        if (validated.app_slug) {
            return connections.filter(c => c.app_slug === validated.app_slug);
        }

        return connections;
    }

    /**
     * Reconcile a user's connected_accounts against Pipedream (source of truth) so the
     * table converges on every sandbox MCP sync and backfills connections dropped by
     * fire-and-forget webhooks. Delegates to connection-reconciler; see that module.
     */
    async reconcileConnectedAccounts(input: { user_id: string }): Promise<{ added: number; removed: number; total: number }> {
        return reconcileConnectedAccounts(this.pipedream, input.user_id);
    }

    async disconnectAccount(input: DisconnectAccountInput): Promise<void> {
        const validated = toolValidator.validateDisconnectAccount(input);

        const connection = await toolsRepository.getConnectionByPipedreamId(validated.pipedream_account_id);

        if (connection) {
            if (connection.user_id !== validated.user_id) {
                throw new UnauthorizedAccessError(
                    `account ${validated.pipedream_account_id}`,
                    validated.user_id,
                    'You do not have permission to disconnect this account'
                );
            }
        }

        try {
            await this.pipedream.deleteAccount(validated.pipedream_account_id);
        } catch (error) {
            log.error('Failed to delete from Pipedream', error instanceof Error ? error : new Error(String(error)));
            throw new Error('Failed to disconnect account from Pipedream. Please try again.');
        }

        if (connection) {
            await toolsRepository.removeConnection(validated.pipedream_account_id);
        }
    }

    async listActions(input: ListActionsInput): Promise<ListActionsResponse> {
        const validated = toolValidator.validateListActions(input);

        const cacheKey = `${validated.app_slug}:${validated.query || ''}:${validated.limit || ''}`;
        const cached = toolsCache.getActions(cacheKey);
        if (cached) {
            log.debug('Cache HIT for actions', { app_slug: validated.app_slug });
            return {
                actions: cached,
                total: cached.length,
            };
        }

        log.debug('Cache MISS for actions', { app_slug: validated.app_slug });
        const response = await this.pipedream.getComponents({
            app: validated.app_slug,
            componentType: 'action',
            q: validated.query,
        });

        toolsCache.setActions(cacheKey, response.data);

        return {
            actions: response.data,
            total: response.data.length,
        };
    }

    async listTriggers(input: ListActionsInput): Promise<ListActionsResponse> {
        const validated = toolValidator.validateListActions(input);

        const cacheKey = `${validated.app_slug}:${validated.query || ''}:${validated.limit || ''}`;
        const cached = toolsCache.getTriggers(cacheKey);
        if (cached) {
            log.debug('Cache HIT for triggers', { app_slug: validated.app_slug });
            return {
                actions: cached,
                total: cached.length,
            };
        }

        log.debug('Cache MISS for triggers', { app_slug: validated.app_slug });
        const response = await this.pipedream.getComponents({
            app: validated.app_slug,
            componentType: 'trigger',
            q: validated.query,
        });

        toolsCache.setTriggers(cacheKey, response.data);

        return {
            actions: response.data,
            total: response.data.length,
        };
    }

    async getAction(input: GetActionInput): Promise<PipedreamAction> {
        const validated = toolValidator.validateGetAction(input);

        const response = await this.pipedream.getComponent({
            key: validated.action_key,
        });

        return response.data;
    }

    async executeAction(input: ExecuteActionInput): Promise<ExecuteActionResponse> {
        const validated = toolValidator.validateExecuteAction(input);

        const connection = await toolsRepository.getConnectionByPipedreamId(validated.pipedream_account_id);
        if (!connection) {
            throw new ToolNotConnectedError(validated.pipedream_account_id, validated.user_id);
        }

        const app_slug = validated.action_key.split('-')[0];
        const startTime = Date.now();

        try {
            const configuredProps = {
                [app_slug]: { authProvisionId: validated.pipedream_account_id },
                ...validated.params,
            };

            const result = await this.pipedream.runAction({
                externalUserId: validated.user_id,
                actionId: { key: validated.action_key },
                configuredProps,
            });

            const duration_ms = Date.now() - startTime;

            await toolsRepository.updateLastUsed(validated.pipedream_account_id);

            await toolsRepository.logExecution({
                agent_slug: null,
                app_slug,
                action_key: validated.action_key,
                input: validated.params,
                output: result.ret as Record<string, unknown>,
                success: true,
                duration_ms,
            });

            return {
                success: true,
                data: result.ret,
                logs: result.os as string[],
            };
        } catch (error) {
            const duration_ms = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';

            await toolsRepository.logExecution({
                agent_slug: null,
                app_slug,
                action_key: validated.action_key,
                input: validated.params,
                output: null,
                success: false,
                error: errorMessage,
                duration_ms,
            });

            throw new ToolExecutionError(validated.action_key, error as Error);
        }
    }

    async getActionOptions(input: GetActionOptionsInput) {
        const validated = toolValidator.validateGetActionOptions(input);

        const response = await this.pipedream.configureComponent({
            externalUserId: validated.user_id,
            componentId: { key: validated.action_key },
            propName: validated.prop_name,
            configuredProps: validated.configured_props,
        });

        return response.options;
    }

    async getToolStats(user_id: string, app_slug: string) {
        return await toolsRepository.getToolStats(user_id, app_slug);
    }

    private async fetchPaginatedApps(query?: string): Promise<PipedreamApp[]> {
        const allApps: PipedreamApp[] = [];
        let after: string | undefined;
        const MAX_PAGES = 500;
        let page = 0;
        do {
            const response = await this.pipedream.getApps({ q: query, after, limit: 100 });
            const data = response.data || [];
            allApps.push(...data);
            after = data.length > 0 ? response.page_info?.end_cursor : undefined;
            page++;
        } while (after && page < MAX_PAGES);
        return allApps;
    }

    async syncPipedreamApps(): Promise<{ synced: number; failed: number; duration_ms: number }> {
        const startTime = Date.now();
        let syncedCount = 0;
        let failedCount = 0;

        try {
            const currentSync = await toolsRepository.getSyncMetadata();
            if (currentSync.sync_status === 'syncing') {
                const staleCutoff = Date.now() - 30 * 60 * 1000;
                const lastSyncTime = currentSync.last_sync_at ? new Date(currentSync.last_sync_at).getTime() : 0;
                if (lastSyncTime > staleCutoff) {
                    throw new Error('Sync already in progress');
                }
                log.info('Detected stale sync (>30min), resetting before new sync');
                await toolsRepository.updateSyncMetadata('failed', undefined, 'Stale sync reset');
            }
            await toolsRepository.updateSyncMetadata('syncing');
            log.info('Starting Pipedream apps sync...');

            const allApps = await this.fetchPaginatedApps();
            log.info('Fetched apps from Pipedream', { count: allApps.length });

            for (const app of allApps) {
                try {
                    await toolsRepository.upsertApp(app);
                    syncedCount++;
                } catch (error) {
                    log.error('Failed to upsert app', { app_slug: app.name_slug, error: error instanceof Error ? error.message : String(error) });
                    failedCount++;
                }
            }

            await toolsRepository.updateSyncMetadata('success', syncedCount);
            const duration_ms = Date.now() - startTime;
            log.info('Sync completed', { synced: syncedCount, failed: failedCount, duration_ms });

            return { synced: syncedCount, failed: failedCount, duration_ms };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            await toolsRepository.updateSyncMetadata('failed', undefined, errorMessage);
            log.error('Failed to sync Pipedream apps', error instanceof Error ? error : new Error(String(error)));
            throw error;
        }
    }

    async hideApp(name_slug: string): Promise<void> {
        await toolsRepository.setAppVisibility(name_slug, true);
    }

    async showApp(name_slug: string): Promise<void> {
        await toolsRepository.setAppVisibility(name_slug, false);
    }

    async getHiddenApps(): Promise<Array<{ name_slug: string; name: string }>> {
        return await toolsRepository.getHiddenApps();
    }
}

export const toolsService = new ToolsService();
