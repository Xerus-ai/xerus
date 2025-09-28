#!/usr/bin/env node

// test_glass_deepgram_integration.js - Test the exact same Deepgram integration used by Glass
require('dotenv').config();
const { createSTT } = require('./src/features/common/ai/factory');
const modelStateService = require('./src/features/common/services/modelStateService');

async function testGlassDeepgramIntegration() {
    console.log('🔧 Testing Glass Deepgram Integration...\n');
    
    try {
        // Simulate the exact same call that Glass makes
        console.log('📋 Step 1: Get model info from modelStateService...');
        const modelInfo = modelStateService.getCurrentModelInfo('stt');
        console.log('Model info:', {
            hasModelInfo: !!modelInfo,
            provider: modelInfo?.provider,
            model: modelInfo?.model,
            hasApiKey: !!modelInfo?.apiKey,
            apiKeyPreview: modelInfo?.apiKey ? modelInfo.apiKey.substring(0, 8) + '...' : 'none'
        });
        
        if (!modelInfo || !modelInfo.apiKey) {
            console.log('❌ No model info or API key - forcing model selection...');
            
            // Force Deepgram selection like in listenService.js
            const deepgramKey = modelStateService.getApiKey('deepgram');
            if (deepgramKey) {
                console.log('✅ Found Deepgram key, forcing selection...');
                if (modelStateService.state?.selectedModels) {
                    modelStateService.state.selectedModels.stt = null;
                }
                modelStateService._autoSelectAvailableModels(['stt']);
                
                // Get updated model info
                const updatedModelInfo = modelStateService.getCurrentModelInfo('stt');
                console.log('Updated model info:', {
                    provider: updatedModelInfo?.provider,
                    model: updatedModelInfo?.model,
                    hasApiKey: !!updatedModelInfo?.apiKey
                });
            }
        }
        
        // Get final model info
        const finalModelInfo = modelStateService.getCurrentModelInfo('stt');
        if (!finalModelInfo || !finalModelInfo.apiKey) {
            console.log('❌ Still no valid model info after forced selection');
            return;
        }
        
        console.log('\n📋 Step 2: Create STT with exact Glass parameters...');
        
        // Use the exact same parameters as sttService.js
        const language = process.env.OPENAI_TRANSCRIBE_LANG || 'en';
        
        // Provider-specific options (exact copy from sttService.js)
        let sttOptions = {
            apiKey: finalModelInfo.apiKey,
            language: language,
        };
        
        // Add provider-specific parameters
        if (finalModelInfo.provider === 'deepgram') {
            // Deepgram-specific options
            sttOptions.sampleRate = 24000;
        }
        
        const callbacks = {
            onmessage: (message) => {
                console.log('📥 Received message:', JSON.stringify(message, null, 2));
            },
            onerror: (error) => {
                console.log('❌ STT error:', error.message);
            },
            onclose: (event) => {
                console.log('🔒 STT closed:', event.reason);
            }
        };
        
        const finalOptions = { 
            ...sttOptions, 
            callbacks: callbacks
        };
        
        console.log('📋 Creating STT with options:', {
            provider: finalModelInfo.provider,
            hasApiKey: !!finalOptions.apiKey,
            language: finalOptions.language,
            sampleRate: finalOptions.sampleRate,
            hasCallbacks: !!finalOptions.callbacks
        });
        
        // Create STT session exactly like Glass does
        const sttSession = await createSTT(finalModelInfo.provider, finalOptions);
        
        console.log('✅ STT session created successfully!');
        console.log('Session methods:', Object.keys(sttSession));
        
        // Test sending some data
        console.log('\n📋 Step 3: Test sending audio data...');
        
        // Create dummy audio data (like what Glass would send)
        const dummyAudioData = Buffer.alloc(1600, 0); // 1600 bytes of silence
        const base64Data = dummyAudioData.toString('base64');
        
        try {
            await sttSession.sendRealtimeInput(Buffer.from(base64Data, 'base64'));
            console.log('✅ Successfully sent audio data to STT session');
        } catch (error) {
            console.log('❌ Error sending audio data:', error.message);
        }
        
        // Close session
        setTimeout(() => {
            console.log('\n📋 Step 4: Closing session...');
            sttSession.close();
            console.log('✅ Test completed successfully!');
        }, 2000);
        
    } catch (error) {
        console.log('❌ Integration test failed:', {
            error: error.message,
            stack: error.stack
        });
    }
}

testGlassDeepgramIntegration().catch(console.error);