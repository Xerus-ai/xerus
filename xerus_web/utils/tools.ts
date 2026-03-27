import { Tool } from "@/types/tool"
import { getApiUrlAsync } from "@/utils/context-detection"

export const getApiUrl = getApiUrlAsync;

export const mapToolData = (tool: Record<string, unknown>): Tool => {
    // Handle both Pipedream apps and generic tools
    const isPipedreamApp = tool.name_slug !== undefined
    const categories = tool.categories as string[] | undefined

    return {
        id: isPipedreamApp ? (tool.name_slug as string) : (String(tool.id ?? '') || (tool.tool_name as string)),
        name: isPipedreamApp ? (tool.name as string) : ((tool.display_name || tool.tool_name || tool.name || 'Unnamed Tool') as string),
        tool_name: isPipedreamApp ? (tool.name_slug as string) : (tool.tool_name as string | undefined),
        description: (tool.description as string) || '',
        icon: isPipedreamApp ? ((tool.img_src as string) || '🔧') : ((tool.icon as string) || '🔧'),
        category: isPipedreamApp ? (categories?.[0] || 'integration') : ((tool.category as string) || 'utility'),
        status: tool.is_enabled ? 'active' : 'inactive',
        is_enabled: (tool.is_enabled as boolean) || false,
        usage_count: (tool.execution_count as number) || 0,
        execution_count: tool.execution_count as number | undefined,
        last_used: (tool.last_executed_at as string) || null,
        last_executed_at: tool.last_executed_at as string | undefined,
        execution_time_avg: (tool.avg_execution_time as number) || 0,
        avg_execution_time: tool.avg_execution_time as number | undefined,
        success_rate: (tool.success_rate as number) || 0,
        configuration: (tool.configuration as Record<string, unknown>) || {},
        parameters: (tool.parameters as Record<string, unknown>[] | Record<string, unknown>) || [],
        provider: isPipedreamApp ? 'pipedream' : ((tool.provider as string) || 'unknown'),
        version: (tool.version as string) || '1.0.0',
        requires_auth: isPipedreamApp ? !!tool.auth_type : ((tool.requires_auth as boolean) || false),
        auth_type: (tool.auth_type as Tool['auth_type']) || null,
        is_configured: (tool.is_configured as boolean) || false,
        api_endpoint: (tool.api_endpoint as string) || undefined,
        mcp_server: (tool.mcp_server as boolean) || false,
        mcp_server_id: (tool.mcp_server_id as string) || undefined,
        server_status: (tool.server_status as Tool['server_status']) || undefined,
        capabilities: (tool.capabilities as string[]) || [],
        tool_count: (tool.tool_count as number) || 0,
        oauth_configured: (tool.oauth_configured as boolean) || false,
        oauth_token_expires: (tool.oauth_token_expires as string) || undefined,
        oauth_token_valid: (tool.oauth_token_valid as boolean) || false,
        authentication_status: (tool.authentication_status as Tool['authentication_status']) || 'not_configured',
        token_info: null,
        auth_status_checked: false
    }
}
