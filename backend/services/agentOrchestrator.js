/**
 * Simplified Agent Orchestrator - Fast, Parallel AI Response Generation
 * 
 * OPTIMIZATIONS:
 * - Parallelized analysis (screenshot + knowledge simultaneously)
 * - Removed expensive confidence scoring AI calls
 * - Simplified workflow with fewer nodes
 * - Query classification to skip RAG for simple queries
 * - Response streaming for memory efficiency
 * - Improved scoring heuristics with caching
 * - Lower confidence thresholds (8+ vs 9+) for faster termination
 * - Faster execution (target: <300ms vs previous 2-3s)
 */

const { ChatOpenAI } = require("@langchain/openai");
const { ChatAnthropic } = require("@langchain/anthropic");
const { HumanMessage, AIMessage, SystemMessage } = require("@langchain/core/messages");

const { neonDB } = require('../database/connections/neon');
const langchainRAGService = require('./langchainRAGService');
const masterPromptOrchestrator = require('./promptOrchestratorService');
// Removed predictive context builder - using simplified approach
const memoryService = require('./memoryService');
const MCPIntegrationService = require('./mcpIntegrationService');
const sharedMCPManager = require('./sharedMCPManager');

class AgentOrchestrator {
  constructor() {
    this.initialized = false;
    this.memoryService = memoryService;
    this.mcpIntegrationService = new MCPIntegrationService(sharedMCPManager);
    
    // Performance tracking
    this.stats = {
      requestsProcessed: 0,
      averageResponseTime: 0,
      totalResponseTime: 0,
      lastActivity: null,
      ragSkipped: 0,
      earlyTerminations: 0,
      cacheHits: 0,
      predictiveHits: 0,
      predictiveSkips: 0
    };
    
    // Response and score caching
    this.responseCache = new Map();
    this.scoreCache = new Map();
    this.maxCacheSize = 100;
    this.cacheExpiry = 10 * 60 * 1000; // 10 minutes
    
    // Agent data caching for performance
    this.agentCache = new Map();
    this.agentCacheExpiry = 5 * 60 * 1000; // 5 minutes
    
    
    console.log('[START] [AgentOrchestrator] Fast AI orchestrator initializing with optimizations...');
  }

  /**
   * Initialize the orchestrator (minimal setup)
   */
  async initialize() {
    if (this.initialized) {
      console.log('[OK] [AgentOrchestrator] Already initialized');
      return;
    }

    // Initialize memory service
    await this.memoryService.initialize();

    this.initialized = true;
    console.log('[OK] [AgentOrchestrator] Initialized - Ready for fast parallel processing with memory system');
  }


  /**
   * Generate cache key for responses
   */
  generateCacheKey(query, agentId, hasScreenshot, hasKnowledge, hasMCPResponse = false) {
    return `${agentId}:${hasScreenshot}:${hasKnowledge}:${hasMCPResponse}:${query.toLowerCase().trim()}`;
  }

  /**
   * Get cached response if available
   */
  getCachedResponse(cacheKey) {
    const cached = this.responseCache.get(cacheKey);
    if (!cached) return null;
    
    // Check if cache is expired
    if (Date.now() - cached.timestamp > this.cacheExpiry) {
      this.responseCache.delete(cacheKey);
      return null;
    }
    
    this.stats.cacheHits++;
    return cached.data;
  }

  /**
   * Cache response data
   */
  cacheResponse(cacheKey, responseData) {
    // Implement LRU eviction if cache is full
    if (this.responseCache.size >= this.maxCacheSize) {
      const firstKey = this.responseCache.keys().next().value;
      this.responseCache.delete(firstKey);
    }
    
    this.responseCache.set(cacheKey, {
      data: responseData,
      timestamp: Date.now()
    });
  }

