import { Tool } from "@/types/tool"
import { getApiUrlAsync } from "@/utils/context-detection"

export const getApiUrl = getApiUrlAsync;

export const mapToolData = (tool: any): Tool => {
    // Handle both Pipedream apps and generic tools
    const isPipedreamApp = tool.name_slug !== undefined

    return {
        id: isPipedreamApp ? tool.name_slug : (tool.id?.toString() || tool.tool_name),
        name: isPipedreamApp ? tool.name : (tool.display_name || tool.tool_name || tool.name || 'Unnamed Tool'),
        tool_name: isPipedreamApp ? tool.name_slug : tool.tool_name,
        description: tool.description || '',
        icon: isPipedreamApp ? (tool.img_src || '🔧') : (tool.icon || '🔧'),
        category: isPipedreamApp ? (tool.categories?.[0] || 'integration') : (tool.category || 'utility'),
        status: tool.is_enabled ? 'active' : 'inactive',
        is_enabled: tool.is_enabled || false,
        usage_count: tool.execution_count || 0,
        execution_count: tool.execution_count,
        last_used: tool.last_executed_at || null,
        last_executed_at: tool.last_executed_at,
        execution_time_avg: tool.avg_execution_time || 0,
        avg_execution_time: tool.avg_execution_time,
        success_rate: tool.success_rate || 0,
        configuration: tool.configuration || {},
        parameters: tool.parameters || [],
        provider: isPipedreamApp ? 'pipedream' : (tool.provider || 'unknown'),
        version: tool.version || '1.0.0',
        requires_auth: isPipedreamApp ? !!tool.auth_type : (tool.requires_auth || false),
        auth_type: tool.auth_type || null,
        is_configured: tool.is_configured || false,
        api_endpoint: tool.api_endpoint || null,
        mcp_server: tool.mcp_server || false,
        mcp_server_id: tool.mcp_server_id || null,
        server_status: tool.server_status || null,
        capabilities: tool.capabilities || [],
        tool_count: tool.tool_count || 0,
        oauth_configured: tool.oauth_configured || false,
        oauth_token_expires: tool.oauth_token_expires || null,
        oauth_token_valid: tool.oauth_token_valid || false,
        authentication_status: tool.authentication_status || 'not_configured',
        token_info: null,
        auth_status_checked: false
    }
}
