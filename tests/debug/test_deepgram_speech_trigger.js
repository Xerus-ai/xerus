#!/usr/bin/env node

// test_deepgram_speech_trigger.js - Test if we can trigger actual transcription
require('dotenv').config();
const WebSocket = require('ws');

async function testDeepgramSpeechTrigger() {
    console.log('🎤 Testing Deepgram Speech Transcription Trigger...\n');
    
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
    console.log('🔗 Connecting to Deepgram...');
    
    const ws = new WebSocket(url, {
        headers: { Authorization: `Token ${apiKey}` },
        perMessageDeflate: false,
    });
    
    let messageCount = 0;
    let transcriptCount = 0;
    let speechStarted = false;
    
    ws.on('open', () => {
        console.log('✅ WebSocket connected successfully!');
        
        // Send a longer, more speech-like audio pattern
        console.log('📤 Sending speech-like audio pattern...');
        
        // Create a 5-second speech-like pattern (200 chunks of 600 samples each)
        let chunkCount = 0;
        const maxChunks = 200; // 5 seconds of audio
        
        const sendSpeechLikeChunk = () => {
            if (chunkCount >= maxChunks) {
                console.log('📤 Finished sending audio pattern');
                return;
            }
            
            // Create 600 samples (1200 bytes) of speech-like audio
            const speechBuffer = Buffer.alloc(1200);
            const samplesPerChunk = 600;
            
            for (let i = 0; i < samplesPerChunk; i++) {
                const globalSample = chunkCount * samplesPerChunk + i;
                
                // Create a complex waveform that changes over time (like speech)
                const baseFreq = 200 + Math.sin(globalSample / 2000) * 150; // Varying fundamental frequency
                const formant1 = Math.sin(2 * Math.PI * baseFreq * globalSample / 24000) * 4000;
                const formant2 = Math.sin(2 * Math.PI * (baseFreq * 2.5) * globalSample / 24000) * 2000;
                const formant3 = Math.sin(2 * Math.PI * (baseFreq * 4) * globalSample / 24000) * 1000;
                
                // Add some amplitude modulation (like speech patterns)
                const ampMod = Math.sin(2 * Math.PI * 5 * globalSample / 24000) * 0.5 + 0.5;
                
                // Combine frequencies with amplitude modulation
                const sample = (formant1 + formant2 + formant3) * ampMod;
                const intSample = Math.floor(Math.max(-32768, Math.min(32767, sample)));
                
                speechBuffer.writeInt16LE(intSample, i * 2);
            }
            
            ws.send(speechBuffer);
            
            if (chunkCount % 40 === 0) { // Log every second
                console.log(`   📦 Sent chunk ${chunkCount + 1}/${maxChunks} (${((chunkCount + 1) / maxChunks * 100).toFixed(1)}%)`);
            }
            
            chunkCount++;
            
            // Send next chunk after 25ms (matching Glass's ultra-low latency)
            setTimeout(sendSpeechLikeChunk, 25);
        };
        
        // Start sending audio
        sendSpeechLikeChunk();
        
        // Close after 8 seconds total (5s audio + 3s wait)
        setTimeout(() => {
            console.log('\\n📊 Final Test Results:');
            console.log(`   Total messages received: ${messageCount}`);
            console.log(`   Speech started events: ${speechStarted ? 1 : 0}`);
            console.log(`   Transcription messages: ${transcriptCount}`);
            
            if (messageCount === 0) {
                console.log('   🔴 No messages received - connection issue');
            } else if (!speechStarted) {
                console.log('   🔴 No speech detection - VAD not triggered');
            } else if (transcriptCount === 0) {
                console.log('   🟡 Speech detected but no transcriptions - audio not recognized as speech');
            } else {
                console.log('   🟢 Success! Transcriptions received - system working correctly');
            }
            
            ws.close();
        }, 8000);
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
        
        if (msg.type === 'Results' && msg.channel?.alternatives?.[0]) {
            transcriptCount++;
            const transcript = msg.channel.alternatives[0].transcript;
            const isFinal = msg.is_final;
            const confidence = msg.channel.alternatives[0].confidence;
            
            console.log(`🎙️ TRANSCRIPT ${transcriptCount}: "${transcript}" (final: ${isFinal}, conf: ${confidence})`);
        } else if (msg.type === 'SpeechStarted') {
            speechStarted = true;
            console.log('🗣️ Speech started detected!');
        } else if (msg.type === 'UtteranceEnd') {
            console.log('🏁 Utterance end detected');
        } else {
            console.log(`📨 Other message: ${msg.type}`, Object.keys(msg));
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

testDeepgramSpeechTrigger().catch(console.error);