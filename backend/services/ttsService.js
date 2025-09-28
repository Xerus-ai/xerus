/**
 * TTS Service - Text-to-Speech Integration with ElevenLabs
 * Supports WebSocket streaming for real-time agent voice responses
 */

const ElevenLabsTTSProvider = require('./tts/providers/ElevenLabsTTSProvider');
const WebSpeechTTSProvider = require('./tts/providers/WebSpeechTTSProvider');

class TTSService {
  constructor() {
    this.provider = new ElevenLabsTTSProvider(); // ElevenLabs as primary
    this.fallbackProvider = new WebSpeechTTSProvider(); // WebSpeech as fallback
    this.providerFailed = false; // Track if primary provider has failed
    this.cache = new Map();
    this.cacheExpiry = 30 * 60 * 1000; // 30 minutes
    this.maxCacheSize = 100;
    this.activeConnections = new Map(); // WebSocket connections per session
  }

  /**
   * Generate speech from text with WebSocket streaming
   * @param {string} text - Text to convert to speech
   * @param {Object} voiceConfig - Voice configuration
   * @param {string} sessionId - WebSocket session ID
   * @returns {Object} Audio result or streaming info
   */
  async generateSpeechStream(text, voiceConfig = {}, sessionId = null) {
    if (!text || typeof text !== 'string') {
      throw new Error('Text input is required');
    }

    const {
      voiceName = 'Female English Actor',
      provider = 'ELEVENLABS',
      speed = 1.0,
      format = 'wav',
      instantMode = true
    } = voiceConfig;

    // Check cache first
    const cacheKey = this.getCacheKey(text, voiceConfig);
    const cached = this.cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < this.cacheExpiry) {
      console.log('[STYLE] TTS cache hit for text:', text.substring(0, 50) + '...');
      return { audio: cached.audio, fromCache: true };
    }

