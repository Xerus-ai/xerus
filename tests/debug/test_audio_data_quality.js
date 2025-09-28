#!/usr/bin/env node

// test_audio_data_quality.js - Analyze the audio data being sent to Deepgram
const fs = require('fs');

function analyzeAudioBuffer(buffer) {
    console.log('🔍 Audio Buffer Analysis:');
    console.log(`   Length: ${buffer.length} bytes`);
    
    // Check if it's all zeros (silence)
    const isAllZeros = buffer.every(byte => byte === 0);
    console.log(`   All zeros (silence): ${isAllZeros}`);
    
    // Calculate some basic statistics
    let min = 255, max = 0, sum = 0;
    for (let i = 0; i < buffer.length; i++) {
        const byte = buffer[i];
        if (byte < min) min = byte;
        if (byte > max) max = byte;
        sum += byte;
    }
    
    const average = sum / buffer.length;
    console.log(`   Min value: ${min}`);
    console.log(`   Max value: ${max}`);
    console.log(`   Average: ${average.toFixed(2)}`);
    console.log(`   Range: ${max - min}`);
    
    // Check for patterns that indicate actual audio
    let nonZeroCount = 0;
    let varianceSum = 0;
    for (let i = 0; i < buffer.length; i++) {
        if (buffer[i] !== 0) nonZeroCount++;
        varianceSum += Math.pow(buffer[i] - average, 2);
    }
    
    const variance = varianceSum / buffer.length;
    const stdDev = Math.sqrt(variance);
    
    console.log(`   Non-zero bytes: ${nonZeroCount}/${buffer.length} (${(nonZeroCount/buffer.length*100).toFixed(1)}%)`);
    console.log(`   Standard deviation: ${stdDev.toFixed(2)}`);
    
    // Assess audio quality
    if (isAllZeros) {
        console.log('   🔴 Assessment: SILENCE - All zeros, no audio signal');
    } else if (stdDev < 1) {
        console.log('   🟡 Assessment: VERY LOW SIGNAL - Minimal variation, possibly noise');
    } else if (stdDev < 10) {
        console.log('   🟡 Assessment: LOW SIGNAL - Some variation, weak audio');
    } else if (stdDev < 30) {
        console.log('   🟢 Assessment: GOOD SIGNAL - Reasonable variation, likely real audio');
    } else {
        console.log('   🟢 Assessment: STRONG SIGNAL - High variation, definite audio content');
    }
    
    console.log('');
}

function createTestAudioData() {
    console.log('🎯 Creating Test Audio Data...\n');
    
    // Test 1: Silence (all zeros)
    console.log('📋 Test 1: Silence (1200 bytes of zeros)');
    const silence = Buffer.alloc(1200, 0);
    analyzeAudioBuffer(silence);
    
    // Test 2: White noise
    console.log('📋 Test 2: White noise (random data)');
    const noise = Buffer.alloc(1200);
    for (let i = 0; i < 1200; i++) {
        noise[i] = Math.floor(Math.random() * 256);
    }
    analyzeAudioBuffer(noise);
    
    // Test 3: Sine wave (simulated audio)
    console.log('📋 Test 3: Sine wave (simulated audio)');
    const sineWave = Buffer.alloc(1200);
    for (let i = 0; i < 1200; i++) {
        // Generate a sine wave at 440Hz (A note)
        const sample = Math.sin(2 * Math.PI * 440 * i / 24000) * 127 + 128;
        sineWave[i] = Math.floor(sample);
    }
    analyzeAudioBuffer(sineWave);
    
    // Test 4: Glass audio format (base64 decoded)
    console.log('📋 Test 4: Glass audio format simulation');
    // Simulate what Glass sends: 1600 bytes base64 -> 1200 bytes buffer
    const glassAudio = Buffer.alloc(1200);
    // Add some realistic audio-like variation
    for (let i = 0; i < 1200; i++) {
        // Simulate 16-bit PCM with some variation
        const baseValue = 128;
        const variation = Math.sin(i / 10) * 20 + Math.random() * 10 - 5;
        glassAudio[i] = Math.max(0, Math.min(255, Math.floor(baseValue + variation)));
    }
    analyzeAudioBuffer(glassAudio);
}

createTestAudioData();