/**
 * Web Speech API TTS Provider - Browser-based fallback TTS
 * Uses browser's built-in speech synthesis as final fallback
 */

class WebSpeechTTSProvider {
  constructor() {
    this.supportsStreaming = false;
    console.log('[WEB] Web Speech TTS Provider initialized - browser-based fallback');
  }

  /**
   * Generate audio using Web Speech API (requires browser context)
   * This is a fallback that instructs the frontend to use browser TTS
   */
  async synthesize(text, options = {}) {
    const { 
      voiceName = 'Default',
      rate = 1.0,
      pitch = 1.0 
    } = options;

    console.log('[WEB] Web Speech TTS synthesis (frontend instruction):', {
      text: text.substring(0, 50) + (text.length > 50 ? '...' : ''),
      textLength: text.length,
      voiceName
    });

    // Instead of actual audio, return instructions for frontend
    const instructionData = {
      type: 'web_speech_instruction',
      text: text,
      voice: voiceName,
      rate: rate,
      pitch: pitch,
      timestamp: Date.now()
    };

    // Convert instruction to a JSON buffer (frontend will handle this)
    const instructionBuffer = Buffer.from(JSON.stringify(instructionData));
    
    console.log('[OK] Web Speech instruction created:', {
      instructionSize: instructionBuffer.length,
      willUseWebSpeechAPI: true
    });

    return instructionBuffer;
  }

  /**
   * Simulate streaming by chunking the instruction
   */
  async synthesizeStream(text, options = {}, onChunk) {
    try {
      const instructionBuffer = await this.synthesize(text, options);
      
      // Send as single chunk
      if (onChunk) {
        onChunk(instructionBuffer);
      }
      
      return { chunks: 1, bytes: instructionBuffer.length };
      
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get available voices (browser-dependent)
   */
  async getAvailableVoices() {
    return [
      {
        id: 'default',
        name: 'Browser Default',
        provider: 'WEB_SPEECH',
        language: 'en',
        description: 'Browser built-in speech synthesis'
      }
    ];
  }

  /**
   * Test connection (always succeeds)
   */
  async testConnection() {
    console.log('[WEB] Web Speech connection test - always available in browser');
    return true;
  }

  /**
   * Get optimal voice for personality
   */
  getOptimalVoiceForPersonality(personalityType) {
    return {
      voiceName: 'Browser Default',
      rate: personalityType === 'executive' ? 0.9 : 1.0,
      pitch: personalityType === 'creative' ? 1.1 : 1.0
    };
  }
}

module.exports = WebSpeechTTSProvider;