    try {
      console.log('[STYLE] Generating TTS for text:', text.substring(0, 100) + '...');
      
      // For WebSocket streaming - using bulk mode for reliability
      if (sessionId && this.activeConnections.has(sessionId)) {
        console.log('[LOADING] Using bulk generation mode for WebSocket streaming');
        const bulkResult = await this.generateBulkAudio(text, voiceConfig);
        
        // Send as single chunk via WebSocket
        const connection = this.activeConnections.get(sessionId);
        if (connection) {
          connection.send(JSON.stringify({
            type: 'tts_audio_chunk',
            data: {
              audio: bulkResult.audio.toString('base64'),
              sessionId: sessionId,
              chunkNumber: 1,
              bulkMode: true,
              timestamp: Date.now()
            }
          }));
          
          connection.send(JSON.stringify({
            type: 'tts_streaming_complete',
            sessionId: sessionId,
            totalChunks: 1,
            bulkMode: true,
            timestamp: Date.now()
          }));
        }
        
        return { 
          streaming: true, 
          sessionId,
          chunks: 1,
          bulkMode: true,
          duration: bulkResult.duration
        };
      } 
      // For direct audio generation
      else {
        return await this.generateBulkAudio(text, voiceConfig);
      }

    } catch (error) {
      console.error(`[ERROR] TTS generation failed:`, {
        error: error.message,
        stack: error.stack,
        sessionId,
        textLength: text?.length,
        voiceConfig
      });
      throw error;
    }
  }

  /**
   * Generate streaming audio via WebSocket
   * @param {string} text - Text to synthesize
   * @param {Object} voiceConfig - Voice configuration
   * @param {string} sessionId - WebSocket session ID
   * @returns {Object} Streaming info
   */
  async generateStreamingAudio(text, voiceConfig, sessionId) {
    const connection = this.activeConnections.get(sessionId);
    if (!connection) {
      throw new Error('No active WebSocket connection for session');
    }

    try {
      console.log(`🔊 Starting streaming TTS for session ${sessionId}: "${text.substring(0, 50)}..."`);
      
      let chunkCount = 0;
      let startTime = Date.now();

      // Use ElevenLabs streaming synthesis
      const streamResult = await this.provider.synthesizeStream(text, voiceConfig, (audioChunk) => {
        chunkCount++;
        console.log(`[PACKAGE] Sending TTS chunk ${chunkCount} (${audioChunk.length} bytes) to session ${sessionId}`);
        
        // Send audio chunks via WebSocket
        try {
          connection.send(JSON.stringify({
            type: 'tts_audio_chunk',
            data: {
              audio: audioChunk.toString('base64'),
              sessionId: sessionId,
              chunkNumber: chunkCount,
              timestamp: Date.now()
            }
          }));
        } catch (wsError) {
          console.error(`[ERROR] WebSocket send error for session ${sessionId}:`, wsError);
          throw wsError;
        }
      });

      const totalTime = Date.now() - startTime;
      console.log(`[OK] TTS streaming completed for session ${sessionId}: ${chunkCount} chunks in ${totalTime}ms`);

      // Send completion signal
      connection.send(JSON.stringify({
        type: 'tts_streaming_complete',
        sessionId: sessionId,
        totalChunks: chunkCount,
        totalTime: totalTime,
        timestamp: Date.now()
      }));

      return { 
        streaming: true, 
        sessionId,
        chunks: chunkCount,
        duration: totalTime
      };

    } catch (error) {
      console.error(`[ERROR] Streaming TTS failed for session ${sessionId}:`, error);
      
      // Try fallback to bulk generation if streaming fails
      if (error.message.includes('connection reset') || 
          error.message.includes('ECONNRESET') || 
          error.message.includes('aborted') || 
          error.message.includes('stream error')) {
        console.log('[LOADING] Attempting fallback to bulk TTS generation...');
        
        try {
          const bulkResult = await this.generateBulkAudio(text, voiceConfig);
          
          // Send as single chunk
          connection.send(JSON.stringify({
            type: 'tts_audio_chunk',
            data: {
              audio: bulkResult.audio.toString('base64'),
              sessionId: sessionId,
              chunkNumber: 1,
              fallback: true,
              timestamp: Date.now()
            }
          }));
          
          // Send completion signal
          connection.send(JSON.stringify({
            type: 'tts_streaming_complete',
            sessionId: sessionId,
            totalChunks: 1,
            fallback: true,
            timestamp: Date.now()
          }));
          
          console.log('[OK] Fallback TTS generation successful');
          return { 
            streaming: true, 
            sessionId,
            fallback: true,
            chunks: 1,
            duration: bulkResult.duration
          };
          
        } catch (fallbackError) {
          console.error('[ERROR] Fallback TTS also failed:', fallbackError);
        }
      }
      
      // Send error via WebSocket
      connection.send(JSON.stringify({
        type: 'tts_error',
        error: error.message,
        sessionId: sessionId,
        timestamp: Date.now()
      }));
      
      throw error;
    }
  }

  /**
   * Generate bulk audio (non-streaming) with automatic fallback
   * @param {string} text - Text to synthesize
   * @param {Object} voiceConfig - Voice configuration
   * @returns {Object} Audio result
   */
  async generateBulkAudio(text, voiceConfig) {
    const startTime = Date.now();
    
    // Try primary provider (ElevenLabs) first, unless it's already known to be failing
    if (!this.providerFailed) {
      try {
        console.log('🔊 Attempting TTS with primary provider (ElevenLabs)...');
        const audioBuffer = await this.provider.synthesize(text, voiceConfig);
        const duration = Date.now() - startTime;
        
        console.log(`[OK] Primary TTS generated in ${duration}ms for ${text.length} characters`);

        // Cache result
        const cacheKey = this.getCacheKey(text, voiceConfig);
        this._addToCache(cacheKey, audioBuffer);

        return {
          audio: audioBuffer,
          duration: duration,
          characterCount: text.length,
          fromCache: false,
          provider: 'ElevenLabs'
        };
        
      } catch (elevenLabsError) {
        console.error('[ERROR] Primary TTS provider failed:', {
          error: elevenLabsError.message,
          stack: elevenLabsError.stack,
          textLength: text.length,
          voiceConfig,
          apiKeySet: !!process.env.ELEVENLABS_API_KEY
        });
        
        // Mark primary provider as failed for future requests
        if (elevenLabsError.message.includes('aborted') || elevenLabsError.message.includes('ECONNRESET')) {
          console.log('[LOADING] Marking primary provider as failed, switching to fallback for future requests');
          this.providerFailed = true;
        }
        
        // Continue to fallback provider
      }
    }
    
    // Try fallback provider (Web Speech API)
    try {
      console.log('[WEB] Using fallback TTS provider (Web Speech API)...');
      const audioBuffer = await this.fallbackProvider.synthesize(text, voiceConfig);
      const duration = Date.now() - startTime;
      
      console.log(`[OK] Fallback TTS generated in ${duration}ms for ${text.length} characters`);

      return {
        audio: audioBuffer,
        duration: duration,
        characterCount: text.length,
        fromCache: false,
        provider: 'WebSpeech',
        requiresFrontendHandling: true
      };
      
    } catch (finalError) {
      console.error('[ERROR] All TTS providers failed:', {
        error: finalError.message,
        stack: finalError.stack,
        textLength: text.length,
        voiceConfig,
        elevenLabsProviderFailed: this.providerFailed
      });
      throw new Error(`All TTS providers failed. ElevenLabs: ${this.providerFailed ? 'Connection issues' : 'Error'}. WebSpeech: ${finalError.message}`);
    }
  }

  /**
   * Register WebSocket connection for streaming
   * @param {string} sessionId - Unique session ID
   * @param {WebSocket} connection - WebSocket connection
   */
  registerConnection(sessionId, connection) {
    this.activeConnections.set(sessionId, connection);
    console.log(`[SYSTEM] TTS WebSocket registered: ${sessionId}`);

    connection.on('close', () => {
      this.activeConnections.delete(sessionId);
      console.log(`[SYSTEM] TTS WebSocket disconnected: ${sessionId}`);
    });

    connection.on('error', (error) => {
      console.error(`[SYSTEM] TTS WebSocket error for ${sessionId}:`, error);
      this.activeConnections.delete(sessionId);
    });
  }

  /**
   * Test TTS functionality
   * @param {string} text - Test text
   * @param {Object} voiceConfig - Voice config for testing
   * @returns {Object} Test result
   */
  async testTTS(text = 'Hello, this is a TTS test message.', voiceConfig = {}) {
    try {
      const startTime = Date.now();
      const result = await this.generateSpeechStream(text, voiceConfig);
      const duration = Date.now() - startTime;

      return {
        success: true,
        duration: duration,
        audioLength: result.audio ? result.audio.length : 0,
        cached: result.fromCache || false,
        message: 'TTS test completed successfully'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'TTS test failed'
      };
    }
  }

  /**
   * Get available voices
   * @returns {Array} Available voice options
   */
  async getAvailableVoices() {
    try {
      return await this.provider.getAvailableVoices();
    } catch (error) {
      console.error('Failed to get available voices:', error);
      return [];
    }
  }

  /**
   * Get optimal voice configuration for agent personality
   * @param {string} personalityType - Agent personality type
   * @returns {Object} Voice configuration
   */
  getOptimalVoiceForPersonality(personalityType) {
    return this.provider.getOptimalVoiceForPersonality(personalityType);
  }

  /**
   * Generate cache key for text and voice config
   * @param {string} text - Text to synthesize
   * @param {Object} config - Voice configuration
   * @returns {string} Cache key
   */
  getCacheKey(text, config) {
    const configString = JSON.stringify({
      voiceName: config.voiceName || 'Female English Actor',
      provider: config.provider || 'ELEVENLABS',
      speed: config.speed || 1.0
    });
    const textHash = Buffer.from(text).toString('base64').substring(0, 50);
    return `${configString}_${textHash}`;
  }

  /**
   * Add item to cache with LRU eviction
   * @param {string} key - Cache key
   * @param {Buffer} audioBuffer - Audio data
   */
  _addToCache(key, audioBuffer) {
    // LRU eviction if cache is full
    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      audio: audioBuffer,
      timestamp: Date.now()
    });
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    console.log('[CLEAN] TTS cache cleared');
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
      activeConnections: this.activeConnections.size,
      expiryMs: this.cacheExpiry
    };
  }
}

module.exports = new TTSService();