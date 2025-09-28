#!/usr/bin/env node

// test_deepgram_setup.js - Test Deepgram API key and configuration
require('dotenv').config();
const { DeepgramProvider } = require('./src/features/common/ai/providers/deepgram');

async function testDeepgramSetup() {
    console.log('🔧 Testing Deepgram Setup...\n');
    
    // 1. Check environment variable
    console.log('1. Environment Variable Check:');
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (apiKey) {
        console.log(`   ✅ DEEPGRAM_API_KEY found (${apiKey.substring(0, 8)}...)`);
    } else {
        console.log('   ❌ DEEPGRAM_API_KEY not found in environment variables');
        return;
    }
    
    // 2. Test API key validation
    console.log('\n2. API Key Validation:');
    try {
        const validation = await DeepgramProvider.validateApiKey(apiKey);
        if (validation.success) {
            console.log('   ✅ Deepgram API key is valid and working');
        } else {
            console.log(`   ❌ Deepgram API key validation failed: ${validation.error}`);
            return;
        }
    } catch (error) {
        console.log(`   ❌ Error testing API key: ${error.message}`);
        return;
    }
    
    // 3. Test model state service integration
    console.log('\n3. Model State Service Integration:');
    try {
        const modelStateService = require('./src/features/common/services/modelStateService');
        
        // Force environment loading
        await modelStateService.loadState();
        
        const deepgramKey = modelStateService.getApiKey('deepgram');
        if (deepgramKey) {
            console.log('   ✅ Deepgram API key loaded by ModelStateService');
        } else {
            console.log('   ❌ Deepgram API key not loaded by ModelStateService');
        }
        
        const availableSTTModels = modelStateService.getAvailableModels('stt');
        const deepgramModels = availableSTTModels.filter(model => 
            modelStateService.getProviderForModel('stt', model.id) === 'deepgram'
        );
        
        if (deepgramModels.length > 0) {
            console.log(`   ✅ Found ${deepgramModels.length} Deepgram STT models:`);
            deepgramModels.forEach(model => {
                console.log(`      - ${model.id}: ${model.name}`);
            });
        } else {
            console.log('   ❌ No Deepgram STT models found');
        }
        
        // Check if Deepgram would be auto-selected
        const selectedSTTModel = modelStateService.getCurrentModelInfo('stt');
        if (selectedSTTModel && selectedSTTModel.provider === 'deepgram') {
            console.log(`   ✅ Deepgram auto-selected: ${selectedSTTModel.model}`);
        } else {
            console.log(`   ⚠️  Deepgram not auto-selected. Current: ${selectedSTTModel?.provider || 'none'}`);
        }
        
    } catch (error) {
        console.log(`   ❌ Error testing ModelStateService: ${error.message}`);
    }
    
    // 4. Test factory registration
    console.log('\n4. Factory Registration:');
    try {
        const { PROVIDERS } = require('./src/features/common/ai/factory');
        if (PROVIDERS.deepgram) {
            console.log('   ✅ Deepgram provider registered in factory');
            console.log(`   ✅ STT Models: ${PROVIDERS.deepgram.sttModels.length} available`);
            PROVIDERS.deepgram.sttModels.forEach(model => {
                console.log(`      - ${model.id}: ${model.name}`);
            });
        } else {
            console.log('   ❌ Deepgram provider not found in factory');
        }
    } catch (error) {
        console.log(`   ❌ Error checking factory: ${error.message}`);
    }
    
    console.log('\n🎯 Summary:');
    console.log('If all checks passed, Deepgram should now be:');
    console.log('- Auto-selected as the preferred STT provider');
    console.log('- Available in the Listen mode settings');
    console.log('- Providing ultra-low latency (150-250ms) transcription');
    console.log('\n🚀 Try the Listen mode now for dramatically improved performance!');
}

testDeepgramSetup().catch(console.error);