  /**
   * Main orchestration method - FAST and PARALLEL with OPTIMIZATIONS
   */
  async orchestrateAgentResponse(query, context = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    const startTime = Date.now();

    try {
      console.log(`[START] [AgentOrchestrator] Processing: "${query.substring(0, 50)}..."`);

      // Step 1: Get user's selected agent (no validation overhead)
      const dbAgent = await this.getUserSelectedAgent(context.agentId);
      if (!dbAgent) {
        throw new Error(`Agent not found: ${context.agentId}`);
      }

      // Step 2: PARALLEL Memory + RAG + MCP retrieval (OPTIMIZATION: Save 341ms+)
      console.log('🧠 [PARALLEL] Starting Memory + RAG + MCP retrieval in parallel...');
      const parallelStartTime = Date.now();
      
      const [memoryContext, ragResults, mcpProcessingResult] = await Promise.all([
        this.retrieveMemoryContext(context.agentId, context.userId || 'guest', query),
        this.getRAGResults(query, context.agentId),
        this.processMCPQuery(dbAgent, query, context)
      ]);
      
      const parallelTime = Date.now() - parallelStartTime;
      console.log(`[FAST] [PARALLEL] Memory + RAG + MCP completed in ${parallelTime}ms (parallel execution)`);
      
      // Step 2.5: Store incoming screenshot in Working Memory with LLM caption generation (ASYNC)
      if (context.image || context.screenshot || context.imageContext) {
        // Start async memory processing - DO NOT AWAIT (non-blocking)
        this.processScreenshotMemoryAsync(dbAgent, context).catch(error => {
          console.warn('[WARNING] [Working Memory] Async screenshot processing failed:', error.message);
        });
        console.log('[START] [Working Memory] Screenshot memory processing started in background (non-blocking)');
      }

      // Step 2.5: Enhanced context detection - check all possible screenshot sources
      const hasScreenshot = !!(context.screenshot || context.image || context.imageContext || context.includeScreenshot);
      
      // Removed predictive context - using simplified direct approach

      // Step 3: Check cache before processing
      const hasKnowledge = ragResults.length > 0;
      const hasMCPResponse = mcpProcessingResult && mcpProcessingResult.hasTools && mcpProcessingResult.response;
      const cacheKey = this.generateCacheKey(query, context.agentId, hasScreenshot, hasKnowledge, hasMCPResponse);
      
      const cachedResponse = this.getCachedResponse(cacheKey);
      if (cachedResponse) {
        console.log('[START] [CACHE HIT] Returning cached response');
        const responseTime = Date.now() - startTime;
        this.updateStats(responseTime);
        
        // Mark as cached and update response time
        const response = { ...cachedResponse };
        response.metadata.cached = true;
        response.metadata.responseTime = responseTime;
        return response;
      }

      // Step 3.5: Check if MCP already provided a complete response
      if (hasMCPResponse) {
        console.log('[TOOL] [MCP RESPONSE] MCP tools provided complete response - using directly');
        
        const responseTime = Date.now() - startTime;
        this.updateStats(responseTime);

        // Store MCP interaction in memory
        await this.storeMemoryInteraction(
          context.agentId, 
          context.userId || 'guest', 
          query, 
          mcpProcessingResult.response,
          {
            analysisType: 'mcp',
            responseTime,
            toolsUsed: mcpProcessingResult.toolCalls?.length || 0,
            mcpServers: mcpProcessingResult.mcpServers || []
          }
        );

        return {
          response: mcpProcessingResult.response,
          selectedAgent: {
            selectedAgent: dbAgent.personality_type,
            agentId: dbAgent.id,
            agentName: dbAgent.name,
            confidence: 0.9
          },
          ragResults: ragResults,
          mcpResults: mcpProcessingResult,
          memoryContext: memoryContext,
          metadata: {
            responseTime,
            analysisType: 'mcp',
            toolsExecuted: mcpProcessingResult.toolCalls?.length || 0,
            mcpUsed: true,
            memoryUsed: Object.values(memoryContext).reduce((sum, arr) => sum + arr.length, 0)
          },
          success: true
        };
      }

      // Step 4: Enhanced analysis approach - always consider available context
      let useScreenshot = hasScreenshot;
      
      // For simple conversational queries, still use available context to enhance response
      if (!useScreenshot && !hasKnowledge && query.length < 50) {
        console.log('[LOADING] [SIMPLE QUERY] Short conversational query detected - checking for any available context');
        // Even simple queries should benefit from available context if present
        useScreenshot = hasScreenshot; // Use screenshot if available, regardless of query complexity
      }
      
      // LOG ENHANCED ANALYSIS PLAN
      console.log('[START] [ENHANCED ANALYSIS PLAN] ==========================================');
      console.log(`[AI] Agent: ${dbAgent.name} (${dbAgent.personality_type}, ${dbAgent.ai_model})`);
      console.log(`❓ Query: "${query}"`);
      console.log(`🖼️ Screenshot: ${hasScreenshot ? 'Available' : 'None'} → ${useScreenshot ? 'Will Use' : 'Will Skip'}`);
      console.log(`📚 Knowledge: ${hasKnowledge ? `${ragResults.length} results` : 'None'}`);
      console.log(`[TASKS] Planned Analyses: ${[
        useScreenshot ? 'Screenshot' : null,
        hasKnowledge ? 'Knowledge' : null,
        (useScreenshot && hasKnowledge) ? 'Combined (if individual < 8)' : null
      ].filter(Boolean).join(', ') || 'Basic only'}`);
      console.log('================================================================');

      // Always use unified memory context - no simple queries

      // Step 5: SMART PARALLEL ANALYSIS - Run individual analyses with intelligent routing
      const individualPromises = [];
      const analysisStartTime = Date.now();
      
      if (useScreenshot) {
        console.log('🖼️ [ANALYSIS] Starting screenshot analysis...');
        // Generate screenshot analysis
        const screenshotPromise = this.generateScreenshotResponse(dbAgent, query, context)
            .then(response => {
              console.log(`[OK] [ANALYSIS] Screenshot completed in ${Date.now() - analysisStartTime}ms`);
              const score = this.quickScore(response, query, 'screenshot');
              return { type: 'screenshot', response, score, preAnalyzed: false };
            });
        
        individualPromises.push(screenshotPromise);
      }

      if (hasKnowledge) {
        console.log('📚 [ANALYSIS] Starting knowledge analysis...');
        const knowledgeStartTime = Date.now();
        individualPromises.push(
          this.generateKnowledgeResponse(dbAgent, query, ragResults)
            .then(response => {
              console.log(`[OK] [ANALYSIS] Knowledge completed in ${Date.now() - knowledgeStartTime}ms`);
              return { type: 'knowledge', response, score: this.quickScore(response, query, 'knowledge') };
            })
        );
      }

      // Step 3b: Wait for individual analyses to complete (NO EARLY TERMINATION)
      const individualResults = await Promise.all(individualPromises);
      console.log(`[FAST] [PERFORMANCE] Individual analyses completed in ${Date.now() - analysisStartTime}ms`);
      
      console.log('🏁 [INDIVIDUAL ANALYSIS RESULTS] ==========================================');
      individualResults.forEach(result => {
        const optimizationNote = result.preAnalyzed ? ' [PRE-ANALYZED [FAST]]' : '';
        console.log(`[DATA] ${result.type.toUpperCase()}: ${result.score}/10 (${result.response.length} chars)${optimizationNote}`);
      });
      console.log('========================================================');

      // Step 6: INTELLIGENT COMBINED ANALYSIS - Only run if individual results are insufficient
      let analysisResults = [...individualResults];
      if (useScreenshot && hasKnowledge) {
        // Check if any individual result is already excellent (quality > 80%)
        const bestIndividualQuality = Math.max(
          ...individualResults.map(result => this.assessContentQuality(result.response))
        );
        
        if (bestIndividualQuality >= 0.8) {
          console.log(`[START] [SMART SKIP] Best individual quality: ${(bestIndividualQuality * 100).toFixed(0)}% - Skipping combined analysis for faster response`);
        } else {
          console.log(`[LOADING] [COMBINED NEEDED] Best individual quality: ${(bestIndividualQuality * 100).toFixed(0)}% - Running combined analysis for better result`);
          
          // Generate combined analysis with screenshot and knowledge
          const combinedStartTime = Date.now();
          const combinedResponse = await this.generateCombinedResponse(dbAgent, query, context, ragResults);
          console.log(`[OK] [COMBINED] Combined analysis completed in ${Date.now() - combinedStartTime}ms`);
            
          const combinedResult = { 
            type: 'combined', 
            response: combinedResponse, 
            score: this.quickScore(combinedResponse, query, 'combined'),
            preAnalyzed: false
          };
          analysisResults.push(combinedResult);
        }
      }

      // Step 4: Select best response based on content quality and context relevance
      console.log('[TARGET] [FINAL SELECTION] ==========================================');
      analysisResults.forEach(result => {
        const quality = this.assessContentQuality(result.response);
        console.log(`[DATA] ${result.type.toUpperCase()}: Quality ${(quality * 100).toFixed(0)}% (${result.response.length} chars)`);
      });
      
      const bestResult = this.selectBestResponse(analysisResults);
      const bestQuality = this.assessContentQuality(bestResult.response);
      console.log(`🏆 [WINNER] ${bestResult.type.toUpperCase()} selected - Quality ${(bestQuality * 100).toFixed(0)}%`);
      
      // Screen context is already stored in working memory by the screenshot analysis flow
      // Simple queries will access it directly from existing visual memory
      
      console.log('========================================================');

      // Update stats
      const responseTime = Date.now() - startTime;
      this.updateStats(responseTime);

      // Step 7: Store interaction in memory
      console.log('💾 [MEMORY] Storing interaction in memory...');
      await this.storeMemoryInteraction(
        context.agentId, 
        context.userId || 'guest', 
        query, 
        bestResult.response,
        {
          analysisType: bestResult.type,
          responseTime,
          ragResults: ragResults.length,
          hasScreenshot: !!(context.screenshot || context.image || context.imageContext)
        }
      );

      return this.buildSuccessResponse(bestResult, dbAgent, ragResults, responseTime, analysisResults, cacheKey, memoryContext, useScreenshot, mcpProcessingResult);

    } catch (error) {
      console.error('[ERROR] [AgentOrchestrator] Failed:', error);
      
      const responseTime = Date.now() - startTime;
      return {
        response: "I apologize, but I encountered an issue processing your request. Please try again.",
        selectedAgent: { selectedAgent: 'assistant', confidence: 0.5 },
        ragResults: [],
        metadata: { error: error.message, responseTime },
        success: false
      };
    }
  }

  /**
   * Process MCP query in parallel with RAG and memory
   */
  async processMCPQuery(agent, query, context) {
    try {
      console.log(`[TOOL] [MCP] Processing MCP query for agent ${agent.id}...`);
      
      // Extract userId from context - if no authenticated user, MCP should not run
      const userId = context.userId;
      
      const result = await this.mcpIntegrationService.processQueryWithMCP(agent, query, context, userId);
      
      if (result.hasTools) {
        console.log(`[TOOL] [MCP] Agent ${agent.id} has MCP tools available`);
        if (result.response) {
          console.log(`[OK] [MCP] MCP tools provided response: ${result.response.substring(0, 100)}...`);
        }
        if (result.toolCalls && result.toolCalls.length > 0) {
          console.log(`[CONFIG] [MCP] Executed ${result.toolCalls.length} tool calls`);
        }
      } else {
        console.log(`[TOOL] [MCP] Agent ${agent.id} has no MCP tools assigned`);
      }
      
      return result;
    } catch (error) {
      console.error('[ERROR] [MCP] MCP processing failed:', error);
      return {
        hasTools: false,
        response: null,
        toolCalls: [],
        error: error.message
      };
    }
  }

