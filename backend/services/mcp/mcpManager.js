/**
 * MCP Manager - Unified Local and Remote MCP Client Implementation
 * Handles MCP server lifecycle for both Docker containers and remote servers
 * 
 * Architecture:
 * - Manages Docker-based local MCP servers
 * - Manages remote MCP servers via SSE/HTTP transport
 * - Handles server discovery and registry
 * - Provides seamless authentication with credential storage
 * - Routes tool calls to appropriate MCP servers
 */

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { spawn } = require('child_process');
const EventEmitter = require('events');
const path = require('path');
const RemoteMCPClient = require('./remoteMCPClient');
const CredentialService = require('../credentialService');

class MCPManager extends EventEmitter {
  constructor() {
    super();
    this.servers = new Map(); // serverName -> { client, transport, process, config, type }
    this.serverRegistry = new Map(); // Available MCP servers registry
    this.credentialService = new CredentialService();
    this.initializeRegistry();
  }

  /**
   * Initialize built-in MCP server registry with both local Docker and working remote servers
   */
  initializeRegistry() {
    // ==== PRODUCTION MCP SERVERS ====
    // Only keep production-ready remote MCP servers

    // ==== WORKING REMOTE MCP SERVERS ====
    

    // Weather MCP Server (example of API-based remote server)
    this.serverRegistry.set('weather-remote', {
      name: 'Weather API',
      description: 'Real-time weather information and forecasts',
      type: 'remote', 
      url: 'https://weather-mcp.example.com/mcp/', // Placeholder - needs deployment
      category: 'data_sources',
      authType: 'api_key',
      capabilities: ['tools'],
      tools: ['get_current_weather', 'get_forecast', 'get_weather_history'],
      status: 'available'
    });

    // GitHub MCP Server (Official Remote Server)
    this.serverRegistry.set('github-remote', {
      name: 'GitHub',
      description: 'Access GitHub repositories, issues, and pull requests',
      type: 'remote',
      url: 'https://api.githubcopilot.com/mcp/',
      category: 'development',
      authType: 'oauth',
      capabilities: ['tools', 'resources'], 
      tools: ['search_repositories', 'list_issues', 'create_issue', 'get_file', 'list_commits'],
      status: 'available'
    });

    // Gmail MCP Server (Working Remote Server via Smithery)
    this.serverRegistry.set('gmail-remote', {
      name: 'Gmail',
      description: 'Comprehensive Gmail integration with email management, labels, and automation',
      type: 'remote',
      url: 'https://gmail.gongrzhe.com',
      category: 'productivity',
      authType: 'oauth',
      oauthCallbackUrl: 'https://gmail.gongrzhe.com/oauth2callback',
      capabilities: ['tools'],
      tools: [
        'send_email', 'create_draft', 'read_email', 'search_emails', 'download_attachment',
        'modify_email', 'delete_email', 'create_label', 'update_label', 'list_labels',
        'delete_label', 'batch_modify_labels', 'create_filter', 'list_filters', 'delete_filter',
        'get_profile', 'get_thread', 'send_reply'
      ],
      toolCount: 18,
      status: 'available',
      npmPackage: '@gongrzhe/server-gmail-autoauth-mcp',
      documentation: 'https://github.com/gongrzhe/gmail-mcp-server'
    });

    // Atlassian MCP Server (Jira/Confluence Integration)
    this.serverRegistry.set('atlassian-remote', {
      name: 'Atlassian',
      description: 'Jira and Confluence integration with issue management, project tracking, and documentation',
      type: 'remote',
      url: 'https://mcp-atlassian-eexd.onrender.com/mcp/',
      category: 'productivity',
      authType: 'oauth',
      oauthCallbackUrl: 'https://mcp-atlassian-eexd.onrender.com/oauth2callback',
      // Note: The hosted server needs ATLASSIAN_OAUTH_ENABLE=true for per-request auth
      // Alternative: Use localhost:8000 if running local server with proper config
      requiresMinimalOAuth: true,
      capabilities: ['tools', 'resources'],
      tools: [
        // Jira Tools
        'jira_create_issue', 'jira_get_issue', 'jira_update_issue', 'jira_delete_issue',
        'jira_search_issues', 'jira_add_comment', 'jira_get_comments', 'jira_transition_issue',
        'jira_get_projects', 'jira_get_project', 'jira_get_issue_types', 'jira_get_priorities',
        'jira_get_statuses', 'jira_assign_issue', 'jira_get_watchers', 'jira_add_watcher',
        // Confluence Tools  
        'confluence_create_page', 'confluence_get_page', 'confluence_update_page', 'confluence_delete_page',
        'confluence_search_pages', 'confluence_get_spaces', 'confluence_get_space', 
        'confluence_add_comment', 'confluence_get_comments'
      ],
      toolCount: 23,
      status: 'available',
      npmPackage: 'mcp-atlassian',
      documentation: 'https://github.com/sooperset/mcp-atlassian',
      oauthScopes: [
        'read:jira-user',
        'read:jira-work',
        'write:jira-work',
        'manage:jira-project',
        'read:confluence-space.summary',
        'read:confluence-props',
        'write:confluence-props',
        'read:confluence-content.all',
        'write:confluence-content',
        'offline_access'
      ],
      features: [
        'OAuth 2.0 Authentication (Cloud)',
        'Jira Issue Management (CRUD operations)',
        'Jira Project and Metadata Access',
        'Confluence Page Management (CRUD operations)', 
        'Confluence Space Management',
        'Advanced Search Capabilities',
        'Comment Management',
        'Issue Transitions and Assignments'
      ]
    });

    // Atlassian MCP Server (Local Development)
    // Only add if ATLASSIAN_LOCAL_MCP_ENABLED environment variable is set
    if (process.env.ATLASSIAN_LOCAL_MCP_ENABLED === 'true') {
      this.serverRegistry.set('atlassian-local', {
        name: 'Atlassian (Local)',
        description: 'Local Atlassian MCP server for development with proper minimal OAuth configuration',
        type: 'remote',
        url: 'http://localhost:8000/mcp/',
        category: 'productivity',
        authType: 'oauth',
        capabilities: ['tools', 'resources'],
        tools: [
          // Same tools as remote but from local server
          'jira_create_issue', 'jira_get_issue', 'jira_update_issue', 'jira_delete_issue',
          'jira_search_issues', 'jira_add_comment', 'jira_get_comments', 'jira_transition_issue',
          'jira_get_projects', 'jira_get_project', 'jira_get_issue_types', 'jira_get_priorities',
          'jira_get_statuses', 'jira_get_versions', 'jira_get_components',
          // Confluence Tools
          'confluence_create_page', 'confluence_get_page', 'confluence_update_page', 'confluence_delete_page',
          'confluence_search_content', 'confluence_get_spaces', 'confluence_get_space'
        ],
        status: 'available',
        setupInstructions: 'Run local MCP server with ATLASSIAN_OAUTH_ENABLE=true'
      });
      console.log('🏠 Added local Atlassian MCP server configuration');
    }

    // ==== DEVELOPMENT/PLACEHOLDER SERVERS (for future) ====
    
    this.serverRegistry.set('google-calendar-future', {
      name: 'Google Calendar (Future)',
      description: 'Google Calendar integration - coming soon',
      type: 'remote',
      url: 'https://calendar-mcp.example.com/v1', 
      category: 'productivity',
      authType: 'oauth',
      capabilities: ['tools', 'resources'],
      tools: ['list_events', 'create_event', 'update_event', 'delete_event'],
      status: 'coming_soon' // Different status to indicate not ready
    });

    this.serverRegistry.set('slack-future', {
      name: 'Slack (Future)', 
      description: 'Slack integration - coming soon',
      type: 'remote',
      url: 'https://slack-mcp.example.com/v1',
      category: 'communication',
      authType: 'oauth', 
      capabilities: ['tools'],
      tools: ['send_message', 'list_channels', 'get_channel_history'],
      status: 'coming_soon'
    });

    console.log(`[TOOL] MCP Registry initialized with ${this.serverRegistry.size} servers (${Array.from(this.serverRegistry.values()).filter(s => s.status === 'available').length} available, ${Array.from(this.serverRegistry.values()).filter(s => s.status === 'coming_soon').length} coming soon)`);
  }

