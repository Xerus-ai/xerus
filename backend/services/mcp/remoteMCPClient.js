/**
 * Remote MCP Client - SSE/HTTP Transport Support
 * Handles connections to remote MCP servers via Server-Sent Events and HTTP
 * 
 * Based on research from Pipedream and Composio patterns:
 * - Pipedream: 2,800+ APIs via managed OAuth and HTTP transport
 * - Composio: Pre-built MCP servers with middleware authentication
 * - GitHub examples: mcp-remote, http-oauth-mcp-server, mcp-proxy
 */

const { EventSource } = require('eventsource');
const axios = require('axios');
const EventEmitter = require('events');
const mcpSessionManager = require('../mcpSessionManager');

class RemoteMCPClient extends EventEmitter {
  constructor(serverConfig, userId = null) {
    super();
    this.serverConfig = serverConfig;
    this.userId = userId || 'guest'; // Support user-specific sessions
    this.isConnected = false;
    this.requestId = 0;
    this.capabilities = null;
    this.sessionId = null; // Track MCP session ID from server
    this.serverId = serverConfig.serverId || 'unknown'; // Server identifier for persistence
  }

  /**
   * Connect to remote MCP server via HTTP with SSE responses
   */
  async connect() {
    try {
      const { url, auth } = this.serverConfig;
      
      console.log(`[SYSTEM] Connecting to remote MCP server: ${url} (user: ${this.userId})`);
      console.log(`[SECURE] Auth type: ${auth.type}, has access_token: ${!!auth.access_token}`);
      
      // Try to restore existing session first
      const existingSession = await mcpSessionManager.getSession(this.userId, this.serverId);
      if (existingSession && existingSession.sessionId) {
        console.log(`[LOADING] Restoring existing MCP session: ${existingSession.sessionId.substring(0, 8)}...`);
        this.sessionId = existingSession.sessionId;
        this.capabilities = existingSession.capabilities;
        
        // Verify session is still valid by making a simple request
        try {
          await this.verifySession();
          this.isConnected = true;
          this.emit('connected');
          console.log(`[OK] MCP session restored successfully`);
          return {
            success: true,
            message: 'Connected via existing session',
            restored: true
          };
        } catch (error) {
          console.warn(`[WARNING] Existing session invalid, creating new one:`, error.message);
          // Invalidate the old session and continue with fresh handshake
          await mcpSessionManager.invalidateSession(this.userId, this.serverId, 'invalid');
          this.sessionId = null;
          this.capabilities = null;
        }
      }
      
      // Mark as connected and perform fresh handshake
      this.isConnected = true;
      this.emit('connected');

      // Initialize handshake via HTTP POST with SSE response
      await this.performHandshake();
      
      return {
        success: true,
        message: 'Connected to remote MCP server via HTTP+SSE'
      };

    } catch (error) {
      console.error(`Failed to connect to remote MCP server:`, error.message);
      this.isConnected = false;
      throw error;
    }
  }

  /**
   * Perform MCP handshake to establish capabilities
   */
  async performHandshake() {
    const initRequest = {
      jsonrpc: '2.0',
      id: this.generateRequestId(),
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {
          roots: {
            listChanged: true
          }
        },
        clientInfo: {
          name: 'xerus-ai-assistant',
          version: '1.0.0'
        }
      }
    };

    const response = await this.sendRequest(initRequest);
    