  /**
   * Get user's selected agent (simplified, no complex validation)
   */
  async getUserSelectedAgent(agentId) {
    try {
      const result = await neonDB.query(
        'SELECT * FROM agents WHERE id = $1 AND is_active = true',
        [parseInt(agentId)]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('[ERROR] [AgentOrchestrator] Failed to get agent:', error);
      return null;
    }
  }

  /**
   * Get RAG results (simplified, no complex classification)
   */
  async getRAGResults(query, agentId) {
    try {
      if (!langchainRAGService.initialized) {
        await langchainRAGService.initialize();
      }

      const agentDocIds = await langchainRAGService.getAgentDocumentIds(agentId);
      
      // Simplified RAG search - skip classification overhead
      const ragResponse = await langchainRAGService.enhancedRAGSearch(query, {
        agentId: agentId,
        documentIds: agentDocIds,
        topK: 5,
        useMultiQuery: false, // Skip multi-query for speed
        useCompression: true,
        useReranking: false,  // Skip reranking for speed
        minScore: 0.4
      });

      return ragResponse.results || [];
    } catch (error) {
      console.warn('[WARNING] [AgentOrchestrator] RAG search failed:', error.message);
      return [];
    }
  }

  /**
   * Generate screenshot response using pre-analyzed data (OPTIMIZATION)
   * Uses pre-processed screenshot analysis instead of re-sending to LLM
   */
  async generateScreenshotResponseFromPreAnalysis(agent, query, context, screenshotAnalysis) {
    // DEPRECATED: This method is part of the old predictive context system and should not be called
    console.error('[ERROR] generateScreenshotResponseFromPreAnalysis called - this method is deprecated');
    return await this.generateScreenshotResponse(agent, query, context);
  }

  /**
   * Generate screenshot-only response using MasterPromptOrchestrator
   */
  async generateScreenshotResponse(agent, query, context) {
    const screenshot = context.screenshot || context.image || context.imageContext;
    
    // Use the agent's assigned model (no override)
    const llm = this.createLLM(agent);
    
    // Use MasterPromptOrchestrator for professional prompt engineering
    const orchestratorContext = {
      strategy: { 
        useKnowledge: false, 
        useScreenshot: true, 
        useTools: false,
        reasoning: "Screenshot-only visual analysis for image-based query response"
      },
      screenshot: screenshot,
      image: screenshot,
      includeScreenshot: true
    };
    
    const systemPrompt = masterPromptOrchestrator.orchestratePrompt(agent, orchestratorContext, query);
    
    // LOG THE PROMPT
    console.log('📝 [SCREENSHOT PROMPT] ==========================================');
    console.log(`[AI] Agent: ${agent.name} (${agent.ai_model})`);
    console.log(`[TASKS] System Prompt (${systemPrompt.length} chars):`);
    console.log(systemPrompt);
    console.log(`❓ User Query: "${query}"`);
    console.log(`🖼️ Screenshot: ${screenshot ? screenshot.substring(0, 50) + '...' : 'None'}`);
    console.log('========================================================');
    
    // Build message content with validation for image data
    const content = [{ type: "text", text: query }];
    const formattedImageData = this.formatImageData(screenshot);
    
    if (formattedImageData) {
      content.push({ type: "image_url", image_url: { url: formattedImageData } });
    } else {
      console.warn('🖼️ [IMAGE SKIPPED] Invalid screenshot data - sending text-only message to prevent API error');
    }

    const messages = [
      new SystemMessage(systemPrompt),
      new HumanMessage({ content })
    ];

    // LOG FINAL PROMPT STRUCTURE
    console.log('[TASKS] [SCREENSHOT FINAL PROMPT] ==========================================');
    console.log('🔹 SYSTEM MESSAGE:');
    console.log(systemPrompt);
    console.log('🔹 USER MESSAGE:');
    console.log(`Text: "${query}"`);
    console.log(`Image: ${screenshot ? 'Included (base64 data)' : 'None'}`);
    console.log('🔹 TOTAL MESSAGES:', messages.length);
    console.log('🔹 ESTIMATED TOKENS:', Math.ceil(systemPrompt.length / 4) + Math.ceil(query.length / 4) + (screenshot ? 1000 : 0));
    console.log('========================================================');

    console.log(`🔥 [PERFORMANCE] Starting LLM API call for ${agent.ai_model}...`);
    const llmStartTime = Date.now();
    const response = await llm.invoke(messages);
    const llmEndTime = Date.now();
    console.log(`🔥 [PERFORMANCE] LLM API call completed in ${llmEndTime - llmStartTime}ms`);
    
    console.log(`[OK] [SCREENSHOT RESPONSE] Length: ${response.content.length} chars`);
    console.log(`📝 [SCREENSHOT RESPONSE] Preview: "${response.content.substring(0, 200)}..."`);
    
    return response.content;
  }

  /**
   * Generate streaming screenshot response for visual queries
   */
  async generateScreenshotResponseStream(agent, query, context, onChunk) {
    try {
      // Send visual processing notification
      onChunk({
        type: 'processing',
        stage: 'visual',
        message: 'Analyzing screenshot...',
        timestamp: Date.now()
      });

      // Memory retrieval - Get relevant memories for context enhancement (UNIFIED SYSTEM)
      console.log('🧠 [VISUAL STREAMING MEMORY] Retrieving relevant memories...');
      onChunk({
        type: 'processing',
        stage: 'memory',
        message: 'Retrieving relevant memories...',
        timestamp: Date.now()
      });
      
      const memoryContext = await this.retrieveMemoryContext(context.agentId, context.userId || 'guest', query);

      const screenshot = context.screenshot || context.image || context.imageContext;
      
      // Use the agent's assigned model (no override)
      const llm = this.createLLM(agent);
      
      // Use MasterPromptOrchestrator for professional prompt engineering
      const orchestratorContext = {
        strategy: { 
          useKnowledge: false, 
          useScreenshot: true, 
          useTools: false,
          reasoning: "Screenshot-only visual analysis for image-based query response"
        },
        screenshot: screenshot,
        image: screenshot,
        includeScreenshot: true
      };
      
      const systemPrompt = masterPromptOrchestrator.orchestratePrompt(agent, orchestratorContext, query);
      
      // LOG THE PROMPT
      console.log('📝 [STREAMING SCREENSHOT PROMPT] ==========================================');
      console.log(`[AI] Agent: ${agent.name} (${agent.ai_model})`);
      console.log(`[TASKS] System Prompt (${systemPrompt.length} chars):`);
      console.log(systemPrompt);
      console.log(`❓ User Query: "${query}"`);
      console.log(`🖼️ Screenshot: ${screenshot ? screenshot.substring(0, 50) + '...' : 'None'}`);
      console.log('========================================================');
      
      // Build message content with validation for image data
      const content = [{ type: "text", text: query }];
      const formattedImageData = this.formatImageData(screenshot);
      
      if (formattedImageData) {
        content.push({ type: "image_url", image_url: { url: formattedImageData } });
      } else {
        console.warn('🖼️ [IMAGE SKIPPED] Invalid screenshot data - sending text-only message to prevent API error');
      }

      const messages = [
        new SystemMessage(systemPrompt),
        new HumanMessage({ content })
      ];

      // LOG FINAL PROMPT STRUCTURE
      console.log('[TASKS] [STREAMING SCREENSHOT FINAL PROMPT] ==========================================');
      console.log('🔹 SYSTEM MESSAGE:');
      console.log(systemPrompt);
      console.log('🔹 USER MESSAGE:');
      console.log(`Text: "${query}"`);
      console.log(`Image: ${screenshot ? 'Included (base64 data)' : 'None'}`);
      console.log('🔹 TOTAL MESSAGES:', messages.length);
      console.log('🔹 ESTIMATED TOKENS:', Math.ceil(systemPrompt.length / 4) + Math.ceil(query.length / 4) + (screenshot ? 1000 : 0));
      console.log('========================================================');

      // Send visual analysis notification
      onChunk({
        type: 'visual',
        hasScreenshot: !!screenshot,
        analysis: 'visual',
        timestamp: Date.now()
      });

      console.log(`🌊 [STREAMING SCREENSHOT] Starting LLM streaming for ${agent.ai_model}...`);
      
      // Stream the LLM response
      const stream = await llm.stream(messages);
      let fullResponse = '';
      
      for await (const chunk of stream) {
        const content = chunk.content;
        if (content) {
          fullResponse += content;
          
          // Send content chunk
          onChunk({
            type: 'content',
            content: content,
            timestamp: Date.now()
          });
        }
      }
      
      console.log(`[OK] [STREAMING SCREENSHOT] Response completed: ${fullResponse.length} chars`);
      
    } catch (error) {
      console.error(`[ERROR] [STREAMING SCREENSHOT] Error:`, error);
      
      // Send error notification
      onChunk({
        type: 'error',
        error: error.message,
        timestamp: Date.now()
      });
      
      throw error;
    }
  }

  /**
   * Generate knowledge-only response using MasterPromptOrchestrator
   */
  async generateKnowledgeResponse(agent, query, ragResults) {
    // Knowledge responses can use the regular model since they don't involve images
    const llm = this.createLLM(agent);
    
    // Use MasterPromptOrchestrator for professional prompt engineering
    const context = {
      strategy: { 
        useKnowledge: true, 
        useScreenshot: false, 
        useTools: false,
        reasoning: "Knowledge-only analysis for comprehensive response based on relevant information"
      },
      ragResults: ragResults
    };
    
    const systemPrompt = masterPromptOrchestrator.orchestratePrompt(agent, context, query);

    // LOG THE PROMPT
    console.log('📚 [KNOWLEDGE PROMPT] ==========================================');
    console.log(`[AI] Agent: ${agent.name} (${agent.ai_model})`);
    console.log(`[TASKS] System Prompt (${systemPrompt.length} chars):`);
    console.log(systemPrompt);
    console.log(`❓ User Query: "${query}"`);
    console.log(`📖 KB Results: ${ragResults.length} items`);
    ragResults.slice(0, 3).forEach((result, index) => {
      console.log(`   ${index + 1}. ${result.title} (${Math.round(result.similarity * 100)}% relevance, ${result.content.length} chars)`);
    });
    console.log('========================================================');

    const messages = [
      new SystemMessage(systemPrompt),
      new HumanMessage(query)
    ];

    // LOG FINAL PROMPT STRUCTURE
    console.log('[TASKS] [KNOWLEDGE FINAL PROMPT] ==========================================');
    console.log('🔹 SYSTEM MESSAGE:');
    console.log(systemPrompt);
    console.log('🔹 USER MESSAGE:');
    console.log(`"${query}"`);
    console.log('🔹 TOTAL MESSAGES:', messages.length);
    console.log('🔹 ESTIMATED TOKENS:', Math.ceil(systemPrompt.length / 4) + Math.ceil(query.length / 4));
    console.log('========================================================');

    console.log(`🔥 [PERFORMANCE] Starting LLM API call for ${agent.ai_model}...`);
    const llmStartTime = Date.now();
    const response = await llm.invoke(messages);
    const llmEndTime = Date.now();
    console.log(`🔥 [PERFORMANCE] LLM API call completed in ${llmEndTime - llmStartTime}ms`);
    
    console.log(`[OK] [KNOWLEDGE RESPONSE] Length: ${response.content.length} chars`);
    console.log(`📝 [KNOWLEDGE RESPONSE] Preview: "${response.content.substring(0, 200)}..."`);
    
    return response.content;
  }

  /**
   * Generate combined response using pre-analyzed screenshot data + knowledge (OPTIMIZATION)
   */
  async generateCombinedResponseFromPreAnalysis(agent, query, context, ragResults, screenshotAnalysis) {
    // DEPRECATED: This method is part of the old predictive context system and should not be called
    console.error('[ERROR] generateCombinedResponseFromPreAnalysis called - this method is deprecated');
    return await this.generateCombinedResponse(agent, query, context, ragResults);
  }

  /**
   * Generate combined response (screenshot + knowledge) using MasterPromptOrchestrator
   */
  async generateCombinedResponse(agent, query, context, ragResults) {
    const screenshot = context.screenshot || context.image || context.imageContext;
    const llm = this.createLLM(agent);
    
    // Use MasterPromptOrchestrator for professional multi-modal prompt engineering
    const orchestratorContext = {
      strategy: { 
        useKnowledge: true, 
        useScreenshot: true, 
        useTools: false,
        reasoning: "Multi-modal analysis combining visual screenshot and knowledge base information for comprehensive response"
      },
      ragResults: ragResults,
      screenshot: screenshot,
      image: screenshot,
      includeScreenshot: true
    };
    
    const systemPrompt = masterPromptOrchestrator.orchestratePrompt(agent, orchestratorContext, query);

    // LOG THE PROMPT
    console.log('[LOADING] [COMBINED PROMPT] ==========================================');
    console.log(`[AI] Agent: ${agent.name} (${agent.ai_model})`);
    console.log(`[TASKS] System Prompt (${systemPrompt.length} chars):`);
    console.log(systemPrompt);
    console.log(`❓ User Query: "${query}"`);
    console.log(`🖼️ Screenshot: ${screenshot ? screenshot.substring(0, 50) + '...' : 'None'}`);
    console.log(`📖 KB Results: ${ragResults.length} items`);
    ragResults.slice(0, 3).forEach((result, index) => {
      console.log(`   ${index + 1}. ${result.title} (${Math.round(result.similarity * 100)}% relevance, ${result.content.length} chars)`);
    });
    console.log('========================================================');

    // Build message content with validation for image data
    const content = [{ type: "text", text: query }];
    const formattedImageData = this.formatImageData(screenshot);
    
    if (formattedImageData) {
      content.push({ type: "image_url", image_url: { url: formattedImageData } });
    } else {
      console.warn('🖼️ [IMAGE SKIPPED] Invalid screenshot data - sending text-only message to prevent API error');
    }

    const messages = [
      new SystemMessage(systemPrompt),
      new HumanMessage({ content })
    ];

    // LOG FINAL PROMPT STRUCTURE
    console.log('[TASKS] [COMBINED FINAL PROMPT] ==========================================');
    console.log('🔹 SYSTEM MESSAGE:');
    console.log(systemPrompt);
    console.log('🔹 USER MESSAGE:');
    console.log(`Text: "${query}"`);
    console.log(`Image: ${screenshot ? 'Included (base64 data)' : 'None'}`);
    console.log('🔹 TOTAL MESSAGES:', messages.length);
    console.log('🔹 ESTIMATED TOKENS:', Math.ceil(systemPrompt.length / 4) + Math.ceil(query.length / 4) + (screenshot ? 1000 : 0));
    console.log('========================================================');

    const response = await llm.invoke(messages);
    
    console.log(`[OK] [COMBINED RESPONSE] Length: ${response.content.length} chars`);
    console.log(`📝 [COMBINED RESPONSE] Preview: "${response.content.substring(0, 200)}..."`);
    
    return response.content;
  }


  /**
   * Create LLM instance for agent - ALWAYS use agent's assigned model
   */
  createLLM(agent) {
    switch (agent.ai_model) {
      case 'claude-3-sonnet':
      case 'claude-3-haiku':
        return new ChatAnthropic({
          modelName: agent.ai_model,
          temperature: 0.7,
          maxTokens: 2048,
          anthropicApiKey: process.env.ANTHROPIC_API_KEY
        });
      default:
        return new ChatOpenAI({
          modelName: agent.ai_model || 'gpt-4o',
          temperature: 0.7,
          maxTokens: 2048,
          openAIApiKey: process.env.OPENAI_API_KEY
        });
    }
  }

  /**
   * Enhanced quick scoring with improved heuristics and caching
   */
  quickScore(response, query, analysisType) {
    if (!response || response.length < 50) return 3;
    
    // Check cache first
    const scoreKey = `${query.toLowerCase().trim()}:${analysisType}:${response.length}`;
    const cachedScore = this.scoreCache.get(scoreKey);
    if (cachedScore) {
      return cachedScore;
    }
    
    const queryLower = query.toLowerCase();
    const responseLower = response.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2); // Filter short words
    const responseWords = responseLower.split(/\s+/);
    
    // 1. Word matching score (40% weight)
    const exactMatches = queryWords.filter(word => responseLower.includes(word)).length;
    const partialMatches = queryWords.filter(word => 
      responseWords.some(rw => rw.includes(word) && rw !== word)
    ).length;
    const wordScore = queryWords.length > 0 ? (exactMatches * 2 + partialMatches) / (queryWords.length * 2) : 0.5;
    
    // 2. Content quality indicators (30% weight)
    const hasCodeBlocks = response.includes('```') || response.includes('`');
    const hasBulletPoints = /[•\-\*]\s/.test(response);
    const hasStructure = /\n\n/.test(response) || /\d+\./.test(response);
    const hasExamples = /example|for instance|such as/i.test(response);
    const qualityScore = [hasCodeBlocks, hasBulletPoints, hasStructure, hasExamples]
      .filter(Boolean).length / 4;
    
    // 3. Length appropriateness (15% weight)
    const idealLength = Math.max(200, queryWords.length * 50);
    const lengthRatio = Math.min(response.length / idealLength, idealLength / response.length);
    const lengthScore = Math.max(0.5, lengthRatio);
    
    // 4. Response completeness (15% weight)
    const hasConclusion = /in conclusion|therefore|overall|to summarize/i.test(response);
    const answersDirectly = queryWords.length > 0 ? queryWords.some(word => 
      responseLower.includes(word) && responseLower.indexOf(word) < response.length / 3
    ) : true; // Default to true for short queries like "hi"
    const completenessScore = [hasConclusion, answersDirectly].filter(Boolean).length / 2;
    
    // Calculate weighted score
    let score = 4 + (wordScore * 4) + (qualityScore * 3) + (lengthScore * 1.5) + (completenessScore * 1.5);
    
    // Analysis type bonuses
    if (analysisType === 'combined') score += 0.8;
    if (analysisType === 'knowledge' && response.length > 300) score += 0.6;
    if (analysisType === 'screenshot' && (/image|screen|visual|picture|photo/i.test(response))) score += 0.6;
    if (analysisType === 'basic') score += 0.4;
    
    // Final score normalization
    const finalScore = Math.min(10, Math.max(1, Math.round(score)));
    
    // Cache the score
    if (this.scoreCache.size >= this.maxCacheSize) {
      const firstKey = this.scoreCache.keys().next().value;
      this.scoreCache.delete(firstKey);
    }
    this.scoreCache.set(scoreKey, finalScore);
    
    return finalScore;
  }

