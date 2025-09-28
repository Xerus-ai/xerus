/**
 * Agent Service - Business Logic Layer
 * Backend Dev Agent 💻 - TDD Implementation
 * Standalone Backend Service
 */

const { neonDB } = require('../database/connections/neon');
const { aiProviderService } = require('./aiProviderService');
const { toolService } = require('./toolService');

// LangChain/Simplified Orchestration Services - Primary AI orchestration system
const langchainRAGService = require('./langchainRAGService');
const agentOrchestrator = require('./agentOrchestrator');

// LangChain imports for screenshot pre-processing
const { ChatOpenAI } = require("@langchain/openai");
const { ChatAnthropic } = require("@langchain/anthropic");
const { HumanMessage, SystemMessage } = require("@langchain/core/messages");

class AgentService {
  constructor() {
    this.validPersonalityTypes = [
      'assistant', 'technical', 'creative', 'tutor', 'executive', 'research',
      'technical_expert', 'creative_assistant', 'executive_assistant', 'research_assistant'
    ];
    this.validAIModels = [
      'gpt-4o', 'gpt-4o-mini', 'claude-3-sonnet', 'claude-3-haiku', 'gemini-pro', 'local-llm'
    ];
    this.booleanFields = [
      'is_active', 'web_search_enabled', 'search_all_knowledge', 'is_default', 'tts_enabled'
    ];
    
    // Performance optimization: Agent and tools caching with preloading
    this.agentCache = new Map();
    this.toolsCache = new Map();
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
    this.maxCacheSize = 50;
    this.preloadComplete = false;
    
    // Preload active agents for faster initial responses
    this.preloadActiveAgents();
  }

  /**
   * Preload active agents into cache for faster initial responses
   */
  async preloadActiveAgents() {
    try {
      console.log('[START] [AgentService] Preloading active agents into cache...');
      const startTime = Date.now();
      
      // Get all active agents with explicit error handling
      const activeAgents = await this.getAgents({ is_active: true, limit: 20 });
      
      // Ensure activeAgents is iterable
      if (!Array.isArray(activeAgents)) {
        console.warn('[WARNING] [AgentService] getAgents returned non-array:', typeof activeAgents);
        this.preloadComplete = true;
        return;
      }
      
      // Cache each agent
      for (const agent of activeAgents) {
        if (agent && agent.id) {
          const cacheKey = `agent_${agent.id}`;
          this._addToCache(this.agentCache, cacheKey, agent);
        }
      }
      
      this.preloadComplete = true;
      const loadTime = Date.now() - startTime;
      console.log(`[OK] [AgentService] Preloaded ${activeAgents.length} active agents in ${loadTime}ms`);
      
    } catch (error) {
      console.error('[ERROR] [AgentService] Agent preloading failed:', error.message);
      console.error('[ERROR] [AgentService] Error details:', error.stack);
      // Don't block service startup on preload failure
      this.preloadComplete = true;
    }
  }

  /**
   * Convert string values to proper boolean for PostgreSQL
   */
  convertToBoolean(value) {
    // Handle already boolean values
    if (typeof value === 'boolean') {
      return value;
    }
    
    // Handle string values
    if (typeof value === 'string') {
      const lowerValue = value.toLowerCase();
      if (lowerValue === 'true' || lowerValue === '1') {
        return true;
      }
      if (lowerValue === 'false' || lowerValue === '0') {
        return false;
      }
      // For any other string value (like "3"), treat as truthy
      return Boolean(value);
    }
    
    // Handle numeric values
    if (typeof value === 'number') {
      return Boolean(value);
    }
    
    // Default fallback
    return Boolean(value);
  }

