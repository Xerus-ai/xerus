#!/usr/bin/env node

// test_deepgram_live_audio.js - Test Deepgram with actual audio data
require('dotenv').config();
const WebSocket = require('ws');
const fs = require('fs');

async function testDeepgramWithAudio() {
    console.log('🎤 Testing Deepgram with Live Audio...\n');
    
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
        console.log('❌ DEEPGRAM_API_KEY not found');
        return;
    }
    
    // Use the exact same configuration as Glass
    const qs = new URLSearchParams({
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
    });
    
    const url = `wss://api.deepgram.com/v1/listen?${qs}`;
    console.log('🔗 Connecting to:', url.substring(0, 80) + '...');
    
    const ws = new WebSocket(url, {
        headers: { Authorization: `Token ${apiKey}` },
        perMessageDeflate: false,
    });
    
    let messageCount = 0;
    let transcriptCount = 0;
    
    ws.on('open', () => {
        console.log('✅ WebSocket connected successfully!');
        
        // Send some test audio data
        console.log('📤 Sending test audio data...');
        
        // Test 1: Send silence (should get no transcription)
        const silence = Buffer.alloc(1200, 0);
        ws.send(silence);
        console.log('   📦 Sent 1200 bytes of silence');
        
        // Test 2: Send proper 16-bit PCM format (what Deepgram expects)
        setTimeout(() => {
            // Create 600 samples of 16-bit PCM (1200 bytes total)
            const pcmBuffer = Buffer.alloc(1200);
            for (let i = 0; i < 600; i++) {
                // Generate a 440Hz sine wave (A note) at proper amplitude
                const sample = Math.sin(2 * Math.PI * 440 * i / 24000) * 16000; // 16-bit range
                const intSample = Math.floor(sample);
                
                // Write as little-endian 16-bit signed integer
                pcmBuffer.writeInt16LE(intSample, i * 2);
            }
            ws.send(pcmBuffer);
            console.log('   📦 Sent 1200 bytes of 16-bit PCM sine wave (440Hz)');
        }, 500);
        
        // Test 3: Send speech-like frequencies (human voice range 300-3400Hz)
        setTimeout(() => {
            const speechBuffer = Buffer.alloc(1200);
            for (let i = 0; i < 600; i++) {
                // Mix multiple frequencies to simulate speech
                const freq1 = Math.sin(2 * Math.PI * 300 * i / 24000) * 5000;
                const freq2 = Math.sin(2 * Math.PI * 800 * i / 24000) * 3000;
                const freq3 = Math.sin(2 * Math.PI * 1200 * i / 24000) * 2000;
                const sample = freq1 + freq2 + freq3;
                const intSample = Math.floor(sample);
                
                speechBuffer.writeInt16LE(intSample, i * 2);
            }
            ws.send(speechBuffer);
            console.log('   📦 Sent 1200 bytes of speech-like frequencies');
        }, 1000);
        
        // Test 4: Send a repeating pattern that might trigger voice detection
        setTimeout(() => {
            const patternBuffer = Buffer.alloc(1200);
            for (let i = 0; i < 600; i++) {
                // Create a pattern that repeats every 100 samples (might look like speech)
                const pattern = (i % 100) < 50 ? 8000 : -8000;
                patternBuffer.writeInt16LE(pattern, i * 2);
            }
            ws.send(patternBuffer);
            console.log('   📦 Sent 1200 bytes of square wave pattern');
        }, 1500);
        
        // Close after testing
        setTimeout(() => {
            console.log('\\n📊 Test Results:');
            console.log(`   Total messages received: ${messageCount}`);
            console.log(`   Transcription messages: ${transcriptCount}`);
            
            if (messageCount === 0) {
                console.log('   🔴 No messages received - possible connection issue');
            } else if (transcriptCount === 0) {
                console.log('   🟡 Messages received but no transcriptions - audio might be too low quality');
            } else {
                console.log('   🟢 Transcriptions received - system working correctly');
            }
            
            ws.close();
        }, 4000);
    });
    
    ws.on('message', (raw) => {
        messageCount++;
        let msg;
        try {
            msg = JSON.parse(raw.toString());
        } catch (error) {
            console.log('❌ Failed to parse message:', error);
            return;
        }
        
        console.log(`📥 Message ${messageCount}:`, {
            type: msg.type,
            hasChannel: !!msg.channel,
            hasAlternatives: !!msg.channel?.alternatives,
            keys: Object.keys(msg)
        });
        
        if (msg.type === 'Results' && msg.channel?.alternatives?.[0]) {
            transcriptCount++;
            const transcript = msg.channel.alternatives[0].transcript;
            const isFinal = msg.is_final;
            const confidence = msg.channel.alternatives[0].confidence;
            
            console.log(`   🎙️ Transcript ${transcriptCount}: "${transcript}" (final: ${isFinal}, confidence: ${confidence})`);
        } else if (msg.type === 'SpeechStarted') {
            console.log('   🗣️ Speech started detected');
        } else if (msg.type === 'UtteranceEnd') {
            console.log('   🏁 Utterance end detected');
        } else {
            console.log(`   📨 Other message: ${JSON.stringify(msg, null, 2)}`);
        }
    });
    
    ws.on('error', (error) => {
        console.log('❌ WebSocket error:', error.message);
    });
    
    ws.on('close', (code, reason) => {
        console.log('🔒 WebSocket closed:', { code, reason: reason.toString() });
        console.log('\\n✅ Test completed');
    });
}

testDeepgramWithAudio().catch(console.error);