  /**
   * Select best response from parallel analyses
   */
  selectBestResponse(analysisResults) {
    if (analysisResults.length === 0) {
      return { type: 'error', response: 'No analysis results available', score: 1 };
    }

    // Single result - return it
    if (analysisResults.length === 1) {
      return analysisResults[0];
    }

    // Multiple results - prioritize by logical context relevance
    // 1. Combined analysis (screenshot + knowledge) - most comprehensive
    const combined = analysisResults.find(r => r.type === 'combined');
    if (combined) {
      console.log('[TARGET] [SELECTION] Combined analysis selected - most comprehensive context');
      return combined;
    }

    // 2. Choose between screenshot and knowledge based on content quality and length
    const screenshot = analysisResults.find(r => r.type === 'screenshot');
    const knowledge = analysisResults.find(r => r.type === 'knowledge');
    
    if (screenshot && knowledge) {
      // Compare by actual content quality rather than hardcoded scores
      const screenshotQuality = this.assessContentQuality(screenshot.response);
      const knowledgeQuality = this.assessContentQuality(knowledge.response);
      
      if (Math.abs(screenshotQuality - knowledgeQuality) < 0.2) {
        // If quality is similar, prefer knowledge for text-heavy queries, screenshot for visual queries
        const isVisualQuery = /screenshot|screen|image|visual|picture|photo|display|show|see|look/i.test(screenshot.response);
        const selected = isVisualQuery ? screenshot : knowledge;
        console.log(`[TARGET] [SELECTION] ${selected.type} selected - similar quality but ${isVisualQuery ? 'visual context' : 'text context'} preferred`);
        return selected;
      } else {
        // Clear quality difference - choose the better one
        const selected = screenshotQuality > knowledgeQuality ? screenshot : knowledge;
        console.log(`[TARGET] [SELECTION] ${selected.type} selected - higher content quality`);
        return selected;
      }
    }

    // 3. Fallback to available result
    const available = screenshot || knowledge || analysisResults.find(r => r.type === 'basic');
    console.log(`[TARGET] [SELECTION] ${available.type} selected - only available option`);
    return available || analysisResults[0];
  }