  /**
   * Get list of available MCP servers from registry
   */
  getAvailableServers() {
    return Array.from(this.serverRegistry.entries())
      .filter(([id, config]) => config.status === 'available') // Only show available servers
      .map(([id, config]) => ({
        id,
        ...config,
        isRunning: this.servers.has(id)
      }));
  }

  /**
   * Get all servers including coming soon ones (for admin/development)
   */
  getAllServers() {
    return Array.from(this.serverRegistry.entries()).map(([id, config]) => ({
      id,
      ...config,
      isRunning: this.servers.has(id)
    }));
  }

  /**
   * Get list of currently running MCP servers
   */
  getRunningServers() {
    return Array.from(this.servers.entries()).map(([id, server]) => ({
      id,
      name: this.serverRegistry.get(id)?.name || id,
      status: server.client ? 'connected' : 'connecting',
      type: server.type,
      config: server.config
    }));
  }

  /**
   * Start an MCP server (supports both Docker and remote)
   */
  async startServer(serverId, userConfig = {}, userId = null) {
    try {
      console.log(`[START] Starting MCP server: ${serverId}`);
      
      // [OK] FIX: If server is already running, return current status instead of throwing error
      if (this.servers.has(serverId)) {
        console.log(`[INFO] Server ${serverId} is already running, returning current status`);
        const capabilities = await this.getServerCapabilities(serverId);
        const serverDef = this.serverRegistry.get(serverId);
        
        return {
          success: true,
          serverId,
          capabilities,
          type: serverDef?.type || 'unknown',
          message: `${serverDef?.name || serverId} is already running`,
          alreadyRunning: true
        };
      }

      const serverDef = this.serverRegistry.get(serverId);
      if (!serverDef) {
        throw new Error(`Unknown server: ${serverId}`);
      }

      let client, transport, serverInfo;

      if (serverDef.type === 'docker') {
        // Handle Docker-based local MCP servers
        ({ client, transport, serverInfo } = await this.startDockerServer(serverId, serverDef, userConfig));
      } else if (serverDef.type === 'remote') {
        // Handle remote MCP servers
        ({ client, transport, serverInfo } = await this.startRemoteServer(serverId, serverDef, userConfig, userId));
      } else {
        throw new Error(`Unsupported server type: ${serverDef.type}`);
      }

      // Store server info
      this.servers.set(serverId, {
        client,
        transport,
        config: { ...serverDef, userConfig },
        status: 'connected',
        type: serverDef.type,
        startTime: new Date().toISOString(),
        ...serverInfo
      });

      // Get server capabilities
      const capabilities = await this.getServerCapabilities(serverId);
      console.log(`[OK] MCP server ${serverId} connected with capabilities:`, capabilities);

      // Update registry status
      serverDef.status = 'running';

      this.emit('serverStarted', { serverId, capabilities, type: serverDef.type });

      return {
        success: true,
        serverId,
        capabilities,
        type: serverDef.type,
        message: `${serverDef.name} connected successfully`
      };

    } catch (error) {
      console.error(`[ERROR] Failed to start MCP server ${serverId}:`, error.message);
      
      // Cleanup on error
      if (this.servers.has(serverId)) {
        await this.stopServer(serverId);
      }

      // Update registry status
      const serverDef = this.serverRegistry.get(serverId);
      if (serverDef) {
        serverDef.status = 'error';
      }

      this.emit('serverError', { serverId, error: error.message });

      throw new Error(`Failed to start ${serverId}: ${error.message}`);
    }
  }

