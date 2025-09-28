/**
 * TTS API Routes - Simplified TTS endpoints
 * 
 * SIMPLIFIED ARCHITECTURE:
 * 1. One endpoint for AI response generation with TTS optimization
 * 2. WebSocket for audio streaming (existing)
 * 3. Basic agent TTS config management
 * 
 * Removed over-engineered endpoints (cache, stats, test, multiple configs)
 */

const express = require('express');
const router = express.Router();
const ttsAgentService = require('../../services/tts/ttsAgentService');
const AgentService = require('../../services/agentService');

// Initialize AgentService instance
const agentService = new AgentService();

/**
 * POST /api/tts/agent/:agentId/respond
 * 
 * SINGLE UNIFIED ENDPOINT for TTS Agent responses
 * - Generate TTS-optimized AI response using agentOrchestrator
 * - Supports both quick and full analysis modes via query parameters
 * - Uses same parallel analysis (screenshot + RAG) as regular mode
 * - Returns concise voice-optimized response ready for TTS streaming
 */
router.post('/agent/:agentId/respond', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { 
      query, 
      userId = 'guest',
      screenshot = null,        // Frontend should send screenshot data
      imageContext = null,      // Frontend should send image context  
      context = {}
    } = req.body;

    // Query parameters for modes
    const includeScreenshot = req.query.screenshot !== 'false'; // Default true
    const includeKnowledge = req.query.knowledge !== 'false';   // Default true
    const quickMode = req.query.quick === 'true';              // Default false

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query is required',
        code: 'MISSING_QUERY'
      });
    }

    const maxLength = quickMode ? 500 : 1000;
    if (query.length > maxLength) {
      return res.status(400).json({
        success: false,
        error: `Query too long (max ${maxLength} characters for ${quickMode ? 'quick' : 'full'} mode)`,
        code: 'QUERY_TOO_LONG'
      });
    }

    console.log(`🔊 [TTS API] ${quickMode ? 'Quick' : 'Full'} response for agent ${agentId}: "${query.substring(0, 50)}..."`);

    // Prepare unified context
    const ttsContext = {
      agentId: parseInt(agentId, 10),
      userId,
      includeScreenshot: quickMode ? false : includeScreenshot, // Quick mode skips screenshot
      includeKnowledge,
      screenshot,           // Use screenshot data from frontend
      imageContext,         // Use image context from frontend
      ...context
    };

    const startTime = Date.now();
    const result = quickMode 
      ? await ttsAgentService.generateQuickVoiceResponse(query, ttsContext)
      : await ttsAgentService.generateVoiceResponse(query, ttsContext);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error,
        code: 'TTS_AGENT_FAILED'
      });
    }

    console.log(`🔊 [TTS API] Response generated in ${result.responseTime}ms (${quickMode ? 'quick' : 'full'} mode)`);

    // Simplified response format
    res.json({
      success: true,
      response: result.response,
      agentId: result.agentId,
      agentName: result.agentName,
      responseTime: result.responseTime,
      
      // TTS metadata
      estimatedDuration: result.estimatedDuration,
      wordCount: result.wordCount,
      
      // Mode indicators
      quickMode,
      contextUsed: result.contextUsed
    });

  } catch (error) {
    console.error('🔊 [TTS API] Response generation error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'TTS_RESPONSE_FAILED'
    });
  }
});

/**
 * GET/PUT /api/tts/agent/:agentId/config
 * 
 * BASIC AGENT TTS CONFIG MANAGEMENT
 * - Get or update agent's TTS configuration (voice, enabled status)
 * - Simplified from multiple config endpoints
 */
router.route('/agent/:agentId/config')
  .get(async (req, res) => {
    try {
      const { agentId } = req.params;
      
      const config = await agentService.getAgentTTSConfig(agentId);
      
      if (!config) {
        return res.status(404).json({
          success: false,
          error: 'Agent not found',
          code: 'AGENT_NOT_FOUND'
        });
      }

      res.json({
        success: true,
        agentId: parseInt(agentId, 10),
        tts_enabled: config.tts_enabled,
        voice_config: config.voice_config
      });

    } catch (error) {
      console.error('Get agent TTS config error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        code: 'GET_AGENT_TTS_CONFIG_FAILED'
      });
    }
  })
  .put(async (req, res) => {
    try {
      const { agentId } = req.params;
      const { tts_enabled, voice_config } = req.body;

      const updatedAgent = await agentService.updateAgentTTS(agentId, {
        tts_enabled,
        voice_config
      });

      if (!updatedAgent) {
        return res.status(404).json({
          success: false,
          error: 'Agent not found',
          code: 'AGENT_NOT_FOUND'
        });
      }

      res.json({
        success: true,
        agentId: updatedAgent.id,
        tts_enabled: updatedAgent.tts_enabled,
        voice_config: updatedAgent.voice_config
      });

    } catch (error) {
      console.error('Update agent TTS config error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        code: 'UPDATE_AGENT_TTS_CONFIG_FAILED'
      });
    }
  });

module.exports = router;