  /**
   * Assess content quality based on actual content characteristics
   * Returns normalized quality score 0.0-1.0
   */
  assessContentQuality(response) {
    if (!response || response.length < 50) return 0.1;
    
    // Assess completeness and structure
    const hasProperStructure = response.includes('\n') || response.length > 200;
    const hasSpecificDetails = /\b(specifically|exactly|precisely|detailed|comprehensive)\b/i.test(response);
    const hasActionableContent = /\b(can|should|try|use|click|select|open|follow)\b/i.test(response);
    const hasConcreteInformation = /\b(\d+|step|process|method|way|how)\b/i.test(response);
    
    // Assess coherence and relevance
    const isCoherent = response.split('.').length > 2; // Multiple sentences
    const hasContext = response.length > 150; // Sufficient detail
    const isComplete = !response.endsWith('...') && !/(incomplete|partial|error)/i.test(response);
    
    // Calculate quality factors (each 0-1)
    const structureScore = hasProperStructure ? 1 : 0;
    const detailScore = [hasSpecificDetails, hasActionableContent, hasConcreteInformation].filter(Boolean).length / 3;
    const coherenceScore = [isCoherent, hasContext, isComplete].filter(Boolean).length / 3;
    
    // Weighted average (structure 30%, detail 40%, coherence 30%)
    return (structureScore * 0.3) + (detailScore * 0.4) + (coherenceScore * 0.3);
  }

  /**
   * Format image data for AI APIs with compression for speed
   * Returns null if image data is invalid to prevent empty URL errors
   */
  formatImageData(imageData) {
    if (!imageData || imageData.trim() === '') {
      console.warn('🖼️ [IMAGE VALIDATION] No valid image data provided');
      return null;
    }
    
    if (imageData.startsWith('data:') || imageData.startsWith('http')) {
      // Check if image size is reasonable (estimate from base64 length)
      const base64Data = imageData.split(',')[1] || imageData;
      const sizeInMB = (base64Data.length * 0.75) / (1024 * 1024); // Approximate MB
      
      console.log(`🖼️ [IMAGE SIZE] Estimated size: ${sizeInMB.toFixed(2)}MB`);
      
      if (sizeInMB > 5) {
        console.warn(`[WARNING] [LARGE IMAGE] Image is ${sizeInMB.toFixed(2)}MB - this may cause slow API response`);
        console.warn(`[INSIGHT] [OPTIMIZATION] Consider resizing screenshots to 1280x720 for faster processing`);
      }
      
      return imageData;
    }
    
    // Format as data URL if raw base64
    const cleanBase64 = imageData.replace(/\s/g, '');
    
    // Validate base64 data has reasonable length
    if (cleanBase64.length < 100) {
      console.warn('🖼️ [IMAGE VALIDATION] Base64 data too short to be valid image');
      return null;
    }
    
    const sizeInMB = (cleanBase64.length * 0.75) / (1024 * 1024);
    console.log(`🖼️ [IMAGE SIZE] Formatted image size: ${sizeInMB.toFixed(2)}MB`);
    
    if (sizeInMB > 5) {
      console.warn(`[WARNING] [LARGE IMAGE] Image is ${sizeInMB.toFixed(2)}MB - this may cause slow API response`);
    }
    
    return `data:image/png;base64,${cleanBase64}`;
  }

