require('dotenv').config();

const modelStateService = require('./src/features/common/services/modelStateService');
const authService = require('./src/features/common/services/authService');
const databaseInitializer = require('./src/features/common/services/databaseInitializer');
const { createLogger } = require('./src/common/services/logger.js');

const logger = createLogger('DebugListenFlow');

async function debugListenFlow() {
    logger.info('=== Debug Listen Flow Start ===');
    
    try {
        // First verify environment variables are loaded
        logger.info('Environment check:');
        logger.info('OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? 'Present (length: ' + process.env.OPENAI_API_KEY.length + ')' : 'Missing');
        logger.info('GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? 'Present (length: ' + process.env.GEMINI_API_KEY.length + ')' : 'Missing');
        
        // Initialize the database (this might be the missing step)
        logger.info('Initializing database...');
        await databaseInitializer.initializeDatabase();
        
        // Initialize auth service
        logger.info('Initializing auth service...');
        await authService.initialize();
        
        // Set a mock user ID if needed
        if (!authService.getCurrentUserId()) {
            await authService.setCurrentUserId('debug-user-123');
        }
        
        // Initialize model state service
        logger.info('Initializing model state service...');
        await modelStateService.initialize();
        
        // Check STT model selection
        logger.info('Current STT selection after full initialization:');
        const sttModel = modelStateService.getCurrentModelInfo('stt');
        logger.info('STT Model:', {
            hasModelInfo: !!sttModel,
            provider: sttModel?.provider,
            model: sttModel?.model,
            hasApiKey: !!sttModel?.apiKey,
            apiKeyPreview: sttModel?.apiKey ? sttModel.apiKey.substring(0, 8) + '...' : 'none'
        });
        
        // Check available models
        const availableModels = modelStateService.getAvailableModels('stt');
        logger.info('Available STT models:', availableModels.map(m => `${m.id} (${modelStateService.getProviderForModel('stt', m.id)})`));
        
        // Check API key status
        const apiKeys = modelStateService.getAllApiKeys();
        logger.info('API Keys loaded:', {
            openai: apiKeys.openai ? 'Present' : 'Missing',
            gemini: apiKeys.gemini ? 'Present' : 'Missing',
            anthropic: apiKeys.anthropic ? 'Present' : 'Missing',
            whisper: apiKeys.whisper,
            ollama: apiKeys.ollama
        });
        
    } catch (error) {
        logger.error('Debug failed:', { error: error.message, stack: error.stack });
    }
    
    logger.info('=== Debug Listen Flow End ===');
}

// Run the debug with proper cleanup
debugListenFlow().then(() => {
    process.exit(0);
}).catch(error => {
    console.error('Debug script failed:', error);
    process.exit(1);
});