  /**
   * Start Docker-based MCP server
   */
  async startDockerServer(serverId, serverDef, userConfig) {
    // Build Docker command like Claude Desktop
    const dockerArgs = [
      'run',
      '-i',
      '--rm',
      '--name', `xerus-mcp-${serverId}`,
      serverDef.dockerImage
    ];

    console.log(`[PACKAGE] Starting Docker container: docker ${dockerArgs.join(' ')}`);

    // Create stdio transport to MCP server
    const transport = new StdioClientTransport({
      command: 'docker',
      args: dockerArgs,
      env: {
        ...process.env,
        ...userConfig.env // User-provided environment variables
      }
    });

    // Create MCP client
    const client = new Client(
      {
        name: 'xerus-ai-assistant',
        version: '1.0.0'
      },
      {
        capabilities: {
          tools: {},
          resources: {}
        }
      }
    );

    console.log(`[SYSTEM] Connecting to Docker MCP server: ${serverId}`);
    await client.connect(transport);

    return {
      client,
      transport,
      serverInfo: { dockerContainer: `xerus-mcp-${serverId}` }
    };
  }


  /**
   * Start remote MCP server
   */
  async startRemoteServer(serverId, serverDef, userConfig, userId) {
    // Get stored credentials for the user
    let credentials = null;
    if (userId) {
      credentials = await this.credentialService.getOAuthTokens(userId, serverId);
    }

    if (!credentials) {
      throw new Error(`No valid credentials found for ${serverId}. Please configure authentication first.`);
    }

    console.log(`[SECURE] Using credentials for ${serverId}:`, { 
      hasAccessToken: !!credentials.access_token, 
      accessTokenLength: credentials.access_token ? credentials.access_token.length : 0,
      hasRefreshToken: !!credentials.refresh_token,
      type: credentials.type,
      structure: Object.keys(credentials),
      accessTokenPreview: credentials.access_token ? credentials.access_token.substring(0, 20) + '...' : 'EMPTY'
    });

    // Ensure credentials have the right structure for remote MCP client
    const authConfig = {
      type: 'oauth',
      access_token: credentials.access_token,
      refresh_token: credentials.refresh_token,
      ...credentials
    };

    // Add cloud_id and instance URLs for Atlassian servers
    if (serverId === 'atlassian-remote') {
      if (process.env.ATLASSIAN_OAUTH_CLOUD_ID) {
        authConfig.cloud_id = process.env.ATLASSIAN_OAUTH_CLOUD_ID;
        console.log(`[WEB] Added Atlassian Cloud ID: ${authConfig.cloud_id}`);
      }
      
      // Add instance URLs that the server might need for multi-cloud OAuth
      if (process.env.JIRA_URL) {
        authConfig.jira_url = process.env.JIRA_URL;
        console.log(`[TARGET] Added Jira URL: ${authConfig.jira_url}`);
      }
      
      if (process.env.CONFLUENCE_URL) {
        authConfig.confluence_url = process.env.CONFLUENCE_URL;
        console.log(`📚 Added Confluence URL: ${authConfig.confluence_url}`);
      }
    }

    // Create remote MCP client with userId and serverId for session persistence
    const client = new RemoteMCPClient({
      url: serverDef.url,
      auth: authConfig,
      serverId: serverId, // Pass serverId for session identification
      ...userConfig
    }, userId); // Pass userId for user-specific sessions

    console.log(`[SYSTEM] Connecting to remote MCP server: ${serverId}`);
    await client.connect();

    return {
      client,
      transport: null, // Remote clients don't use transport
      serverInfo: { remoteUrl: serverDef.url }
    };
  }