  /**
   * Retrieve relevant memory context for query
   */
  async retrieveMemoryContext(agentId, userId, query) {
    try {
      const memoryInstance = await this.memoryService.getMemoryInstance(agentId, userId);
      
      const memoryContext = {
        working: [],
        episodic: [],
        semantic: [],
        procedural: []
      };

      // Retrieve from different memory types in parallel
      const retrievalPromises = [
        memoryInstance.working.getContext().then(context => {
          memoryContext.working = context.slice(0, 5); // Last 5 working memory items
        }).catch(() => {}),
        
        memoryInstance.episodic.searchEpisodes(query, { limit: 3 }).then(episodes => {
          memoryContext.episodic = episodes;
        }).catch(() => {}),
        
        memoryInstance.semantic.searchKnowledge(query, { limit: 4 }).then(knowledge => {
          memoryContext.semantic = knowledge;
        }).catch(() => {}),
        
        memoryInstance.procedural.findRelevantBehaviors(query, { limit: 2 }).then(behaviors => {
          memoryContext.procedural = behaviors;
        }).catch(() => {})
      ];

      await Promise.all(retrievalPromises);

      const totalMemories = memoryContext.working.length + memoryContext.episodic.length + 
                           memoryContext.semantic.length + memoryContext.procedural.length;
      
      console.log(`🧠 [MEMORY] Retrieved ${totalMemories} relevant memories (W:${memoryContext.working.length}, E:${memoryContext.episodic.length}, S:${memoryContext.semantic.length}, P:${memoryContext.procedural.length})`);
      
      return memoryContext;
      
    } catch (error) {
      console.error('[ERROR] [MEMORY] Memory retrieval failed:', error);
      return { working: [], episodic: [], semantic: [], procedural: [] };
    }
  }

  /**
   * Store interaction in memory system
   */
  async storeMemoryInteraction(agentId, userId, query, response, metadata) {
    try {
      const memoryInstance = await this.memoryService.getMemoryInstance(agentId, userId);
      
      // Store in working memory (immediate context)
      await memoryInstance.working.addItem({
        type: 'interaction',
        content: {
          query: query,
          response: response.substring(0, 500) // Truncate for working memory
        },
        timestamp: new Date(),
        metadata: metadata
      });
      
      // Store as episodic memory (session-specific memory)
      await memoryInstance.episodic.storeEpisode({
        content: query,
        response: response,
        context: {
          analysisType: metadata.analysisType,
          hasScreenshot: metadata.hasScreenshot,
          ragUsed: metadata.ragResults > 0
        },
        importance: this.calculateInteractionImportance(query, response, metadata),
        timestamp: new Date()
      });
      
      // Let the memory system decide if this should be promoted to semantic/procedural
      
      console.log(`💾 [MEMORY] Stored interaction for agent ${agentId}, user ${userId}`);
      
    } catch (error) {
      console.error('[ERROR] [MEMORY] Memory storage failed:', error);
    }
  }

  /**
   * Calculate importance score for memory interaction
   */
  calculateInteractionImportance(query, response, metadata) {
    let importance = 0.5; // Base importance
    
    // Longer responses might be more important
    if (response.length > 500) importance += 0.2;
    
    // Complex analysis types might be more important
    if (metadata.analysisType === 'combined') importance += 0.2;
    if (metadata.analysisType === 'knowledge') importance += 0.1;
    
    // RAG usage indicates complexity
    if (metadata.ragResults > 0) importance += 0.1;
    
    // Screenshot usage indicates visual context
    if (metadata.hasScreenshot) importance += 0.1;
    
    // Fast responses might indicate simple/common queries
    if (metadata.responseTime < 1000) importance -= 0.1;
    
    return Math.max(0.1, Math.min(1.0, importance));
  }

  /**
   * Build success response object with memory-efficient streaming
   */
  buildSuccessResponse(bestResult, dbAgent, ragResults, responseTime, analysisResults, cacheKey = null, memoryContext = null, useScreenshot = false, mcpResult = null) {
    console.log(`[OK] [AgentOrchestrator] Completed in ${responseTime}ms using ${bestResult.type} analysis`);

    // Track early termination
    const wasEarlyTermination = analysisResults.length < 3;
    if (wasEarlyTermination) {
      this.stats.earlyTerminations++;
    }

    // Create a memory-efficient response object
    const response = {
      response: bestResult.response,
      selectedAgent: {
        selectedAgent: dbAgent.personality_type,
        agentId: dbAgent.id,
        agentName: dbAgent.name,
        confidence: bestResult.score / 10
      },
      ragResults: this.streamRAGResults(ragResults), // Stream RAG results to reduce memory
      mcpResults: mcpResult || null, // Include MCP results if available
      memoryContext: memoryContext || null, // Include memory context if available
      metadata: {
        responseTime,
        analysisType: bestResult.type,
        analysesRun: analysisResults.length,
        parallelExecution: true,
        earlyTermination: wasEarlyTermination,
        cached: false,
        memoryOptimized: true,
        memoryUsed: memoryContext ? Object.values(memoryContext).reduce((sum, arr) => sum + arr.length, 0) : 0,
        useScreenshot: useScreenshot,  // Include corrected screenshot decision
        mcpUsed: mcpResult ? mcpResult.hasTools : false,
        mcpToolsExecuted: mcpResult && mcpResult.toolCalls ? mcpResult.toolCalls.length : 0
      },
      success: true
    };

    // Cache only essential parts for memory efficiency
    if (cacheKey) {
      const cacheableResponse = {
        ...response,
        ragResults: ragResults.slice(0, 3), // Cache only top 3 RAG results
        response: bestResult.response.length > 2000 ? 
          bestResult.response.substring(0, 2000) + '...' : bestResult.response // Truncate long responses
      };
      this.cacheResponse(cacheKey, cacheableResponse);
    }

    return response;
  }

  /**
   * Orchestrate agent response with streaming support
   * Streams response chunks in real-time via callback function
   */
  async orchestrateAgentResponseStream(query, context, onChunk) {
    const startTime = Date.now();
    
    try {
      console.log(`🌊 [STREAMING ORCHESTRATOR] Starting streaming orchestration for query: "${query.substring(0, 50)}..."`);
      console.log(`🌊 [STREAMING ORCHESTRATOR] Context:`, { 
        agentId: context.agentId, 
        hasScreenshot: !!(context.screenshot || context.image), 
        userId: context.userId || 'guest' 
      });
      
      // Get agent configuration
      const dbAgent = await this.getAgentById(context.agentId);
      if (!dbAgent) {
        throw new Error(`Agent not found: ${context.agentId}`);
      }
      
      console.log(`🌊 [STREAMING ORCHESTRATOR] Agent loaded: ${dbAgent.name} (${dbAgent.ai_model})`);
      
      // Test chunk sending immediately
      console.log(`🌊 [STREAMING ORCHESTRATOR] Testing chunk callback...`);
      onChunk({
        type: 'test',
        message: 'Streaming orchestrator initialized successfully',
        timestamp: Date.now()
      });

      // Send initial metadata chunk
      onChunk({
        type: 'metadata',
        agent: {
          id: dbAgent.id,
          name: dbAgent.name,
          model: dbAgent.ai_model
        },
        timestamp: Date.now()
      });

      // Route to advanced streaming (no query classification)
      // INTELLIGENT ROUTING - same logic as non-streaming orchestrator
      const hasScreenshot = !!(context.screenshot || context.image || context.imageContext);
      
      // For visual queries, prioritize screenshot analysis over RAG
      const isVisualQuery = /screenshot|screen|image|visual|picture|photo|display|show|see|look|left.*side|right.*side|top|bottom|what.*you.*see|describe.*screen/i.test(query);
      
      if (hasScreenshot && isVisualQuery) {
        console.log(`🖼️ [STREAMING VISUAL] Visual query detected - using screenshot analysis`);
        
        // Send strategy chunk
        onChunk({
          type: 'strategy',
          strategy: 'visual',
          reasoning: 'Visual query with screenshot - using direct screenshot analysis',
          timestamp: Date.now()
        });

        // Stream screenshot response directly
        await this.generateScreenshotResponseStream(dbAgent, query, context, onChunk);
      } else {
        // Send strategy chunk  
        onChunk({
          type: 'strategy', 
          strategy: 'advanced',
          reasoning: 'Complex query - using full orchestration with RAG and tools',
          timestamp: Date.now()
        });

        // Stream advanced response
        await this.generateAdvancedResponseStream(dbAgent, query, context, onChunk);
      }

      // Send completion timing
      const totalTime = Date.now() - startTime;
      onChunk({
        type: 'timing',
        executionTime: totalTime,
        timestamp: Date.now()
      });

      console.log(`[OK] [STREAMING ORCHESTRATOR] Streaming completed in ${totalTime}ms`);

    } catch (error) {
      console.error(`[ERROR] [STREAMING ORCHESTRATOR] Error:`, error);
      
      // Send error chunk
      onChunk({
        type: 'error',
        error: error.message,
        timestamp: Date.now()
      });
      
      throw error;
    }
  }

