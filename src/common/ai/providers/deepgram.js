// providers/deepgram.js

const { createClient, LiveTranscriptionEvents } = require('@deepgram/sdk');
const WebSocket = require('ws');
const { createLogger } = require('../../services/logger.js');

const logger = createLogger('Deepgram');

/**
 * Deepgram Provider [KR]. API Key [KR] [KR] [Korean text].
 */
class DeepgramProvider {
    /**
     * Deepgram API Key[KR] [Korean text] [Korean text].
     * @param {string} key - [KR] Deepgram API Key
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    static async validateApiKey(key) {
        if (!key || typeof key !== 'string') {
            return { success: false, error: 'Invalid Deepgram API key format.' };
        }
        try {
            // ✨ [Korean comment translated]: SDK [Korean comment translated] [Korean comment translated] fetch[Korean comment translated] API[Korean comment translated] [Korean comment translated] [Korean comment translated] [Korean comment translated] (openai.js [Korean comment translated])
            const response = await fetch('https://api.deepgram.com/v1/projects', {
                headers: { 'Authorization': `Token ${key}` }
            });

            if (response.ok) {
                return { success: true };
            } else {
                const errorData = await response.json().catch(() => ({}));
                const message = errorData.err_msg || `Validation failed with status: ${response.status}`;
                return { success: false, error: message };
            }
        } catch (error) {
            logger.error('Network error during key validation:', { error });
            return { success: false, error: error.message || 'A network error occurred during validation.' };
        }
    }
}

function createSTT({
    apiKey,
    language = 'en-US',
    sampleRate = 24000,
    callbacks = {},
  }) {
    // [SEARCH] DEBUG: Log API key details at createSTT call
    logger.info('[SEARCH] DEBUG: createSTT called with:', {
        hasApiKey: !!apiKey,
        apiKeyType: typeof apiKey,
        apiKeyLength: apiKey?.length,
        apiKeyPreview: apiKey ? apiKey.substring(0, 8) + '...' : 'none',
        language,
        sampleRate
    });
    
    // Validated Deepgram parameters for real-time streaming
    const qs = new URLSearchParams({
      model: 'nova-2',
      encoding: 'linear16',
      sample_rate: sampleRate.toString(),
      language,
      smart_format: 'true',
      interim_results: 'true',
      channels: '1',
      // Core real-time parameters (validated with Deepgram API)
      endpointing: '100',
      vad_events: 'true',
      punctuate: 'false'
    });
  
    const url = `wss://api.deepgram.com/v1/listen?${qs}`;
  
    const ws = new WebSocket(url, {
      headers: { Authorization: `Token ${apiKey}` },
      // Optimize WebSocket for low latency
      perMessageDeflate: false, // Disable compression for speed
    });
    ws.binaryType = 'arraybuffer';
  
    return new Promise((resolve, reject) => {
      const to = setTimeout(() => {
        ws.terminate();
        reject(new Error('DG open timeout (10 s)'));
      }, 5_000); // Reduced timeout for faster failure detection
  
      ws.on('open', () => {
        clearTimeout(to);
        logger.info('Deepgram WebSocket connected for ultra-low latency STT');
        resolve({
          sendRealtimeInput: (buf) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(buf);
            }
          },
          close: () => {
            if (ws.readyState === WebSocket.OPEN) {
              // Send FinishRequest for clean shutdown
              ws.send(JSON.stringify({ type: 'FinishRequest' }));
              ws.close(1000, 'client');
            }
          },
        });
      });
  
      ws.on('message', raw => {
        let msg;
        try { 
          msg = JSON.parse(raw.toString()); 
        } catch (error) { 
          logger.warn('Failed to parse Deepgram message:', error);
          return; 
        }
        
        // Debug logging removed to prevent log flooding
        
        // Handle different message types for optimal performance
        if (msg.type === 'Results' && msg.channel?.alternatives?.[0]) {
          const transcript = msg.channel.alternatives[0].transcript;
          const isFinal = msg.is_final;
          const confidence = msg.channel.alternatives[0].confidence;
          
          // Transcript logging removed to prevent flooding
          
          // Only process meaningful transcripts
          if (transcript && transcript.trim().length > 0) {
            // Final transcript logging removed to prevent flooding
            callbacks.onmessage?.({ 
              provider: 'deepgram', 
              transcript,
              is_final: isFinal,
              confidence,
              ...msg 
            });
          }
          // Empty transcript debug logging removed
        } else if (msg.type === 'SpeechStarted') {
          // Voice activity detection event (logging removed)
          callbacks.onmessage?.({ 
            provider: 'deepgram', 
            type: 'speech_started',
            ...msg 
          });
        } else if (msg.type === 'UtteranceEnd') {
          // Utterance completion event (logging removed)
          callbacks.onmessage?.({ 
            provider: 'deepgram', 
            type: 'utterance_end',
            ...msg 
          });
        }
        // Other message type logging removed to prevent flooding
      });
  
      ws.on('close', (code, reason) => {
        logger.info('Deepgram WebSocket closed:', { code, reason: reason.toString() });
        callbacks.onclose?.({ code, reason: reason.toString() });
      });
  
      ws.on('error', err => {
        clearTimeout(to);
        logger.error('Deepgram WebSocket error:', {
          error: err.message,
          url,
          apiKeyPreview: apiKey ? apiKey.substring(0, 8) + '...' : 'missing',
          readyState: ws.readyState
        });
        callbacks.onerror?.(err);
        reject(err);
      });
    });
  }

// ... (LLM [Korean comment translated] Placeholder [Korean comment translated] [Korean comment translated] [Korean comment translated]) ...
function createLLM(opts) {
  logger.warn('LLM not supported.');
  return { generateContent: async () => { throw new Error("Deepgram does not support LLM functionality."); } };
}
function createStreamingLLM(opts) {
  logger.warn('Streaming LLM not supported.');
  return { streamChat: async () => { throw new Error("Deepgram does not support Streaming LLM functionality."); } };
}

module.exports = {
    DeepgramProvider,
    createSTT,
    createLLM,
    createStreamingLLM
};