  /**
   * Get server status for toggle operations
   */
  async getServerStatus(serverId) {
    const serverDef = this.serverRegistry.get(serverId);
    if (!serverDef) {
      return null;
    }

    const isRunning = this.servers.has(serverId);
    return {
      server_id: serverId,
      name: serverDef.name,
      description: serverDef.description,
      is_running: isRunning,
      status: isRunning ? 'running' : 'stopped',
      type: serverDef.type,
      auth_type: serverDef.authType,
      requires_auth: serverDef.authType !== 'none'
    };
  }

  /**
   * Stop an MCP server (handles both Docker and remote)
   */
  async stopServer(serverId) {
    try {
      console.log(`🛑 Stopping MCP server: ${serverId}`);

      const server = this.servers.get(serverId);
      if (!server) {
        console.log(`Server ${serverId} is not running`);
        return { success: true, message: 'Server was not running' };
      }

      // Close connection based on server type
      if (server.type === 'docker') {
        // Close Docker-based MCP client connection
        if (server.client && server.transport) {
          await server.client.close();
        }
      } else if (server.type === 'remote') {
        // Close remote MCP client connection
        if (server.client && typeof server.client.close === 'function') {
          await server.client.close();
        }
      }

      // Remove from active servers
      this.servers.delete(serverId);

      // Update registry status
      const serverDef = this.serverRegistry.get(serverId);
      if (serverDef) {
        serverDef.status = 'available';
      }

      console.log(`[OK] MCP server ${serverId} stopped successfully`);
      this.emit('serverStopped', { serverId, type: server.type });

      return {
        success: true,
        serverId,
        type: server.type,
        message: `${serverDef?.name || serverId} stopped successfully`
      };

    } catch (error) {
      console.error(`[ERROR] Failed to stop MCP server ${serverId}:`, error.message);
      throw error;
    }
  }

