/**
 * MCP API Routes - Model Context Protocol Integration
 * Provides REST API for MCP server management like Claude Desktop
 */

const express = require('express');
const router = express.Router();
const MCPManager = require('../../services/mcp/mcpManager');
const { asyncHandler, ValidationError, NotFoundError } = require('../middleware/errorHandler');
const { requirePermission, requireGuestPermission } = require('../middleware/auth');

// Initialize MCP Manager singleton
const mcpManager = new MCPManager();

// Global error handling for MCP Manager
mcpManager.on('serverError', (event) => {
  console.error(`MCP Server Error [${event.serverId}]:`, event.error);
});

mcpManager.on('serverStarted', (event) => {
  console.log(`MCP Server Started [${event.serverId}] with ${event.capabilities.tools.length} tools`);
});

mcpManager.on('serverStopped', (event) => {
  console.log(`MCP Server Stopped [${event.serverId}]`);
});

/**
 * GET /api/v1/mcp/servers
 * List all available MCP servers (registry + running status)
 */
router.get('/servers', requireGuestPermission('mcp:read'), asyncHandler(async (req, res) => {
  const servers = mcpManager.getAvailableServers();
  
  // For guest users, show all servers but indicate authentication requirements
  if (req.user && req.user.isGuest) {
    res.set('X-Guest-Mode', 'true');
    
    const guestServers = servers.map(server => ({
      ...server,
      guest_enabled: false, // Guests cannot start MCP servers
      guest_disabled_reason: 'Sign in to use MCP servers'
    }));
    
    return res.json(guestServers);
  }

  res.json(servers);
}));

/**
 * GET /api/v1/mcp/servers/running
 * List currently running MCP servers
 */
router.get('/servers/running', requireGuestPermission('mcp:read'), asyncHandler(async (req, res) => {
  const runningServers = mcpManager.getRunningServers();
  
  res.json({
    servers: runningServers,
    total: runningServers.length,
    timestamp: new Date().toISOString()
  });
}));

/**
 * POST /api/v1/mcp/servers/:serverId/start
 * Start an MCP server (like Claude Desktop server management)
 */
router.post('/servers/:serverId/start', requirePermission('mcp:manage'), asyncHandler(async (req, res) => {
  const { serverId } = req.params;
  const userConfig = req.body || {}; // User configuration (env vars, etc.)

  try {
    const userId = req.user?.uid || req.user?.id;
    const result = await mcpManager.startServer(serverId, userConfig, userId);
    
    res.json({
      success: true,
      message: result.message,
      server_id: serverId,
      capabilities: result.capabilities,
      started_at: new Date().toISOString()
    });
  } catch (error) {
    if (error.message.includes('already running')) {
      res.status(409).json({
        error: 'Server already running',
        server_id: serverId,
        message: error.message
      });
    } else {
      throw new ValidationError(`Failed to start MCP server: ${error.message}`);
    }
  }
}));

/**
 * POST /api/v1/mcp/servers/:serverId/stop
 * Stop an MCP server
 */
router.post('/servers/:serverId/stop', requirePermission('mcp:manage'), asyncHandler(async (req, res) => {
  const { serverId } = req.params;

  const result = await mcpManager.stopServer(serverId);
  
  res.json({
    success: true,
    message: result.message,
    server_id: serverId,
    stopped_at: new Date().toISOString()
  });
}));

/**
 * GET /api/v1/mcp/servers/:serverId/capabilities
 * Get MCP server capabilities (tools, resources, prompts)
 */
router.get('/servers/:serverId/capabilities', requireGuestPermission('mcp:read'), asyncHandler(async (req, res) => {
  const { serverId } = req.params;

  try {
    const capabilities = await mcpManager.getServerCapabilities(serverId);
    
    res.json({
      server_id: serverId,
      connected: capabilities.connected,
      tools: capabilities.tools,
      resources: capabilities.resources,
      prompts: capabilities.prompts,
      total_tools: capabilities.tools.length,
      total_resources: capabilities.resources.length,
      total_prompts: capabilities.prompts.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    throw new NotFoundError(`MCP server ${serverId} is not running or not found`);
  }
}));

/**
 * POST /api/v1/mcp/servers/:serverId/tools/:toolName/execute
 * Execute a tool via MCP server (main tool execution endpoint)
 */
router.post('/servers/:serverId/tools/:toolName/execute', requireGuestPermission('tools:execute'), asyncHandler(async (req, res) => {
  const { serverId, toolName } = req.params;
  const { parameters = {} } = req.body;
  const userId = req.user?.uid || req.user?.id;

  try {
    // For guest users, add usage tracking context
    const executionContext = {
      userId: userId,
      isGuest: req.user?.isGuest || false,
      parameters
    };

    const result = await mcpManager.executeTool(serverId, toolName, parameters);
    
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        tool_name: toolName,
        server_id: serverId,
        executed_at: result.executedAt
      });
    }

    res.json({
      success: true,
      result: result.result,
      tool_name: toolName,
      server_id: serverId,
      execution_time: Date.now() - new Date(result.executedAt).getTime(),
      executed_at: result.executedAt
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      tool_name: toolName,
      server_id: serverId,
      executed_at: new Date().toISOString()
    });
  }
}));

