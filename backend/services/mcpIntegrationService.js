/**
 * MCP Integration Service
 * Bridges MCP capabilities with LangChain and agent orchestration
 * Enables agents to use MCP tools during query processing
 */

const MCPManager = require('./mcp/mcpManager');
const { neonDB } = require('../database/connections/neon');
const { OpenAI } = require('openai');

class MCPIntegrationService {
  constructor(sharedMCPManager = null) {
    // Use shared MCP manager instance if provided, otherwise create new one
    // This allows the web portal's MCPManager to be shared with agent integration
    this.mcpManager = sharedMCPManager || new MCPManager();
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  /**
   * Get MCP tools assigned to an agent
   * @param {number} agentId - Agent ID
   * @returns {Promise<Array>} MCP server IDs assigned to the agent
   */
  async getAgentMCPTools(agentId) {
    try {
      const result = await neonDB.query(
        'SELECT tool_name FROM agent_tools WHERE agent_id = $1 AND tool_name LIKE $2',
        [agentId, 'mcp:%']
      );

      // Extract server IDs from tool_name format: "mcp:server-id"
      return result.rows.map(row => row.tool_name.replace('mcp:', ''));
    } catch (error) {
      console.error('Error getting agent MCP tools:', error);
      return [];
    }
  }

  /**
   * Get available MCP tools for given servers
   * @param {Array} serverIds - MCP server IDs
   * @param {string} userId - User ID for authentication
   * @returns {Promise<Array>} Available MCP tools in OpenAI function format
   */
  async getMCPTools(serverIds, userId = null) {
    const allTools = [];

    for (const serverId of serverIds) {
      try {
        // First try to get capabilities from running server
        let capabilities;
        try {
          capabilities = await this.mcpManager.getServerCapabilities(serverId);
        } catch (error) {
          if (error.message.includes('is not connected')) {
            console.log(`[TOOL] [MCP] Server ${serverId} not running, attempting to start...`);
            
            // Try to start the server if it has valid credentials
            if (userId) {
              try {
                const startResult = await this.mcpManager.startServer(serverId, {}, userId);
                console.log(`[OK] [MCP] Server ${serverId} started successfully`);
                
                // Get capabilities from the newly started server
                capabilities = await this.mcpManager.getServerCapabilities(serverId);
              } catch (startError) {
                console.error(`[ERROR] [MCP] Failed to start server ${serverId}:`, startError.message);
                continue; // Skip this server
              }
            } else {
              console.log(`[WARNING] [MCP] No userId provided to start server ${serverId}`);
              continue; // Skip this server
            }
          } else {
            throw error; // Re-throw other errors
          }
        }
        
        if (capabilities && capabilities.tools) {
          // Convert MCP tools to OpenAI function format
          const convertedTools = capabilities.tools.map(tool => ({
            type: 'function',
            function: {
              name: `mcp_${serverId}_${tool.name}`,
              description: tool.description || `${tool.name} from ${serverId}`,
              parameters: tool.inputSchema || { type: 'object', properties: {} }
            },
            mcpMetadata: {
              serverId,
              toolName: tool.name
            }
          }));
          
          allTools.push(...convertedTools);
          console.log(`[OK] [MCP] Added ${convertedTools.length} tools from ${serverId}`);
        }
      } catch (error) {
        console.error(`Error getting tools from MCP server ${serverId}:`, error);
      }
    }

    return allTools;
  }

  /**
   * Execute MCP tool call
   * @param {Object} toolCall - OpenAI tool call object
   * @returns {Promise<Object>} Tool execution result
   */
  async executeMCPTool(toolCall) {
    try {
      const { mcpMetadata } = toolCall;
      if (!mcpMetadata) {
        throw new Error('Missing MCP metadata in tool call');
      }

      const { serverId, toolName } = mcpMetadata;
      const parameters = JSON.parse(toolCall.function.arguments);

      console.log(`Executing MCP tool: ${serverId}/${toolName} with params:`, parameters);

      const result = await this.mcpManager.executeTool(serverId, toolName, parameters);
      
      return {
        success: result.success,
        content: result.success ? JSON.stringify(result.result, null, 2) : result.error,
        toolCall
      };
    } catch (error) {
      console.error('Error executing MCP tool:', error);
      return {
        success: false,
        content: `Error executing MCP tool: ${error.message}`,
        toolCall
      };
    }
  }

  /**
   * Process query with MCP tools using OpenAI function calling
   * @param {Object} agent - Agent configuration
   * @param {string} query - User query
   * @param {string} context - Additional context
   * @param {string} userId - User ID for authentication
   * @returns {Promise<Object>} Processing result with tool calls
   */
  async processQueryWithMCP(agent, query, context = '', userId = null) {
    try {
      // Get agent's MCP tools
      const mcpServerIds = await this.getAgentMCPTools(agent.id);
      
      if (mcpServerIds.length === 0) {
        return {
          hasTools: false,
          response: null,
          toolCalls: []
        };
      }

      console.log(`Agent ${agent.id} has MCP servers:`, mcpServerIds);

      // Get available MCP tools (will auto-start servers if needed)
      const mcpTools = await this.getMCPTools(mcpServerIds, userId);
      
      if (mcpTools.length === 0) {
        return {
          hasTools: false,
          response: null,
          toolCalls: []
        };
      }

      console.log(`Available MCP tools for agent ${agent.id}:`, mcpTools.map(t => t.function.name));

      // Create messages for OpenAI
      const messages = [
        {
          role: 'system',
          content: `You are ${agent.name}, a ${agent.personality} AI assistant. You have access to external tools through MCP (Model Context Protocol). Use these tools when they can help answer the user's question.

Context: ${context}

Available tools:
${mcpTools.map(t => `- ${t.function.name}: ${t.function.description}`).join('\n')}

Use tools judiciously - only call them if they're relevant to answering the user's question.`
        },
        {
          role: 'user',
          content: query
        }
      ];

      // Call OpenAI with function calling
      const response = await this.openai.chat.completions.create({
        model: agent.model || 'gpt-4o-mini',
        messages,
        tools: mcpTools,
        tool_choice: 'auto',
        temperature: 0.7
      });

      const choice = response.choices[0];
      const toolCalls = choice.message.tool_calls || [];

      // Execute tool calls if any
      const toolResults = [];
      if (toolCalls.length > 0) {
        console.log(`Executing ${toolCalls.length} MCP tool calls...`);
        
        for (const toolCall of toolCalls) {
          // Find the tool metadata
          const tool = mcpTools.find(t => t.function.name === toolCall.function.name);
          if (tool) {
            toolCall.mcpMetadata = tool.mcpMetadata;
            const result = await this.executeMCPTool(toolCall);
            toolResults.push(result);
          }
        }

        // If we have tool results, make a second call to get the final response
        if (toolResults.length > 0) {
          const toolMessages = [
            ...messages,
            choice.message,
            ...toolResults.map(result => ({
              role: 'tool',
              tool_call_id: result.toolCall.id,
              content: result.content
            }))
          ];

          const finalResponse = await this.openai.chat.completions.create({
            model: agent.model || 'gpt-4o-mini',
            messages: toolMessages,
            temperature: 0.7
          });

          return {
            hasTools: true,
            response: finalResponse.choices[0].message.content,
            toolCalls: toolResults,
            usage: {
              initial: response.usage,
              final: finalResponse.usage
            }
          };
        }
      }

      return {
        hasTools: true,
        response: choice.message.content,
        toolCalls: [],
        usage: response.usage
      };

    } catch (error) {
      console.error('Error processing query with MCP:', error);
      return {
        hasTools: true,
        response: null,
        toolCalls: [],
        error: error.message
      };
    }
  }

  /**
   * Check if query might benefit from MCP tools
   * @param {string} query - User query
   * @param {Array} mcpServerIds - Available MCP server IDs
   * @returns {boolean} Whether MCP tools might be useful
   */
  shouldUseMCP(query, mcpServerIds) {
    const queryLower = query.toLowerCase();
    
    // Simple heuristics for when MCP tools might be useful
    const mcpKeywords = {
      'atlassian-remote': ['jira', 'confluence', 'ticket', 'issue', 'project', 'task', 'sprint', 'board'],
      'github-remote': ['github', 'repository', 'repo', 'commit', 'pull request', 'issue', 'code'],
      'weather-remote': ['weather', 'temperature', 'forecast', 'climate'],
      'gmail-remote': ['email', 'gmail', 'mail', 'send', 'inbox']
    };

    for (const serverId of mcpServerIds) {
      const keywords = mcpKeywords[serverId] || [];
      if (keywords.some(keyword => queryLower.includes(keyword))) {
        return true;
      }
    }

    // Also use MCP for action-oriented queries
    const actionKeywords = ['create', 'update', 'delete', 'search', 'find', 'get', 'send', 'check'];
    return actionKeywords.some(keyword => queryLower.includes(keyword));
  }
}

module.exports = MCPIntegrationService;