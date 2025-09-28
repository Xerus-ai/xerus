/**
 * TTS Agent Service - Voice Response Generation
 * 
 * Integrates with existing agentOrchestrator.js for TTS-optimized voice responses
 * Features:
 * - Uses same parallel analysis (screenshot + RAG) as regular mode
 * - Enables TTS mode in masterPromptOrchestrator for concise responses
 * - Maintains all agent orchestration benefits (memory, caching, context)
 * - Optimized for 30-second voice responses (~75 words)
 */

const agentOrchestrator = require('../agentOrchestrator'); 

class TTSAgentService {
  constructor() {
    this.initialized = false;
    this.stats = {
      ttsRequestsProcessed: 0,
      averageResponseTime: 0,
      totalResponseTime: 0,
      lastActivity: null
    };
    
    console.log('🔊 [TTSAgent] TTS Agent Service initializing...');
  }

  /**
   * Initialize the TTS Agent service
   */
  async initialize() {
    if (this.initialized) {
      console.log('[OK] [TTSAgent] Already initialized');
      return;
    }

    // Initialize the underlying agent orchestrator
    await agentOrchestrator.initialize();

    this.initialized = true;
    console.log('[OK] [TTSAgent] TTS Agent Service initialized - Ready for voice responses');
  }

  /**
   * Generate TTS-optimized voice response for user query
   * 
   * @param {string} query - User's query/question
   * @param {Object} context - Request context
   * @param {number} context.agentId - Agent ID to use for response
   * @param {string} context.userId - User ID (defaults to 'guest')
   * @param {Object} context.screenshot - Optional screenshot data from Fast Context Manager
   * @param {boolean} context.includeScreenshot - Whether to include screenshot analysis
   * @param {boolean} context.includeKnowledge - Whether to include RAG knowledge search
   * @returns {Object} TTS-optimized response with voice metadata
   */
  async generateVoiceResponse(query, context = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    const startTime = Date.now();

    try {
      console.log(`🔊 [TTSAgent] Generating voice response for: "${query.substring(0, 50)}..."`);

      // Prepare TTS context - enable TTS mode and include screenshot if available
      const ttsContext = {
        ...context,
        isTTS: true,  // 🔑 Enable TTS mode in masterPromptOrchestrator
        userId: context.userId || 'guest',
        includeScreenshot: context.includeScreenshot !== false, // Default to true
        includeKnowledge: context.includeKnowledge !== false,   // Default to true
      };

      // Screenshot should be provided by frontend via API request
      // Frontend has access to Fast Context Manager and should send screenshot data

      // Log TTS context setup with detailed information
      console.log('[TARGET] [TTSAgent] TTS Context configured:', {
        agentId: ttsContext.agentId,
        userId: ttsContext.userId,
        isTTS: ttsContext.isTTS,
        includeScreenshot: ttsContext.includeScreenshot,
        includeKnowledge: ttsContext.includeKnowledge,
        hasScreenshot: !!(ttsContext.screenshot || ttsContext.image || ttsContext.imageContext),
        queryLength: query?.length || 0,
        queryPreview: query?.substring(0, 100) + '...'
      });

      // Log screenshot information
      if (ttsContext.screenshot) {
        console.log('📸 [TTSAgent] Screenshot data provided:', {
          hasScreenshot: true,
          screenshotSize: typeof ttsContext.screenshot === 'string' ? ttsContext.screenshot.length : 'not string',
          imageContext: !!ttsContext.imageContext
        });
      } else {
        console.log('📸 [TTSAgent] No screenshot data provided');
      }

      // Call existing agent orchestrator with TTS mode enabled
      const orchestrationResult = await agentOrchestrator.orchestrateAgentResponse(query, ttsContext);

      if (!orchestrationResult.success) {
        throw new Error(`Agent orchestration failed: ${orchestrationResult.error}`);
      }

      // Update TTS stats
      const responseTime = Date.now() - startTime;
      this.updateStats(responseTime);

      // Format TTS-optimized response
      const ttsResponse = {
        success: true,
        response: orchestrationResult.response,
        agentId: ttsContext.agentId,
        agentName: orchestrationResult.agent?.name || 'AI Assistant',
        analysisType: orchestrationResult.analysisType || 'tts',
        responseTime,
        
        // TTS-specific metadata
        ttsOptimized: true,
        estimatedDuration: this.estimateVoiceDuration(orchestrationResult.response),
        wordCount: this.countWords(orchestrationResult.response),
        
        // Context information
        contextUsed: {
          screenshot: !!(ttsContext.screenshot || ttsContext.image || ttsContext.imageContext),
          knowledge: orchestrationResult.ragResults?.length > 0,
          memory: orchestrationResult.memoryContext?.memories?.length > 0
        },
        
        // Original orchestration metadata
        ragResults: orchestrationResult.ragResults || [],
        memoryContext: orchestrationResult.memoryContext,
        
        // Performance metadata
        stats: {
          responseTime,
          cacheHit: orchestrationResult.cacheHit || false,
          analysisDetails: orchestrationResult.analysisResults || []
        }
      };

      console.log(`🔊 [TTSAgent] Voice response generated in ${responseTime}ms:`, {
        wordCount: ttsResponse.wordCount,
        estimatedDuration: ttsResponse.estimatedDuration,
        analysisType: ttsResponse.analysisType,
        contextUsed: ttsResponse.contextUsed
      });

      return ttsResponse;

    } catch (error) {
      console.error('[ERROR] [TTSAgent] Failed to generate voice response:', error);
      
      const responseTime = Date.now() - startTime;
      this.updateStats(responseTime);

      return {
        success: false,
        error: error.message,
        response: "I apologize, but I encountered an issue generating your voice response. Please try again.",
        responseTime,
        ttsOptimized: true,
        estimatedDuration: "5s",
        wordCount: 15
      };
    }
  }