  /**
   * Get server capabilities (tools, resources, prompts) - supports both Docker and remote
   */
  async getServerCapabilities(serverId) {
    const server = this.servers.get(serverId);
    if (!server || !server.client) {
      throw new Error(`Server ${serverId} is not connected`);
    }

    try {
      let tools, resources, prompts;

      if (server.type === 'docker') {
        // Use standard MCP client methods for Docker servers
        [tools, resources, prompts] = await Promise.allSettled([
          server.client.listTools(),
          server.client.listResources(),
          server.client.listPrompts()
        ]);
      } else if (server.type === 'remote') {
        // Use remote client methods for remote servers
        [tools, resources, prompts] = await Promise.allSettled([
          server.client.listTools(),
          server.client.listResources(),
          Promise.resolve({ prompts: [] }) // Remote servers may not support prompts
        ]);
      }

      return {
        tools: tools.status === 'fulfilled' ? (tools.value.tools || tools.value) : [],
        resources: resources.status === 'fulfilled' ? (resources.value.resources || resources.value) : [],
        prompts: prompts.status === 'fulfilled' ? (prompts.value.prompts || prompts.value) : [],
        connected: true,
        type: server.type
      };
    } catch (error) {
      console.error(`Failed to get capabilities for ${serverId}:`, error.message);
      return {
        tools: [],
        resources: [],
        prompts: [],
        connected: false,
        error: error.message,
        type: server.type
      };
    }
  }

  /**
   * Execute a tool via MCP (supports both Docker and remote servers)
   */
  async executeTool(serverId, toolName, parameters = {}) {
    const server = this.servers.get(serverId);
    if (!server || !server.client) {
      throw new Error(`MCP server ${serverId} is not connected`);
    }

    try {
      console.log(`[TOOL] Executing tool ${toolName} on ${server.type} server ${serverId} with parameters:`, parameters);
      

      let result;
      if (server.type === 'docker') {
        // Use standard MCP client for Docker servers
        result = await server.client.callTool({
          name: toolName,
          arguments: parameters
        });
      } else if (server.type === 'remote') {
        // Use remote client for remote servers
        result = await server.client.callTool(toolName, parameters);
      }

      console.log(`[OK] Tool execution completed for ${toolName}:`, result);

      return {
        success: true,
        result: result.content || result,
        toolName,
        serverId,
        serverType: server.type,
        executedAt: new Date().toISOString()
      };

    } catch (error) {
      console.error(`[ERROR] Tool execution failed for ${toolName} on ${serverId}:`, error.message);
      
      return {
        success: false,
        error: error.message,
        toolName,
        serverId,
        serverType: server.type,
        executedAt: new Date().toISOString()
      };
    }
  }

  /**
   * Read a resource from MCP server (supports both Docker and remote)
   */
  async readResource(serverId, resourceUri) {
    const server = this.servers.get(serverId);
    if (!server || !server.client) {
      throw new Error(`Server ${serverId} is not connected`);
    }

    try {
      let result;
      if (server.type === 'docker') {
        // Use standard MCP client for Docker servers
        result = await server.client.readResource({
          uri: resourceUri
        });
      } else if (server.type === 'remote') {
        // Use remote client for remote servers
        result = await server.client.readResource(resourceUri);
      }

      return {
        success: true,
        content: result.contents || result,
        uri: resourceUri,
        serverId,
        serverType: server.type
      };

    } catch (error) {
      console.error(`Failed to read resource ${resourceUri} from ${serverId}:`, error.message);
      throw error;
    }
  }

  /**
   * Get a prompt from MCP server
   */
  async getPrompt(serverId, promptName, arguments_ = {}) {
    const server = this.servers.get(serverId);
    if (!server || !server.client) {
      throw new Error(`Server ${serverId} is not connected`);
    }

    try {
      const result = await server.client.getPrompt({
        name: promptName,
        arguments: arguments_
      });

      return {
        success: true,
        prompt: result,
        promptName,
        serverId
      };

    } catch (error) {
      console.error(`Failed to get prompt ${promptName} from ${serverId}:`, error.message);
      throw error;
    }
  }