/**
 * GET /api/v1/mcp/servers/:serverId/resources
 * List resources from MCP server
 */
router.get('/servers/:serverId/resources', requireGuestPermission('mcp:read'), asyncHandler(async (req, res) => {
  const { serverId } = req.params;

  try {
    const capabilities = await mcpManager.getServerCapabilities(serverId);
    
    res.json({
      server_id: serverId,
      resources: capabilities.resources,
      total: capabilities.resources.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    throw new NotFoundError(`MCP server ${serverId} is not running`);
  }
}));

/**
 * GET /api/v1/mcp/servers/:serverId/resources/:resourceUri
 * Read a specific resource from MCP server
 */
router.get('/servers/:serverId/resources/:resourceUri(*)', requireGuestPermission('mcp:read'), asyncHandler(async (req, res) => {
  const { serverId, resourceUri } = req.params;

  try {
    const result = await mcpManager.readResource(serverId, resourceUri);
    
    res.json({
      success: true,
      content: result.content,
      uri: resourceUri,
      server_id: serverId,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    throw new NotFoundError(`Resource not found or server not running: ${error.message}`);
  }
}));

/**
 * GET /api/v1/mcp/servers/:serverId/prompts
 * List prompts from MCP server
 */
router.get('/servers/:serverId/prompts', requireGuestPermission('mcp:read'), asyncHandler(async (req, res) => {
  const { serverId } = req.params;

  try {
    const capabilities = await mcpManager.getServerCapabilities(serverId);
    
    res.json({
      server_id: serverId,
      prompts: capabilities.prompts,
      total: capabilities.prompts.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    throw new NotFoundError(`MCP server ${serverId} is not running`);
  }
}));

/**
 * POST /api/v1/mcp/servers/:serverId/prompts/:promptName
 * Get a prompt from MCP server with arguments
 */
router.post('/servers/:serverId/prompts/:promptName', requireGuestPermission('mcp:read'), asyncHandler(async (req, res) => {
  const { serverId, promptName } = req.params;
  const { arguments: promptArgs = {} } = req.body;

  try {
    const result = await mcpManager.getPrompt(serverId, promptName, promptArgs);
    
    res.json({
      success: true,
      prompt: result.prompt,
      prompt_name: promptName,
      server_id: serverId,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    throw new NotFoundError(`Prompt not found or server not running: ${error.message}`);
  }
}));

/**
 * GET /api/v1/mcp/health
 * Health check for all MCP servers
 */
router.get('/health', requireGuestPermission('mcp:read'), asyncHandler(async (req, res) => {
  const health = await mcpManager.healthCheck();
  
  res.json({
    status: health.runningServers > 0 ? 'healthy' : 'no_servers',
    total_servers: health.totalServers,
    running_servers: health.runningServers,
    servers: health.servers,
    timestamp: new Date().toISOString()
  });
}));

/**
 * POST /api/v1/mcp/servers/stop-all
 * Stop all running MCP servers (emergency stop)
 */
router.post('/servers/stop-all', requirePermission('mcp:manage'), asyncHandler(async (req, res) => {
  await mcpManager.stopAllServers();
  
  res.json({
    success: true,
    message: 'All MCP servers stopped',
    timestamp: new Date().toISOString()
  });
}));

/**
 * Integration with existing tools system
 * GET /api/v1/mcp/tools
 * Get all available tools across all MCP servers (integrates with existing tools API)
 */
router.get('/tools', requireGuestPermission('tools:read'), asyncHandler(async (req, res) => {
  const runningServers = mcpManager.getRunningServers();
  
  const allTools = [];
  
  for (const server of runningServers) {
    try {
      const capabilities = await mcpManager.getServerCapabilities(server.id);
      
      // Transform MCP tools to match existing tools API format
      const mcpTools = capabilities.tools.map(tool => ({
        id: `${server.id}:${tool.name}`,
        name: tool.name,
        tool_name: tool.name,
        description: tool.description || `${tool.name} from ${server.name}`,
        icon: '🔧', // Default MCP tool icon
        category: 'mcp_tools',
        status: 'active',
        is_enabled: true,
        usage_count: 0,
        last_used: null,
        execution_time_avg: 0,
        success_rate: 100,
        parameters: tool.inputSchema || {},
        provider: server.name,
        version: '1.0.0',
        mcp_server_id: server.id,
        mcp_tool: true
      }));
      
      allTools.push(...mcpTools);
    } catch (error) {
      console.error(`Failed to get tools from ${server.id}:`, error.message);
    }
  }

  res.json(allTools);
}));

// Graceful shutdown handler
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, stopping all MCP servers...');
  await mcpManager.stopAllServers();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Received SIGINT, stopping all MCP servers...');
  await mcpManager.stopAllServers();
  process.exit(0);
});

module.exports = router;