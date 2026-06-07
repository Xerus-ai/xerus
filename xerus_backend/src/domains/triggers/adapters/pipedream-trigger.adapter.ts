// PipedreamTriggerAdapter - First TriggerSourceAdapter implementation
// Uses Pipedream Connect SDK to manage trigger deployment and event normalization

import type { BackendClient, V1Component, ConfigurableProp } from '@pipedream/sdk';
import { getPipedreamClient } from '../../../shared/clients/pipedream';
import { BaseTriggerAdapter } from '../trigger-source.adapter';
import type {
    TriggerProvider,
    NormalizedEvent,
    TriggerRegistration,
    TriggerRegistrationResult,
    TriggerDefinition,
    EventNormalizationMetadata,
} from '../trigger.types';
import {
    TriggerAdapterError,
    TriggerRegistrationError,
    TriggerDeregistrationError,
    EventNormalizationError,
} from '../trigger.errors';
import { ToolNotConnectedError } from '../../tools/errors';

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const PIPEDREAM_RATE_LIMIT_ACTIONS_PER_MIN = 100;
const MAX_REGISTRATION_RETRIES = 1;

// -----------------------------------------------------------------------------
// PipedreamTriggerAdapter
// -----------------------------------------------------------------------------

export class PipedreamTriggerAdapter extends BaseTriggerAdapter {
    readonly provider: TriggerProvider = 'pipedream';
    readonly displayName = 'Pipedream';

    private readonly client: BackendClient;

    constructor(client?: BackendClient) {
        super();
        this.client = client ?? getPipedreamClient();
    }

    /**
     * List available trigger components for a specific app.
     * Uses Pipedream's getComponents API filtered to trigger type.
     */
    async listTriggers(appSlug: string): Promise<TriggerDefinition[]> {
        const response = await this.client.getComponents({
            app: appSlug,
            componentType: 'trigger',
        });

        return response.data.map((component: V1Component) =>
            mapComponentToTriggerDefinition(appSlug, component)
        );
    }

    /**
     * Register a trigger by deploying a Pipedream trigger component.
     * Deploys the component with a webhook URL pointing to our endpoint.
     * Retries once on failure before throwing.
     */
    async register(config: TriggerRegistration): Promise<TriggerRegistrationResult> {
        const webhookUrl = this.buildWebhookUrl(
            getBaseUrl(),
            config.agent_slug
        );

        const triggerKey = buildTriggerKey(config.app, config.event_type);

        const configuredProps = buildConfiguredProps(config);

        let lastError: Error | undefined;

        for (let attempt = 0; attempt <= MAX_REGISTRATION_RETRIES; attempt++) {
            try {
                const response = await this.client.deployTrigger({
                    externalUserId: config.user_id,
                    triggerId: { key: triggerKey },
                    configuredProps,
                    webhookUrl,
                });

                return {
                    external_id: `${config.user_id}:${response.data.id}`,
                    webhook_url: webhookUrl,
                };
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));

                if (isAccountNotConnectedError(lastError)) {
                    throw new ToolNotConnectedError(config.app, config.user_id);
                }

                if (isRateLimitError(lastError)) {
                    throw new TriggerAdapterError(
                        'pipedream',
                        `Rate limited (${PIPEDREAM_RATE_LIMIT_ACTIONS_PER_MIN} actions/min). Retry later.`
                    );
                }

                if (attempt < MAX_REGISTRATION_RETRIES) {
                    continue;
                }
            }
        }

        throw new TriggerRegistrationError(
            config.app,
            config.event_type,
            `Deployment failed after ${MAX_REGISTRATION_RETRIES + 1} attempts: ${lastError?.message}`
        );
    }

    /**
     * Deregister a trigger by undeploying the Pipedream event source.
     * The externalId is the deployed component ID (dc_xxxxx).
     */
    async deregister(externalId: string): Promise<void> {
        // externalId format: userId:deploymentId (set during register)
        const { userId, deploymentId } = parseExternalId(externalId);

        try {
            await this.client.deleteTrigger({
                id: deploymentId,
                externalUserId: userId,
            });
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            throw new TriggerDeregistrationError(externalId, err.message);
        }
    }

    /**
     * Normalize a raw Pipedream webhook payload into NormalizedEvent format.
     * Pipedream delivers events with an event body containing the app-specific data.
     */
    normalize(rawEvent: unknown, metadata: EventNormalizationMetadata): NormalizedEvent {
        if (!rawEvent || typeof rawEvent !== 'object') {
            throw new EventNormalizationError(
                metadata.app,
                metadata.event_type,
                'Raw event must be a non-null object'
            );
        }

        const eventData = rawEvent as Record<string, unknown>;

        const payload = extractPayload(eventData);
        const accountId = extractAccountId(eventData);
        const externalEventId = extractExternalEventId(eventData);

        return this.createNormalizedEvent(
            metadata.app,
            metadata.event_type,
            payload,
            accountId,
            externalEventId
        );
    }

    /**
     * Verify Pipedream API connectivity.
     */
    async healthCheck(): Promise<boolean> {
        try {
            await this.client.getApps({ limit: 1 });
            return true;
        } catch {
            return false;
        }
    }
}