    if (response && response.result) {
      this.capabilities = response.result.capabilities;
      console.log(`[TARGET] Remote MCP capabilities received:`, this.capabilities);
      
      // Store session after successful handshake
      if (this.sessionId) {
        await this.storeSession();
      }
      
      // Send initialized notification (optional for some servers)
      try {
        await this.sendNotification({
          jsonrpc: '2.0',
          method: 'notifications/initialized'
        });
        console.log(`[OK] Initialized notification sent successfully`);
        
        // Wait longer for the server to finish initialization
        // The server logs show "Received request before initialization was complete"
        await new Promise(resolve => setTimeout(resolve, 3000));
        console.log(`[WAIT] Waited 3 seconds for server initialization to complete`);
        
      } catch (error) {
        console.warn(`[WARNING] Initialized notification failed (some servers don't require it):`, error.message);
        // Don't throw - some MCP servers don't require the initialized notification
      }
    }
  }

  /**
   * Build authentication headers based on auth type
   */
  buildAuthHeaders(auth) {
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream'
    };

    console.log(`[SEARCH] Building auth headers for type: ${auth.type}, has access_token: ${!!auth.access_token}`);

    switch (auth.type) {
      case 'bearer':
        if (auth.token) {
          headers['Authorization'] = `Bearer ${auth.token}`;
          console.log(`[OK] Added Bearer token auth header`);
        }
        break;
      case 'api_key':
        if (auth.api_key) {
          headers['X-API-Key'] = auth.api_key;
          console.log(`[OK] Added API key auth header`);
        }
        break;
      case 'oauth':
        // FastMCP Atlassian server expects Bearer token for OAuth
        console.log(`[SEARCH] OAuth auth details:`, {
          has_access_token: !!auth.access_token,
          access_token_length: auth.access_token ? auth.access_token.length : 0,
          access_token_preview: auth.access_token ? auth.access_token.substring(0, 20) + '...' : 'none',
          auth_keys: Object.keys(auth)
        });
        
        if (auth.access_token) {
          headers['Authorization'] = `Bearer ${auth.access_token}`;
          console.log(`[OK] Added OAuth Bearer token auth header (${auth.access_token.length} chars)`);
          
          // Add Cloud ID header for multi-cloud OAuth (if available)
          if (auth.cloud_id) {
            headers['X-Atlassian-Cloud-Id'] = auth.cloud_id;
            console.log(`[OK] Added Atlassian Cloud ID header`);
          }
        } else {
          console.warn(`[WARNING] OAuth auth configured but no access_token available`, auth);
        }
        break;
      case 'basic':
        if (auth.username && auth.password) {
          const credentials = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
          headers['Authorization'] = `Basic ${credentials}`;
          console.log(`[OK] Added Basic auth header`);
        }
        break;
      default:
        console.warn(`[WARNING] Unknown auth type: ${auth.type}`);
    }

    // Add session ID if available (for servers that require session tracking)
    if (this.sessionId) {
      headers['mcp-session-id'] = this.sessionId;
      console.log(`[LINK] Added MCP session ID header: ${this.sessionId.substring(0, 8)}...`);
    }

    return headers;
  }

  /**
   * Parse SSE response from HTTP POST response
   */
  parseSSEResponse(sseData) {
    try {
      console.log(`[SEARCH] Parsing SSE response (${sseData.length} chars):`, sseData.substring(0, 200) + '...');
      
      // SSE format: "event: message\r\ndata: {...}\r\n\r\n" or "event: message\ndata: {...}\n\n"
      // Handle both \r\n (Windows) and \n (Unix) line endings
      const lines = sseData.split(/\r?\n/);
      let eventType = null;
      let data = null;
      
      console.log(`[SEARCH] SSE lines (${lines.length}):`, lines.slice(0, 5));
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith('event:')) {
          eventType = trimmedLine.substring(6).trim();
          console.log(`📡 Found event type: ${eventType}`);
        } else if (trimmedLine.startsWith('data:')) {
          data = trimmedLine.substring(5).trim();
          console.log(`[PACKAGE] Found data: ${data.substring(0, 100)}...`);
        }
      }
      
      if (eventType === 'message' && data) {
        const jsonData = JSON.parse(data);
        console.log(`[OK] Parsed SSE message:`, {
          id: jsonData.id,
          hasResult: !!jsonData.result,
          hasError: !!jsonData.error,
          resultKeys: jsonData.result ? Object.keys(jsonData.result) : null,
          errorCode: jsonData.error?.code,
          errorMessage: jsonData.error?.message
        });
        
        // Handle MCP error responses
        if (jsonData.error) {
          throw new Error(`MCP Server Error ${jsonData.error.code}: ${jsonData.error.message}${jsonData.error.data ? ` - ${jsonData.error.data}` : ''}`);
        }
        
        return jsonData;
      }
      
      // Try to parse as plain JSON if SSE format detection fails
      if (!eventType && !data && sseData.trim().startsWith('{')) {
        console.log(`[LOADING] Attempting plain JSON parse...`);
        const jsonData = JSON.parse(sseData.trim());
        console.log(`[OK] Parsed as plain JSON:`, {
          id: jsonData.id,
          hasResult: !!jsonData.result,
          hasError: !!jsonData.error,
          resultKeys: jsonData.result ? Object.keys(jsonData.result) : null
        });
        return jsonData;
      }
      
      throw new Error(`Invalid SSE format: event=${eventType}, hasData=${!!data}, dataLength=${sseData.length}`);
    } catch (error) {
      console.error('[ERROR] Failed to parse SSE response:', {
        error: error.message,
        dataLength: sseData.length,
        dataPreview: sseData.substring(0, 300)
      });
      throw error;
    }
  }


  /**
   * Send request to remote MCP server
   */
  async sendRequest(request, timeout = 60000) {
    if (!this.isConnected) {
      throw new Error('Not connected to remote MCP server');
    }

    const requestId = request.id || this.generateRequestId();
    request.id = requestId;

    // Send HTTP POST and get SSE response directly
    const response = await this.sendHttpRequest(request, timeout);
    return response;
  }

  /**
   * Send HTTP request to remote MCP server
   */
  async sendHttpRequest(request, timeout = 60000) {
    const { url, auth } = this.serverConfig;
    
    // Build headers for HTTP POST with SSE response support
    const headers = this.buildAuthHeaders(auth);

    console.log(`📤 Sending HTTP POST to ${url}:`, {
      method: request.method,
      id: request.id,
      authType: auth.type,
      headers: { ...headers, Authorization: headers.Authorization ? '[REDACTED]' : 'none' }
    });

    try {
      const response = await axios.post(url, request, {
        headers,
        timeout
      });

      console.log(`📥 HTTP POST response:`, {
        status: response.status,
        contentType: response.headers['content-type']
      });

      // Extract and store session ID from server response
      if (response.headers['mcp-session-id']) {
        this.sessionId = response.headers['mcp-session-id'];
        console.log(`[LINK] Captured MCP session ID: ${this.sessionId.substring(0, 8)}...`);
        
        // Store session persistently
        await this.storeSession();
      }

      // Server returns SSE format even for HTTP POST - parse it
      if (response.headers['content-type']?.includes('text/event-stream')) {
        return this.parseSSEResponse(response.data);
      }

      return response.data;
    } catch (error) {
      console.error(`[ERROR] HTTP POST failed:`, {
        method: request.method,
        id: request.id,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        headers: error.response?.headers
      });
      
      // Even on error, try to capture session ID for future requests
      if (error.response?.headers?.['mcp-session-id']) {
        this.sessionId = error.response.headers['mcp-session-id'];
        console.log(`[LINK] Captured MCP session ID from error response: ${this.sessionId.substring(0, 8)}...`);
        
        // Store session persistently even from error response
        await this.storeSession().catch(console.error);
      }
      
      throw error;
    }
  }

  /**
   * Send notification (no response expected)
   */
  async sendNotification(notification) {
    const { url, auth } = this.serverConfig;
    
    const headers = this.buildAuthHeaders(auth);

    console.log(`📤 Sending notification to ${url}:`, {
      method: notification.method,
      authType: auth.type,
      headers: { ...headers, Authorization: headers.Authorization ? '[REDACTED]' : 'none' }
    });

    try {
      await axios.post(url, notification, {
        headers,
        timeout: 10000
      });
      console.log(`[OK] Notification sent successfully: ${notification.method}`);
    } catch (error) {
      console.error(`[ERROR] Notification failed:`, {
        method: notification.method,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        headers: error.response?.headers
      });
      throw error;
    }
  }

  /**
   * List available tools
   */
  async listTools() {
    try {
      const request = {
        jsonrpc: '2.0',
        id: this.generateRequestId(),
        method: 'tools/list'
      };

      console.log(`[TOOL] Listing tools for MCP server`);
      const response = await this.sendRequest(request);
      
      if (!response) {
        throw new Error('No response received from tools/list');
      }
      
      if (!response.result) {
        console.warn(`[WARNING] tools/list response missing result:`, response);
        return [];
      }
      
      console.log(`[OK] Tools list result:`, {
        type: typeof response.result,
        isArray: Array.isArray(response.result),
        keys: response.result ? Object.keys(response.result) : null,
        length: response.result?.length || response.result?.tools?.length || 0
      });
      
      return response.result;
    } catch (error) {
      console.error(`[ERROR] Failed to list tools:`, error.message);
      throw error;
    }
  }

  /**
   * Call a tool
   */
  async callTool(toolName, parameters = {}) {
    const request = {
      jsonrpc: '2.0',
      id: this.generateRequestId(),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: parameters
      }
    };

    const response = await this.sendRequest(request);
    return response.result;
  }

  /**
   * List available resources
   */
  async listResources() {
    try {
      const request = {
        jsonrpc: '2.0',
        id: this.generateRequestId(),
        method: 'resources/list'
      };

      console.log(`📚 Listing resources for MCP server`);
      const response = await this.sendRequest(request);
      
      if (!response) {
        throw new Error('No response received from resources/list');
      }
      
      if (!response.result) {
        console.warn(`[WARNING] resources/list response missing result:`, response);
        return [];
      }
      
      console.log(`[OK] Resources list result:`, {
        type: typeof response.result,
        isArray: Array.isArray(response.result),
        keys: response.result ? Object.keys(response.result) : null,
        length: response.result?.length || response.result?.resources?.length || 0
      });
      
      return response.result;
    } catch (error) {
      console.error(`[ERROR] Failed to list resources:`, error.message);
      throw error;
    }
  }

  /**
   * Read a resource
   */
  async readResource(resourceUri) {
    const request = {
      jsonrpc: '2.0',
      id: this.generateRequestId(),
      method: 'resources/read',
      params: {
        uri: resourceUri
      }
    };

    const response = await this.sendRequest(request);
    return response.result;
  }

  /**
   * Close connection
   */
  async close() {
    try {
      this.isConnected = false;
      console.log('[OK] Remote MCP connection closed');
      this.emit('disconnected');
    } catch (error) {
      console.error('Error closing remote MCP connection:', error);
    }
  }

  /**
   * Generate unique request ID
   */
  generateRequestId() {
    return `req_${++this.requestId}_${Date.now()}`;
  }

  /**
   * Store current session in persistent storage
   */
  async storeSession() {
    if (!this.sessionId) return;

    try {
      await mcpSessionManager.storeSession(this.userId, this.serverId, {
        sessionId: this.sessionId,
        serverUrl: this.serverConfig.url,
        authType: this.serverConfig.auth.type,
        capabilities: this.capabilities,
        expiresAt: null // MCP sessions don't typically have explicit expiration
      });
    } catch (error) {
      console.error(`[ERROR] Failed to store MCP session:`, error.message);
    }
  }

  /**
   * Verify that the current session is still valid
   */
  async verifySession() {
    if (!this.sessionId) {
      throw new Error('No session to verify');
    }

    try {
      // Make a simple capabilities request to verify session is valid
      const request = {
        jsonrpc: '2.0',
        id: this.generateRequestId(),
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: { roots: { listChanged: true } },
          clientInfo: { name: 'xerus-ai-assistant', version: '1.0.0' }
        }
      };

      await this.sendHttpRequest(request, 10000); // 10 second timeout for verification
      console.log(`[OK] MCP session verified: ${this.sessionId.substring(0, 8)}...`);
      
      // Update last used timestamp
      await mcpSessionManager.updateLastUsed(this.userId, this.serverId);
      
    } catch (error) {
      console.warn(`[WARNING] MCP session verification failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get connection status
   */
  getStatus() {
    return {
      connected: this.isConnected,
      capabilities: this.capabilities
    };
  }
}

module.exports = RemoteMCPClient;