  /**
   * Generate basic response with streaming
   */

  /**
   * Generate advanced response with streaming (RAG + Tools)
   */
  async generateAdvancedResponseStream(agent, query, context, onChunk) {
    try {
      // Send RAG processing notification
      onChunk({
        type: 'processing',
        stage: 'rag',
        message: 'Analyzing knowledge base...',
        timestamp: Date.now()
      });

      // BUFFERED QUALITY SELECTION - Natural flow without simple query optimization
      // Step 1: Get RAG results for all queries (will return 0 for simple queries naturally)
      let ragResults = [];
      try {
        const ragResponse = await langchainRAGService.enhancedRAGSearch(query, { agentId: context.agentId });
        ragResults = ragResponse?.results || [];
        console.log(`[SEARCH] [STREAMING BUFFERED] RAG search completed: ${ragResults.length} results`);
      } catch (error) {
        console.warn('RAG search failed:', error);
        ragResults = [];
      }

      // Step 2: Check cache before processing (copy from non-streaming)
      const hasScreenshot = !!(context.screenshot || context.image || context.imageContext);
      const hasKnowledge = ragResults.length > 0;
      const cacheKey = this.generateCacheKey(query, context.agentId, hasScreenshot, hasKnowledge);
      
      const cachedResponse = this.getCachedResponse(cacheKey);
      if (cachedResponse) {
        console.log('[START] [STREAMING CACHE HIT] Returning cached response');
        
        onChunk({
          type: 'strategy',
          strategy: 'cached',
          reasoning: 'Using cached response for faster delivery',
          timestamp: Date.now()
        });
        
        // Stream the cached response directly
        const responseText = cachedResponse.response || cachedResponse.content || JSON.stringify(cachedResponse);
        const chunkSize = 50;
        
        for (let i = 0; i < responseText.length; i += chunkSize) {
          const chunk = responseText.slice(i, i + chunkSize);
          onChunk({
            type: 'content',
            content: chunk,
            resultType: 'cached',
            timestamp: Date.now()
          });
          await new Promise(resolve => setTimeout(resolve, 30)); // Faster for cached responses
        }
        
        console.log(`[OK] [STREAMING CACHE] Completed streaming cached response: ${responseText.length} chars`);
        return;
      }

      // Step 2.5: Memory retrieval - Get relevant memories for context enhancement (UNIFIED SYSTEM)
      console.log('🧠 [STREAMING MEMORY] Retrieving relevant memories...');
      onChunk({
        type: 'processing',
        stage: 'memory',
        message: 'Retrieving relevant memories...',
        timestamp: Date.now()
      });
      
      const memoryContext = await this.retrieveMemoryContext(context.agentId, context.userId || 'guest', query);

      // Step 3: Determine what analyses to run (natural flow)
      let useScreenshot = hasScreenshot;
      
      // Always use unified memory context - no simple queries
      if (!useScreenshot && !hasKnowledge) {
        onChunk({
          type: 'strategy', 
          strategy: 'unified_memory',
          reasoning: 'Using unified memory retrieval with empty context - may find episodic/procedural memory',
          timestamp: Date.now()
        });
        
        // Continue to unified memory retrieval even with empty context
        // This ensures consistency and may find relevant episodic or procedural memory
      }

      // Step 3: PARALLEL ANALYSIS - Run individual analyses (copy exact structure)
      console.log('[START] [STREAMING BUFFERED] Starting parallel analysis for quality selection...');
      
      onChunk({
        type: 'strategy',
        strategy: 'buffered_parallel',
        reasoning: `Running ${[useScreenshot ? 'screenshot' : null, hasKnowledge ? 'knowledge' : null].filter(Boolean).join(' + ')} analysis in parallel, then streaming best result`,
        timestamp: Date.now()
      });

      const individualPromises = [];
      const analysisStartTime = Date.now();
      
      if (useScreenshot) {
        console.log('🖼️ [BUFFERED ANALYSIS] Starting screenshot analysis...');
        onChunk({
          type: 'processing',
          stage: 'screenshot',
          message: 'Analyzing screenshot...',
          timestamp: Date.now()
        });
        
        const screenshotPromise = this.generateScreenshotResponse(agent, query, context)
            .then(response => {
              console.log(`[OK] [BUFFERED ANALYSIS] Screenshot completed in ${Date.now() - analysisStartTime}ms`);
              const score = this.quickScore(response, query, 'screenshot');
              return { type: 'screenshot', response, score, preAnalyzed: false };
            });
        
        individualPromises.push(screenshotPromise);
      }

      if (hasKnowledge) {
        console.log('📚 [BUFFERED ANALYSIS] Starting knowledge analysis...');
        onChunk({
          type: 'processing', 
          stage: 'knowledge',
          message: 'Processing knowledge base results...',
          timestamp: Date.now()
        });
        
        const knowledgeStartTime = Date.now();
        individualPromises.push(
          this.generateKnowledgeResponse(agent, query, ragResults)
            .then(response => {
              console.log(`[OK] [BUFFERED ANALYSIS] Knowledge completed in ${Date.now() - knowledgeStartTime}ms`);
              return { type: 'knowledge', response, score: this.quickScore(response, query, 'knowledge') };
            })
        );
      }

      // Wait for individual analyses to complete
      const individualResults = await Promise.all(individualPromises);
      console.log(`[FAST] [BUFFERED PERFORMANCE] Individual analyses completed in ${Date.now() - analysisStartTime}ms`);
      
      console.log('🏁 [BUFFERED ANALYSIS RESULTS] ==========================================');
      individualResults.forEach(result => {
        console.log(`[DATA] ${result.type.toUpperCase()}: ${result.score}/10 (${result.response.length} chars)`);
      });
      console.log('========================================================');

      // Step 4: INTELLIGENT COMBINED ANALYSIS - Only run if individual results are insufficient (copy exact logic)
      let analysisResults = [...individualResults];
      if (useScreenshot && hasKnowledge) {
        // Check if any individual result is already excellent (quality > 80%)
        const bestIndividualQuality = Math.max(
          ...individualResults.map(result => this.assessContentQuality(result.response))
        );
        
        if (bestIndividualQuality >= 0.8) {
          console.log(`[START] [BUFFERED SMART SKIP] Best individual quality: ${(bestIndividualQuality * 100).toFixed(0)}% - Skipping combined analysis for faster response`);
        } else {
          console.log(`[LOADING] [BUFFERED COMBINED NEEDED] Best individual quality: ${(bestIndividualQuality * 100).toFixed(0)}% - Running combined analysis for better result`);
          
          onChunk({
            type: 'processing',
            stage: 'combined',
            message: 'Running combined analysis for enhanced quality...',
            timestamp: Date.now()
          });
          
          // Generate combined analysis with screenshot and knowledge
          const combinedStartTime = Date.now();
          const combinedResponse = await this.generateCombinedResponse(agent, query, context, ragResults);
          console.log(`[OK] [BUFFERED COMBINED] Combined analysis completed in ${Date.now() - combinedStartTime}ms`);
            
          const combinedResult = { 
            type: 'combined', 
            response: combinedResponse, 
            score: this.quickScore(combinedResponse, query, 'combined'),
            preAnalyzed: false
          };
          analysisResults.push(combinedResult);
        }
      }

      // Step 5: SELECT BEST RESULT (copy exact logic)
      const bestResult = this.selectBestResponse(analysisResults);
      console.log(`🏆 [BUFFERED SELECTION] Selected best result: ${bestResult.type.toUpperCase()} (score: ${bestResult.score}/10)`);
      
      onChunk({
        type: 'selection',
        selectedType: bestResult.type,
        score: bestResult.score,
        totalCandidates: analysisResults.length,
        reasoning: `Selected ${bestResult.type} with highest quality score`,
        timestamp: Date.now()
      });
      
      // Step 6: STREAM THE SELECTED BEST RESULT
      onChunk({
        type: 'rag',
        results: ragResults.length,
        hasScreenshot: useScreenshot,
        hasKnowledgeRAG: hasKnowledge,
        selectedResult: bestResult.type,
        timestamp: Date.now()
      });

      console.log(`🌊 [BUFFERED STREAMING] Directly streaming pre-generated ${bestResult.type} result...`);
      
      // Directly stream the pre-generated best result (no second LLM call!)
      const responseText = bestResult.response;
      const chunkSize = 50; // Characters per chunk for realistic streaming effect
      
      console.log(`📤 [DIRECT STREAMING] Streaming ${responseText.length} chars in ${chunkSize}-char chunks`);
      
      for (let i = 0; i < responseText.length; i += chunkSize) {
        const chunk = responseText.slice(i, i + chunkSize);
        
        // Send content chunk
        onChunk({
          type: 'content',
          content: chunk,
          resultType: bestResult.type,
          timestamp: Date.now()
        });
        
        // Small delay to simulate realistic streaming (adjust as needed)
        await new Promise(resolve => setTimeout(resolve, 50)); // 50ms between chunks
      }
      
      console.log(`[OK] [DIRECT STREAMING] Completed streaming ${responseText.length} chars from ${bestResult.type} result`);
      
    } catch (error) {
      console.error(`[ERROR] [STREAMING ADVANCED] Error:`, error);
      throw error;
    }
  }

