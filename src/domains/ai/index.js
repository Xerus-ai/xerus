/**
 * XERUS AI DOMAIN
 * AI provider management and context optimization services
 * 
 * This domain handles:
 * - AI provider selection and management
 * - Context optimization and management
 * - AI request execution and monitoring
 * - Performance optimization and cost tracking
 */

const { aiProviderManager, AIProviderManager } = require('./ai-provider-manager');
const { fastContextManager, FastContextManager } = require('./fast-context-manager');

module.exports = {
    // AI Provider Management
    aiProviderManager,
    AIProviderManager,
    
    // Context Management
    fastContextManager,
    FastContextManager,
    
    // Domain utilities
    getDomainStatus() {
        return {
            domain: 'ai',
            services: [
                {
                    name: 'AI Provider Manager',
                    status: aiProviderManager ? 'available' : 'unavailable',
                    description: 'Intelligent AI provider selection and monitoring'
                },
                {
                    name: 'Fast Context Manager',
                    status: fastContextManager ? 'available' : 'unavailable',
                    description: 'High-performance context management'
                }
            ],
            initialized: Date.now()
        };
    },
    
    // Initialize all AI domain services
    async initializeAIDomain() {
        try {
            if (!aiProviderManager.initialized) {
                await aiProviderManager.initialize();
            }
            
            if (!fastContextManager.initialized) {
                await fastContextManager.initialize();
            }
            
            return {
                success: true,
                message: 'AI domain services initialized successfully'
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                message: 'Failed to initialize AI domain services'
            };
        }
    }
};