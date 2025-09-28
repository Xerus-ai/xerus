/**
 * ElevenLabs TTS Provider - Alternative TTS provider
 * https://elevenlabs.io/docs/api-reference/text-to-speech
 */

const axios = require('axios');

class ElevenLabsTTSProvider {
  constructor() {
    this.apiKey = process.env.ELEVENLABS_API_KEY;
    this.baseURL = 'https://api.elevenlabs.io/v1';
    this.supportsStreaming = true;
    
    // Default voice ID for Rachel (high quality female voice)
    this.defaultVoiceId = '21m00Tcm4TlvDq8ikWAM';
  }

  /**
   * Synthesize speech using ElevenLabs API
   * @param {string} text - Text to convert to speech
   * @param {Object} options - Voice configuration options
   * @returns {Buffer} - Audio data buffer
   */
  async synthesize(text, options = {}) {
    const {
      voiceId = this.defaultVoiceId,
      stability = 0.5,
      similarity_boost = 0.5,
      style = 0.0,
      use_speaker_boost = true
    } = options;

    if (!this.apiKey) {
      throw new Error('ELEVENLABS_API_KEY environment variable is required');
    }

    try {
      console.log('🎤 ElevenLabs TTS synthesis:', {
        text: text.substring(0, 50) + (text.length > 50 ? '...' : ''),
        textLength: text.length,
        voiceId
      });

      const response = await axios.post(
        `${this.baseURL}/text-to-speech/${voiceId}`,
        {
          text: text,
          model_id: "eleven_monolingual_v1",
          voice_settings: {
            stability: stability,
            similarity_boost: similarity_boost,
            style: style,
            use_speaker_boost: use_speaker_boost
          }
        },
        {
          headers: {
            'xi-api-key': this.apiKey,
            'Content-Type': 'application/json'
          },
          responseType: 'arraybuffer',
          timeout: 30000
        }
      );

      const audioBuffer = Buffer.from(response.data);
      console.log(`[OK] ElevenLabs TTS complete: ${audioBuffer.length} bytes`);
      return audioBuffer;

    } catch (error) {
      console.error('ElevenLabs TTS synthesis failed:', error.response?.data || error.message);
      throw new Error(`ElevenLabs TTS failed: ${error.response?.data?.detail || error.message}`);
    }
  }

  /**
   * Stream synthesis with real-time audio chunks
   * @param {string} text - Text to synthesize
   * @param {Object} options - Voice options
   * @param {Function} onChunk - Callback for audio chunks
   */
  async synthesizeStream(text, options = {}, onChunk) {
    // ElevenLabs doesn't have true streaming, so we'll do bulk then simulate chunks
    try {
      const audioBuffer = await this.synthesize(text, options);
      
      // Simulate streaming by chunking the result
      const chunkSize = 4096;
      const totalChunks = Math.ceil(audioBuffer.length / chunkSize);
      
      console.log(`🎤 Simulating ElevenLabs streaming with ${totalChunks} chunks`);
      
      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, audioBuffer.length);
        const chunk = audioBuffer.slice(start, end);
        
        // Small delay to simulate streaming
        await new Promise(resolve => setTimeout(resolve, 50));
        
        if (onChunk) {
          onChunk(chunk);
        }
      }
      
      return { chunks: totalChunks, bytes: audioBuffer.length };
      
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get available voices from ElevenLabs
   * @returns {Array} Available voices
   */
  async getAvailableVoices() {
    return [
      {
        id: '21m00Tcm4TlvDq8ikWAM',
        name: 'Rachel',
        provider: 'ELEVENLABS',
        language: 'en',
        description: 'Natural female voice'
      },
      {
        id: 'ErXwobaYiN019PkySvjV',
        name: 'Antoni',
        provider: 'ELEVENLABS',
        language: 'en',
        description: 'Natural male voice'
      }
    ];
  }

  /**
   * Test ElevenLabs connection
   * @returns {boolean} True if connection successful
   */
  async testConnection() {
    try {
      await this.synthesize('Connection test', { 
        voiceId: this.defaultVoiceId
      });
      return true;
    } catch (error) {
      console.error('ElevenLabs connection test failed:', error.message);
      return false;
    }
  }

  /**
   * Get optimal voice for personality
   * @param {string} personalityType - Agent personality type
   * @returns {Object} Voice configuration
   */
  getOptimalVoiceForPersonality(personalityType) {
    const voiceMap = {
      'assistant': { voiceId: '21m00Tcm4TlvDq8ikWAM', stability: 0.6 },
      'technical': { voiceId: 'ErXwobaYiN019PkySvjV', stability: 0.7 },
      'creative': { voiceId: '21m00Tcm4TlvDq8ikWAM', stability: 0.5 }
    };

    return voiceMap[personalityType] || voiceMap['assistant'];
  }
}

module.exports = ElevenLabsTTSProvider;