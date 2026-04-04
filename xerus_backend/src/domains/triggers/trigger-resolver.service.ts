// Trigger Resolver Service
// Determines which provider can handle a trigger for a specific user

import { pool } from '../../database/connection';
import type {
    TriggerProvider,
    ProviderResolutionResult,
    TriggerProviderRow,
} from './trigger.types';
import { type TriggerSourceAdapter, triggerAdapterRegistry } from './trigger-source.adapter';
import { TriggerResolutionError, TriggerProviderNotFoundError, TriggerAdapterError } from './trigger.errors';

// -----------------------------------------------------------------------------
// Trigger Resolver Service
// -----------------------------------------------------------------------------

/**
 * TriggerResolver determines which provider should handle a trigger for a user.
 *
 * Resolution order:
 * 1. Check if user has the app connected via Pipedream
 * 2. Check if app supports native webhooks and user has native connection
 * 3. Check future providers (Zapier, custom)
 * 4. If no connection found, throw error
 */
export class TriggerResolver {
    /**
     * Resolve which provider can deliver events for a user's app.
     *
     * @param userId - User ID
     * @param app - App identifier (gmail, github, etc.)
     * @param eventType - Event type to listen for
     * @returns Provider, provider ID, and account ID
     * @throws TriggerResolutionError if no provider can handle this trigger
     */
    async resolve(
        userId: string,
        app: string,
        eventType: string
    ): Promise<ProviderResolutionResult> {
        // Check Pipedream first (most common)
        const pipedreamResult = await this.checkPipedreamConnection(userId, app);
        if (pipedreamResult) {
            return pipedreamResult;
        }

        // Check native webhooks
        const nativeResult = await this.checkNativeConnection(userId, app);
        if (nativeResult) {
            return nativeResult;
        }

        throw new TriggerResolutionError(
            app,
            eventType,
            `No connected account found for ${app}. Connect the app via Pipedream or native integration.`
        );
    }

    /**
     * Get the adapter for a resolved provider.
     *
     * @param provider - Provider name
     * @returns TriggerSourceAdapter
     * @throws TriggerProviderNotFoundError if adapter not registered
     */
    getAdapter(provider: TriggerProvider): TriggerSourceAdapter {
        if (!triggerAdapterRegistry.has(provider)) {
            throw new TriggerProviderNotFoundError(provider);
        }
        return triggerAdapterRegistry.get(provider);
    }

    /**
     * List all apps a user has connected (across all providers).
     *
     * @param userId - User ID
     * @returns Array of app slugs
     */
    async listConnectedApps(userId: string): Promise<string[]> {
        const apps: Set<string> = new Set();

        // Get Pipedream connected apps
        const pipedreamApps = await this.getPipedreamConnectedApps(userId);
        pipedreamApps.forEach((app) => apps.add(app));

        return Array.from(apps);
    }

    /**
     * Get provider details from the database.
     *
     * @param slug - Provider slug
     * @returns Provider row or null
     */
    async getProvider(slug: TriggerProvider): Promise<TriggerProviderRow | null> {
        const result = await pool.query<TriggerProviderRow>(
            `SELECT id, slug, display_name, adapter_config, is_active, created_at
             FROM trigger_providers
             WHERE slug = $1 AND is_active = true`,
            [slug]
        );
        return result.rows[0] || null;
    }

    /**
     * Get all active providers.
     *
     * @returns Array of active provider rows
     */
    async getActiveProviders(): Promise<TriggerProviderRow[]> {
        const result = await pool.query<TriggerProviderRow>(
            `SELECT id, slug, display_name, adapter_config, is_active, created_at
             FROM trigger_providers
             WHERE is_active = true
             ORDER BY slug`
        );
        return result.rows;
    }

    // -------------------------------------------------------------------------
    // Private: Provider-specific connection checks
    // -------------------------------------------------------------------------

    private async checkPipedreamConnection(
        userId: string,
        app: string
    ): Promise<ProviderResolutionResult | null> {
        // Query connected_accounts to check if app is connected via Pipedream
        const result = await pool.query<{ pipedream_account_id: string }>(
            `SELECT pipedream_account_id
             FROM connected_accounts
             WHERE user_id = $1 AND app_slug = $2
             LIMIT 1`,
            [userId, app]
        );

        if (result.rows.length === 0) {
            return null;
        }

        const provider = await this.getProvider('pipedream');
        if (!provider) {
            return null;
        }

        return {
            provider: 'pipedream',
            provider_id: provider.id,
            account_id: result.rows[0].pipedream_account_id,
        };
    }

    private async checkNativeConnection(
        userId: string,
        app: string
    ): Promise<ProviderResolutionResult | null> {
        // Get native provider and check if app is in supported_apps list from adapter_config
        const provider = await this.getProvider('native');
        if (!provider) {
            return null;
        }

        // Check if this app is supported by native webhooks (from adapter_config)
        const supportedApps = provider.adapter_config.supported_apps as string[];
        if (!Array.isArray(supportedApps) || supportedApps.length === 0) {
            throw new TriggerAdapterError('native', 'No supported_apps configured in adapter_config');
        }
        if (!supportedApps.includes(app)) {
            return null;
        }

        // Check if user has a connected account for this app
        // Native connections also go through connected_accounts
        const result = await pool.query<{ pipedream_account_id: string }>(
            `SELECT pipedream_account_id
             FROM connected_accounts
             WHERE user_id = $1 AND app_slug = $2
             LIMIT 1`,
            [userId, app]
        );

        if (result.rows.length === 0) {
            return null;
        }

        return {
            provider: 'native',
            provider_id: provider.id,
            account_id: result.rows[0].pipedream_account_id,
        };
    }

    private async getPipedreamConnectedApps(userId: string): Promise<string[]> {
        const result = await pool.query<{ app_slug: string }>(
            `SELECT DISTINCT app_slug
             FROM connected_accounts
             WHERE user_id = $1`,
            [userId]
        );
        return result.rows.map((row: { app_slug: string }) => row.app_slug);
    }
}

// Singleton instance
export const triggerResolver = new TriggerResolver();
