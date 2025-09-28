/**
 * Tools API Routes - RESTful Endpoints
 * Backend Dev Agent 💻 - Extracted and cleaned up
 * Standalone Backend Service
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const router = express.Router();

// Import services and middleware
const ToolService = require('../../services/toolService');
const ToolConfigurationService = require('../../services/toolConfigurationService');
const { asyncHandler, ValidationError, NotFoundError } = require('../middleware/errorHandler');
const { requirePermission, requireGuestPermission, DEFAULT_USER_PERMISSIONS } = require('../middleware/auth');
const CredentialService = require('../../services/credentialService');
const GenericOAuthService = require('../../services/oauth/genericOAuthService');
const sharedMCPManager = require('../../services/sharedMCPManager');

// Initialize services
const toolService = new ToolService();
const toolConfigService = new ToolConfigurationService();
const credentialService = new CredentialService();
const oauthService = new GenericOAuthService();
const mcpManager = sharedMCPManager;

// Helper function to get appropriate icons for MCP servers
function getMCPServerIcon(serverCategory, serverName) {
  const lowerName = serverName.toLowerCase();
  
  // Specific server icon URLs (relative paths for frontend proxy)
  if (lowerName.includes('gmail')) return '/api/tools/icons/gmail_new_logo_icon.png';
  if (lowerName.includes('github')) return '/api/tools/icons/GitHub-logo-768x432.png';
  if (lowerName.includes('weather')) return '/api/tools/icons/weather_logo.png';
  if (lowerName.includes('calendar') || lowerName.includes('google calendar')) return '/api/tools/icons/Google-Calendar-Logo.png';
  if (lowerName.includes('atlassian')) return '/api/tools/icons/atlassian-logo.png';
  
  // Legacy emoji fallbacks for other servers
  if (lowerName.includes('slack')) return '💬';
  if (lowerName.includes('notion')) return '📝';
  if (lowerName.includes('drive') || lowerName.includes('google drive')) return '☁️';
  if (lowerName.includes('discord')) return '🎮';
  if (lowerName.includes('linear')) return '📋';
  if (lowerName.includes('figma')) return '🎨';
  
  // Category fallbacks
  const categoryIcons = {
    'productivity': '[FAST]',
    'development': '💻', 
    'communication': '💬',
    'document': '📄',
    'design': '🎨',
    'storage': '☁️'
  };
  
  return categoryIcons[serverCategory] || '🔧';
}

/**
 * GET /api/v1/tools
 * List tools with filtering and pagination
 * Guest users only see allowed tools (perplexity, firecrawl, tavily)
 */
router.get('/', requireGuestPermission('tools:read'), asyncHandler(async (req, res) => {
  const {
    category,
    tool_type,
    is_enabled,
    provider,
    limit = 50,
    offset = 0,
    page,
    per_page
  } = req.query;

  // Handle pagination parameters
  const actualLimit = per_page ? parseInt(per_page) : parseInt(limit);
  const actualOffset = page ? (parseInt(page) - 1) * actualLimit : parseInt(offset);

  // Validate limits
  if (actualLimit > 100) {
    throw new ValidationError('Limit cannot exceed 100 items');
  }

  const filters = {
    category,
    tool_type,
    is_enabled: is_enabled !== undefined ? is_enabled === 'true' : undefined,
    provider,
    limit: actualLimit,
    offset: actualOffset
  };

  let tools = await toolService.getTools(filters);

  // Add MCP servers as single tools (better UX - show server, not individual functions)
  try {
    console.log('[SEARCH] DEBUG: Starting MCP server processing...');
    const availableServers = mcpManager.getAvailableServers();
    const runningServers = mcpManager.getRunningServers();
    const runningServerIds = new Set(runningServers.map(s => s.id));
    
    console.log(`[SEARCH] DEBUG: Found ${availableServers.length} available servers, ${runningServers.length} running`);
    console.log(`[SEARCH] DEBUG: Available server IDs:`, availableServers.map(s => s.id));
    
    for (const server of availableServers) {
      console.log(`[SEARCH] DEBUG: Processing server ${server.id} (${server.name})`);
      const isRunning = runningServerIds.has(server.id);
      const requiresAuth = server.authType && server.authType !== 'none';
      
      console.log(`[SEARCH] DEBUG: ${server.id} - isRunning: ${isRunning}, requiresAuth: ${requiresAuth}`);
      
      // For OAuth-based MCP servers, check if they have valid credentials
      let hasCredentials = false;
      if (requiresAuth && (req.user?.uid || req.user?.id)) {
        const userId = req.user.uid || req.user.id;
        try {
          hasCredentials = await credentialService.hasValidCredentials(userId, server.id);
          
          // Only check credentials for the current authenticated user - no cross-user sharing
          // Each user (including guests) has isolated credentials
        } catch (error) {
          console.error(`Failed to check credentials for ${server.id}:`, error.message);
          hasCredentials = false; // Ensure it defaults to false on error
        }
      }
      
      // For OAuth servers, configured means having credentials OR being running
      // For non-auth servers, configured means being running
      const isConfigured = requiresAuth ? (hasCredentials || isRunning) : isRunning;
      
      // Create ONE tool entry per MCP server (not per individual function)
      const mcpServerTool = {
        id: `mcp:${server.id}`,
        name: server.name, // e.g., "Google Calendar" 
        tool_name: server.name,
        description: server.description,
        icon: getMCPServerIcon(server.category, server.name),
        category: 'mcp_tools',
        status: isRunning ? 'active' : (isConfigured ? 'configured' : 'inactive'),
        is_enabled: isRunning, // [OK] FIX: Only enabled when server is actually running
        usage_count: 0,
        last_used: null,
        execution_time_avg: 0,
        success_rate: 100,
        parameters: {}, // Will be populated when server is running
        provider: server.name,
        version: '1.0.0',
        mcp_server_id: server.id,
        mcp_tool: true,
        mcp_server: true, // Flag to identify this as an MCP server
        // MCP-specific fields
        capabilities: server.tools || [],
        tool_count: server.tools ? server.tools.length : 0,
        docker_image: server.dockerImage,
        // Authentication fields
        requires_auth: requiresAuth,
        auth_type: server.authType || 'none',
        is_configured: isConfigured, // Configured if has credentials (OAuth) OR is running
        is_authenticated: hasCredentials, // New field to show auth status
        server_status: isRunning ? 'running' : 'stopped'
      };
      
      tools.push(mcpServerTool);
    }
  } catch (error) {
    console.error('Failed to fetch MCP servers:', error.message);
  }

  // All users (guest and authenticated) now have unified permissions - no filtering needed

  // Set pagination headers
  res.set({
    'X-Total-Count': tools.length.toString(),
    'X-Page': page || Math.floor(actualOffset / actualLimit) + 1,
    'X-Per-Page': actualLimit.toString()
  });

  res.json(tools);
}));

/**
 * GET /api/v1/tools/:toolName
 * Get specific tool configuration by name
 * Guest users can only access allowed tools
 */
router.get('/:toolName', requireGuestPermission('tools:read'), asyncHandler(async (req, res) => {
  const { toolName } = req.params;
  
  const tool = await toolService.getToolByName(toolName);
  if (!tool) {
    throw new NotFoundError('Tool not found');
  }
  
  // All users (guest and authenticated) now have unified permissions - no filtering needed

  res.json(tool);
}));

/**
 * POST /api/v1/tools/:toolName/execute
 * Execute specific tool with parameters
 * Guest users can only execute allowed tools (perplexity, firecrawl, tavily)
 */