  /**
   * Stream RAG results to reduce memory footprint
   */
  streamRAGResults(ragResults) {
    return ragResults.map(result => ({
      title: result.title,
      similarity: result.similarity,
      content: result.content.length > 500 ? 
        result.content.substring(0, 500) + '...' : result.content, // Truncate long content
      metadata: {
        originalLength: result.content.length,
        truncated: result.content.length > 500
      }
    }));
  }

  /**
   * Get agent by ID from database
   * Helper method for streaming orchestration
   */
  async getAgentById(id) {
    try {
      // Check cache first for performance
      const cacheKey = `agent_${id}`;
      const cached = this.agentCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp) < this.agentCacheExpiry) {
        this.stats.cacheHits++;
        return cached.data;
      }

      const agents = await neonDB.sql`
        SELECT 
          id, name, personality_type, system_prompt, ai_model,
          is_active, web_search_enabled, search_all_knowledge, is_default,
          created_at, updated_at
        FROM agents 
        WHERE id = ${id} AND is_active = true
      `;
      
      if (agents.length === 0) {
        return null;
      }
      
      const agent = agents[0];
      
      // Cache the result with LRU eviction
      if (this.agentCache.size >= this.maxCacheSize) {
        const firstKey = this.agentCache.keys().next().value;
        this.agentCache.delete(firstKey);
      }
      
      this.agentCache.set(cacheKey, {
        data: agent,
        timestamp: Date.now()
      });
      
      return agent;
    } catch (error) {
      console.error(`[ERROR] [ORCHESTRATOR] Failed to get agent ${id}:`, error);
      return null;
    }
  }

  /**
   * Update performance statistics
   */
  updateStats(responseTime) {
    this.stats.requestsProcessed++;
    this.stats.totalResponseTime += responseTime;
    this.stats.averageResponseTime = this.stats.totalResponseTime / this.stats.requestsProcessed;
    this.stats.lastActivity = new Date();
  }

  /**
   * Get performance statistics with optimization metrics
   */
  getStats() {
    return {
      ...this.stats,
      initialized: this.initialized,
      avgResponseTimeMs: Math.round(this.stats.averageResponseTime),
      optimizations: {
        ragSkipRate: this.stats.requestsProcessed > 0 ? (this.stats.ragSkipped / this.stats.requestsProcessed * 100).toFixed(1) + '%' : '0%',
        earlyTerminationRate: this.stats.requestsProcessed > 0 ? (this.stats.earlyTerminations / this.stats.requestsProcessed * 100).toFixed(1) + '%' : '0%',
        cacheHitRate: this.stats.requestsProcessed > 0 ? (this.stats.cacheHits / this.stats.requestsProcessed * 100).toFixed(1) + '%' : '0%',
        responseCacheSize: this.responseCache.size,
        scoreCacheSize: this.scoreCache.size,
        message: 'Simplified orchestration - predictive features removed'
      }
    };
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      if (!this.initialized) {
        return { status: 'not_initialized' };
      }

      const testResult = await this.orchestrateAgentResponse('health check', { agentId: 1 });
      
      return {
        status: 'healthy',
        initialized: this.initialized,
        testResponse: testResult.success,
        stats: this.getStats()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        initialized: this.initialized
      };
    }
  }


  /**
   * Process screenshot memory storage asynchronously (non-blocking)
   * This method runs in the background to generate LLM captions and store screenshots
   * without blocking the main agent response
   */
  async processScreenshotMemoryAsync(agent, context) {
    try {
      console.log('🖼️ [Working Memory] === ASYNC LLM CAPTION GENERATION START ===');
      console.log('📸 [Working Memory] Processing screenshot for visual memory storage...');
      
      const memoryInstance = await this.memoryService.getMemoryInstance(context.agentId, context.userId || 'guest');
      
      // Generate LLM caption for the screenshot (moved from frontend, now async)
      const imageData = context.image || context.screenshot;
      let caption = 'Screenshot captured';
      
      if (imageData) {
        try {
          console.log('[AI] [Working Memory] Generating LLM caption for screenshot...');
          const captionStartTime = Date.now();
          
          const llm = this.createLLM(agent);
          const captionResult = await llm.invoke([
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Provide a detailed but concise description of what you see in this screenshot. Focus on the main content, interface elements, and any visible text or data.'
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:image/jpeg;base64,${imageData}`,
                    detail: 'auto'
                  }
                }
              ]
            }
          ]);
          
          caption = captionResult.content || 'Screenshot captured';
          const captionTime = Date.now() - captionStartTime;
          console.log(`[OK] [Working Memory] LLM caption generated in ${captionTime}ms: "${caption.substring(0, 100)}..."`);
          
        } catch (captionError) {
          console.warn('[WARNING] [Working Memory] LLM caption generation failed:', captionError.message);
          caption = 'Screenshot captured (caption generation failed)';
        }
      }
      
      // Store in working memory with generated caption
      await memoryInstance.working.addItem({
        type: 'visual',
        context_type: 'screenshot',
        content: {
          caption: caption,
          imageContext: context.imageContext || 'Screenshot',
          timestamp: new Date(),
          hasImage: true,
          hasLLMCaption: true
        },
        image_data: imageData,
        timestamp: new Date(),
        metadata: {
          source: 'user_request',
          type: 'screenshot',
          llm_processed: true
        }
      });
      
      console.log('📸 [Working Memory] Screenshot stored in working memory with LLM caption');
      console.log('🖼️ [Working Memory] === ASYNC LLM CAPTION GENERATION COMPLETE ===');
      
    } catch (error) {
      console.error('[ERROR] [Working Memory] Async screenshot processing failed:', error.message);
      throw error; // Re-throw for the .catch() handler
    }
  }


}

module.exports = new AgentOrchestrator();