  /**
   * Get agents with filtering support and user isolation
   */
  async getAgents(filters = {}) {
    try {
      const { 
        personality_type, 
        is_active, 
        ai_model, 
        limit = 50, 
        offset = 0, 
        user_id = null,
        include_system_agents = true,
        agent_type = null 
      } = filters;
      
      let whereConditions = ['1=1']; // Base condition
      let params = [];
      let paramIndex = 1;
      
      // User isolation: show system agents + user's own agents
      if (user_id) {
        if (include_system_agents) {
          whereConditions.push(`(
            agent_type = 'system' 
            OR agent_type = 'shared' 
            OR (agent_type = 'user' AND user_id = $${paramIndex})
          )`);
        } else {
          // Only user's own agents
          whereConditions.push(`(agent_type = 'user' AND user_id = $${paramIndex})`);
        }
        params.push(user_id);
        paramIndex++;
      } else if (!include_system_agents) {
        // If no user_id but don't want system agents, return empty
        return [];
      }
      
      // Additional filters
      if (personality_type) {
        whereConditions.push(`personality_type = $${paramIndex}`);
        params.push(personality_type);
        paramIndex++;
      }
      
      if (is_active !== undefined) {
        whereConditions.push(`is_active = $${paramIndex}`);
        params.push(is_active);
        paramIndex++;
      }
      
      if (ai_model) {
        whereConditions.push(`ai_model = $${paramIndex}`);
        params.push(ai_model);
        paramIndex++;
      }
      
      if (agent_type) {
        whereConditions.push(`agent_type = $${paramIndex}`);
        params.push(agent_type);
        paramIndex++;
      }
      
      // Build the query
      const whereClause = whereConditions.join(' AND ');
      const query = `
        SELECT 
          *,
          CASE 
            WHEN agent_type = 'system' THEN 'System Agent'
            WHEN agent_type = 'user' THEN 'My Agent'
            WHEN agent_type = 'shared' THEN 'Shared Agent'
            ELSE 'Unknown'
          END as agent_source
        FROM agents 
        WHERE ${whereClause}
        ORDER BY 
          CASE WHEN is_default THEN 0 ELSE 1 END,
          agent_type ASC,
          usage_count DESC, 
          name ASC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      
      params.push(limit, offset);
      
      const result = await neonDB.query(query, params);
      
      // Ensure we always return an array - handle case where database returns object instead of array
      const rows = result.rows || [];
      return Array.isArray(rows) ? rows : [rows];
    } catch (error) {
      console.error('[ERROR] [AgentService] Database query error in getAgents:', error.message);
      console.error('[ERROR] [AgentService] Query:', query);
      console.error('[ERROR] [AgentService] Params:', params);
      throw new Error(`Failed to get agents: ${error.message}`);
    }
  }

  /**
   * Get agent by ID with caching and user access validation
   */
  async getAgentById(id, user_id = null) {
    try {
      // Validate ID
      const agentId = parseInt(id);
      if (isNaN(agentId)) {
        throw new Error('Invalid agent ID');
      }

      // Check cache first (but don't use cache if user_id is involved for security)
      let agent = null;
      
      if (!user_id) {
        const cacheKey = `agent_${agentId}`;
        const cached = this.agentCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < this.cacheExpiry) {
          agent = cached.data;
        }
      }
      
      if (!agent) {
        const result = await neonDB.sql`
          SELECT 
            *,
            CASE 
              WHEN agent_type = 'system' THEN 'System Agent'
              WHEN agent_type = 'user' THEN 'My Agent'
              WHEN agent_type = 'shared' THEN 'Shared Agent'
              ELSE 'Unknown'
            END as agent_source
          FROM agents 
          WHERE id = ${agentId}
        `;
        
        agent = result[0] || null;
        
        // Cache the result only if no user-specific context
        if (agent && !user_id) {
          const cacheKey = `agent_${agentId}`;
          this._addToCache(this.agentCache, cacheKey, agent);
        }
      }
      
      // If user_id is provided, validate access
      if (user_id && agent) {
        const hasAccess = this.canUserAccessAgent(agent, user_id);
        if (!hasAccess) {
          return null; // Act as if agent doesn't exist
        }
      }
      
      return agent;
    } catch (error) {
      throw new Error(`Failed to get agent: ${error.message}`);
    }
  }
  
  /**
   * Check if user can access a specific agent
   */
  canUserAccessAgent(agent, user_id) {
    if (!agent) return false;
    
    // System and shared agents are accessible to everyone
    if (agent.agent_type === 'system' || agent.agent_type === 'shared') {
      return true;
    }
    
    // User agents are only accessible to their creator
    if (agent.agent_type === 'user' && agent.user_id === user_id) {
      return true;
    }
    
    // Default deny
    return false;
  }

  /**
   * Create new agent with user isolation
   */
  async createAgent(agentData, user_id = null) {
    try {
      // Validate required fields
      if (!agentData.name) {
        throw new Error('Name is required');
      }
      
      if (!agentData.personality_type) {
        throw new Error('Personality type is required');
      }
      
      // Validate personality type
      if (!this.validPersonalityTypes.includes(agentData.personality_type)) {
        throw new Error('Invalid personality type');
      }
      
      // Validate AI model if provided
      if (agentData.ai_model && !this.validAIModels.includes(agentData.ai_model)) {
        throw new Error('Invalid AI model');
      }

      // Set defaults for optional fields
      const {
        name,
        personality_type,
        description = null,
        system_prompt = 'You are a helpful AI assistant.',
        capabilities = [],
        response_style = {},
        is_active = true,
        ai_model = 'gpt-4o',
        model_preferences = {},
        web_search_enabled = false,
        search_all_knowledge = false,
        agent_type = user_id ? 'user' : 'system' // Default to user if user_id provided
      } = agentData;

      // Validate agent_type
      const validAgentTypes = ['system', 'user', 'shared'];
      if (!validAgentTypes.includes(agent_type)) {
        throw new Error('Invalid agent type. Must be: system, user, or shared');
      }

      // Only system admins can create system agents
      if (agent_type === 'system' && user_id !== 'admin_user') {
        throw new Error('Only administrators can create system agents');
      }

      const result = await neonDB.sql`
        INSERT INTO agents (
          name, personality_type, description, system_prompt, capabilities, 
          response_style, is_active, ai_model, model_preferences, 
          web_search_enabled, search_all_knowledge, agent_type, user_id, 
          created_by, created_at, updated_at
        )
        VALUES (
          ${name}, ${personality_type}, ${description}, ${system_prompt},
          ${JSON.stringify(capabilities)}, ${JSON.stringify(response_style)},
          ${is_active}, ${ai_model}, ${JSON.stringify(model_preferences)},
          ${web_search_enabled}, ${search_all_knowledge}, ${agent_type}, 
          ${user_id}, ${user_id || 'system'}, 
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        RETURNING *
      `;
      
      return result[0];
    } catch (error) {
      throw new Error(`Failed to create agent: ${error.message}`);
    }
  }

  /**
   * Update agent
   */
  async updateAgent(id, updateData) {
    try {
      const agentId = parseInt(id);
      if (isNaN(agentId)) {
        throw new Error('Invalid agent ID');
      }

      // Validate personality type if being updated
      if (updateData.personality_type && !this.validPersonalityTypes.includes(updateData.personality_type)) {
        throw new Error('Invalid personality type');
      }
      
      // Validate AI model if being updated
      if (updateData.ai_model && !this.validAIModels.includes(updateData.ai_model)) {
        throw new Error('Invalid AI model');
      }

      // Handle both single and multi-field updates using the same logic
      // Single field updates
      if (Object.keys(updateData).length === 1) {
        const [key, value] = Object.entries(updateData)[0];
        return await this.updateSingleField(agentId, key, value);
      }
      
      // For multi-field updates, handle them sequentially WITHOUT recursion
      let updatedAgent = null;
      
      for (const [key, value] of Object.entries(updateData)) {
        updatedAgent = await this.updateSingleField(agentId, key, value);
      }
      
      return updatedAgent;
    } catch (error) {
      throw new Error(`Failed to update agent: ${error.message}`);
    }
  }

  /**
   * Update a single field - helper method to avoid recursion
   */
  async updateSingleField(agentId, key, value) {
    try {
      // Ensure database connection is initialized
      if (!neonDB.sql) {
        await neonDB.initialize();
      }
      
      // Handle specific fields with explicit queries
      if (key === 'ai_model') {
        const result = await neonDB.sql`
          UPDATE agents 
          SET ai_model = ${value}, updated_at = CURRENT_TIMESTAMP 
          WHERE id = ${agentId} 
          RETURNING *
        `;
        return result[0] || null;
      }
      
      if (key === 'description') {
        const result = await neonDB.sql`
          UPDATE agents 
          SET description = ${value}, updated_at = CURRENT_TIMESTAMP 
          WHERE id = ${agentId} 
          RETURNING *
        `;
        return result[0] || null;
      }
      
      if (key === 'name') {
        const result = await neonDB.sql`
          UPDATE agents 
          SET name = ${value}, updated_at = CURRENT_TIMESTAMP 
          WHERE id = ${agentId} 
          RETURNING *
        `;
        return result[0] || null;
      }
      
      if (key === 'personality_type') {
        const result = await neonDB.sql`
          UPDATE agents 
          SET personality_type = ${value}, updated_at = CURRENT_TIMESTAMP 
          WHERE id = ${agentId} 
          RETURNING *
        `;
        return result[0] || null;
      }
      
      if (key === 'avatar') {
        const result = await neonDB.sql`
          UPDATE agents 
          SET avatar = ${value}, updated_at = CURRENT_TIMESTAMP 
          WHERE id = ${agentId} 
          RETURNING *
        `;
        return result[0] || null;
      }
      
      if (key === 'system_prompt') {
        const result = await neonDB.sql`
          UPDATE agents 
          SET system_prompt = ${value}, updated_at = CURRENT_TIMESTAMP 
          WHERE id = ${agentId} 
          RETURNING *
        `;
        return result[0] || null;
      }
      
      if (key === 'capabilities') {
        const result = await neonDB.sql`
          UPDATE agents 
          SET capabilities = ${JSON.stringify(value)}, updated_at = CURRENT_TIMESTAMP 
          WHERE id = ${agentId} 
          RETURNING *
        `;
        return result[0] || null;
      }
      
      // Handle boolean fields with explicit field mapping
      if (this.booleanFields.includes(key)) {
        const convertedValue = this.convertToBoolean(value);
        
        if (key === 'is_active') {
          const result = await neonDB.sql`
            UPDATE agents 
            SET is_active = ${convertedValue}, updated_at = CURRENT_TIMESTAMP 
            WHERE id = ${agentId} 
            RETURNING *
          `;
          return result[0] || null;
        }
        
        if (key === 'web_search_enabled') {
          const result = await neonDB.sql`
            UPDATE agents 
            SET web_search_enabled = ${convertedValue}, updated_at = CURRENT_TIMESTAMP 
            WHERE id = ${agentId} 
            RETURNING *
          `;
          return result[0] || null;
        }
        
        if (key === 'search_all_knowledge') {
          // If enabling search_all_knowledge, clear any existing document assignments
          // (since they're mutually exclusive)
          if (convertedValue) {
            await neonDB.sql`
              DELETE FROM agent_knowledge_access WHERE agent_id = ${agentId}
            `;
            console.log(`[TASKS] Enabled search_all_knowledge for agent ${agentId} - cleared individual document assignments`);
          }
          
          const result = await neonDB.sql`
            UPDATE agents 
            SET search_all_knowledge = ${convertedValue}, updated_at = CURRENT_TIMESTAMP 
            WHERE id = ${agentId} 
            RETURNING *
          `;
          return result[0] || null;
        }
        
        if (key === 'is_default') {
          const result = await neonDB.sql`
            UPDATE agents 
            SET is_default = ${convertedValue}, updated_at = CURRENT_TIMESTAMP 
            WHERE id = ${agentId} 
            RETURNING *
          `;
          return result[0] || null;
        }
        
        if (key === 'tts_enabled') {
          const result = await neonDB.sql`
            UPDATE agents 
            SET tts_enabled = ${convertedValue}, updated_at = CURRENT_TIMESTAMP 
            WHERE id = ${agentId} 
            RETURNING *
          `;
          return result[0] || null;
        }
      }
      
      // Handle document assignments (knowledgeBase field from frontend)
      if (key === 'knowledgeBase') {
        // knowledgeBase comes as an array of document IDs from the frontend
        const documentIds = Array.isArray(value) ? value : [];
        
        // First get the current agent to return
        const currentAgent = await neonDB.sql`
          SELECT * FROM agents WHERE id = ${agentId}
        `;
        
        if (!currentAgent || currentAgent.length === 0) {
          throw new Error('Agent not found');
        }
        
        // When specific documents are assigned, disable search_all_knowledge
        // (since they're mutually exclusive)
        await neonDB.sql`
          UPDATE agents 
          SET search_all_knowledge = false, updated_at = CURRENT_TIMESTAMP 
          WHERE id = ${agentId}
        `;
        
        // Clear existing assignments for this agent
        await neonDB.sql`
          DELETE FROM agent_knowledge_access WHERE agent_id = ${agentId}
        `;
        
        // If new document IDs provided, assign them
        if (documentIds.length > 0) {
          const result = await this.assignDocumentsToAgent(
            agentId, 
            documentIds.map(id => parseInt(id)), 
            { accessLevel: 'read' }
          );
          
          console.log(`[TASKS] Updated agent ${agentId} document assignments:`, {
            removed_all: true,
            assigned: result.assigned,
            skipped: result.skipped,
            search_all_knowledge_disabled: true
          });
        } else {
          console.log(`[TASKS] Cleared all document assignments for agent ${agentId}`);
        }
        
        // Get updated agent to return (with search_all_knowledge = false)
        const updatedAgent = await neonDB.sql`
          SELECT * FROM agents WHERE id = ${agentId}
        `;
        
        return updatedAgent[0] || currentAgent[0];
      }
      
      // Handle tool assignments (tools field from frontend)
      if (key === 'tools') {
        // tools comes as an array of tool IDs from the frontend
        const toolIds = Array.isArray(value) ? value : [];
        
        // First get the current agent to return
        const currentAgent = await neonDB.sql`
          SELECT * FROM agents WHERE id = ${agentId}
        `;
        
        if (!currentAgent || currentAgent.length === 0) {
          throw new Error('Agent not found');
        }
        
        // Clear existing tool assignments for this agent
        await neonDB.sql`
          DELETE FROM agent_tools WHERE agent_id = ${agentId}
        `;
        
        // If new tool IDs provided, assign them
        if (toolIds.length > 0) {
          // Validate tools - check both regular tools and MCP tools
          const regularTools = await neonDB.sql`
            SELECT tool_name FROM tool_configurations WHERE tool_name = ANY(${toolIds})
          `;
          
          const regularToolNames = regularTools.map(row => row.tool_name);
          
          // For MCP tools (those starting with "mcp:"), we'll accept them directly
          // since they're not stored in tool_configurations table
          const mcpTools = toolIds.filter(toolId => toolId.startsWith('mcp:'));
          
          const validToolNames = [...regularToolNames, ...mcpTools];
          const invalidToolIds = toolIds.filter(toolId => 
            !validToolNames.includes(toolId)
          );
          
          if (invalidToolIds.length > 0) {
            console.warn(`[WARNING] Skipping invalid tools: ${invalidToolIds.join(', ')}`);
          }
          
          // Insert valid tool assignments
          if (validToolNames.length > 0) {
            const insertPromises = validToolNames.map(toolName => 
              neonDB.sql`
                INSERT INTO agent_tools (agent_id, tool_name, is_enabled, created_at, updated_at)
                VALUES (${agentId}, ${toolName}, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
              `
            );
            
            await Promise.all(insertPromises);
            
            console.log(`[TOOL] Updated agent ${agentId} tool assignments:`, {
              removed_all: true,
              assigned: validToolNames.length,
              skipped: invalidToolIds.length,
              regular_tools: regularToolNames.length,
              mcp_tools: mcpTools.length,
              tools: validToolNames
            });
          }
        } else {
          console.log(`[TOOL] Cleared all tool assignments for agent ${agentId}`);
        }
        
        // Return the current agent (tools are managed separately in agent_tools table)
        return currentAgent[0];
      }
      
      // Handle any remaining fields that weren't caught above
      throw new Error(`Unsupported field for update: ${key}`);
      
    } catch (error) {
      throw new Error(`Failed to update single field ${key}: ${error.message}`);
    }
  }

  /**
   * Delete agent with cascade cleanup
   */
  async deleteAgent(id) {
    try {
      const agentId = parseInt(id);
      if (isNaN(agentId)) {
        throw new Error('Invalid agent ID');
      }

      return await neonDB.transaction(async (client) => {
        // Clean up related records in correct order
        await client.query('DELETE FROM agent_executions WHERE agent_id = $1', [agentId]);
        await client.query('DELETE FROM agent_knowledge_access WHERE agent_id = $1', [agentId]);
        await client.query('DELETE FROM agent_tools WHERE agent_id = $1', [agentId]);
        
        // Delete the agent
        const result = await client.query('DELETE FROM agents WHERE id = $1', [agentId]);
        
        return result.rowCount > 0;
      });
    } catch (error) {
      throw new Error(`Failed to delete agent: ${error.message}`);
    }
  }


  /**
   * Execute agent with LangChain/LangGraph orchestration
   * OPTIMIZED: Let agentOrchestrator handle all agent initialization internally
   */
  async executeAgent(agentId, input, context = {}) {
    try {
      // Validate input only - let orchestrator handle agent validation
      if (!input || input.trim() === '') {
        throw new Error('Input cannot be empty');
      }

      const start = Date.now();
      
      console.log(`[AI] [DIRECT] Starting direct orchestration for agent ${agentId}...`);
      
      // Minimal context - orchestrator will fetch agent data and tools internally
      const orchestrationContext = {
        agentId: agentId,
        screenshot: context.screenshot,
        image: context.image,
        imageContext: context.imageContext,
        userId: context.userId,
        sessionId: context.sessionId
      };
      
      // Direct orchestration call - it handles all agent initialization internally
      const orchestrationResult = await agentOrchestrator.orchestrateAgentResponse(
        input, 
        orchestrationContext
      );
      
      console.log(`[OK] [SimplifiedOrchestrator] Orchestration completed: ${orchestrationResult.selectedAgent.selectedAgent} agent selected`);
      
      const aiResponse = {
        response: orchestrationResult.response,
        execution_time: orchestrationResult.metadata.orchestrationTime,
        tokens_used: orchestrationResult.metadata.responseLength || 0,
        model_used: orchestrationResult.selectedAgent.selectedAgent,
        tools_called: [],
        selectedAgent: orchestrationResult.selectedAgent,
        ragResults: orchestrationResult.ragResults
      };

      // Tool processing handled by orchestrator

      // Log execution summary
      console.log('[DATA] Agent execution completed:', {
        agent_id: agentId,
        input_length: input.length,
        output_length: aiResponse.response?.length || 0,
        execution_time: aiResponse.execution_time,
        tokens_used: aiResponse.tokens_used,
        context_items: aiResponse.ragResults?.length || 0,
        tools_called: aiResponse.tools_called?.length || 0
      });

      return {
        response: aiResponse.response,
        execution_time: aiResponse.execution_time || (Date.now() - start),
        tokens_used: aiResponse.tokens_used,
        model_used: aiResponse.model_used,
        tools_called: aiResponse.tools_called || [],
        context_used: {
          ragItems: aiResponse.ragResults?.length || 0,
          tools: orchestrationContext.tools?.length || 0
        },
        // LangGraph orchestration results
        selectedAgent: aiResponse.selectedAgent,
        
        // Context decision information for API compatibility
        modalityDecision: {
          primary: aiResponse.selectedAgent.contextStrategy || 'langraph_orchestrated',
          useScreenshot: aiResponse.metadata?.useScreenshot || false,
          useKnowledge: aiResponse.ragResults && aiResponse.ragResults.length > 0,
          confidence: aiResponse.selectedAgent.confidence || 0.8,
          reasoning: aiResponse.selectedAgent.reasoning || 'LangGraph agent selection'
        },
        context_strategy: aiResponse.selectedAgent?.selectedAgent || 'unknown',
        context_reasoning: aiResponse.selectedAgent?.reasoning || 'No reasoning provided',
        success: true
      };
    } catch (error) {
      throw new Error(`Agent execution failed: ${error.message}`);
    }
  }

  /**
   * Execute agent with streaming response
   * Streams chunks in real-time via callback function
   * OPTIMIZED: Let agentOrchestrator handle agent lookup and initialization
   */
  async executeAgentStream(agentId, input, context = {}, onChunk) {
    try {
      // Validate input only - let orchestrator handle agent validation
      if (!input || input.trim() === '') {
        throw new Error('Input cannot be empty');
      }

      console.log(`🌊 [STREAMING] Direct orchestration for agent ${agentId}...`);
      
      // Minimal context - orchestrator will fetch agent data and tools internally
      const orchestrationContext = {
        agentId: agentId,
        screenshot: context.screenshot,
        image: context.image,
        imageContext: context.imageContext,
        userId: context.userId,
        sessionId: context.sessionId
      };
      
      // Direct orchestrator call - it handles all agent initialization internally
      await agentOrchestrator.orchestrateAgentResponseStream(
        input, 
        orchestrationContext,
        onChunk
      );
      
      console.log(`[OK] [STREAMING] Direct orchestration completed for agent ${agentId}`);
      
    } catch (error) {
      console.error(`[ERROR] [STREAMING] Agent streaming failed:`, error);
      throw new Error(`Agent streaming failed: ${error.message}`);
    }
  }

  /**
   * Get agent tools for LangGraph context analysis with caching
   * NEW: Helper method for LangGraph orchestration
   */
  async getAgentTools(agentId) {
    try {
      // Check cache first
      const cacheKey = `tools_${agentId}`;
      const cached = this.toolsCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp) < this.cacheExpiry) {
        return cached.data;
      }

      // Get all agent tool assignments
      const agentToolAssignments = await neonDB.sql`
        SELECT tool_name, is_enabled
        FROM agent_tools
        WHERE agent_id = ${agentId} AND is_enabled = true
        LIMIT 50
      `;
      
      const tools = [];
      
      for (const assignment of agentToolAssignments) {
        const toolName = assignment.tool_name;
        
        if (toolName.startsWith('mcp:')) {
          // MCP tools - return basic info since they're not in tool_configurations
          tools.push({
            name: toolName,
            description: `MCP Tool: ${toolName.replace('mcp:', '').replace('-remote', '')}`,
            parameters: {},
            enabled: assignment.is_enabled
          });
        } else {
          // Regular tools - get full details from tool_configurations
          try {
            const toolConfig = await neonDB.sql`
              SELECT description, parameters_schema
              FROM tool_configurations
              WHERE tool_name = ${toolName}
              LIMIT 1
            `;
            
            if (toolConfig.length > 0) {
              tools.push({
                name: toolName,
                description: toolConfig[0].description,
                parameters: toolConfig[0].parameters_schema || {},
                enabled: assignment.is_enabled
              });
            }
          } catch (error) {
            console.warn(`[WARNING] Failed to get config for regular tool ${toolName}:`, error.message);
          }
        }
      }
      
      // Cache the result
      this._addToCache(this.toolsCache, cacheKey, tools);
      
      return tools;
    } catch (error) {
      console.warn(`[WARNING] [LangGraph] Failed to get agent tools for ${agentId}:`, error.message);
      return [];
    }
  }



  /**
   * Get agent analytics
   */
  async getAgentAnalytics(agentId) {
    try {
      const result = await neonDB.sql`
        SELECT 
          COUNT(*) as total_executions,
          AVG(execution_time) as avg_execution_time,
          SUM(token_count_input + token_count_output) as total_tokens_used,
          (COUNT(*) FILTER (WHERE output_text IS NOT NULL AND output_text != '')) * 100.0 / COUNT(*) as success_rate,
          MAX(created_at) as last_execution
        FROM agent_executions 
        WHERE agent_id = ${agentId}
      `;
      
      const analytics = result[0];
      
      // Convert and format the results
      return {
        total_executions: parseInt(analytics.total_executions) || 0,
        avg_execution_time: Math.round(parseFloat(analytics.avg_execution_time) || 0),
        total_tokens_used: parseInt(analytics.total_tokens_used) || 0,
        success_rate: parseFloat(analytics.success_rate) || 0,
        last_execution: analytics.last_execution
      };
    } catch (error) {
      throw new Error(`Failed to get agent analytics: ${error.message}`);
    }
  }

  /**
   * ==========================================
   * AGENT-DOCUMENT ASSIGNMENT METHODS
   * ==========================================
   * Scalable methods for managing many-to-many
   * relationships between agents and documents
   */

  /**
   * Get all documents assigned to an agent
   * @param {number} agentId - The agent ID
   * @param {Object} options - Query options
   * @returns {Array} Array of assigned documents with metadata
   */
  async getAgentDocuments(agentId, options = {}) {
    try {
      const {
        page = 1,
        limit = 100,
        accessLevel,
        isIndexed,
        search
      } = options;

      // Ensure database connection is initialized
      if (!neonDB.sql) {
        await neonDB.initialize();
      }

      // Build the base query
      let query = `
        SELECT DISTINCT
          kb.id,
          kb.title,
          kb.content_type,
          kb.source_url,
          kb.file_path,
          kb.tags,
          kb.is_indexed,
          kb.index_status,
          kb.word_count,
          kb.character_count,
          kb.created_at,
          kb.updated_at,
          kb.folder_id,
          aka.access_level,
          aka.created_at as assigned_at,
          f.name as folder_name
        FROM agent_knowledge_access aka
        JOIN knowledge_base kb ON aka.knowledge_item_id = kb.id
        LEFT JOIN folders f ON kb.folder_id = f.id
        WHERE aka.agent_id = $1
      `;

      const params = [parseInt(agentId)];
      let paramIndex = 2;

      // Add filters
      if (accessLevel) {
        query += ` AND aka.access_level = $${paramIndex}`;
        params.push(accessLevel);
        paramIndex++;
      }

      if (isIndexed !== undefined) {
        query += ` AND kb.is_indexed = $${paramIndex}`;
        params.push(isIndexed);
        paramIndex++;
      }

      if (search) {
        query += ` AND (kb.title ILIKE $${paramIndex} OR kb.content ILIKE $${paramIndex})`;
        params.push(`%${search}%`);
        paramIndex++;
      }

      // Add pagination
      query += ` ORDER BY aka.created_at DESC`;
      query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(parseInt(limit));
      params.push((parseInt(page) - 1) * parseInt(limit));

      const result = await neonDB.query(query, params);
      return result.rows || [];

    } catch (error) {
      throw new Error(`Failed to get agent documents: ${error.message}`);
    }
  }

  /**
   * Assign multiple documents to an agent (bulk operation)
   * @param {number} agentId - The agent ID
   * @param {Array} documentIds - Array of document IDs to assign
   * @param {Object} options - Assignment options
   * @returns {Object} Assignment results
   */
  async assignDocumentsToAgent(agentId, documentIds, options = {}) {
    try {
      const {
        accessLevel = 'read',
        assignedBy = 'system'
      } = options;

      // Validate inputs
      if (!Array.isArray(documentIds) || documentIds.length === 0) {
        throw new Error('Document IDs must be a non-empty array');
      }

      // Ensure database connection is initialized
      if (!neonDB.sql) {
        await neonDB.initialize();
      }

      return await neonDB.transaction(async (client) => {
        // Validate that agent exists and is active
        const agentCheck = await client.query(
          'SELECT id FROM agents WHERE id = $1 AND is_active = TRUE',
          [parseInt(agentId)]
        );

        if (!agentCheck.rows || agentCheck.rows.length === 0) {
          throw new Error('Agent not found or inactive');
        }

        // Validate that all documents exist and are indexed
        const docCheck = await client.query(
          'SELECT id FROM knowledge_base WHERE id = ANY($1) AND is_indexed = TRUE',
          [documentIds.map(id => parseInt(id))]
        );

        const validDocIds = docCheck.rows.map(row => row.id);
        const invalidDocIds = documentIds.filter(id => !validDocIds.includes(parseInt(id)));

        if (invalidDocIds.length > 0) {
          console.warn(`[WARNING]  Skipping invalid/unindexed documents: ${invalidDocIds.join(', ')}`);
        }

        if (validDocIds.length === 0) {
          return {
            success: true,
            assigned: 0,
            skipped: invalidDocIds.length,
            assignments: [],
            message: 'No valid documents to assign'
          };
        }

        // Perform bulk upsert with conflict resolution
        const assignmentValues = validDocIds.map((docId, index) => {
          const baseIndex = index * 3; // Only 3 parameters per record
          return `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, CURRENT_TIMESTAMP)`;
        }).join(', ');

        const assignmentParams = [];
        validDocIds.forEach(docId => {
          assignmentParams.push(parseInt(agentId), parseInt(docId), accessLevel);
        });

        const insertQuery = `
          INSERT INTO agent_knowledge_access (agent_id, knowledge_item_id, access_level, created_at)
          VALUES ${assignmentValues}
          ON CONFLICT (agent_id, knowledge_item_id) 
          DO UPDATE SET 
            access_level = EXCLUDED.access_level,
            created_at = CURRENT_TIMESTAMP
          RETURNING *
        `;

        const result = await client.query(insertQuery, assignmentParams);

        console.log(`[OK] Successfully assigned ${result.rows.length} documents to agent ${agentId}`);

        return {
          success: true,
          assigned: result.rows.length,
          skipped: invalidDocIds.length,
          assignments: result.rows,
          message: `Assigned ${result.rows.length} documents successfully`
        };
      });

    } catch (error) {
      console.error(`[ERROR] Failed to assign documents to agent:`, error);
      throw new Error(`Failed to assign documents to agent: ${error.message}`);
    }
  }

  /**
   * Remove document assignments from an agent
   * @param {number} agentId - The agent ID
   * @param {Array} documentIds - Array of document IDs to unassign (optional - if empty, removes all)
   * @returns {Object} Removal results
   */
  async removeDocumentsFromAgent(agentId, documentIds = []) {
    try {
      // Ensure database connection is initialized
      if (!neonDB.sql) {
        await neonDB.initialize();
      }

      let query = 'DELETE FROM agent_knowledge_access WHERE agent_id = $1';
      const params = [parseInt(agentId)];

      if (documentIds.length > 0) {
        query += ' AND knowledge_item_id = ANY($2)';
        params.push(documentIds.map(id => parseInt(id)));
      }

      query += ' RETURNING *';

      const result = await neonDB.query(query, params);

      console.log(`[OK] Removed ${result.rows.length} document assignments from agent ${agentId}`);

      return {
        success: true,
        removed: result.rows.length,
        assignments: result.rows,
        message: `Removed ${result.rows.length} assignments successfully`
      };

    } catch (error) {
      throw new Error(`Failed to remove document assignments: ${error.message}`);
    }
  }

  /**
   * Update document assignment access level
   * @param {number} agentId - The agent ID
   * @param {number} documentId - The document ID
   * @param {string} accessLevel - New access level ('read', 'write', 'admin')
   * @returns {Object} Updated assignment
   */
  async updateDocumentAssignment(agentId, documentId, accessLevel) {
    try {
      // Ensure database connection is initialized
      if (!neonDB.sql) {
        await neonDB.initialize();
      }

      const result = await neonDB.query(
        `UPDATE agent_knowledge_access 
         SET access_level = $3, created_at = CURRENT_TIMESTAMP
         WHERE agent_id = $1 AND knowledge_item_id = $2
         RETURNING *`,
        [parseInt(agentId), parseInt(documentId), accessLevel]
      );

      if (!result.rows || result.rows.length === 0) {
        throw new Error('Assignment not found');
      }

      return {
        success: true,
        assignment: result.rows[0],
        message: 'Assignment updated successfully'
      };

    } catch (error) {
      throw new Error(`Failed to update document assignment: ${error.message}`);
    }
  }

  /**
   * Get assignment analytics for an agent
   * @param {number} agentId - The agent ID
   * @returns {Object} Assignment analytics
   */
  async getAgentDocumentAnalytics(agentId) {
    try {
      // Ensure database connection is initialized
      if (!neonDB.sql) {
        await neonDB.initialize();
      }

      const analyticsQuery = `
        SELECT 
          COUNT(*) as total_assignments,
          COUNT(CASE WHEN kb.is_indexed = TRUE THEN 1 END) as indexed_documents,
          COUNT(CASE WHEN aka.access_level = 'read' THEN 1 END) as read_access,
          COUNT(CASE WHEN aka.access_level = 'write' THEN 1 END) as write_access,
          COUNT(CASE WHEN aka.access_level = 'admin' THEN 1 END) as admin_access,
          COUNT(DISTINCT kb.content_type) as unique_content_types,
          SUM(kb.word_count) as total_word_count,
          MIN(aka.created_at) as first_assignment,
          MAX(aka.created_at) as last_assignment
        FROM agent_knowledge_access aka
        JOIN knowledge_base kb ON aka.knowledge_item_id = kb.id
        WHERE aka.agent_id = $1
      `;

      const result = await neonDB.query(analyticsQuery, [parseInt(agentId)]);
      const analytics = result.rows[0] || {};

      return {
        total_assignments: parseInt(analytics.total_assignments) || 0,
        indexed_documents: parseInt(analytics.indexed_documents) || 0,
        access_levels: {
          read: parseInt(analytics.read_access) || 0,
          write: parseInt(analytics.write_access) || 0,
          admin: parseInt(analytics.admin_access) || 0
        },
        unique_content_types: parseInt(analytics.unique_content_types) || 0,
        total_word_count: parseInt(analytics.total_word_count) || 0,
        first_assignment: analytics.first_assignment,
        last_assignment: analytics.last_assignment
      };

    } catch (error) {
      throw new Error(`Failed to get agent document analytics: ${error.message}`);
    }
  }

  /**
   * Check if an agent has access to a specific document
   * @param {number} agentId - The agent ID
   * @param {number} documentId - The document ID
   * @returns {Object|null} Assignment details or null if no access
   */
  async checkAgentDocumentAccess(agentId, documentId) {
    try {
      // Ensure database connection is initialized
      if (!neonDB.sql) {
        await neonDB.initialize();
      }

      const result = await neonDB.query(
        `SELECT aka.*, kb.title, kb.is_indexed
         FROM agent_knowledge_access aka
         JOIN knowledge_base kb ON aka.knowledge_item_id = kb.id
         WHERE aka.agent_id = $1 AND aka.knowledge_item_id = $2`,
        [parseInt(agentId), parseInt(documentId)]
      );

      return result.rows && result.rows.length > 0 ? result.rows[0] : null;

    } catch (error) {
      throw new Error(`Failed to check agent document access: ${error.message}`);
    }
  }

  /**
   * Lightweight screenshot analysis for predictive context
   * Pre-processes screenshot content during typing to optimize agentOrchestrator
   */
  // Removed complex analyzeScreenContent and parseScreenAnalysis methods
  // Using simple AIProviderService-based screenshot description instead

  /**
   * Cache helper method - adds item to cache with LRU eviction
   */
  _addToCache(cache, key, data) {
    // LRU eviction if cache is full
    if (cache.size >= this.maxCacheSize) {
      const firstKey = cache.keys().next().value;
      cache.delete(firstKey);
    }
    
    cache.set(key, {
      data: data,
      timestamp: Date.now()
    });
  }

  /**
   * ==========================================
   * AGENT TTS CONFIGURATION METHODS
   * ==========================================
   * Methods for managing agent text-to-speech settings
   */

  /**
   * Get agent TTS configuration
   * @param {number} agentId - The agent ID
   * @returns {Object|null} TTS configuration or null if not enabled
   */
  async getAgentTTSConfig(agentId) {
    try {
      const agent = await this.getAgentById(agentId);
      if (!agent || !agent.tts_enabled) {
        return null;
      }

      return {
        enabled: agent.tts_enabled,
        voiceConfig: agent.voice_config || {},
        analysisPrompt: agent.analysis_prompt,
        agentId: agent.id,
        agentName: agent.name,
        personalityType: agent.personality_type
      };
    } catch (error) {
      console.error(`Failed to get TTS config for agent ${agentId}:`, error);
      return null;
    }
  }

  /**
   * Update agent TTS settings
   * @param {number} agentId - The agent ID  
   * @param {Object} ttsConfig - TTS configuration
   * @returns {Object} Updated agent data
   */
  async updateAgentTTS(agentId, ttsConfig) {
    try {
      const {
        enabled = false,
        voiceConfig = {},
        analysisPrompt = null
      } = ttsConfig;

      // Validate voice configuration
      if (enabled && voiceConfig) {
        const validProviders = ['HUME_AI'];
        if (voiceConfig.provider && !validProviders.includes(voiceConfig.provider)) {
          throw new Error(`Invalid TTS provider: ${voiceConfig.provider}`);
        }
      }

      // Update TTS fields
      const updateData = {
        tts_enabled: enabled,
        voice_config: voiceConfig,
        analysis_prompt: analysisPrompt
      };

      const updatedAgent = await this.updateAgent(agentId, updateData);

      // Clear cache for this agent
      const cacheKey = `agent_${agentId}`;
      this.agentCache.delete(cacheKey);

      console.log(`[OK] Updated TTS config for agent ${agentId}:`, {
        enabled: enabled,
        voiceProvider: voiceConfig.provider || 'default',
        voiceName: voiceConfig.voiceName || 'default'
      });

      return updatedAgent;

    } catch (error) {
      console.error(`Failed to update TTS config for agent ${agentId}:`, error);
      throw new Error(`Failed to update agent TTS: ${error.message}`);
    }
  }

  /**
   * Execute agent analysis for Listen service with TTS consideration
   * @param {number} agentId - The agent ID
   * @param {string} transcript - User transcript
   * @param {Object} context - Additional context (screenshots, etc.)
   * @returns {Object} Analysis result with TTS info
   */
  async executeAgentAnalysis(agentId, transcript, context = {}) {
    try {
      const agent = await this.getAgentById(agentId);
      if (!agent) {
        throw new Error('Agent not found');
      }

      // Use specialized analysis prompt if available for TTS
      let analysisPrompt = transcript;
      if (agent.analysis_prompt) {
        analysisPrompt = `${agent.analysis_prompt}\n\nUser said: "${transcript}"`;
      }

      // Include screen context if available
      const enhancedContext = {
        ...context,
        transcript: transcript,
        screenContext: context.screenshot ? 
          await this.analyzeScreenContext(context.screenshot) : null
      };

      console.log(`[AI] Executing agent analysis for TTS: Agent ${agent.name}`);

      // Execute analysis through orchestrator
      const response = await this.executeAgent(
        agentId,
        analysisPrompt,
        enhancedContext
      );

      return {
        analysis: response.response,
        shouldSpeak: agent.tts_enabled,
        voiceConfig: agent.voice_config || {},
        agentId: agent.id,
        agentName: agent.name,
        executionTime: response.execution_time,
        modelUsed: response.model_used
      };

    } catch (error) {
      console.error(`Agent analysis failed for agent ${agentId}:`, error);
      throw new Error(`Agent analysis failed: ${error.message}`);
    }
  }

  /**
   * Get optimal TTS voice configuration for an agent's personality
   * @param {number} agentId - The agent ID
   * @returns {Object} Optimal voice configuration
   */
  async getOptimalTTSVoiceForAgent(agentId) {
    try {
      const agent = await this.getAgentById(agentId);
      if (!agent) {
        throw new Error('Agent not found');
      }

      // Use existing voice config if available
      if (agent.voice_config && Object.keys(agent.voice_config).length > 0) {
        return agent.voice_config;
      }

      // Get optimal voice from TTS service
      const ttsService = require('./ttsService');
      return ttsService.getOptimalVoiceForPersonality(agent.personality_type);

    } catch (error) {
      console.error(`Failed to get optimal voice for agent ${agentId}:`, error);
      // Return default configuration
      return {
        voiceName: 'Female English Actor',
        provider: 'HUME_AI',
        speed: 1.0
      };
    }
  }

  /**
   * Enable TTS for an agent with optimal voice settings
   * @param {number} agentId - The agent ID
   * @param {Object} customVoiceConfig - Optional custom voice configuration
   * @returns {Object} Updated agent with TTS enabled
   */
  async enableAgentTTS(agentId, customVoiceConfig = null) {
    try {
      const agent = await this.getAgentById(agentId);
      if (!agent) {
        throw new Error('Agent not found');
      }

      // Get optimal voice configuration
      const voiceConfig = customVoiceConfig || 
        await this.getOptimalTTSVoiceForAgent(agentId);

      // Default analysis prompt for TTS
      const analysisPrompt = agent.analysis_prompt || 
        `Provide a helpful and concise response as ${agent.name}, a ${agent.personality_type} AI assistant. 
         Keep responses conversational and under 200 words for voice delivery.`;

      // Enable TTS
      const updatedAgent = await this.updateAgentTTS(agentId, {
        enabled: true,
        voiceConfig: voiceConfig,
        analysisPrompt: analysisPrompt
      });

      console.log(`[OK] Enabled TTS for agent: ${agent.name}`);
      return updatedAgent;

    } catch (error) {
      console.error(`Failed to enable TTS for agent ${agentId}:`, error);
      throw error;
    }
  }

  /**
   * Disable TTS for an agent
   * @param {number} agentId - The agent ID
   * @returns {Object} Updated agent with TTS disabled
   */
  async disableAgentTTS(agentId) {
    try {
      const updatedAgent = await this.updateAgentTTS(agentId, {
        enabled: false,
        voiceConfig: {},
        analysisPrompt: null
      });

      console.log(`[ERROR] Disabled TTS for agent ${agentId}`);
      return updatedAgent;

    } catch (error) {
      console.error(`Failed to disable TTS for agent ${agentId}:`, error);
      throw error;
    }
  }

  /**
   * Analyze screenshot context (simplified for TTS integration)
   * @param {string} screenshot - Screenshot data
   * @returns {string} Screen context description
   */
  async analyzeScreenContext(screenshot) {
    try {
      // Simplified screenshot analysis for TTS context
      // This would integrate with existing screenshot analysis capabilities
      if (!screenshot) return null;
      
      return "User's screen context available for analysis";
    } catch (error) {
      console.warn('Screenshot analysis failed:', error.message);
      return null;
    }
  }

  /**
   * Clear all caches (useful for testing or memory management)
   */
  clearCaches() {
    this.agentCache.clear();
    this.toolsCache.clear();
  }
}

module.exports = AgentService;