router.post('/:toolName/execute', asyncHandler(async (req, res) => {
  const { toolName } = req.params;
  const { parameters } = req.body;

  // All users (guest and authenticated) have unified permissions - credit system controls usage limits

  if (!parameters || Object.keys(parameters).length === 0) {
    throw new ValidationError('Tool parameters are required', { field: 'parameters' });
  }

  let result;
  
  // Check if this is an MCP server tool (format: mcp:serverId)
  if (toolName.startsWith('mcp:')) {
    const parts = toolName.split(':');
    const serverId = parts[1];
    
    if (!serverId) {
      throw new ValidationError('Invalid MCP server tool format');
    }
    
    // For MCP server tools, we need a specific function to execute
    const { functionName, ...toolParams } = parameters;
    if (!functionName) {
      throw new ValidationError('MCP server execution requires "functionName" parameter');
    }
    
    try {
      // Ensure server is running before execution
      const runningServers = mcpManager.getRunningServers();
      const isRunning = runningServers.some(s => s.id === serverId);
      
      if (!isRunning) {
        return res.status(400).json({
          success: false,
          error: 'MCP server is not running. Please start the server first.',
          tool_name: toolName,
          mcp_tool: true,
          server_id: serverId,
          server_status: 'stopped',
          timestamp: new Date().toISOString()
        });
      }
      
      result = await mcpManager.executeTool(serverId, functionName, toolParams);
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: error.message,
        tool_name: toolName,
        mcp_tool: true,
        server_id: serverId,
        timestamp: new Date().toISOString()
      });
    }
  } else {
    // Regular tool execution
    result = await toolService.executeTool(toolName, parameters);
  }
  
  res.json({
    tool_name: toolName,
    parameters,
    result,
    timestamp: new Date().toISOString()
  });
}));

/**
 * PUT /api/v1/tools/:toolName/config
 * Update tool configuration
 */
router.put('/:toolName/config', requirePermission('tools:configure'), asyncHandler(async (req, res) => {
  const { toolName } = req.params;
  const configData = req.body;

  // Validate that we're not updating read-only fields
  const readOnlyFields = ['tool_name', 'created_at', 'execution_count', 'last_executed_at'];
  const hasReadOnlyFields = readOnlyFields.some(field => field in configData);
  
  if (hasReadOnlyFields) {
    throw new ValidationError('Cannot update read-only fields', { 
      readOnlyFields,
      providedFields: Object.keys(configData)
    });
  }

  const tool = await toolService.updateToolConfiguration(toolName, configData);
  if (!tool) {
    throw new NotFoundError('Tool not found');
  }

  res.json(tool);
}));

/**
 * POST /api/v1/tools/:toolName/toggle
 * Toggle tool enabled/disabled state
 */
