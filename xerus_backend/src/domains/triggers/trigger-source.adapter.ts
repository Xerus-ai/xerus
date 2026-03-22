// Trigger Source Adapter Interface
// Provider-agnostic abstraction for trigger sources (Pipedream, native webhooks, etc.)

import type {
    NormalizedEvent,
    TriggerRegistration,
    TriggerRegistrationResult,
    TriggerDefinition,
    EventNormalizationMetadata,
    TriggerProvider,
} from '../heartbeat/normalized-event.types';

// -----------------------------------------------------------------------------
// Trigger Source Adapter Interface
// -----------------------------------------------------------------------------

/**
 * TriggerSourceAdapter is the provider-agnostic interface for trigger sources.
 *
 * Each provider (Pipedream, native webhooks, Zapier) implements this interface
 * to handle trigger registration, deregistration, and event normalization.
 *
 * The adapter pattern allows:
 * - Adding new providers without changing core heartbeat logic
 * - Provider-specific implementation details hidden behind common interface
 * - Consistent event format (NormalizedEvent) regardless of source
 */
export interface TriggerSourceAdapter {
    /**
     * Unique identifier for this provider (pipedream, native, zapier)
     */
    readonly provider: TriggerProvider;

    /**
     * Human-readable name for display purposes
     */
    readonly displayName: string;

    /**
     * List available triggers for a specific app.
     * Returns trigger definitions that can be registered.
     *
     * @param appSlug - App identifier (gmail, github, slack, etc.)
     * @returns Promise<TriggerDefinition[]> - Available triggers for the app
     * @throws TriggerAdapterError if provider is unavailable
     */
    listTriggers(appSlug: string): Promise<TriggerDefinition[]>;

    /**
     * Register a trigger to start listening for events.
     * Creates a webhook subscription with the external provider.
     *
     * @param config - Trigger registration configuration
     * @returns Promise<TriggerRegistrationResult> - External ID and webhook URL
     * @throws TriggerRegistrationError if registration fails
     */
    register(config: TriggerRegistration): Promise<TriggerRegistrationResult>;

    /**
     * Deregister a trigger to stop listening for events.
     * Removes the webhook subscription from the external provider.
     *
     * @param externalId - External trigger/subscription ID from register()
     * @throws TriggerDeregistrationError if cleanup fails
     */
    deregister(externalId: string): Promise<void>;

    /**
     * Normalize a raw webhook payload to the standard NormalizedEvent format.
     * Called when our webhook endpoint receives an event from this provider.
     *
     * @param rawEvent - Raw webhook payload from the provider
     * @param metadata - Context about the expected app and event type
     * @returns NormalizedEvent - Standardized event format
     * @throws EventNormalizationError if payload is invalid
     */
    normalize(rawEvent: unknown, metadata: EventNormalizationMetadata): NormalizedEvent;

    /**
     * Verify the signature of an incoming webhook request.
     * Optional - if not implemented, the webhook receiver rejects unsigned requests.
     */
    verifySignature?(req: import('express').Request): boolean;

    /**
     * Validate that the adapter is properly configured and can communicate
     * with the external provider.
     *
     * @returns Promise<boolean> - True if adapter is healthy
     */
    healthCheck(): Promise<boolean>;
}

// -----------------------------------------------------------------------------
// Abstract Base Adapter (optional convenience class)
// -----------------------------------------------------------------------------

/**
 * BaseTriggerAdapter provides common functionality for trigger adapters.
 * Concrete adapters can extend this or implement TriggerSourceAdapter directly.
 */
export abstract class BaseTriggerAdapter implements TriggerSourceAdapter {
    abstract readonly provider: TriggerProvider;
    abstract readonly displayName: string;

    abstract listTriggers(appSlug: string): Promise<TriggerDefinition[]>;
    abstract register(config: TriggerRegistration): Promise<TriggerRegistrationResult>;
    abstract deregister(externalId: string): Promise<void>;
    abstract normalize(rawEvent: unknown, metadata: EventNormalizationMetadata): NormalizedEvent;

    /**
     * Default health check - override in concrete adapters for actual checks
     */
    async healthCheck(): Promise<boolean> {
        return true;
    }

    /**
     * Helper to create a NormalizedEvent with common fields
     */
    protected createNormalizedEvent(
        app: string,
        eventType: string,
        payload: Record<string, unknown>,
        accountId: string,
        externalEventId?: string
    ): NormalizedEvent {
        return {
            app,
            event_type: eventType,
            payload,
            source_provider: this.provider,
            received_at: new Date(),
            account_id: accountId,
            external_event_id: externalEventId,
        };
    }

    /**
     * Helper to build our webhook URL for this provider
     */
    protected buildWebhookUrl(baseUrl: string, agentId: number): string {
        return `${baseUrl}/api/v1/webhooks/triggers/${this.provider}/${agentId}`;
    }
}

// -----------------------------------------------------------------------------
// Adapter Registry
// -----------------------------------------------------------------------------

/**
 * TriggerAdapterRegistry maintains the collection of available adapters.
 * Used by TriggerResolver to find the appropriate adapter for a user's setup.
 */
export class TriggerAdapterRegistry {
    private adapters: Map<TriggerProvider, TriggerSourceAdapter> = new Map();

    /**
     * Register an adapter for a provider
     */
    register(adapter: TriggerSourceAdapter): void {
        this.adapters.set(adapter.provider, adapter);
    }

    /**
     * Get an adapter by provider name
     * @throws Error if adapter not found
     */
    get(provider: TriggerProvider): TriggerSourceAdapter {
        const adapter = this.adapters.get(provider);
        if (!adapter) {
            throw new Error(`No adapter registered for provider: ${provider}`);
        }
        return adapter;
    }

    /**
     * Check if an adapter exists for a provider
     */
    has(provider: TriggerProvider): boolean {
        return this.adapters.has(provider);
    }

    /**
     * Get all registered adapters
     */
    getAll(): TriggerSourceAdapter[] {
        return Array.from(this.adapters.values());
    }

    /**
     * Get all registered provider names
     */
    getProviders(): TriggerProvider[] {
        return Array.from(this.adapters.keys());
    }
}

// Global registry instance
export const triggerAdapterRegistry = new TriggerAdapterRegistry();
