/**
 * Conversation Domain - Main Export
 * Ask/Listen Services & Conversation Management Domain
 * 
 * This domain handles:
 * - Ask service (text-based AI interactions)
 * - Listen service (voice-based AI interactions)  
 * - Conversation history and context management
 * - Integration with agents and knowledge domains
 */

// Import domain services
const { memoryManager } = require('./memory-manager.js');
// Lazy import askService to avoid circular dependency

// Create domain interface
class ConversationDomain {
  constructor() {
    this.memoryManager = memoryManager;
    this.askService = null; // Lazy loaded
    this.initialized = false;
  }

  /**
   * Initialize the conversation domain
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      // Initialize conversation services
      if (this.memoryManager && typeof this.memoryManager.initialize === 'function') {
        await this.memoryManager.initialize();
      }

      // Lazy load askService to avoid circular dependency
      if (!this.askService) {
        this.askService = require('../../features/ask/askService.js');
      }
      if (this.askService && typeof this.askService.initialize === 'function') {
        await this.askService.initialize();
      }

      this.initialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize conversation domain: ${error.message}`);
    }
  }

  /**
   * Process a user query (unified ask with enhanced features)
   */
  async ask(query, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    // Lazy load askService to avoid circular dependency
    if (!this.askService) {
      this.askService = require('../../features/ask/askService.js');
    }
    
    if (this.askService && typeof this.askService.sendMessage === 'function') {
      return await this.askService.sendMessage(query, options.conversationHistory || []);
    }

    throw new Error('Ask service not available');
  }

  /**
   * Process a basic user query (same as ask - unified implementation)
   */
  async basicAsk(query, options = {}) {
    return await this.ask(query, options);
  }

  /**
   * Start voice interaction session
   */
  async startListening(options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    throw new Error('Listen service integration not implemented');
  }

  /**
   * Stop voice interaction session
   */
  async stopListening() {
    if (!this.initialized) {
      await this.initialize();
    }

    throw new Error('Listen service integration not implemented');
  }

  /**
   * Get conversation history
   */
  async getConversationHistory(limit = 50) {
    if (!this.initialized) {
      await this.initialize();
    }

    return [];
  }

  /**
   * Clear conversation history
   */
  async clearConversationHistory() {
    if (!this.initialized) {
      await this.initialize();
    }

    return true;
  }

  /**
   * Get domain status
   */
  getStatus() {
    return {
      initialized: this.initialized,
      askService: {
        available: !!this.askService,
        initialized: this.askService?.initialized || false,
        providerStats: this.askService?.getProviderStatistics ? this.askService.getProviderStatistics() : {}
      },
      listen: {
        available: false, // TODO: Implement listen service integration
        initialized: false
      }
    };
  }

  /**
   * Shutdown the conversation domain
   */
  async shutdown() {
    try {
      // Lazy load askService to avoid circular dependency
      if (!this.askService) {
        this.askService = require('../../features/ask/askService.js');
      }
      if (this.askService && typeof this.askService.shutdown === 'function') {
        await this.askService.shutdown();
      }

      this.initialized = false;
    } catch (error) {
      throw new Error(`Failed to shutdown conversation domain: ${error.message}`);
    }
  }
}

// Create singleton instance
const conversationDomain = new ConversationDomain();

// Export domain interface and services
module.exports = {
  conversationDomain,
  ConversationDomain,
  
  // Re-export individual services for backward compatibility
  memoryManager,
  // askService is lazy-loaded and accessed via conversationDomain.askService
  
  // Convenience functions
  async ask(query, options) {
    return await conversationDomain.ask(query, options);
  },
  
  async basicAsk(query, options) {
    return await conversationDomain.basicAsk(query, options);
  },
  
  async startListening(options) {
    return await conversationDomain.startListening(options);
  },
  
  async stopListening() {
    return await conversationDomain.stopListening();
  }
};