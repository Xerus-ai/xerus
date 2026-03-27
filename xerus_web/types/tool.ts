export interface Tool {
    id: string
    name: string
    tool_name?: string
    description: string
    icon: string
    category: string
    status: 'active' | 'inactive'
    is_enabled: boolean
    usage_count: number
    execution_count?: number
    last_used: string | null
    last_executed_at?: string
    execution_time_avg: number
    avg_execution_time?: number
    success_rate: number
    parameters: Record<string, unknown>[] | Record<string, unknown>
    configuration?: Record<string, unknown>
    provider: string
    version: string
    requires_auth?: boolean
    auth_type?: 'oauth' | 'api_key' | 'keys' | 'none' | null
    is_configured?: boolean
    token_info?: {
        expires_at?: string | null
        has_refresh_token?: boolean
    } | null
    auth_status_checked?: boolean
    connected_account_ids?: string[]
    mcp_server?: boolean
    mcp_server_id?: string
    server_status?: 'running' | 'stopped'
    capabilities?: string[]
    tool_count?: number
    docker_image?: string
    api_endpoint?: string
    oauth_configured?: boolean
    oauth_token_expires?: string
    oauth_token_valid?: boolean
    authentication_status?: 'authenticated' | 'not_configured'
}
