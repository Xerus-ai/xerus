// Simulate the exact flow that happens in the Electron app
require('dotenv').config();

const modelStateService = require('./src/features/common/services/modelStateService');
const { createLogger } = require('./src/common/services/logger.js');

const logger = createLogger('DebugElectronFlow');

async function debugElectronFlow() {
    logger.info('=== Debug Electron Flow ===');
    
    try {
        // First, check environment variables are loaded
        logger.info('Environment check:', {
            OPENAI_API_KEY: process.env.OPENAI_API_KEY ? 'Present' : 'Missing',
            GEMINI_API_KEY: process.env.GEMINI_API_KEY ? 'Present' : 'Missing',
            ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? 'Present' : 'Missing'
        });
        
        // Simulate the exact same initialization as Electron app
        logger.info('Initializing modelStateService...');
        await modelStateService.initialize();
        
        // Get current state
        logger.info('Getting current STT model info...');
        const sttModel = modelStateService.getCurrentModelInfo('stt');
        logger.info('Current STT selection:', {
            provider: sttModel?.provider,
            model: sttModel?.model,
            hasApiKey: !!sttModel?.apiKey
        });
        
        // Debug available models
        logger.info('Checking available STT models...');
        const availableModels = modelStateService.getAvailableModels('stt');
        logger.info('Available STT models:', availableModels.map(m => ({
            id: m.id,
            provider: modelStateService.getProviderForModel('stt', m.id)
        })));
        
        // Check API keys state
        const apiKeys = modelStateService.getAllApiKeys();
        logger.info('API Keys state:', {
            openai: apiKeys.openai ? 'Present' : 'Missing',
            gemini: apiKeys.gemini ? 'Present' : 'Missing',
            anthropic: apiKeys.anthropic ? 'Present' : 'Missing',
            whisper: apiKeys.whisper,
            ollama: apiKeys.ollama
        });
        
        // Manually test auto-selection
        logger.info('Testing manual auto-selection...');
        modelStateService._autoSelectAvailableModels(['stt']);
        
        const afterAutoSelection = modelStateService.getCurrentModelInfo('stt');
        logger.info('After manual auto-selection:', {
            provider: afterAutoSelection?.provider,
            model: afterAutoSelection?.model,
            hasApiKey: !!afterAutoSelection?.apiKey
        });
        
    } catch (error) {
        logger.error('Debug failed:', { error: error.message, stack: error.stack });
    }
}

debugElectronFlow().then(() => {
    logger.info('=== Debug Complete ===');
    process.exit(0);
}).catch(error => {
    console.error('Debug failed:', error);
    process.exit(1);
});