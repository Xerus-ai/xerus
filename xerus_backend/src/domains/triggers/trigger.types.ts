// Trigger Domain Types
// Inlined from deleted heartbeat/normalized-event.types.ts after Block 7 cleanup.
// Canonical source for trigger-related types used across the triggers domain.

// -----------------------------------------------------------------------------
// Trigger Provider
// -----------------------------------------------------------------------------

export type TriggerProvider = 'pipedream' | 'native' | 'webhook' | 'schedule' | 'manual';

export const TRIGGER_PROVIDERS: TriggerProvider[] = ['pipedream', 'native', 'webhook', 'schedule', 'manual'];

// -----------------------------------------------------------------------------
// Normalized Event
// -----------------------------------------------------------------------------

export interface NormalizedEvent {
    app: string;
    event_type: string;
    payload: Record<string, unknown>;
    source_provider: TriggerProvider;
    received_at: Date;
    account_id: string;
    agent_slug?: string;
    external_event_id?: string;
}

export interface EventNormalizationMetadata {
    app: string;
    event_type: string;
    agent_slug?: string;
}

// -----------------------------------------------------------------------------
// Trigger Registration
// -----------------------------------------------------------------------------

export interface TriggerRegistration {
    app: string;
    event_type: string;
    agent_slug: string;
    user_id: string;
    account_id: string;
    webhook_url?: string;
    filter?: Record<string, unknown>;
}

export interface TriggerRegistrationResult {
    external_id: string;
    webhook_url: string;
}

// -----------------------------------------------------------------------------
// Trigger Definition
// -----------------------------------------------------------------------------

export interface TriggerDefinition {
    app: string;
    event_type: string;
    display_name: string;
    description: string;
    supports_filter: boolean;
}

// -----------------------------------------------------------------------------
// Agent Trigger Row (DB row shape)
// -----------------------------------------------------------------------------

export interface AgentTriggerRow {
    id: number;
    agent_slug: string;
    user_id: string;
    provider_id: number;
    app_slug: string;
    event_type: string;
    external_id: string;
    webhook_url: string;
    filter_config: Record<string, unknown>;
    account_id: string;
    enabled: boolean;
    last_fired_at: Date | null;
    fire_count: number;
    created_at: Date;
    updated_at: Date;
}

// -----------------------------------------------------------------------------
// Provider Resolution
// -----------------------------------------------------------------------------

export interface ProviderResolutionResult {
    provider: TriggerProvider;
    provider_id: number;
    account_id: string;
}

export interface TriggerProviderRow {
    id: number;
    slug: string;
    display_name: string;
    adapter_config: Record<string, unknown>;
    is_active: boolean;
    created_at: Date;
}
