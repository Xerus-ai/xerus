#!/usr/bin/env node

// test_deepgram_websocket.js - Test Deepgram WebSocket connection specifically
require('dotenv').config();
const WebSocket = require('ws');

async function testDeepgramWebSocket() {
    console.log('🔧 Testing Deepgram WebSocket Connection...\n');
    
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
        console.log('❌ DEEPGRAM_API_KEY not found');
        return;
    }
    
    console.log(`✅ API Key found: ${apiKey.substring(0, 8)}...`);
    
    // Test different parameter configurations
    const configs = [
        {
            name: 'Basic Configuration',
            params: {
                model: 'nova-2',
                encoding: 'linear16',
                sample_rate: '24000',
                language: 'en-US',
                interim_results: 'true',
                channels: '1'
            }
        },
        {
            name: 'Enhanced Configuration',
            params: {
                model: 'nova-2',
                encoding: 'linear16',
                sample_rate: '24000',
                language: 'en-US',
                smart_format: 'true',
                interim_results: 'true',
                channels: '1',
                endpointing: '100',
                vad_events: 'true',
                punctuate: 'false'
            }
        }
    ];
    
    for (const config of configs) {
        console.log(`\n📡 Testing ${config.name}:`);
        
        const qs = new URLSearchParams(config.params);
        const url = `wss://api.deepgram.com/v1/listen?${qs}`;
        
        console.log(`   URL: ${url}`);
        
        await new Promise((resolve) => {
            const ws = new WebSocket(url, {
                headers: { Authorization: `Token ${apiKey}` }
            });
            
            const timeout = setTimeout(() => {
                console.log('   ⏰ Connection timeout (10s)');
                ws.terminate();
                resolve();
            }, 10000);
            
            ws.on('open', () => {
                console.log('   ✅ WebSocket connected successfully!');
                clearTimeout(timeout);
                ws.close();
                resolve();
            });
            
            ws.on('error', (error) => {
                console.log(`   ❌ WebSocket error: ${error.message}`);
                clearTimeout(timeout);
                resolve();
            });
            
            ws.on('close', (code, reason) => {
                console.log(`   🔒 WebSocket closed: ${code} - ${reason}`);
                clearTimeout(timeout);
                resolve();
            });
        });
    }
    
    // Test with minimal parameters
    console.log('\n📡 Testing Minimal Configuration:');
    const minimalParams = {
        model: 'nova-2',
        encoding: 'linear16',
        sample_rate: '24000'
    };
    
    const minimalQs = new URLSearchParams(minimalParams);
    const minimalUrl = `wss://api.deepgram.com/v1/listen?${minimalQs}`;
    
    console.log(`   URL: ${minimalUrl}`);
    
    await new Promise((resolve) => {
        const ws = new WebSocket(minimalUrl, {
            headers: { Authorization: `Token ${apiKey}` }
        });
        
        const timeout = setTimeout(() => {
            console.log('   ⏰ Connection timeout (10s)');
            ws.terminate();
            resolve();
        }, 10000);
        
        ws.on('open', () => {
            console.log('   ✅ Minimal WebSocket connected successfully!');
            clearTimeout(timeout);
            ws.close();
            resolve();
        });
        
        ws.on('error', (error) => {
            console.log(`   ❌ Minimal WebSocket error: ${error.message}`);
            clearTimeout(timeout);
            resolve();
        });
        
        ws.on('close', (code, reason) => {
            console.log(`   🔒 Minimal WebSocket closed: ${code} - ${reason}`);
            clearTimeout(timeout);
            resolve();
        });
    });
    
    console.log('\n🎯 WebSocket Test Complete');
}

testDeepgramWebSocket().catch(console.error);