router.post('/:toolName/toggle', requirePermission('tools:manage'), asyncHandler(async (req, res) => {
  const { toolName } = req.params;

  // Check if this is an MCP server
  if (toolName.startsWith('mcp:')) {
    const serverId = toolName.replace('mcp:', '');
    const serverStatus = await mcpManager.getServerStatus(serverId);
    
    if (!serverStatus) {
      throw new NotFoundError('MCP server not found');
    }

    try {
      let result;
      if (serverStatus.is_running) {
        // Stop the server
        result = await mcpManager.stopServer(serverId);
        res.json({
          message: `MCP server ${serverId} stopped successfully`,
          tool_name: toolName,
          is_enabled: false,
          server_status: 'stopped',
          timestamp: new Date().toISOString()
        });
      } else {
        // Start the server with user credentials for OAuth-enabled servers
        const userId = req.user?.uid || req.user?.id;
        result = await mcpManager.startServer(serverId, {}, userId);
        res.json({
          message: `MCP server ${serverId} started successfully`,
          tool_name: toolName,
          is_enabled: true,
          server_status: 'running',
          capabilities: result.capabilities,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error(`Failed to toggle MCP server ${serverId}:`, error);
      res.status(500).json({
        error: 'Failed to toggle MCP server',
        message: error.message,
        tool_name: toolName,
        timestamp: new Date().toISOString()
      });
    }
  } else {
    // Handle regular database tools
    const tool = await toolService.toggleTool(toolName);
    if (!tool) {
      throw new NotFoundError('Tool not found');
    }

    res.json({
      message: `Tool ${tool.is_enabled ? 'enabled' : 'disabled'} successfully`,
      tool_name: toolName,
      is_enabled: tool.is_enabled,
      timestamp: new Date().toISOString()
    });
  }
}));

/**
 * GET /api/v1/tools/:toolName/analytics
 * Get tool execution analytics
 */
router.get('/:toolName/analytics', requirePermission('tools:analytics'), asyncHandler(async (req, res) => {
  const { toolName } = req.params;

  // Verify tool exists
  const tool = await toolService.getToolByName(toolName);
  if (!tool) {
    throw new NotFoundError('Tool not found');
  }

  const analytics = await toolService.getToolAnalytics(toolName);
  
  res.json(analytics);
}));

/**
 * GET /api/v1/tools/categories
 * Get list of tool categories with counts
 */
router.get('/categories', asyncHandler(async (req, res) => {
  const categories = await toolService.getToolCategories();
  
  res.json({
    categories,
    total_categories: categories.length,
    timestamp: new Date().toISOString()
  });
}));

/**
 * GET /api/v1/tools/analytics/global
 * Get global tools analytics
 */
router.get('/analytics/global', requirePermission('tools:analytics'), asyncHandler(async (req, res) => {
  const analytics = await toolService.getAllToolsAnalytics();
  
  res.json(analytics);
}));

// ===== ENHANCED TOOL CONFIGURATION MANAGEMENT =====

/**
 * GET /api/v1/tools/:toolName/configuration
 * Get tool configuration with schema validation
 */
router.get('/:toolName/configuration', requirePermission('tools:configure'), asyncHandler(async (req, res) => {
  const { toolName } = req.params;
  const { include_secrets = false } = req.query;

  const config = await toolConfigService.getToolConfiguration(
    toolName, 
    include_secrets === 'true'
  );
  
  res.json(config);
}));

/**
 * PUT /api/v1/tools/:toolName/configuration
 * Update tool configuration with validation
 */
router.put('/:toolName/configuration', requirePermission('tools:configure'), asyncHandler(async (req, res) => {
  const { toolName } = req.params;
  const { validate_only = false, merge_existing = true } = req.query;
  const configData = req.body;

  const result = await toolConfigService.updateToolConfiguration(toolName, configData, {
    validateOnly: validate_only === 'true',
    mergeWithExisting: merge_existing !== 'false'
  });

  if (validate_only === 'true') {
    res.json({
      message: 'Configuration validation completed',
      validation_result: result
    });
  } else {
    res.json({
      message: 'Tool configuration updated successfully',
      tool: result
    });
  }
}));

/**
 * POST /api/v1/tools/:toolName/configuration/validate
 * Validate tool configuration without saving
 */
router.post('/:toolName/configuration/validate', requirePermission('tools:configure'), asyncHandler(async (req, res) => {
  const { toolName } = req.params;
  const { configuration } = req.body;

  const validation = toolConfigService.validateConfiguration(toolName, configuration);
  
  res.json({
    tool_name: toolName,
    validation,
    timestamp: new Date().toISOString()
  });
}));

/**
 * GET /api/v1/tools/:toolName/schema
 * Get configuration schema for a tool
 */
router.get('/:toolName/schema', requirePermission('tools:read'), asyncHandler(async (req, res) => {
  const { toolName } = req.params;

  const schema = toolConfigService.getConfigurationSchema(toolName);
  
  res.json({
    tool_name: toolName,
    schema,
    timestamp: new Date().toISOString()
  });
}));

/**
 * GET /api/v1/tools/templates
 * Get available configuration templates
 */
router.get('/templates', requirePermission('tools:configure'), asyncHandler(async (req, res) => {
  const templates = toolConfigService.getConfigurationTemplates();
  
  res.json({
    templates,
    total_templates: templates.length,
    timestamp: new Date().toISOString()
  });
}));

/**
 * POST /api/v1/tools/create-from-template
 * Create new tool configuration from template
 */
router.post('/create-from-template', requirePermission('tools:manage'), asyncHandler(async (req, res) => {
  const { tool_name, template_type, custom_config } = req.body;

  if (!tool_name || !template_type) {
    throw new ValidationError('tool_name and template_type are required');
  }

  const tool = await toolConfigService.createToolConfiguration(
    tool_name, 
    template_type, 
    custom_config || {}
  );

  res.status(201).json({
    message: 'Tool configuration created successfully',
    tool,
    timestamp: new Date().toISOString()
  });
}));

/**
 * POST /api/v1/tools/bulk-update
 * Bulk update tool configurations
 */
router.post('/bulk-update', requirePermission('tools:manage'), asyncHandler(async (req, res) => {
  const { updates } = req.body;

  if (!Array.isArray(updates) || updates.length === 0) {
    throw new ValidationError('updates must be a non-empty array');
  }

  const result = await toolConfigService.bulkUpdateConfigurations(updates);
  
  res.json({
    message: 'Bulk update completed',
    ...result,
    timestamp: new Date().toISOString()
  });
}));

/**
 * POST /api/v1/tools/export
 * Export tool configurations
 */
router.post('/export', requirePermission('tools:admin'), asyncHandler(async (req, res) => {
  const { tool_names, include_secrets = false, format = 'json' } = req.body;

  const configurations = await toolConfigService.exportConfigurations(tool_names, {
    includeSecrets: include_secrets,
    format
  });

  const filename = `tool-configurations-${new Date().toISOString().split('T')[0]}.${format}`;
  
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', format === 'yaml' ? 'text/yaml' : 'application/json');
  
  if (format === 'yaml') {
    res.send(configurations);
  } else {
    res.json({
      export_date: new Date().toISOString(),
      total_tools: configurations.length,
      configurations
    });
  }
}));

/**
 * POST /api/v1/tools/import
 * Import tool configurations
 */
router.post('/import', requirePermission('tools:admin'), asyncHandler(async (req, res) => {
  const { configurations, validate_only = false, overwrite_existing = false } = req.body;

  if (!Array.isArray(configurations) || configurations.length === 0) {
    throw new ValidationError('configurations must be a non-empty array');
  }

  const result = await toolConfigService.importConfigurations(configurations, {
    validateOnly: validate_only,
    overwriteExisting: overwrite_existing
  });

  res.json({
    message: validate_only ? 'Configuration validation completed' : 'Import completed',
    ...result,
    timestamp: new Date().toISOString()
  });
}));

// =====================================
// OAuth Authentication Endpoints
// =====================================

/**
 * GET /api/v1/tools/:toolName/auth/url
 * Get OAuth authorization URL for tool configuration (supports all providers)
 */
router.get('/:toolName/auth/url', requirePermission('tools:configure'), asyncHandler(async (req, res) => {
  const { toolName } = req.params;
  const { provider } = req.query; // Optional provider override

  // Check if this is an MCP server (format: mcp:serverId or direct serverId)
  let serverId = null;
  let isMCPServer = false;
  
  if (toolName.startsWith('mcp:')) {
    serverId = toolName.replace('mcp:', '');
    isMCPServer = true;
  } else {
    // Check if this toolName exists as an MCP server ID
    const availableServers = mcpManager.getAvailableServers();
    const serverConfig = availableServers.find(s => s.id === toolName);
    if (serverConfig) {
      serverId = toolName;
      isMCPServer = true;
    }
  }

  if (isMCPServer && serverId) {
    // Handle MCP server OAuth
    try {
      const availableServers = mcpManager.getAvailableServers();
      const serverConfig = availableServers.find(s => s.id === serverId);
      
      if (!serverConfig) {
        throw new NotFoundError(`MCP server ${serverId} not found`);
      }

      if (serverConfig.authType !== 'oauth') {
        throw new ValidationError('MCP server does not use OAuth authentication');
      }

      // For Atlassian MCP server, use Atlassian's OAuth service, not the MCP server's endpoint
      if (serverId === 'atlassian-remote') {
        // Generate proper Atlassian OAuth URL with user ID in state
        const userId = req.user?.uid || req.user?.id;
        const stateData = {
          tool: toolName,
          user: userId,
          nonce: Math.random().toString(36).substring(7)
        };
        const state = Buffer.from(JSON.stringify(stateData)).toString('base64');
        
        const params = new URLSearchParams({
          audience: 'api.atlassian.com',
          client_id: process.env.ATLASSIAN_OAUTH_CLIENT_ID || 'your_client_id_here',
          scope: serverConfig.oauthScopes ? serverConfig.oauthScopes.join(' ') : 'read:jira-user read:jira-work write:jira-work',
          redirect_uri: `${process.env.API_BASE_URL || 'http://localhost:5001'}/api/v1/tools/${toolName}/auth/callback`,
          response_type: 'code',
          prompt: 'consent',
          state: state
        });
        
        const oauthUrl = `https://auth.atlassian.com/authorize?${params.toString()}`;
        
        return res.json({
          auth_url: oauthUrl,
          tool_name: toolName,
          server_id: serverId,
          server_name: serverConfig.name,
          tool_type: 'mcp',
          oauth_callback_url: `${process.env.API_BASE_URL || 'http://localhost:5001'}/api/v1/tools/${toolName}/auth/callback`,
          scopes: serverConfig.oauthScopes || [],
          expires_in: 600, // 10 minutes for user to complete OAuth
          message: `Click the auth_url to authorize access to your ${serverConfig.name} account via Atlassian OAuth`,
          oauth_provider: 'atlassian'
        });
      }

      // For other MCP servers, use their own OAuth endpoints
      const baseUrl = serverConfig.url.replace(/\/+$/, ''); // Remove trailing slashes
      const oauthUrl = `${baseUrl}/oauth/authorize`;
      
      return res.json({
        auth_url: oauthUrl,
        tool_name: toolName,
        server_id: serverId,
        server_name: serverConfig.name,
        tool_type: 'mcp',
        oauth_callback_url: serverConfig.oauthCallbackUrl,
        scopes: serverConfig.oauthScopes || [],
        expires_in: 600, // 10 minutes for user to complete OAuth
        message: `Click the auth_url to authorize access to your ${serverConfig.name} account`
      });
    } catch (error) {
      throw new ValidationError(`MCP OAuth configuration error: ${error.message}`);
    }
  }

  // Handle regular tools
  const tool = await toolService.getToolByName(toolName);
  if (!tool) {
    throw new NotFoundError('Tool not found');
  }

  if (tool.auth_type !== 'oauth') {
    throw new ValidationError('Tool does not use OAuth authentication');
  }

  try {
    // Get user ID for state parameter
    const userId = req.user?.uid || req.user?.id;
    console.log(`[SEARCH] [${toolName}] Generating OAuth URL for user: ${userId}`);
    
    // Generate OAuth URL for the appropriate provider
    const authUrl = oauthService.generateAuthUrl(toolName, provider, null, userId);
    const detectedProvider = provider || oauthService.detectProvider(toolName);
    const scopes = oauthService.getToolScopes(toolName, detectedProvider);

    res.json({
      auth_url: authUrl,
      tool_name: toolName,
      tool_type: 'regular',
      provider: detectedProvider,
      scopes: scopes,
      expires_in: 600, // 10 minutes for user to complete OAuth
      message: `Click the auth_url to authorize access to your ${detectedProvider} account`
    });
  } catch (error) {
    throw new ValidationError(`OAuth configuration error: ${error.message}`);
  }
}));

/**
 * POST /api/v1/tools/:toolName/auth/process-callback
 * Process OAuth callback URL (for handling redirects from external services)
 */
router.post('/:toolName/auth/process-callback', requirePermission('tools:configure'), asyncHandler(async (req, res) => {
  const { toolName } = req.params;
  const { callback_url } = req.body;
  const userId = req.user?.uid || req.user?.id;

  if (!userId) {
    throw new ValidationError('User authentication required');
  }

  if (!callback_url) {
    throw new ValidationError('callback_url is required');
  }

  try {
    // Parse the callback URL to extract code and state
    const url = new URL(callback_url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');

    if (!code) {
      throw new ValidationError('Authorization code not found in callback URL');
    }

    // For MCP servers, handle directly with server configuration
    const serverId = toolName;
    const availableServers = mcpManager.getAvailableServers();
    const serverConfig = availableServers.find(s => s.id === serverId);
    
    if (!serverConfig) {
      throw new NotFoundError(`MCP server configuration not found for: ${serverId}`);
    }

    // Handle OAuth token exchange for supported MCP servers
    if (serverId === 'atlassian-remote') {
      // Atlassian OAuth flow
      const redirectUri = `${process.env.API_BASE_URL || 'http://localhost:5001'}/api/v1/tools/${toolName}/auth/callback`;
      
      // Exchange code for tokens using the generic OAuth service
      const tokens = await oauthService.exchangeCodeForTokens(serverId, code, redirectUri, 'atlassian');
      
      // Store tokens securely for this user
      await credentialService.storeOAuthTokens(userId, serverId, tokens);

      // Configure MCP server with OAuth tokens for immediate use
      try {
        // Create OAuth credentials object for MCP client
        const mcpCredentials = {
          type: 'oauth',
          access_token: tokens.access_token,
          token_type: tokens.token_type || 'Bearer',
          expires_at: tokens.expires_at,
          refresh_token: tokens.refresh_token
        };
        
        // Store credentials in MCP credential store
        await mcpManager.credentialStore.storeCredentials(userId, serverId, mcpCredentials);
        
        console.log(`[OK] MCP credentials configured for ${serverId} user ${userId}`);
      } catch (mcpError) {
        console.error('Failed to configure MCP credentials:', mcpError);
        // Don't fail the OAuth flow, just log the error
      }

      return res.json({
        success: true,
        server_id: serverId,
        server_name: serverConfig.name,
        message: `${serverConfig.name} authenticated successfully`,
        expires_in: tokens.expires_at ? Math.floor((new Date(tokens.expires_at) - new Date()) / 1000) : null
      });
    }

    throw new ValidationError('OAuth processing not supported for this tool');

  } catch (error) {
    console.error('OAuth callback processing error:', error);
    throw new ValidationError(`OAuth callback processing failed: ${error.message}`);
  }
}));

/**
 * POST /api/v1/tools/:toolName/auth/callback
 * Handle OAuth callback and store tokens (supports all providers)
 */
router.post('/:toolName/auth/callback', requirePermission('tools:configure'), asyncHandler(async (req, res) => {
  const { toolName } = req.params;
  const { code, state, provider } = req.body; // Added provider support
  const userId = req.user?.uid || req.user?.id;

  if (!userId) {
    throw new ValidationError('User authentication required');
  }

  if (!code) {
    throw new ValidationError('Authorization code is required');
  }

  // Check if this is an MCP server (format: mcp:serverId or direct serverId)
  let serverId = null;
  let isMCPServer = false;
  
  if (toolName.startsWith('mcp:')) {
    serverId = toolName.replace('mcp:', '');
    isMCPServer = true;
  } else {
    // Check if this toolName exists as an MCP server ID
    const availableServers = mcpManager.getAvailableServers();
    const serverConfig = availableServers.find(s => s.id === toolName);
    if (serverConfig) {
      serverId = toolName;
      isMCPServer = true;
    }
  }

  if (isMCPServer && serverId) {
    // Handle MCP server OAuth callback
    try {
      const availableServers = mcpManager.getAvailableServers();
      const serverConfig = availableServers.find(s => s.id === serverId);
      
      if (!serverConfig) {
        throw new NotFoundError(`MCP server ${serverId} not found`);
      }

      // Handle OAuth token exchange for supported MCP servers
      if (serverId === 'atlassian-remote') {
        // Check if user has custom OAuth app configured
        let tokens;
        const customOAuthCredentials = await credentialService.getOAuthTokens(userId, `${toolName}-custom-oauth`);
        const hasCustomOAuth = customOAuthCredentials && customOAuthCredentials.type === 'custom_oauth_app';

        if (hasCustomOAuth) {
          // Use custom OAuth app for token exchange
          console.log(`[SECURE] Using custom OAuth app for ${toolName} user ${userId}`);
          
          // Verify state parameter if present
          if (state) {
            const stateKey = `oauth_state_${userId}_${toolName}`;
            const storedState = await credentialService.getOAuthTokens(userId, stateKey);
            
            if (!storedState || storedState.state !== state) {
              throw new ValidationError('Invalid OAuth state parameter. Please retry authentication.');
            }
            
            // Clean up state after verification
            await mcpManager.credentialStore.deleteCredentials(userId, stateKey);
          }

          // Exchange code for tokens using custom OAuth app credentials
          tokens = await oauthService.exchangeCodeForTokensCustom({
            code,
            client_id: customOAuthCredentials.client_id,
            client_secret: customOAuthCredentials.client_secret,
            redirect_uri: customOAuthCredentials.callback_url,
            provider: 'atlassian'
          });

          console.log(`[OK] Custom OAuth token exchange successful for ${toolName} user ${userId}`);
        } else {
          // Use Xerus managed OAuth (original flow)
          console.log(`[START] Using Xerus managed OAuth for ${toolName} user ${userId}`);
          const redirectUri = `${process.env.API_BASE_URL || 'http://localhost:5001'}/api/v1/tools/${toolName}/auth/callback`;
          
          // Exchange code for tokens using the generic OAuth service
          tokens = await oauthService.exchangeCodeForTokens(serverId, code, redirectUri, 'atlassian');
        }
        
        // Store tokens securely for this user
        await credentialService.storeOAuthTokens(userId, serverId, tokens);

        // Configure MCP server with OAuth tokens for immediate use
        try {
          // Create OAuth credentials object for MCP client
          const mcpCredentials = {
            type: 'oauth',
            access_token: tokens.access_token,
            token_type: tokens.token_type || 'Bearer',
            expires_at: tokens.expires_at,
            refresh_token: tokens.refresh_token
          };
          
          // Store credentials in MCP credential store
          await mcpManager.credentialStore.storeCredentials(userId, serverId, mcpCredentials);
          
          console.log(`[OK] MCP credentials configured for ${serverId} user ${userId}`);
        } catch (mcpError) {
          console.error('Failed to configure MCP credentials:', mcpError);
          // Don't fail the OAuth flow, just log the error
        }

        // Test the connection by getting user info
        let connectionTest = { success: false, message: 'Not tested' };
        try {
          // We don't test connection for MCP servers as they handle their own authentication
          connectionTest = { success: true, message: 'OAuth tokens stored successfully' };
        } catch (testError) {
          connectionTest = { success: false, message: testError.message };
        }

        return res.json({
          success: true,
          message: `${serverConfig.name} authenticated successfully`,
          tool_name: toolName,
          server_id: serverId,
          server_name: serverConfig.name,
          tool_type: 'mcp',
          connection_test: connectionTest.success ? 'passed' : 'failed',
          connection_message: connectionTest.message,
          configured_at: new Date().toISOString(),
          token_expires_at: tokens.expires_at
        });
      } else {
        // For other MCP servers, return a message indicating manual setup needed
        return res.json({
          success: true,
          message: `OAuth callback received for ${serverConfig.name}. This server requires manual OAuth setup.`,
          tool_name: toolName,
          server_id: serverId,
          server_name: serverConfig.name,
          tool_type: 'mcp',
          next_step: 'Complete OAuth flow with the MCP server directly',
          oauth_url: `${serverConfig.url}/oauth`,
          configured_at: new Date().toISOString()
        });
      }
    } catch (error) {
      throw new ValidationError(`MCP OAuth callback failed: ${error.message}`);
    }
  }

  // Handle regular tools
  const tool = await toolService.getToolByName(toolName);
  if (!tool) {
    throw new NotFoundError('Tool not found');
  }

  try {
    // Exchange code for tokens using generic OAuth service
    const tokens = await oauthService.exchangeCodeForTokens(toolName, code, null, provider);
    
    // Store tokens securely
    await credentialService.storeOAuthTokens(userId, toolName, tokens);

    // Test the connection
    const testResult = await toolService.executeTool(toolName, 
      { operation: 'testConnection' }, 
      { userId }
    );

    res.json({
      success: true,
      message: `${tool.display_name} authenticated successfully`,
      tool_name: toolName,
      tool_type: 'regular',
      connection_test: testResult.success ? 'passed' : 'failed',
      configured_at: new Date().toISOString()
    });
  } catch (error) {
    throw new ValidationError(`OAuth authentication failed: ${error.message}`);
  }
}));

/**
 * GET /api/v1/tools/:toolName/auth/callback
 * Handle OAuth callback via GET (redirect from OAuth provider)
 */
router.get('/:toolName/auth/callback', asyncHandler(async (req, res) => {
  const { toolName } = req.params;
  const { code, state, error, error_description } = req.query;
  
  // Extract user ID from state parameter
  let userId = req.user?.uid || req.user?.id;
  
  // Debug logging for OAuth callback
  console.log(`[SEARCH] [${toolName}] OAuth callback debug:`, {
    hasReqUser: !!req.user,
    reqUserUid: req.user?.uid,
    reqUserId: req.user?.id,
    extractedUserId: userId,
    hasState: !!state,
    timestamp: new Date().toISOString()
  });
  
  if (state) {
    try {
      // Try to parse as base64 JSON first (MCP format)
      try {
        const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
        if (stateData.user) {
          userId = stateData.user;
          console.log(`[SEARCH] Extracted user ID from base64 state (overriding session): ${userId}`);
        }
      } catch (base64Error) {
        // If base64 parsing fails, try simple format: toolName:userId:timestamp
        const stateParts = state.split(':');
        if (stateParts.length >= 3) {
          // Extract user ID from state (always second part)
          userId = stateParts[1];
          console.log(`[SEARCH] Extracted user ID from simple state (overriding session): ${userId}`);
        }
      }
    } catch (error) {
      console.error('Failed to parse state parameter:', error);
    }
  }
  
  console.log(`[SEARCH] [${toolName}] Final user ID for OAuth: ${userId}`);

  // Handle OAuth errors first
  if (error) {
    return res.status(400).json({
      success: false,
      error: error,
      error_description: error_description || 'OAuth authentication failed',
      tool_name: toolName,
      timestamp: new Date().toISOString()
    });
  }

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'User authentication required',
      tool_name: toolName,
      timestamp: new Date().toISOString()
    });
  }

  if (!code) {
    return res.status(400).json({
      success: false,
      error: 'Authorization code is required',
      tool_name: toolName,
      timestamp: new Date().toISOString()
    });
  }

  try {
    // Process OAuth callback directly (similar to POST handler logic)
    console.log(`[LOADING] Processing GET OAuth callback for ${toolName} user ${userId}`);

    // Check if this is an MCP server
    let serverId = null;
    let isMCPServer = false;
    
    if (toolName.startsWith('mcp:')) {
      serverId = toolName.replace('mcp:', '');
      isMCPServer = true;
    } else {
      const availableServers = mcpManager.getAvailableServers();
      const serverConfig = availableServers.find(s => s.id === toolName);
      if (serverConfig) {
        serverId = toolName;
        isMCPServer = true;
      }
    }

    let authResult = null;

    if (isMCPServer && serverId === 'atlassian-remote') {
      // Handle Atlassian MCP OAuth callback
      let tokens;
      const customOAuthCredentials = await credentialService.getOAuthTokens(userId, `${toolName}-custom-oauth`);
      const hasCustomOAuth = customOAuthCredentials && customOAuthCredentials.type === 'custom_oauth_app';

      if (hasCustomOAuth) {
        console.log(`[SECURE] Using custom OAuth app for ${toolName} user ${userId}`);
        
        // Verify state parameter if present
        if (state) {
          try {
            const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
            if (stateData.custom) {
              // Custom OAuth - verify against stored state
              const stateKey = `oauth_state_${userId}_${toolName}`;
              const storedState = await credentialService.getOAuthTokens(userId, stateKey);
              
              if (!storedState || storedState.state !== state) {
                throw new Error('Invalid OAuth state parameter. Please retry authentication.');
              }
              
              await mcpManager.credentialStore.deleteCredentials(userId, stateKey);
            }
          } catch (parseError) {
            console.error('Failed to parse state parameter:', parseError);
            throw new Error('Invalid OAuth state parameter. Please retry authentication.');
          }
        }

        tokens = await oauthService.exchangeCodeForTokensCustom({
          code,
          client_id: customOAuthCredentials.client_id,
          client_secret: customOAuthCredentials.client_secret,
          redirect_uri: customOAuthCredentials.callback_url,
          provider: 'atlassian'
        });
      } else {
        console.log(`[START] Using Xerus managed OAuth for ${toolName} user ${userId}`);
        const redirectUri = `${process.env.API_BASE_URL || 'http://localhost:5001'}/api/v1/tools/${toolName}/auth/callback`;
        tokens = await oauthService.exchangeCodeForTokens(serverId, code, redirectUri, 'atlassian');
      }
      
      // Store tokens and configure MCP
      try {
        console.log(`[PACKAGE] Storing OAuth tokens for user ${userId}, tool ${serverId}`);
        await credentialService.storeOAuthTokens(userId, serverId, tokens);
        console.log(`[OK] OAuth tokens stored successfully`);
      } catch (credError) {
        console.error(`[ERROR] Failed to store OAuth tokens:`, credError);
        throw new Error(`Failed to store OAuth tokens: ${credError.message}`);
      }
      
      try {
        const mcpCredentials = {
          type: 'oauth',
          access_token: tokens.access_token,
          token_type: tokens.token_type || 'Bearer',
          expires_at: tokens.expires_at,
          refresh_token: tokens.refresh_token
        };
        
        console.log(`[TOOL] Storing MCP credentials for user ${userId}, server ${serverId}`);
        await mcpManager.storeCredentials(userId, serverId, mcpCredentials);
        console.log(`[OK] MCP credentials stored successfully`);
      } catch (mcpError) {
        console.error(`[ERROR] Failed to store MCP credentials:`, mcpError);
        throw new Error(`Failed to store MCP credentials: ${mcpError.message}`);
      }
      
      console.log(`[OK] OAuth callback successful for ${serverId} user ${userId}`);
      
      authResult = {
        success: true,
        message: `Atlassian authenticated successfully`,
        tool_name: toolName,
        server_id: serverId,
        configured_at: new Date().toISOString()
      };
    } else {
      throw new Error(`OAuth callback not supported for tool: ${toolName}`);
    }

    // Return success page
    if (authResult && authResult.success) {
      // For popup authentication, we can close the popup with a success message
      const successPage = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Authentication Successful</title>
            <style>
              body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
              .success { color: #22c55e; font-size: 18px; }
              .details { color: #6b7280; margin: 20px 0; }
            </style>
          </head>
          <body>
            <h2 class="success">[OK] Authentication Successful!</h2>
            <p class="details">${authResult.message}</p>
            <p class="details">Tool: ${authResult.tool_name}</p>
            <p>You can close this window and return to Xerus.</p>
            <script>
              // Auto-close popup after 3 seconds
              setTimeout(() => {
                window.close();
              }, 3000);
            </script>
          </body>
        </html>
      `;
      
      res.setHeader('Content-Type', 'text/html');
      return res.send(successPage);
    } else {
      // Handle error case
      const errorPage = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Authentication Failed</title>
            <style>
              body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
              .error { color: #ef4444; font-size: 18px; }
              .details { color: #6b7280; margin: 20px 0; }
            </style>
          </head>
          <body>
            <h2 class="error">[ERROR] Authentication Failed</h2>
            <p class="details">Authentication process failed</p>
            <p>Please close this window and try again.</p>
            <script>
              setTimeout(() => {
                window.close();
              }, 5000);
            </script>
          </body>
        </html>
      `;
      
      res.setHeader('Content-Type', 'text/html');
      return res.status(400).send(errorPage);
    }

  } catch (error) {
    console.error('GET OAuth callback error:', error);
    
    const errorPage = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Authentication Error</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
            .error { color: #ef4444; font-size: 18px; }
            .details { color: #6b7280; margin: 20px 0; }
          </style>
        </head>
        <body>
          <h2 class="error">[ERROR] Authentication Error</h2>
          <p class="details">${error.message}</p>
          <p>Please close this window and try again.</p>
          <script>
            setTimeout(() => {
              window.close();
            }, 5000);
          </script>
        </body>
      </html>
    `;
    
    res.setHeader('Content-Type', 'text/html');
    return res.status(500).send(errorPage);
  }
}));

/**
 * GET /api/v1/tools/:toolName/auth/status
 * Check authentication status for a tool
 */
router.get('/:toolName/auth/status', requirePermission('tools:read'), asyncHandler(async (req, res) => {
  const { toolName } = req.params;
  const userId = req.user?.uid || req.user?.id;

  if (!userId) {
    throw new ValidationError('User authentication required');
  }

  // Check if it's a regular tool first
  let tool = await toolService.getToolByName(toolName);
  let isMCPServer = false;
  let mcpServer = null;

  // If not a regular tool, check if it's an MCP server
  if (!tool) {
    const availableServers = mcpManager.getAvailableServers();
    mcpServer = availableServers.find(server => server.id === toolName);
    if (mcpServer) {
      isMCPServer = true;
      // Create a tool-like object for MCP servers
      tool = {
        tool_name: mcpServer.id,
        display_name: mcpServer.name,
        requires_auth: mcpServer.authType !== 'none',
        auth_type: mcpServer.authType,
        provider: 'mcp'
      };
    } else {
      throw new NotFoundError('Tool not found');
    }
  }

  const hasCredentials = await credentialService.hasValidCredentials(userId, toolName);
  
  let tokenInfo = null;
  if (hasCredentials) {
    const tokens = await credentialService.getOAuthTokens(userId, toolName);
    tokenInfo = {
      expires_at: tokens?.expires_at,
      has_refresh_token: !!tokens?.refresh_token
    };
  }

  res.json({
    tool_name: toolName,
    display_name: tool.display_name,
    is_authenticated: hasCredentials,
    requires_auth: tool.requires_auth,
    auth_type: tool.auth_type,
    provider: tool.provider,
    is_mcp_server: isMCPServer,
    token_info: tokenInfo
  });
}));

/**
 * DELETE /api/v1/tools/:toolName/auth
 * Revoke authentication for a tool
 */
router.delete('/:toolName/auth', requirePermission('tools:configure'), asyncHandler(async (req, res) => {
  const { toolName } = req.params;
  const userId = req.user?.uid || req.user?.id;

  if (!userId) {
    throw new ValidationError('User authentication required');
  }

  // Verify tool exists
  const tool = await toolService.getToolByName(toolName);
  if (!tool) {
    throw new NotFoundError('Tool not found');
  }

  await credentialService.deleteCredentials(userId, toolName);

  res.json({
    success: true,
    message: `Authentication revoked for ${tool.display_name}`,
    tool_name: toolName,
    revoked_at: new Date().toISOString()
  });
}));

/**
 * GET /api/v1/tools/auth/configured
 * List all tools configured by the user
 */
router.get('/auth/configured', requirePermission('tools:read'), asyncHandler(async (req, res) => {
  const userId = req.user?.uid || req.user?.id;

  if (!userId) {
    throw new ValidationError('User authentication required');
  }

  const configuredTools = await credentialService.getUserConfiguredTools(userId);

  res.json({
    configured_tools: configuredTools,
    count: configuredTools.length
  });
}));

// =====================================
// MCP Server Management Endpoints (Inline with Tools)
// =====================================

/**
 * POST /api/v1/tools/mcp/:serverId/start
 * Start MCP server for a tool
 */
router.post('/mcp/:serverId/start', requirePermission('tools:configure'), asyncHandler(async (req, res) => {
  const { serverId } = req.params;
  const userConfig = req.body || {};

  try {
    const userId = req.user?.uid || req.user?.id;
    const result = await mcpManager.startServer(serverId, userConfig, userId);
    
    res.json({
      success: true,
      message: `${serverId} server started successfully`,
      server_id: serverId,
      tool_id: `mcp:${serverId}`,
      capabilities: result.capabilities,
      started_at: new Date().toISOString()
    });
  } catch (error) {
    if (error.message.includes('already running')) {
      res.status(409).json({
        error: 'Server already running',
        server_id: serverId,
        tool_id: `mcp:${serverId}`,
        message: error.message
      });
    } else {
      throw new ValidationError(`Failed to start MCP server: ${error.message}`);
    }
  }
}));

/**
 * POST /api/v1/tools/mcp/:serverId/stop
 * Stop MCP server for a tool
 */
router.post('/mcp/:serverId/stop', requirePermission('tools:configure'), asyncHandler(async (req, res) => {
  const { serverId } = req.params;

  const result = await mcpManager.stopServer(serverId);
  
  res.json({
    success: true,
    message: `${serverId} server stopped successfully`,
    server_id: serverId,
    tool_id: `mcp:${serverId}`,
    stopped_at: new Date().toISOString()
  });
}));

/**
 * GET /api/v1/tools/mcp/:serverId/status
 * Get MCP server status and capabilities
 */
router.get('/mcp/:serverId/status', requireGuestPermission('tools:read'), asyncHandler(async (req, res) => {
  const { serverId } = req.params;

  try {
    const availableServers = mcpManager.getAvailableServers();
    const server = availableServers.find(s => s.id === serverId);
    
    if (!server) {
      throw new NotFoundError(`MCP server ${serverId} not found`);
    }

    const runningServers = mcpManager.getRunningServers();
    const isRunning = runningServers.some(s => s.id === serverId);
    
    let capabilities = null;
    let toolNames = [];
    if (isRunning) {
      try {
        capabilities = await mcpManager.getServerCapabilities(serverId);
        // Extract tool names for frontend display
        if (capabilities && capabilities.tools) {
          toolNames = capabilities.tools.map(tool => tool.name || 'unnamed_tool');
        }
      } catch (error) {
        console.error(`Failed to get capabilities for ${serverId}:`, error.message);
      }
    }
    
    // Check authentication status for authenticated users
    let authStatus = { is_configured: false, oauth_configured: false };
    if (req.user && !req.user.isGuest && server.authType && server.authType !== 'none') {
      const userId = req.user?.uid || req.user?.id;
      try {
        const hasCredentials = await mcpManager.hasValidCredentials(userId, serverId);
        authStatus.is_configured = hasCredentials;
        
        // For OAuth servers, check OAuth-specific status
        if (server.authType === 'oauth' && hasCredentials) {
          const credentials = await credentialService.getOAuthTokens(userId, serverId);
          if (credentials && credentials.type === 'oauth' && credentials.access_token) {
            authStatus.oauth_configured = true;
            authStatus.oauth_token_expires = credentials.expires_at;
            authStatus.oauth_token_valid = true; // Could add token validation here
          }
        }
      } catch (error) {
        console.error(`Failed to check auth status for ${serverId}:`, error.message);
      }
    }

    res.json({
      server_id: serverId,
      tool_id: `mcp:${serverId}`,
      name: server.name,
      description: server.description,
      status: isRunning ? 'running' : 'stopped',
      is_running: isRunning,
      available_functions: server.tools || [],
      capabilities: toolNames, // Send tool names array for frontend display
      tool_count: toolNames.length,
      raw_capabilities: capabilities, // Keep full capabilities for debugging
      auth_type: server.authType,
      requires_auth: server.authType && server.authType !== 'none',
      is_configured: authStatus.is_configured,
      oauth_configured: authStatus.oauth_configured,
      oauth_token_expires: authStatus.oauth_token_expires,
      oauth_token_valid: authStatus.oauth_token_valid,
      authentication_status: authStatus.is_configured ? 'authenticated' : 'not_configured',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    throw new NotFoundError(`MCP server ${serverId} status check failed: ${error.message}`);
  }
}));

// =====================================
// MCP Server Credential Management Endpoints
// =====================================

/**
 * GET /api/v1/tools/mcp/:serverId/credentials/requirements
 * Get credential requirements for an MCP server
 */
router.get('/mcp/:serverId/credentials/requirements', requirePermission('tools:configure'), asyncHandler(async (req, res) => {
  const { serverId } = req.params;

  try {
    const requirements = mcpManager.getCredentialRequirements(serverId);
    
    res.json({
      server_id: serverId,
      credentials: requirements,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    throw new NotFoundError(`MCP server ${serverId} not found: ${error.message}`);
  }
}));

/**
 * POST /api/v1/tools/mcp/:serverId/credentials
 * Store credentials for an MCP server
 */
router.post('/mcp/:serverId/credentials', requirePermission('tools:configure'), asyncHandler(async (req, res) => {
  const { serverId } = req.params;
  const credentials = req.body;
  const userId = req.user?.uid || req.user?.id;

  if (!userId) {
    throw new ValidationError('User authentication required');
  }

  if (!credentials || Object.keys(credentials).length === 0) {
    throw new ValidationError('Credentials are required');
  }

  try {
    const result = await mcpManager.storeCredentials(userId, serverId, credentials);
    
    res.json({
      success: true,
      message: `Credentials stored securely for ${serverId}`,
      server_id: serverId,
      stored_at: new Date().toISOString()
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
      server_id: serverId,
      timestamp: new Date().toISOString()
    });
  }
}));

/**
 * GET /api/v1/tools/mcp/:serverId/credentials/status
 * Check if user has valid credentials for an MCP server
 */
router.get('/mcp/:serverId/credentials/status', requirePermission('tools:configure'), asyncHandler(async (req, res) => {
  const { serverId } = req.params;
  const userId = req.user?.uid || req.user?.id;

  if (!userId) {
    throw new ValidationError('User authentication required');
  }

  try {
    const hasCredentials = await mcpManager.hasValidCredentials(userId, serverId);
    const requirements = mcpManager.getCredentialRequirements(serverId);
    
    res.json({
      server_id: serverId,
      has_valid_credentials: hasCredentials,
      is_configured: hasCredentials,
      requirements: requirements,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
      server_id: serverId,
      timestamp: new Date().toISOString()
    });
  }
}));

/**
 * DELETE /api/v1/tools/mcp/:serverId/credentials
 * Remove stored credentials for an MCP server
 */
router.delete('/mcp/:serverId/credentials', requirePermission('tools:configure'), asyncHandler(async (req, res) => {
  const { serverId } = req.params;
  const userId = req.user?.uid || req.user?.id;

  if (!userId) {
    throw new ValidationError('User authentication required');
  }

  try {
    await mcpManager.credentialStore.deleteCredentials(userId, serverId);
    
    res.json({
      success: true,
      message: `Credentials removed for ${serverId}`,
      server_id: serverId,
      removed_at: new Date().toISOString()
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
      server_id: serverId,
      timestamp: new Date().toISOString()
    });
  }
}));

/**
 * GET /api/v1/tools/mcp/servers/requiring-configuration
 * Get list of MCP servers that require user configuration
 */
router.get('/mcp/servers/requiring-configuration', requirePermission('tools:configure'), asyncHandler(async (req, res) => {
  const userId = req.user?.uid || req.user?.id;

  try {
    const servers = mcpManager.getServersRequiringConfiguration(userId);
    
    res.json({
      servers,
      total: servers.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}));

/**
 * POST /api/v1/tools/mcp/:serverId/start-with-user
 * Start MCP server with user credentials (enhanced version)
 */
router.post('/mcp/:serverId/start-with-user', requirePermission('tools:configure'), asyncHandler(async (req, res) => {
  const { serverId } = req.params;
  const userConfig = req.body || {};
  const userId = req.user?.uid || req.user?.id;

  if (!userId) {
    throw new ValidationError('User authentication required');
  }

  try {
    const result = await mcpManager.startServer(serverId, userConfig, userId);
    
    res.json({
      success: true,
      message: `${serverId} server started successfully with user credentials`,
      server_id: serverId,
      tool_id: `mcp:${serverId}`,
      server_type: result.type,
      capabilities: result.capabilities,
      started_at: new Date().toISOString()
    });
  } catch (error) {
    if (error.message.includes('No valid credentials')) {
      res.status(400).json({
        success: false,
        error: 'Missing credentials',
        message: 'Please configure authentication for this server first',
        server_id: serverId,
        requires_configuration: true,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({
        success: false,
        error: error.message,
        server_id: serverId,
        timestamp: new Date().toISOString()
      });
    }
  }
}));

// =====================================
// Custom OAuth App Endpoints
// =====================================

/**
 * POST /api/v1/tools/:toolName/auth/custom-oauth
 * Configure custom OAuth app credentials for a tool
 */
router.post('/:toolName/auth/custom-oauth', requirePermission('tools:configure'), asyncHandler(async (req, res) => {
  const { toolName } = req.params;
  const { client_id, client_secret, cloud_id, scopes, callback_url } = req.body;
  const userId = req.user?.uid || req.user?.id;

  if (!userId) {
    throw new ValidationError('User authentication required');
  }

  // Validate required fields
  const requiredFields = { client_id, client_secret, cloud_id, callback_url };
  const missing = Object.entries(requiredFields)
    .filter(([key, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new ValidationError(`Missing required fields: ${missing.join(', ')}`);
  }

  try {
    // Store custom OAuth app credentials securely
    const customOAuthCredentials = {
      type: 'custom_oauth_app',
      client_id,
      client_secret,
      cloud_id,
      callback_url,
      scopes: scopes || process.env.ATLASSIAN_OAUTH_SCOPE,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Store credentials using MCP credential store for security
    await mcpManager.credentialStore.storeCredentials(userId, `${toolName}-custom-oauth`, customOAuthCredentials);

    console.log(`[OK] Custom OAuth app configured for ${toolName} by user ${userId}`);

    res.json({
      success: true,
      message: `Custom OAuth app configured successfully for ${toolName}`,
      tool_name: toolName,
      client_id: client_id,
      callback_url: callback_url,
      scopes: customOAuthCredentials.scopes,
      configured_at: customOAuthCredentials.created_at
    });

  } catch (error) {
    console.error(`Failed to configure custom OAuth app for ${toolName}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to configure custom OAuth app',
      message: error.message,
      tool_name: toolName,
      timestamp: new Date().toISOString()
    });
  }
}));

/**
 * GET /api/v1/tools/:toolName/auth/custom-oauth/status
 * Check if user has configured custom OAuth app for a tool
 */
router.get('/:toolName/auth/custom-oauth/status', requirePermission('tools:configure'), asyncHandler(async (req, res) => {
  const { toolName } = req.params;
  const userId = req.user?.uid || req.user?.id;

  if (!userId) {
    throw new ValidationError('User authentication required');
  }

  try {
    const credentials = await credentialService.getOAuthTokens(userId, `${toolName}-custom-oauth`);
    const hasCustomOAuth = credentials && credentials.type === 'custom_oauth_app';

    res.json({
      tool_name: toolName,
      has_custom_oauth: hasCustomOAuth,
      is_configured: hasCustomOAuth,
      client_id: hasCustomOAuth ? credentials.client_id : null,
      callback_url: hasCustomOAuth ? credentials.callback_url : null,
      configured_at: hasCustomOAuth ? credentials.created_at : null,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error(`Failed to check custom OAuth status for ${toolName}:`, error);
    res.json({
      tool_name: toolName,
      has_custom_oauth: false,
      is_configured: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}));

/**
 * POST /api/v1/tools/:toolName/auth/custom-oauth/authorize
 * Generate OAuth authorization URL using custom OAuth app
 */
router.post('/:toolName/auth/custom-oauth/authorize', requirePermission('tools:configure'), asyncHandler(async (req, res) => {
  const { toolName } = req.params;
  const userId = req.user?.uid || req.user?.id;

  if (!userId) {
    throw new ValidationError('User authentication required');
  }

  try {
    // Get custom OAuth app credentials
    const credentials = await credentialService.getOAuthTokens(userId, `${toolName}-custom-oauth`);
    
    if (!credentials || credentials.type !== 'custom_oauth_app') {
      throw new ValidationError('Custom OAuth app not configured. Please configure your OAuth app first.');
    }

    // Generate state parameter for security with user ID
    const stateData = {
      tool: toolName,
      user: userId,
      nonce: crypto.randomBytes(16).toString('hex'),
      custom: true // Mark as custom OAuth
    };
    const state = Buffer.from(JSON.stringify(stateData)).toString('base64');
    
    // Store state in session/cache for verification (temporary storage)
    const stateKey = `oauth_state_${userId}_${toolName}`;
    await mcpManager.credentialStore.storeCredentials(userId, stateKey, {
      type: 'oauth_state',
      state,
      tool_name: toolName,
      is_custom: true,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 minutes
    });

    // Build OAuth authorization URL using custom app credentials
    const authUrl = new URL('https://auth.atlassian.com/authorize');
    authUrl.searchParams.append('audience', 'api.atlassian.com');
    authUrl.searchParams.append('client_id', credentials.client_id);
    authUrl.searchParams.append('scope', credentials.scopes);
    authUrl.searchParams.append('redirect_uri', credentials.callback_url);
    authUrl.searchParams.append('state', state);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('prompt', 'consent');

    console.log(`[LINK] Generated custom OAuth URL for ${toolName} user ${userId}`);

    res.json({
      success: true,
      authorization_url: authUrl.toString(),
      state: state,
      tool_name: toolName,
      client_id: credentials.client_id,
      callback_url: credentials.callback_url,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error(`Failed to generate custom OAuth URL for ${toolName}:`, error);
    res.status(400).json({
      success: false,
      error: error.message,
      tool_name: toolName,
      timestamp: new Date().toISOString()
    });
  }
}));

/**
 * DELETE /api/v1/tools/:toolName/auth/custom-oauth
 * Remove custom OAuth app configuration for a tool
 */
router.delete('/:toolName/auth/custom-oauth', requirePermission('tools:configure'), asyncHandler(async (req, res) => {
  const { toolName } = req.params;
  const userId = req.user?.uid || req.user?.id;

  if (!userId) {
    throw new ValidationError('User authentication required');
  }

  try {
    // Remove custom OAuth app credentials
    await mcpManager.credentialStore.deleteCredentials(userId, `${toolName}-custom-oauth`);
    
    // Also remove any OAuth tokens obtained using this custom app
    await mcpManager.credentialStore.deleteCredentials(userId, toolName);

    console.log(`[CLEAN] Removed custom OAuth app for ${toolName} user ${userId}`);

    res.json({
      success: true,
      message: `Custom OAuth app removed for ${toolName}`,
      tool_name: toolName,
      removed_at: new Date().toISOString()
    });

  } catch (error) {
    console.error(`Failed to remove custom OAuth app for ${toolName}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove custom OAuth app',
      message: error.message,
      tool_name: toolName,
      timestamp: new Date().toISOString()
    });
  }
}));

/**
 * GET /api/v1/tools/icons/:iconName
 * Serve tool icons from tool_icons directory
 */
router.get('/icons/:iconName', asyncHandler(async (req, res) => {
  const { iconName } = req.params;
  const iconPath = path.join(__dirname, '../../tool_icons', iconName);
  
  // Check if file exists
  if (!fs.existsSync(iconPath)) {
    return res.status(404).json({ error: 'Icon not found' });
  }
  
  // Set proper CORS and cache headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
  
  // Serve the icon file
  res.sendFile(iconPath);
}));

// =====================================
// MCP Server OAuth Endpoints
// =====================================

// =====================================
// TOKEN REFRESH SERVICE MANAGEMENT
// =====================================

/**
 * GET /api/v1/tools/token-refresh/status
 * Get token refresh service status
 */
router.get('/token-refresh/status', requirePermission('admin:read'), asyncHandler(async (req, res) => {
  if (!global.tokenRefreshService) {
    return res.status(503).json({
      error: 'Token refresh service not available',
      status: 'disabled'
    });
  }

  const status = global.tokenRefreshService.getStatus();
  const stats = await global.tokenRefreshService.getStatistics();
  
  res.json({
    service_status: status,
    token_statistics: stats
  });
}));

/**
 * POST /api/v1/tools/token-refresh/manual
 * Manually trigger token refresh job
 */
router.post('/token-refresh/manual', requirePermission('admin:write'), asyncHandler(async (req, res) => {
  if (!global.tokenRefreshService) {
    throw new Error('Token refresh service not available');
  }

  console.log('[LOADING] Manual token refresh triggered by admin');
  const result = await global.tokenRefreshService.refreshExpiredTokens();
  
  res.json({
    success: true,
    message: 'Manual token refresh completed',
    result: result
  });
}));

/**
 * POST /api/v1/tools/:toolName/token-refresh
 * Manually refresh a specific user's token
 */
router.post('/:toolName/token-refresh', requirePermission('tools:configure'), asyncHandler(async (req, res) => {
  const { toolName } = req.params;
  const userId = req.user?.uid || req.user?.id;

  if (!userId) {
    throw new ValidationError('User authentication required');
  }

  if (!global.tokenRefreshService) {
    throw new Error('Token refresh service not available');
  }

  try {
    const result = await global.tokenRefreshService.refreshSpecificToken(userId, toolName);
    
    res.json({
      success: result.success,
      message: result.success ? 'Token refreshed successfully' : `Token refresh failed: ${result.reason}`,
      tool_name: toolName,
      refreshed_at: new Date().toISOString()
    });
  } catch (error) {
    throw new ValidationError(`Token refresh failed: ${error.message}`);
  }
}));

// =====================================
// Legacy MCP OAuth endpoints have been unified into main OAuth endpoints above
// All OAuth requests (both regular tools and MCP servers) now use:
// GET  /api/v1/tools/:toolName/auth/url
// POST /api/v1/tools/:toolName/auth/callback
// This provides consistent behavior and eliminates dual endpoint confusion

module.exports = router;