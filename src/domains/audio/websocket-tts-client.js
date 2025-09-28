/**
 * WebSocket TTS Client - Frontend real-time TTS communication
 * Handles agent TTS streaming and bidirectional communication
 */

// Simple EventEmitter implementation for browser compatibility
class EventEmitter {
  constructor() {
    this.events = {};
  }

  on(event, listener) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(listener);
    return this;
  }

  once(event, listener) {
    const onceWrapper = (...args) => {
      listener(...args);
      this.off(event, onceWrapper);
    };
    return this.on(event, onceWrapper);
  }

  off(event, listener) {
    if (!this.events[event]) return this;
    this.events[event] = this.events[event].filter(l => l !== listener);
    return this;
  }

  emit(event, ...args) {
    if (!this.events[event]) return false;
    this.events[event].forEach(listener => listener(...args));
    return true;
  }
}

class WebSocketTTSClient extends EventEmitter {
  constructor() {
    super();
    this.ws = null;
    this.sessionId = null;
    this.isConnected = false;
    this.isConnecting = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    this.audioQueue = [];
    this.currentAgent = null;
    
    // TTS Audio Context for playback
    this.audioContext = null;
    this.audioBuffer = null;
    this.audioSource = null;
  }

  /**
   * Connect to TTS WebSocket server
   * @param {string} serverUrl - WebSocket server URL
   * @returns {Promise<boolean>} Connection success
   */
  async connect(serverUrl = 'ws://localhost:5001/tts-stream') {
    if (this.isConnected || this.isConnecting) {
      console.log('[LINK] TTS WebSocket already connected/connecting');
      return true;
    }

    this.isConnecting = true;

    try {
      console.log(`[LINK] Connecting to TTS WebSocket: ${serverUrl}`);
      
      this.ws = new WebSocket(serverUrl);

      // Connection established
      this.ws.onopen = () => {
        console.log('[OK] TTS WebSocket connected');
        this.isConnected = true;
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.emit('connected');
      };

      // Message received
      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.error('[ERROR] Failed to parse TTS WebSocket message:', error);
        }
      };