// -----------------------------------------------------------------------------
// Helper Functions
// -----------------------------------------------------------------------------

function mapComponentToTriggerDefinition(
    appSlug: string,
    component: V1Component
): TriggerDefinition {
    const eventType = extractEventType(component.key, appSlug);
    const supportsFilter = hasFilterableProps(component);

    return {
        app: appSlug,
        event_type: eventType,
        display_name: component.name,
        description: component.description ?? '',
        supports_filter: supportsFilter,
    };
}

/**
 * Extract event type from component key.
 * Component keys follow pattern: "app_slug-event-name"
 * We strip the app prefix to get the event type.
 */
function extractEventType(componentKey: string, appSlug: string): string {
    const prefix = `${appSlug}-`;
    if (componentKey.startsWith(prefix)) {
        return componentKey.slice(prefix.length);
    }
    return componentKey;
}

/**
 * Check if component has configurable props that allow filtering.
 * Props with remoteOptions or non-app/non-interface types indicate filterability.
 */
function hasFilterableProps(component: V1Component): boolean {
    if (!component.configurable_props) {
        return false;
    }

    return component.configurable_props.some(
        (prop: ConfigurableProp) =>
            prop.type !== 'app' &&
            !prop.type.startsWith('$.interface') &&
            !prop.type.startsWith('$.service') &&
            !prop.hidden
    );
}

/**
 * Build the trigger component key from app slug and event type.
 * Convention: app_slug-event_type (e.g., "gmail-new-email")
 */
function buildTriggerKey(app: string, eventType: string): string {
    return `${app}-${eventType}`;
}

/**
 * Build configuredProps for Pipedream deployTrigger.
 * Includes app auth provision and any filter configuration.
 */
function buildConfiguredProps(
    config: TriggerRegistration
): Record<string, unknown> {
    const props: Record<string, unknown> = {
        [config.app]: {
            authProvisionId: config.account_id,
        },
    };

    if (config.filter) {
        Object.assign(props, config.filter);
    }

    return props;
}

/**
 * Get the base URL for webhook endpoints.
 */
function getBaseUrl(): string {
    const baseUrl = process.env.XERUS_API_BASE_URL || process.env.API_BASE_URL;
    if (!baseUrl) {
        throw new TriggerAdapterError('pipedream', 'XERUS_API_BASE_URL or API_BASE_URL environment variable is required');
    }
    return baseUrl;
}

/**
 * Parse the composite external ID back into userId and deploymentId.
 * Format: "userId:deploymentId"
 */
function parseExternalId(externalId: string): { userId: string; deploymentId: string } {
    const separatorIndex = externalId.indexOf(':');
    if (separatorIndex === -1) {
        throw new TriggerDeregistrationError(
            externalId,
            'Invalid external ID format. Expected "userId:deploymentId"'
        );
    }

    return {
        userId: externalId.slice(0, separatorIndex),
        deploymentId: externalId.slice(separatorIndex + 1),
    };
}

/**
 * Extract the event payload from Pipedream webhook data.
 * Pipedream wraps event data in various formats.
 */
function extractPayload(eventData: Record<string, unknown>): Record<string, unknown> {
    // Pipedream emitted events have the payload in the 'e' field (V1EmittedEvent format)
    if (eventData.e && typeof eventData.e === 'object') {
        return eventData.e as Record<string, unknown>;
    }

    // Direct webhook delivery sends the payload at top level
    return eventData;
}

/**
 * Extract account ID from event data.
 */
function extractAccountId(eventData: Record<string, unknown>): string {
    return (
        (eventData.account_id as string) ??
        (eventData.owner_id as string) ??
        'unknown'
    );
}

/**
 * Extract external event ID from event data.
 */
function extractExternalEventId(eventData: Record<string, unknown>): string | undefined {
    return (
        (eventData.id as string | undefined) ??
        (eventData.event_id as string | undefined)
    );
}

/**
 * Check if error indicates account not connected (401 from Pipedream).
 */
function isAccountNotConnectedError(error: Error): boolean {
    return error.message.includes('401') || error.message.includes('Unauthorized');
}

/**
 * Check if error indicates rate limiting (429 from Pipedream).
 */
function isRateLimitError(error: Error): boolean {
    return error.message.includes('429') || error.message.includes('rate limit');
}

// -----------------------------------------------------------------------------
// Singleton Export
// -----------------------------------------------------------------------------

let pipedreamTriggerAdapter: PipedreamTriggerAdapter | null = null;

export function getPipedreamTriggerAdapter(): PipedreamTriggerAdapter {
    if (!pipedreamTriggerAdapter) {
        pipedreamTriggerAdapter = new PipedreamTriggerAdapter();
    }
    return pipedreamTriggerAdapter;
}

export function resetPipedreamTriggerAdapter(): void {
    pipedreamTriggerAdapter = null;
}
