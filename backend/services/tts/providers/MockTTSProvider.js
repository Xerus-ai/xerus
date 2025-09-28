/**
 * Mock TTS Provider - For testing TTS system without external dependencies
 * Generates silent audio or text-to-audio conversion for development/testing
 */

class MockTTSProvider {
  constructor() {
    this.supportsStreaming = true;
    console.log('🎭 Mock TTS Provider initialized - will generate mock audio for testing');
  }

  /**
   * Generate mock audio buffer
   * @param {string} text - Text to convert
   * @returns {Buffer} - Mock audio buffer
   */
  generateMockAudio(text) {
    // Create a simple WAV header for a short silent audio file
    const sampleRate = 44100;
    const duration = Math.max(1, Math.min(10, text.length / 15)); // 1-10 seconds based on text length
    const samples = Math.floor(sampleRate * duration);
    
    // WAV header (44 bytes) + audio data
    const buffer = Buffer.alloc(44 + samples * 2);
    
    // WAV header
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + samples * 2, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20); // PCM
    buffer.writeUInt16LE(1, 22); // Mono
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * 2, 28);
    buffer.writeUInt16LE(2, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(samples * 2, 40);
    
    // Silent audio data (all zeros)
    buffer.fill(0, 44);
    
    return buffer;
  }

  /**
   * Mock synthesis (non-streaming)
   * @param {string} text - Text to convert
   * @param {Object} options - Voice options
   * @returns {Buffer} - Mock audio buffer
   */
  async synthesize(text, options = {}) {
    const { voiceName = 'Mock Voice' } = options;
    
    console.log('🎭 Mock TTS synthesis:', {
      text: text.substring(0, 50) + (text.length > 50 ? '...' : ''),
      textLength: text.length,
      voiceName,
      estimatedDuration: `${Math.ceil(text.length / 15)}s`
    });
    
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
    
    const mockAudio = this.generateMockAudio(text);
    
    console.log('[OK] Mock TTS completed:', {
      audioSize: mockAudio.length,
      audioSizeKB: Math.round(mockAudio.length / 1024)
    });
    
    return mockAudio;
  }

  /**
   * Mock streaming synthesis
   * @param {string} text - Text to synthesize
   * @param {Object} options - Voice options
   * @param {Function} onChunk - Chunk callback
   */
  async synthesizeStream(text, options = {}, onChunk) {
    const { voiceName = 'Mock Voice' } = options;
    
    console.log('🎭 Mock TTS streaming synthesis:', {
      text: text.substring(0, 50) + (text.length > 50 ? '...' : ''),
      textLength: text.length,
      voiceName
    });
    
    return new Promise(async (resolve, reject) => {
      try {
        const mockAudio = this.generateMockAudio(text);
        const chunkSize = 4096; // 4KB chunks
        const totalChunks = Math.ceil(mockAudio.length / chunkSize);
        
        console.log(`🎭 Simulating ${totalChunks} audio chunks...`);
        
        for (let i = 0; i < totalChunks; i++) {
          const start = i * chunkSize;
          const end = Math.min(start + chunkSize, mockAudio.length);
          const chunk = mockAudio.slice(start, end);
          
          // Simulate streaming delay
          await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));
          
          console.log(`[PACKAGE] Mock chunk ${i + 1}/${totalChunks}: ${chunk.length} bytes`);
          
          if (onChunk) {
            try {
              onChunk(chunk);
            } catch (chunkError) {
              console.error('[ERROR] Error in chunk callback:', chunkError);
            }
          }
        }
        
        console.log('[OK] Mock TTS streaming completed');
        resolve({ chunks: totalChunks, bytes: mockAudio.length });
        
      } catch (error) {
        console.error('[ERROR] Mock TTS streaming failed:', error);
        reject(error);
      }
    });
  }

  /**
   * Get mock available voices
   * @returns {Array} Mock voice list
   */
  async getAvailableVoices() {
    return [
      {
        id: 'mock-female',
        name: 'Mock Female Voice',
        provider: 'MOCK',
        language: 'en',
        description: 'Mock female voice for testing'
      },
      {
        id: 'mock-male',
        name: 'Mock Male Voice',
        provider: 'MOCK',
        language: 'en',
        description: 'Mock male voice for testing'
      }
    ];
  }

  /**
   * Test connection (always succeeds for mock)
   * @returns {boolean} Always true
   */
  async testConnection() {
    console.log('🎭 Mock TTS connection test - always successful');
    return true;
  }

  /**
   * Get optimal mock voice for personality
   * @param {string} personalityType - Agent personality
   * @returns {Object} Mock voice config
   */
  getOptimalVoiceForPersonality(personalityType) {
    const voiceMap = {
      'assistant': { voiceName: 'Mock Female Voice', provider: 'MOCK' },
      'technical': { voiceName: 'Mock Male Voice', provider: 'MOCK' },
      'creative': { voiceName: 'Mock Female Voice', provider: 'MOCK' },
      'tutor': { voiceName: 'Mock Male Voice', provider: 'MOCK' },
      'executive': { voiceName: 'Mock Male Voice', provider: 'MOCK' },
      'research': { voiceName: 'Mock Female Voice', provider: 'MOCK' }
    };

    return voiceMap[personalityType] || voiceMap['assistant'];
  }
}

module.exports = MockTTSProvider;