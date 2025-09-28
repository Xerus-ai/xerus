require('dotenv').config();

// Simple debug to test getAvailableModels logic without full Electron context
const { PROVIDERS } = require('./src/features/common/ai/factory');

console.log('=== Debug Available Models ===');

// Simulate the state from modelStateService
const mockState = {
    apiKeys: {
        'openai': process.env.OPENAI_API_KEY,
        'gemini': process.env.GEMINI_API_KEY,
        'anthropic': process.env.ANTHROPIC_API_KEY,
        'ollama': 'local',
        'whisper': 'local'
    }
};

console.log('Mock API Keys State:');
Object.entries(mockState.apiKeys).forEach(([provider, key]) => {
    if (provider === 'ollama' || provider === 'whisper') {
        console.log(`  ${provider}: ${key}`);
    } else {
        console.log(`  ${provider}: ${key ? 'Present (length: ' + key.length + ')' : 'Missing'}`);
    }
});

// Simulate getAvailableModels for STT
console.log('\n=== Simulating getAvailableModels(\'stt\') ===');
const available = [];
const modelList = 'sttModels';

for (const [providerId, key] of Object.entries(mockState.apiKeys)) {
    console.log(`\nChecking provider: ${providerId}`);
    console.log(`  API Key: ${key ? 'Present' : 'Missing'}`);
    
    if (!key) {
        console.log(`  ❌ Skipping ${providerId} - no API key`);
        continue;
    }
    
    // Check if provider has STT models
    if (PROVIDERS[providerId]?.[modelList]) {
        const models = PROVIDERS[providerId][modelList];
        console.log(`  ✅ ${providerId} has ${models.length} STT models:`, models.map(m => m.id));
        available.push(...models);
    } else {
        console.log(`  ❌ ${providerId} has no STT models`);
    }
}

console.log('\n=== Final Available STT Models ===');
available.forEach(model => {
    console.log(`  ${model.id} (${model.name})`);
});

// Test auto-selection logic
console.log('\n=== Testing Auto-Selection Logic ===');
const apiModel = available.find(model => {
    const provider = getProviderForModel('stt', model.id);
    const hasApiKey = mockState.apiKeys[provider];
    const isNotLocal = provider !== 'ollama' && provider !== 'whisper';
    console.log(`  Model ${model.id}: provider=${provider}, hasApiKey=${!!hasApiKey}, isNotLocal=${isNotLocal}`);
    return provider && isNotLocal && hasApiKey;
});

console.log(`\nPreferred API model: ${apiModel ? apiModel.id : 'none found'}`);
console.log(`Fallback model: ${available[0] ? available[0].id : 'none available'}`);
console.log(`Final selection: ${(apiModel || available[0])?.id || 'none'}`);

// Helper function to simulate getProviderForModel
function getProviderForModel(type, modelId) {
    if (!modelId) return null;
    for (const providerId in PROVIDERS) {
        const models = type === 'llm' ? PROVIDERS[providerId].llmModels : PROVIDERS[providerId].sttModels;
        if (models.some(m => m.id === modelId)) {
            return providerId;
        }
    }
    return null;
}