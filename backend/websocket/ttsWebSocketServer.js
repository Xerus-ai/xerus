/**
 * TTS WebSocket Server - Real-time agent communication
 * Handles bidirectional TTS streaming and agent analysis
 */

const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const ttsService = require('../services/ttsService');
const AgentService = require('../services/agentService');
const ttsAgentService = require('../services/tts/ttsAgentService');

// Initialize AgentService instance
const agentService = new AgentService();

class TTSWebSocketServer {
  constructor(server) {
    this.wss = new WebSocket.Server({
      server,
      path: '/tts-stream'
    });

    this.clients = new Map(); // sessionId -> WebSocket connection
    this.agentConnections = new Map(); // sessionId -> selected agent info

    this.wss.on('connection', (ws, request) => {
      this.handleConnection(ws, request);
    });

    console.log('[SYSTEM] TTS WebSocket server initialized on /tts-stream');
  }

  handleConnection(ws, request) {
    const sessionId = uuidv4();
    const clientIP = request.socket.remoteAddress;

    console.log(`[SYSTEM] TTS WebSocket connected: ${sessionId} from ${clientIP}`);

    // Store connection
    this.clients.set(sessionId, ws);

    // Register with TTS service for streaming
    ttsService.registerConnection(sessionId, ws);

    // Send connection confirmation
    ws.send(JSON.stringify({
      type: 'connection_established',
      sessionId: sessionId,
      timestamp: Date.now()
    }));

    // Handle messages
    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data);
        await this.handleMessage(ws, sessionId, message);
      } catch (error) {
        console.error('WebSocket message parsing error:', error);
        ws.send(JSON.stringify({
          type: 'error',
          error: 'Invalid message format',
          timestamp: Date.now()
        }));
      }
    });

    // Handle disconnection
    ws.on('close', (code, reason) => {
      console.log(`[SYSTEM] TTS WebSocket disconnected: ${sessionId}, code: ${code}`);
      this.cleanup(sessionId);
    });

    // Handle errors
    ws.on('error', (error) => {
      console.error(`[SYSTEM] TTS WebSocket error for ${sessionId}:`, error);
      this.cleanup(sessionId);
    });
  }

  async handleMessage(ws, sessionId, message) {
    const { type, data } = message;

    try {
      switch (type) {
        case 'agent_analysis_request':
          await this.handleAgentAnalysisRequest(ws, sessionId, data);
          break;

        case 'tts_generate':
          await this.handleTTSGenerate(ws, sessionId, data);
          break;

        case 'agent_selection':
          await this.handleAgentSelection(ws, sessionId, data);
          break;

        case 'test_connection':
          await this.handleTestConnection(ws, sessionId, data);
          break;

        case 'get_available_voices':
          await this.handleGetAvailableVoices(ws, sessionId);
          break;

        default:
          console.warn(`Unknown TTS WebSocket message type: ${type}`);
          ws.send(JSON.stringify({
            type: 'error',
            error: `Unknown message type: ${type}`,
            timestamp: Date.now()
          }));
      }
    } catch (error) {
      console.error(`Error handling message type ${type}:`, error);
      ws.send(JSON.stringify({
        type: 'error',
        error: error.message,
        messageType: type,
        timestamp: Date.now()
      }));
    }
  }

  async handleAgentAnalysisRequest(ws, sessionId, data) {
    const { agentId, transcript, context } = data;

    console.log('[TOOL] [DEBUG] [OK] RECEIVED agent analysis request in TTS WebSocket!', {
      sessionId,
      agentId,
      transcriptLength: transcript?.length,
      transcriptPreview: transcript?.substring(0, 100),
      hasContext: !!context,
      contextKeys: context ? Object.keys(context) : []
    });

    if (!agentId || !transcript) {
      console.error('[ERROR] [DEBUG] Missing required fields:', { hasAgentId: !!agentId, hasTranscript: !!transcript });
      throw new Error('agentId and transcript are required');
    }

    console.log(`[AI] [DEBUG] Processing TTS-optimized agent analysis request for agent ${agentId}`);

    try {
      // Check if agent has TTS enabled first
      const agent = await agentService.getAgentById(agentId);
      if (!agent || !agent.tts_enabled) {
        console.log(`[WARNING] Agent ${agentId} does not have TTS enabled, using regular analysis`);
        
        // Fallback to regular agent analysis if TTS not enabled
        const analysis = await agentService.executeAgent(agentId, transcript, context);
        
        ws.send(JSON.stringify({
          type: 'agent_analysis_result',
          data: {
            agentId: agentId,
            analysis: analysis.response,
            execution_time: analysis.execution_time,
            model_used: analysis.model_used,
            ttsEnabled: false,
            timestamp: Date.now()
          }
        }));
        return;
      }

      console.log(`[SYSTEM] Using TTS Agent service for ${agent.name} - will generate concise voice response`);

      // Use TTS Agent service for TTS-optimized response generation
      const ttsContext = {
        agentId: parseInt(agentId, 10),
        userId: context?.userId || 'guest',
        includeScreenshot: context?.includeScreenshot !== false,
        includeKnowledge: context?.includeKnowledge !== false,
        screenshot: context?.screenshot || null,
        imageContext: context?.imageContext || null,
        ...context
      };

      const ttsResult = await ttsAgentService.generateVoiceResponse(transcript, ttsContext);

      if (!ttsResult.success) {
        throw new Error(`TTS Agent generation failed: ${ttsResult.error}`);
      }

      // Send TTS-optimized analysis result
      ws.send(JSON.stringify({
        type: 'agent_analysis_result',
        data: {
          agentId: agentId,
          analysis: ttsResult.response,
          execution_time: ttsResult.responseTime,
          model_used: 'TTS-optimized',
          ttsEnabled: true,
          ttsOptimized: true,
          wordCount: ttsResult.wordCount,
          estimatedDuration: ttsResult.estimatedDuration,
          contextUsed: ttsResult.contextUsed,
          timestamp: Date.now()
        }
      }));

      console.log(`[SYSTEM] Generating TTS audio for concise response (${ttsResult.wordCount} words)`);
      
      // Generate TTS from the concise response
      console.log(`[SYSTEM] [TTS WebSocket] About to generate TTS for concise response: "${ttsResult.response?.substring(0, 100)}..."`);
      console.log(`[SYSTEM] [TTS WebSocket] Response details:`, {
        wordCount: ttsResult.wordCount,
        estimatedDuration: ttsResult.estimatedDuration,
        responseLength: ttsResult.response?.length
      });
      
      await this.generateTTSForAnalysis(ws, sessionId, {
        analysis: ttsResult.response, // This is now the concise TTS-optimized response!
        voiceConfig: agent.voice_config,
        agentId: agentId
      });

    } catch (error) {
      console.error('TTS Agent analysis failed:', error);
      ws.send(JSON.stringify({
        type: 'agent_analysis_error',
        error: error.message,
        agentId: agentId,
        timestamp: Date.now()
      }));
    }
  }

  async generateTTSForAnalysis(ws, sessionId, analysisData) {
    const { analysis, voiceConfig, agentId } = analysisData;

    console.log('[TOOL] [DEBUG] generateTTSForAnalysis called:', {
      sessionId,
      agentId,
      analysisLength: analysis?.length,
      analysisPreview: analysis?.substring(0, 100),
      hasVoiceConfig: !!voiceConfig,
      voiceConfig
    });

    try {
      // Generate TTS using streaming
      console.log('[TOOL] [DEBUG] Calling ttsService.generateSpeechStream...');
      const result = await ttsService.generateSpeechStream(
        analysis,
        voiceConfig,
        sessionId
      );
      
      console.log('[TOOL] [DEBUG] TTS service result:', {
        hasResult: !!result,
        streaming: result?.streaming,
        sessionId: result?.sessionId,
        chunks: result?.chunks,
        resultKeys: result ? Object.keys(result) : []
      });

      if (result.streaming) {
        // Streaming audio chunks will be sent automatically via WebSocket
        ws.send(JSON.stringify({
          type: 'tts_streaming_started',
          sessionId: result.sessionId,
          agentId: agentId,
          timestamp: Date.now()
        }));
      } else if (result.requiresFrontendHandling) {
        // Send Web Speech instruction for browser-based TTS
        ws.send(JSON.stringify({
          type: 'web_speech_instruction',
          text: analysis, // The text to be spoken
          voice: voiceConfig?.voiceName || 'Female English Actor',
          agentId: agentId,
          duration: result.duration,
          characterCount: result.characterCount,
          timestamp: Date.now()
        }));
      } else {
        // Send complete audio
        ws.send(JSON.stringify({
          type: 'tts_audio_complete',
          data: {
            audio: result.audio.toString('base64'),
            voiceConfig: voiceConfig,
            agentId: agentId,
            duration: result.duration,
            characterCount: result.characterCount,
            fromCache: result.fromCache
          },
          timestamp: Date.now()
        }));
      }

    } catch (error) {
      console.error('TTS generation failed:', error);
      ws.send(JSON.stringify({
        type: 'tts_error',
        error: error.message,
        agentId: agentId,
        timestamp: Date.now()
      }));
    }
  }

  async handleTTSGenerate(ws, sessionId, data) {
    const { text, voiceConfig } = data;

    if (!text) {
      throw new Error('Text is required for TTS generation');
    }

    console.log(`[SYSTEM] Direct TTS generation request: "${text.substring(0, 50)}..."`);

    await this.generateTTSForAnalysis(ws, sessionId, {
      analysis: text,
      voiceConfig: voiceConfig || {}
    });
  }

  async handleAgentSelection(ws, sessionId, data) {
    const { agentId } = data;

    try {
      const agent = await agentService.getAgentById(agentId);
      if (!agent) {
        throw new Error('Agent not found');
      }

      // Store agent selection for this session
      this.agentConnections.set(sessionId, {
        agentId: agentId,
        agent: agent,
        ttsEnabled: agent.tts_enabled,
        voiceConfig: agent.voice_config
      });

      ws.send(JSON.stringify({
        type: 'agent_selected',
        data: {
          agentId: agentId,
          agent: {
            id: agent.id,
            name: agent.name,
            personality_type: agent.personality_type,
            tts_enabled: agent.tts_enabled
          },
          ttsConfig: agent.tts_enabled ? {
            enabled: true,
            voiceConfig: agent.voice_config
          } : null
        },
        timestamp: Date.now()
      }));

    } catch (error) {
      ws.send(JSON.stringify({
        type: 'agent_selection_error',
        error: error.message,
        timestamp: Date.now()
      }));
    }
  }

  async handleTestConnection(ws, sessionId, data) {
    const { text, voiceConfig } = data;

    try {
      const testResult = await ttsService.testTTS(
        text || 'WebSocket TTS connection test successful.',
        voiceConfig || {}
      );

      ws.send(JSON.stringify({
        type: 'test_connection_result',
        data: testResult,
        timestamp: Date.now()
      }));

    } catch (error) {
      ws.send(JSON.stringify({
        type: 'test_connection_error',
        error: error.message,
        timestamp: Date.now()
      }));
    }
  }

  async handleGetAvailableVoices(ws, sessionId) {
    try {
      const voices = await ttsService.getAvailableVoices();

      ws.send(JSON.stringify({
        type: 'available_voices',
        data: voices,
        timestamp: Date.now()
      }));

    } catch (error) {
      ws.send(JSON.stringify({
        type: 'available_voices_error',
        error: error.message,
        timestamp: Date.now()
      }));
    }
  }

  cleanup(sessionId) {
    this.clients.delete(sessionId);
    this.agentConnections.delete(sessionId);
  }

  /**
   * Broadcast message to all connected clients
   * @param {Object} message - Message to broadcast
   */
  broadcast(message) {
    const messageString = JSON.stringify(message);
    this.clients.forEach((ws, sessionId) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(messageString);
      }
    });
  }

  /**
   * Get server statistics
   * @returns {Object} Server stats
   */
  getStats() {
    return {
      totalConnections: this.clients.size,
      activeAgentSessions: this.agentConnections.size,
      ttsCache: ttsService.getCacheStats()
    };
  }
}

module.exports = TTSWebSocketServer;