  /**
   * Stop all MCP servers (cleanup)
   */
  async stopAllServers() {
    console.log('🛑 Stopping all MCP servers...');
    
    const stopPromises = Array.from(this.servers.keys()).map(serverId => 
      this.stopServer(serverId).catch(error => 
        console.error(`Failed to stop ${serverId}:`, error.message)
      )
    );

    await Promise.allSettled(stopPromises);
    console.log('[OK] All MCP servers stopped');
  }

  /**
   * Health check for MCP servers
   */
  async healthCheck() {
    const health = {
      totalServers: this.serverRegistry.size,
      runningServers: this.servers.size,
      servers: {}
    };

    for (const [serverId, server] of this.servers) {
      try {
        const capabilities = await this.getServerCapabilities(serverId);
        health.servers[serverId] = {
          status: capabilities.connected ? 'healthy' : 'unhealthy',
          type: server.type,
          uptime: Date.now() - new Date(server.startTime).getTime(),
          capabilities
        };
      } catch (error) {
        health.servers[serverId] = {
          status: 'error',
          type: server.type,
          error: error.message
        };
      }
    }

    return health;
  }

  /**
   * Store credentials for a user's MCP server
   */
  async storeCredentials(userId, serverId, credentials) {
    const serverDef = this.serverRegistry.get(serverId);
    if (!serverDef) {
      throw new Error(`Unknown server: ${serverId}`);
    }

    if (serverDef.type !== 'remote') {
      throw new Error(`Server ${serverId} does not require credentials (local Docker server)`);
    }

    // Convert MCP credential format to OAuth token format for database storage
    const tokens = {
      access_token: credentials.access_token,
      refresh_token: credentials.refresh_token,
      token_type: credentials.token_type || 'Bearer',
      expires_at: credentials.expires_at
    };

    return await this.credentialService.storeOAuthTokens(userId, serverId, tokens);
  }

  /**
   * Check if user has valid credentials for a server
   */
  async hasValidCredentials(userId, serverId) {
    const serverDef = this.serverRegistry.get(serverId);
    if (!serverDef) {
      return false;
    }

    if (serverDef.type === 'docker') {
      return true; // Docker servers don't need user credentials
    }

    return await this.credentialService.hasValidCredentials(userId, serverId);
  }

  /**
   * Get credential configuration requirements for a server
   */
  getCredentialRequirements(serverId) {
    const serverDef = this.serverRegistry.get(serverId);
    if (!serverDef) {
      throw new Error(`Unknown server: ${serverId}`);
    }

    if (serverDef.type === 'docker') {
      return {
        required: false,
        type: 'none',
        message: 'No credentials required for local Docker server'
      };
    }

    const requirements = {
      required: true,
      type: serverDef.authType,
      serverId,
      serverName: serverDef.name
    };

    switch (serverDef.authType) {
      case 'oauth':
        requirements.message = `OAuth authentication required for ${serverDef.name}`;
        requirements.fields = ['client_id', 'client_secret', 'redirect_uri'];
        break;
      case 'bearer':
        requirements.message = `Bearer token required for ${serverDef.name}`;
        requirements.fields = ['token'];
        break;
      case 'api_key':
        requirements.message = `API key required for ${serverDef.name}`;
        requirements.fields = ['api_key'];
        break;
      case 'basic':
        requirements.message = `Username and password required for ${serverDef.name}`;
        requirements.fields = ['username', 'password'];
        break;
      default:
        requirements.message = `Authentication required for ${serverDef.name}`;
        requirements.fields = [];
    }

    return requirements;
  }

  /**
   * Get list of MCP servers that require user configuration
   */
  async getServersRequiringConfiguration(userId = null) {
    const remoteServers = Array.from(this.serverRegistry.entries())
      .filter(([id, config]) => config.type === 'remote');

    const serversWithCredentials = await Promise.all(
      remoteServers.map(async ([id, config]) => ({
        id,
        name: config.name,
        authType: config.authType,
        requiresConfig: true,
        hasCredentials: userId ? await this.credentialService.hasValidCredentials(userId, id) : false
      }))
    );

    return serversWithCredentials;
  }
}

module.exports = MCPManager;