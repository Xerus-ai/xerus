// Tools Domain Types
// Pipedream Connect integration types

// ===== DATABASE TYPES =====

export interface PipedreamAppRow {
    id: number;
    name_slug: string;
    name: string;
    description: string | null;
    auth_type: string | null;
    img_src: string | null;
    categories: string[] | null;
    featured: boolean;
    featured_weight: number | null;
    created_at: Date;
    updated_at: Date;
}

export interface PipedreamAppsSyncRow {
    id: number;
    last_sync_at: Date | null;
    total_apps: number;
    sync_status: 'pending' | 'syncing' | 'success' | 'failed';
    error: string | null;
}

export interface ConnectedAccount {
    id: number;
    user_id: string;
    app_slug: string;
    app_name: string;
    pipedream_account_id: string;
    created_at: Date;
    last_used_at: Date | null;
}

export interface ConnectedAccountRow {
    id: number;
    user_id: string;
    app_slug: string;
    app_name: string;
    pipedream_account_id: string;
    created_at: Date;
    last_used_at: Date | null;
}

export interface ToolExecution {
    id: number;
    agent_slug: string | null;
    app_slug: string;
    action_key: string;
    input: Record<string, unknown>;
    output: Record<string, unknown> | null;
    success: boolean;
    error: string | null;
    duration_ms: number | null;
    created_at: Date;
}

export interface ToolExecutionRow {
    id: number;
    agent_slug: string | null;
    app_slug: string;
    action_key: string;
    input: unknown;
    output: unknown;
    success: boolean;
    error: string | null;
    duration_ms: number | null;
    created_at: Date;
}

// ===== INPUT/OUTPUT TYPES =====

export interface SaveConnectionInput {
    user_id: string;
    pipedream_account_id: string;
    app_slug: string;
    app_name: string;
}

export interface LogExecutionInput {
    agent_slug: string | null;
    app_slug: string;
    action_key: string;
    input: Record<string, unknown>;
    output: Record<string, unknown> | null;
    success: boolean;
    error?: string;
    duration_ms: number;
}

export interface UpdateLastUsedInput {
    pipedream_account_id: string;
}

// ===== PIPEDREAM SDK TYPES (from @pipedream/sdk) =====

export interface PipedreamApp {
    name_slug: string;
    name: string;
    description?: string;
    auth_type?: string;
    img_src?: string;
    categories?: string[];
    featured_weight?: number;
    custom_fields_json?: string;
}

export interface PipedreamAccount {
    id: string;
    name: string;
    external_id: string;
    healthy: boolean;
    dead: boolean;
    app: {
        name_slug: string;
        name: string;
        img_src?: string;
    };
    created_at: string;
    updated_at: string;
}

export type PipedreamConnectEvent = 'CONNECTION_SUCCESS' | 'CONNECTION_ERROR';

// Payload delivered to the Connect webhook (webhook_uri) after an OAuth attempt.
// Account fields are nested under `account`; the event distinguishes success from error.
export interface PipedreamConnectWebhookPayload {
    event: PipedreamConnectEvent;
    account?: PipedreamAccount;
    error?: string;
    connect_token?: string;
}

export interface PipedreamAction {
    key: string;
    name: string;
    description?: string;
    version?: string;
    configurable_props?: unknown[];
    component_type?: string;
}

export interface PipedreamConnectToken {
    token: string;
    expires_at: string;
    connect_link_url: string;
}

export interface PipedreamExecutionResult {
    success: boolean;
    data: unknown;
    logs?: string[];
}

// ===== SERVICE RESPONSE TYPES =====

export interface PaginationMetadata {
    total: number;
    page: number;
    limit: number;
    total_pages: number;
    has_more: boolean;
}

export interface ListAppsResponse {
    apps: PipedreamApp[];
    pagination: PaginationMetadata;
}

export interface StartConnectionResponse {
    connect_url: string;
    expires_at: string;
    token: string;
}

export interface ListActionsResponse {
    actions: PipedreamAction[];
    total: number;
}

export interface ExecuteActionResponse {
    success: boolean;
    data: unknown;
    logs?: string[];
}

// ===== SERVICE METHODS INPUT TYPES =====

export interface ListAppsInput {
    query?: string;
    page?: number;
    limit?: number;
}

export interface ListAppsFromDBInput {
    page?: number;
    limit?: number;
    search?: string;
    categories?: string[];
}

export interface ListAppsFromDBResponse {
    apps: PipedreamApp[];
    pagination: PaginationMetadata;
    available_categories: string[];
}

export interface StartConnectionInput {
    user_id: string;
    webhook_url?: string;
    allowed_origins?: string[];
}

export interface GetConnectedAccountsInput {
    user_id: string;
    app_slug?: string;
}

export interface DisconnectAccountInput {
    pipedream_account_id: string;
    user_id: string;
}

export interface ListActionsInput {
    app_slug: string;
    query?: string;
    limit?: number;
}

export interface GetActionInput {
    action_key: string;
}

export interface ExecuteActionInput {
    user_id: string;
    action_key: string;
    pipedream_account_id: string;
    params: Record<string, unknown>;
}

export interface GetActionOptionsInput {
    user_id: string;
    action_key: string;
    prop_name: string;
    configured_props: Record<string, unknown>;
}

// ===== REPOSITORY METHOD RETURN TYPES =====

export interface GetConnectionsResult {
    connections: ConnectedAccount[];
}