      // Connection closed
      this.ws.onclose = (event) => {
        console.log(`[LINK] TTS WebSocket disconnected: ${event.code} - ${event.reason}`);
        this.isConnected = false;
        this.isConnecting = false;
        this.sessionId = null;
        this.emit('disconnected', event.code, event.reason);
        
        // Attempt reconnection for non-intentional disconnections
        if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.attemptReconnection();
        }
      };

      // Connection error
      this.ws.onerror = (error) => {
        console.error('[ERROR] TTS WebSocket error:', error);
        this.isConnecting = false;
        this.emit('error', error);
      };

      // Wait for connection confirmation
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          this.isConnecting = false;
          resolve(false);
        }, 5000);

        this.once('connected', () => {
          clearTimeout(timeout);
          resolve(true);
        });
      });

    } catch (error) {
      console.error('[ERROR] TTS WebSocket connection failed:', error);
      this.isConnecting = false;
      return false;
    }
  }

  /**
   * Handle incoming WebSocket messages
   * @param {Object} message - Parsed message object
   */
  handleMessage(message) {
    const { type, data, sessionId, timestamp } = message;

    switch (type) {
      case 'connection_established':
        this.sessionId = sessionId;
        console.log(`[LINK] TTS Session established: ${sessionId}`);
        break;

      case 'agent_analysis_result':
        console.log(`[AI] Agent analysis completed: ${data?.agentId || 'unknown'}`);
        this.emit('agentAnalysisResult', data || {});
        break;

      case 'tts_streaming_started':
        console.log(`[START] TTS streaming started for agent: ${data?.agentId || 'unknown'}`);
        this.emit('ttsStreamingStarted', data || {});
        this.audioQueue = []; // Clear previous audio chunks
        break;

      case 'tts_audio_chunk':
        console.log(`[START] TTS audio chunk received`);
        this.handleAudioChunk(data);
        break;

      case 'web_speech_instruction':
        console.log(`[WEB] Web Speech TTS instruction received`);
        this.handleWebSpeechInstruction(data);
        break;

      case 'tts_streaming_complete':
        console.log(`[OK] TTS streaming complete`);
        this.emit('ttsStreamingComplete', { sessionId });
        this.playQueuedAudio();
        break;

      case 'tts_audio_complete':
        console.log(`[START] TTS audio complete (bulk)`);
        this.handleBulkAudio(data);
        break;

      case 'agent_selected':
        console.log(`[AI] Agent selected: ${data?.agent?.name || 'unknown'}`);
        this.currentAgent = data?.agent || {};
        this.emit('agentSelected', data || {});
        break;

      case 'available_voices':
        console.log(`[START] Available voices received: ${data?.length || 0} voices`);
        this.emit('availableVoices', data || []);
        break;

      case 'test_connection_result':
        console.log(`[TEST] TTS test result:`, data);
        this.emit('testResult', data);
        break;

      case 'agent_analysis_error':
      case 'agent_selection_error':
      case 'tts_error':
      case 'test_connection_error':
      case 'available_voices_error':
      case 'error':
        console.error(`[ERROR] TTS WebSocket error (${type}):`, message.error);
        this.emit('error', message.error, type);
        break;

      default:
        // Unknown message type - ignore
    }
  }

  /**
   * Handle streaming audio chunks
   * @param {Object} data - Audio chunk data
   */
  async handleAudioChunk(data) {
    try {
      // Check if data and audio property exist
      if (!data || !data.audio) {
        console.warn('[WARNING] TTS audio chunk missing data or audio property');
        return;
      }
      
      // Decode base64 audio data
      const audioData = atob(data.audio);
      const audioBytes = new Uint8Array(audioData.length);
      for (let i = 0; i < audioData.length; i++) {
        audioBytes[i] = audioData.charCodeAt(i);
      }

      // Add to queue for sequential playback
      this.audioQueue.push(audioBytes.buffer);
      this.emit('audioChunk', audioBytes);

    } catch (error) {
      console.error('[ERROR] Failed to process TTS audio chunk:', error);
    }
  }

  /**
   * Handle Web Speech API TTS instruction
   * @param {Object} data - Web Speech instruction data
   */
  async handleWebSpeechInstruction(data) {
    try {
      const { text, voice } = data;
      
      if (!text) {
        console.warn('[WARNING] Web Speech instruction missing text');
        return;
      }

      console.log(`[WEB] [TTS Client] Using browser Web Speech API for: "${text.substring(0, 50)}..."`);

      // Check if Web Speech API is available
      if (!('speechSynthesis' in window)) {
        console.error('[ERROR] Web Speech API not supported in this browser');
        return;
      }

      // Create speech synthesis utterance
      const utterance = new SpeechSynthesisUtterance(text);
      
      // Configure voice if specified
      if (voice) {
        const voices = speechSynthesis.getVoices();
        const selectedVoice = voices.find(v => 
          v.name.toLowerCase().includes(voice.toLowerCase()) ||
          (voice.toLowerCase().includes('female') && v.name.toLowerCase().includes('female'))
        );
        if (selectedVoice) {
          utterance.voice = selectedVoice;
        }
      }

      // Configure speech parameters
      utterance.rate = 0.9;
      utterance.pitch = 1.0;
      utterance.volume = 0.8;

      // Set up event handlers
      utterance.onstart = () => {
        console.log('[START] [Web Speech] TTS playback started');
        this.emit('audioPlaying', { duration: text.length * 0.1 }); // Rough estimate
      };

      utterance.onend = () => {
        console.log('[START] [Web Speech] TTS playback ended, resuming microphone');
        
        // Resume microphone after Web Speech TTS
        if (window.api && window.api.invoke) {
          window.api.invoke('listen:resume-microphone');
        }
        
        this.emit('audioFinished');
      };

      utterance.onerror = (event) => {
        console.error('[ERROR] Web Speech TTS error:', event.error);
        
        // Resume microphone on error
        if (window.api && window.api.invoke) {
          window.api.invoke('listen:resume-microphone');
        }
        
        this.emit('error', event.error, 'web_speech_tts');
      };

      // Start TTS playback
      speechSynthesis.speak(utterance);

    } catch (error) {
      console.error('[ERROR] Failed to handle Web Speech instruction:', error);
    }
  }

  /**
   * Handle complete bulk audio
   * @param {Object} data - Complete audio data
   */
  async handleBulkAudio(data) {
    try {
      // Check if data and audio property exist
      if (!data || !data.audio) {
        console.warn('[WARNING] TTS bulk audio missing data or audio property');
        return;
      }
      
      // Decode base64 audio data
      const audioData = atob(data.audio);
      const audioBytes = new Uint8Array(audioData.length);
      for (let i = 0; i < audioData.length; i++) {
        audioBytes[i] = audioData.charCodeAt(i);
      }

      // Play immediately for bulk audio
      await this.playAudio(audioBytes.buffer);
      this.emit('audioComplete', data);

    } catch (error) {
      console.error('[ERROR] Failed to process bulk TTS audio:', error);
    }
  }

  /**
   * Play queued audio chunks sequentially
   */
  async playQueuedAudio() {
    if (this.audioQueue.length === 0) return;

    try {
      // Initialize Web Audio API context if needed
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }

      // Resume context if suspended (required for Chrome)
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      // Concatenate all audio chunks
      const totalLength = this.audioQueue.reduce((sum, chunk) => sum + chunk.byteLength, 0);
      const concatenated = new Uint8Array(totalLength);
      let offset = 0;

      for (const chunk of this.audioQueue) {
        concatenated.set(new Uint8Array(chunk), offset);
        offset += chunk.byteLength;
      }

      // Play the concatenated audio
      await this.playAudio(concatenated.buffer);
      this.audioQueue = []; // Clear queue

    } catch (error) {
      console.error('[ERROR] Failed to play queued TTS audio:', error);
    }
  }

  /**
   * Play audio buffer using Web Audio API
   * @param {ArrayBuffer} audioData - Audio data to play
   */
  async playAudio(audioData) {
    try {
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }

      // [OK] CRITICAL FIX: Pause microphone BEFORE TTS playback starts
      console.log('[START] [TTS Client] PAUSING MICROPHONE before TTS playback');
      if (window.api && window.api.invoke) {
        window.api.invoke('listen:pause-microphone');
      }

      // Stop any currently playing audio
      if (this.audioSource) {
        this.audioSource.stop();
        this.audioSource = null;
      }

      // Resume audio context if suspended
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      // Check if we have valid audio data
      if (!audioData || audioData.byteLength === 0) {
        throw new Error('No audio data provided or audio data is empty');
      }

      // Check for JSON data masquerading as audio (common error)
      const firstBytes = new Uint8Array(audioData.slice(0, 8));
      const firstBytesHex = Array.from(firstBytes).map(b => b.toString(16).padStart(2, '0')).join(' ');
      
      if (firstBytes[0] === 0x7b && firstBytes[1] === 0x22) { // Starts with {"
        const jsonString = new TextDecoder().decode(audioData);
        console.error('[ERROR] [TTS Client] Received JSON instead of audio data:', jsonString.substring(0, 200));
        throw new Error('Backend sent JSON error message instead of audio data');
      }

      console.log(`[START] [TTS Client] Decoding audio data (${audioData.byteLength} bytes)`);

      // Try standard decodeAudioData first
      let audioBuffer;
      try {
        audioBuffer = await this.audioContext.decodeAudioData(audioData.slice(0));
      } catch (decodeError) {
        console.error('[ERROR] Standard audio decode failed:', decodeError.message);
        
        // Single PCM fallback attempt (most TTS services use PCM)
        try {
          console.log('[LOADING] [TTS Client] Trying PCM 22050Hz mono fallback...');
          audioBuffer = await this.createAudioBufferFromPCM(audioData, 22050, 1);
          console.log('[OK] [TTS Client] PCM fallback successful');
        } catch (pcmError) {
          console.error('[ERROR] PCM fallback failed:', pcmError.message);
          throw new Error('Audio decode failed - neither standard format nor PCM worked');
        }
      }
      
      // Create source and connect to destination
      this.audioSource = this.audioContext.createBufferSource();
      this.audioSource.buffer = audioBuffer;
      this.audioSource.connect(this.audioContext.destination);

      // Play the audio
      this.audioSource.start();
      console.log(`[START] [TTS Client] Audio playback started (${audioBuffer.duration.toFixed(2)}s duration)`);
      this.emit('audioPlaying', { duration: audioBuffer.duration });

      // Clean up when finished
      this.audioSource.onended = () => {
        console.log('[START] [TTS Client] Audio playback ended, cleaning up and emitting audioFinished');
        this.audioSource = null;
        
        // [OK] CRITICAL FIX: Resume microphone AFTER TTS playback ends
        console.log('[START] [TTS Client] RESUMING MICROPHONE after TTS playback');
        if (window.api && window.api.invoke) {
          window.api.invoke('listen:resume-microphone');
        }
        
        this.emit('audioFinished');
      };

    } catch (error) {
      console.error('[ERROR] Failed to play TTS audio:', error);
      
      // [OK] CRITICAL FIX: Resume microphone even if TTS fails
      console.log('[START] [TTS Client] RESUMING MICROPHONE after TTS error');
      if (window.api && window.api.invoke) {
        window.api.invoke('listen:resume-microphone');
      }
      
      this.emit('audioError', error);
    }
  }

  /**
   * Create audio buffer from raw PCM data (fallback method)
   * @param {ArrayBuffer} pcmData - Raw PCM audio data
   * @returns {AudioBuffer} Created audio buffer
   */
  async createAudioBufferFromPCM(pcmData, sampleRate = 22050, channels = 1) {
    // 16-bit PCM format
    const bytesPerSample = 2;
    const bytesPerFrame = bytesPerSample * channels;
    const totalSamples = pcmData.byteLength / bytesPerSample;
    const framesCount = totalSamples / channels;
    
    // Validate input data
    if (pcmData.byteLength % bytesPerFrame !== 0) {
      throw new Error(`Invalid PCM data size: ${pcmData.byteLength} bytes doesn't match ${channels} channels * ${bytesPerSample} bytes per sample`);
    }
    
    const audioBuffer = this.audioContext.createBuffer(channels, framesCount, sampleRate);
    const int16Data = new Int16Array(pcmData);
    
    // Convert PCM data to Float32Array for each channel
    for (let channel = 0; channel < channels; channel++) {
      const channelData = audioBuffer.getChannelData(channel);
      
      // Interleaved data: extract samples for this channel
      for (let frame = 0; frame < framesCount; frame++) {
        const sampleIndex = frame * channels + channel;
        if (sampleIndex < int16Data.length) {
          channelData[frame] = int16Data[sampleIndex] / 32768.0; // Convert to float (-1.0 to 1.0)
        }
      }
    }
    
    return audioBuffer;
  }

  /**
   * Request agent analysis with TTS response
   * @param {string} agentId - Agent ID to analyze
   * @param {string} transcript - Audio transcript
   * @param {Object} context - Additional context (screenshots, etc.)
   */
  requestAgentAnalysis(agentId, transcript, context = {}) {
    console.log('[TOOL] [DEBUG] requestAgentAnalysis called:', {
      isConnected: this.isConnected,
      hasWebSocket: !!this.ws,
      webSocketState: this.ws?.readyState,
      agentId,
      transcriptLength: transcript?.length
    });

    if (!this.isConnected) {
      console.error('[ERROR] [DEBUG] Cannot send - TTS WebSocket not connected!');
      throw new Error('TTS WebSocket not connected');
    }

    const message = {
      type: 'agent_analysis_request',
      data: {
        agentId: agentId,
        transcript: transcript,
        context: context
      },
      timestamp: Date.now()
    };

    console.log('[TOOL] [DEBUG] Sending WebSocket message:', JSON.stringify(message, null, 2));
    
    try {
      this.ws.send(JSON.stringify(message));
      console.log(`[OK] [DEBUG] Agent analysis request sent successfully to WebSocket for agent ${agentId}`);
      console.log(`[TOOL] [DEBUG] WebSocket readyState after send: ${this.ws.readyState} (1=OPEN, 0=CONNECTING, 2=CLOSING, 3=CLOSED)`);
    } catch (error) {
      console.error('[ERROR] [DEBUG] Failed to send WebSocket message:', error);
      throw error;
    }
  }

  /**
   * Generate direct TTS from text
   * @param {string} text - Text to synthesize
   * @param {Object} voiceConfig - Voice configuration
   */
  generateTTS(text, voiceConfig = {}) {
    if (!this.isConnected) {
      throw new Error('TTS WebSocket not connected');
    }

    const message = {
      type: 'tts_generate',
      data: {
        text: text,
        voiceConfig: voiceConfig
      },
      timestamp: Date.now()
    };

    this.ws.send(JSON.stringify(message));
    console.log(`[START] Sent TTS generation request: "${text.substring(0, 50)}..."`);
  }

  /**
   * Select agent for TTS session
   * @param {string} agentId - Agent ID to select
   */
  selectAgent(agentId) {
    if (!this.isConnected) {
      throw new Error('TTS WebSocket not connected');
    }

    const message = {
      type: 'agent_selection',
      data: { agentId: agentId },
      timestamp: Date.now()
    };

    this.ws.send(JSON.stringify(message));
    console.log(`[AI] Sent agent selection: ${agentId}`);
  }

  /**
   * Test TTS connection
   * @param {string} testText - Optional test text
   * @param {Object} voiceConfig - Optional voice config
   */
  testConnection(testText = 'TTS test message', voiceConfig = {}) {
    if (!this.isConnected) {
      throw new Error('TTS WebSocket not connected');
    }

    const message = {
      type: 'test_connection',
      data: {
        text: testText,
        voiceConfig: voiceConfig
      },
      timestamp: Date.now()
    };

    this.ws.send(JSON.stringify(message));
    console.log(`[TEST] Sent TTS test request`);
  }

  /**
   * Get available voices
   */
  getAvailableVoices() {
    if (!this.isConnected) {
      throw new Error('TTS WebSocket not connected');
    }

    const message = {
      type: 'get_available_voices',
      data: {},
      timestamp: Date.now()
    };

    this.ws.send(JSON.stringify(message));
    console.log(`[START] Requested available voices`);
  }

  /**
   * Attempt to reconnect to the WebSocket server
   */
  attemptReconnection() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[ERROR] Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * this.reconnectAttempts;
    
    console.log(`[LOADING] TTS WebSocket reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Stop any currently playing TTS audio
   */
  stopAudio() {
    if (this.audioSource) {
      console.log('[START] [TTS Client] Stopping TTS audio playback');
      this.audioSource.stop();
      this.audioSource = null;
      this.ttsPlaying = false;
      this.emit('audioFinished');
    }
    
    // [OK] CRITICAL FIX: Resume microphone when TTS is stopped manually
    console.log('[START] [TTS Client] RESUMING MICROPHONE after TTS manual stop');
    if (window.api && window.api.invoke) {
      window.api.invoke('listen:resume-microphone');
    }
    
    // Clear any queued audio chunks
    this.audioQueue = [];
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect() {
    if (this.ws) {
      console.log('[LINK] Disconnecting TTS WebSocket');
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    
    // Stop any playing audio
    this.stopAudio();
    
    // Reset state
    this.isConnected = false;
    this.isConnecting = false;
    this.sessionId = null;
    this.audioQueue = [];
    this.currentAgent = null;
  }

  /**
   * Get connection status
   * @returns {Object} Connection status
   */
  getStatus() {
    return {
      connected: this.isConnected,
      connecting: this.isConnecting,
      sessionId: this.sessionId,
      currentAgent: this.currentAgent,
      reconnectAttempts: this.reconnectAttempts,
      audioQueueLength: this.audioQueue.length,
      hasAudioContext: !!this.audioContext
    };
  }
}

export { WebSocketTTSClient };