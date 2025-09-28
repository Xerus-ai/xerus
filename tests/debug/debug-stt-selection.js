const modelStateService = require('./src/features/common/services/modelStateService');
const { createLogger } = require('./src/common/services/logger.js');

const logger = createLogger('DebugSTTSelection');

async function debugSTTSelection() {
    logger.info('=== STT Selection Debug Start ===');
    
    try {
        // Initialize model state service
        await modelStateService.initialize();
        
        // Check current selection
        logger.info('1. Initial STT model selection:');
        const initialSttModel = modelStateService.getCurrentModelInfo('stt');
        logger.info('Initial:', {
            hasModelInfo: !!initialSttModel,
            provider: initialSttModel?.provider,
            model: initialSttModel?.model,
            hasApiKey: !!initialSttModel?.apiKey
        });
        
        // Check available models
        logger.info('2. Available STT models:');
        const availableModels = modelStateService.getAvailableModels('stt');
        logger.info('Available models:', availableModels);
        
        // Check API keys
        logger.info('3. API key status:');
        const apiKeys = modelStateService.getAllApiKeys();
        const apiKeyStatus = {};
        Object.keys(apiKeys).forEach(provider => {
            const key = apiKeys[provider];
            if (provider === 'ollama' || provider === 'whisper') {
                apiKeyStatus[provider] = key === 'local' ? 'local' : 'missing';
            } else {
                apiKeyStatus[provider] = key ? 'present' : 'missing';
            }
        });
        logger.info('API Key Status:', apiKeyStatus);
        
        // Force auto-selection and see what happens
        logger.info('4. Forcing auto-selection...');
        modelStateService._autoSelectAvailableModels(['stt']);
        
        const afterAutoSelection = modelStateService.getCurrentModelInfo('stt');
        logger.info('After auto-selection:', {
            hasModelInfo: !!afterAutoSelection,
            provider: afterAutoSelection?.provider,
            model: afterAutoSelection?.model,
            hasApiKey: !!afterAutoSelection?.apiKey
        });
        
        // Check provider preferences in auto-selection
        logger.info('5. Testing provider preference logic...');
        const availableSttModels = modelStateService.getAvailableModels('stt');
        logger.info('All available STT models:', availableSttModels);
        
        // Simulate the auto-selection logic
        const apiModel = availableSttModels.find(model => {
            const provider = modelStateService.getProviderForModel('stt', model.id);
            const hasApiKey = modelStateService.hasValidApiKey(provider);
            logger.info(`Checking model ${model.id} (provider: ${provider}): hasApiKey=${hasApiKey}, isNotLocalProvider=${provider !== 'ollama' && provider !== 'whisper'}`);
            return provider && provider !== 'ollama' && provider !== 'whisper' && hasApiKey;
        });
        
        logger.info('Preferred API model found:', apiModel);
        const fallbackModel = availableSttModels[0];
        logger.info('Fallback model:', fallbackModel);
        
        const selectedModel = apiModel || fallbackModel;
        logger.info('Final selected model should be:', selectedModel);
        
    } catch (error) {
        logger.error('Debug failed:', { error: error.message, stack: error.stack });
    }
    
    logger.info('=== STT Selection Debug End ===');
}

// Run the debug
debugSTTSelection().then(() => {
    process.exit(0);
}).catch(error => {
    console.error('Debug script failed:', error);
    process.exit(1);
});