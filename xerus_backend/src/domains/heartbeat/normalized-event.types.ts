// Normalized Event Types for Provider-Agnostic Trigger Layer
// All trigger providers normalize raw webhook payloads to this standard format

// -----------------------------------------------------------------------------
// Supported Apps and Event Types
// -----------------------------------------------------------------------------

export const TRIGGER_APPS = [
    'gmail',
    'github',
    'slack',
    'stripe',
    'notion',
    'linear',
    'calendar',
    'trello',
    'jira',
    'hubspot',
] as const;


export const TRIGGER_PROVIDERS = ['pipedream', 'native', 'zapier', 'custom'] as const;

export type TriggerProvider = (typeof TRIGGER_PROVIDERS)[number];

// -----------------------------------------------------------------------------
// Normalized Event (Standard event format across all providers)
// -----------------------------------------------------------------------------

export interface NormalizedEvent {
    /** App that generated the event (gmail, github, slack, stripe) */
    app: string;

    /** Event type within the app (new_email, pr_opened, payment_failed) */
    event_type: string;

    /** Event payload - structure depends on app and event_type */
    payload: Record<string, unknown>;

    /** Provider that delivered this event (pipedream, native, zapier) */
    source_provider: TriggerProvider;

    /** When the event was received by our webhook */
    received_at: Date;

    /** User's connected account ID for this app */
    account_id: string;

    /** Optional: unique ID of this event from the source */
    external_event_id?: string;

    /** Optional: agent ID this event is targeting */
    agent_id?: number;
}

// -----------------------------------------------------------------------------
// Trigger Registration (Request to start listening for events)
// -----------------------------------------------------------------------------

export interface TriggerRegistration {
    /** Agent that will receive this trigger */
    agent_id: number;

    /** User who owns the agent */
    user_id: string;

    /** App to listen to (gmail, github, etc.) */
    app: string;

    /** Event type to listen for (new_email, pr_opened, etc.) */
    event_type: string;

    /** User's connected account ID for this app */
    account_id: string;

    /** Our webhook URL for receiving events */
    webhook_url: string;

    /** Optional filter configuration (e.g., from:vip-list for email) */
    filter?: Record<string, unknown>;
}

// -----------------------------------------------------------------------------
// Trigger Definition (Describes available triggers for an app)
// -----------------------------------------------------------------------------

export interface TriggerDefinition {
    /** App this trigger belongs to */
    app: string;

    /** Event type identifier */
    event_type: string;

    /** Human-readable name */
    display_name: string;

    /** Description of what triggers this event */
    description: string;

    /** Whether this trigger supports filtering */
    supports_filter: boolean;

    /** JSON schema for filter configuration (if supports_filter is true) */
    filter_schema?: Record<string, unknown>;
}

// -----------------------------------------------------------------------------
// Database Row Types (snake_case for DB columns)
// Matches: trigger_providers, agent_triggers tables (migration 023)
// NOTE: DB currently uses integer IDs (legacy), migration 023 specifies UUID
// -----------------------------------------------------------------------------

export interface TriggerProviderRow {
    id: number;
    slug: string;
    display_name: string;
    adapter_class: string | null;
    adapter_config: Record<string, unknown>;
    is_active: boolean;
    created_at: Date;
}

export interface AgentTriggerRow {
    id: number;
    agent_id: number;
    user_id: string;
    provider_id: number | null;
    app_slug: string;
    event_type: string;
    external_id: string | null;
    webhook_url: string | null;
    filter_config: Record<string, unknown>;
    account_id: string | null;
    enabled: boolean;
    last_fired_at: Date | null;
    fire_count: number;
    created_at: Date;
    updated_at: Date;
}

// -----------------------------------------------------------------------------
// Registration Result
// -----------------------------------------------------------------------------

export interface TriggerRegistrationResult {
    /** External ID from the provider (subscription ID, webhook ID, etc.) */
    external_id: string;

    /** Webhook URL that was registered */
    webhook_url: string;
}

// -----------------------------------------------------------------------------
// Event Normalization Metadata
// -----------------------------------------------------------------------------

export interface EventNormalizationMetadata {
    /** App identifier for the event */
    app: string;

    /** Event type identifier */
    event_type: string;

    /** Agent ID (if known from webhook URL) */
    agent_id?: number;
}

// -----------------------------------------------------------------------------
// Provider Resolution Result
// -----------------------------------------------------------------------------

export interface ProviderResolutionResult {
    /** Provider that can handle this app for the user */
    provider: TriggerProvider;

    /** Provider ID from database (integer in legacy DB) */
    provider_id: number;

    /** User's connected account ID for this app */
    account_id: string;
}

// -----------------------------------------------------------------------------
// Trigger State (for tracking trigger health)
// -----------------------------------------------------------------------------

export const TRIGGER_STATES = ['active', 'inactive', 'error', 'rate_limited'] as const;

type TriggerState = (typeof TRIGGER_STATES)[number];

export interface TriggerHealth {
    trigger_id: string;
    state: TriggerState;
    last_fired_at: Date | null;
    fire_count: number;
    error_message?: string;
    error_count?: number;
}