  /**
   * Generate quick voice response without screenshot analysis (faster)
   * Useful for simple queries that don't need visual context
   * 
   * @param {string} query - User's query
   * @param {Object} context - Request context  
   * @returns {Object} Quick TTS response
   */
  async generateQuickVoiceResponse(query, context = {}) {
    return this.generateVoiceResponse(query, {
      ...context,
      includeScreenshot: false, // Skip screenshot for speed
      includeKnowledge: true    // Keep knowledge search for accuracy
    });
  }

  /**
   * Get TTS service statistics
   * @returns {Object} Service performance stats
   */
  getStats() {
    return {
      ...this.stats,
      initialized: this.initialized,
      uptime: this.initialized ? Date.now() - (this.stats.lastActivity || Date.now()) : 0
    };
  }

  /**
   * Update service statistics
   * @param {number} responseTime - Response time in milliseconds
   */
  updateStats(responseTime) {
    this.stats.ttsRequestsProcessed++;
    this.stats.totalResponseTime += responseTime;
    this.stats.averageResponseTime = Math.round(this.stats.totalResponseTime / this.stats.ttsRequestsProcessed);
    this.stats.lastActivity = Date.now();
  }

  /**
   * Estimate voice duration based on text length and speaking rate
   * @param {string} text - Response text
   * @returns {string} Estimated duration (e.g., "15s")
   */
  estimateVoiceDuration(text) {
    if (!text) return "0s";
    
    // Average speaking rate: ~150 words per minute (2.5 words per second)
    const wordCount = this.countWords(text);
    const estimatedSeconds = Math.round(wordCount / 2.5);
    
    return `${estimatedSeconds}s`;
  }

  /**
   * Count words in text
   * @param {string} text - Text to count
   * @returns {number} Word count
   */
  countWords(text) {
    if (!text) return 0;
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }

  /**
   * Test TTS agent service
   * @returns {boolean} True if service is working
   */
  async testService() {
    try {
      const testResult = await this.generateQuickVoiceResponse("Test TTS service", {
        agentId: 1,
        userId: 'test'
      });
      
      return testResult.success === true;
    } catch (error) {
      console.error('[ERROR] [TTSAgent] Service test failed:', error.message);
      return false;
    }
  }
}

module.exports = new TTSAgentService();