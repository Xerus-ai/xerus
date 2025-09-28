/**
 * Domains - Main Export
 * Central orchestration of all business domains
 * 
 * This module provides unified access to all domain services:
 * - Agents: AI agent management and personality system
 * - Conversation: Ask/Listen services and conversation management
 * - System: Memory management, performance monitoring, and infrastructure
 * - Settings: Configuration and preferences management
 * - Audio: Audio processing and voice interaction
 */

// Import all domain modules
const { agentsDomain } = require('./agents/index.js');
const { conversationDomain } = require('./conversation/index.js');
const { systemDomain } = require('./system/index.js');
const { infrastructureDomain } = require('./infrastructure/index.js');
const { uiDomain } = require('./ui/index.js');

// Create unified domains interface
class DomainsManager {
  constructor() {
    this.agents = agentsDomain;
    this.conversation = conversationDomain;
    this.system = systemDomain;
    this.infrastructure = infrastructureDomain;
    this.ui = uiDomain;
    this.initialized = false;
  }

  /**
   * Initialize all domains
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      // Initialize domains in dependency order
      await this.system.initialize(); // Initialize system first (foundation services)
      await this.infrastructure.initialize();
      await this.ui.initialize();
      await this.agents.initialize();
      await this.conversation.initialize();

      this.initialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize domains: ${error.message}`);
    }
  }

  /**
   * Get status of all domains
   */
  getStatus() {
    return {
      initialized: this.initialized,
      system: this.system.getStatus(),
      infrastructure: this.infrastructure.getStatus(),
      ui: this.ui.getStatus(),
      agents: this.agents.getStatus(),
      conversation: this.conversation.getStatus()
    };
  }

  /**
   * Shutdown all domains
   */
  async shutdown() {
    try {
      // Shutdown in reverse order
      await this.conversation.shutdown();
      await this.agents.shutdown();
      await this.ui.shutdown();
      await this.infrastructure.shutdown();
      await this.system.shutdown(); // Shutdown system last (foundation services)

      this.initialized = false;
    } catch (error) {
      throw new Error(`Failed to shutdown domains: ${error.message}`);
    }
  }
}

// Create singleton instance
const domainsManager = new DomainsManager();

// Export unified interface and individual domains
module.exports = {
  domainsManager,
  DomainsManager,
  
  // Individual domains
  agentsDomain,
  conversationDomain,
  systemDomain,
  infrastructureDomain,
  uiDomain,
  
  // Convenience access
  agents: agentsDomain,
  conversation: conversationDomain,
  system: systemDomain,
  infrastructure: infrastructureDomain,
  ui: uiDomain,
  
  // Initialization helper
  async initializeAllDomains() {
    return await domainsManager.initialize();
  },
  
  // Status helper
  getAllDomainsStatus() {
    return domainsManager.getStatus();
  }
};