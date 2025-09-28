#!/usr/bin/env node

// test_aec_integration.js - Test current AEC integration
const fs = require('fs');
const path = require('path');

async function testAecIntegration() {
    console.log('🔧 Testing AEC Integration...\n');
    
    // Test 1: Check if AEC directory exists and has required files
    console.log('📋 Step 1: Check AEC module availability');
    const aecDir = path.join(__dirname, 'aec');
    const nativeAecDir = path.join(__dirname, 'libaec-win-x86-64');
    
    if (fs.existsSync(aecDir)) {
        console.log('✅ WASM AEC directory found:', aecDir);
        
        // Check for key files
        const wasmFiles = [
            'src/lib.rs',
            'Cargo.toml',
            'examples/usage.rs'
        ];
        
        for (const file of wasmFiles) {
            const filePath = path.join(aecDir, file);
            if (fs.existsSync(filePath)) {
                console.log(`   ✅ ${file} - Found`);
            } else {
                console.log(`   ❌ ${file} - Missing`);
            }
        }
    } else {
        console.log('❌ WASM AEC directory not found');
    }
    
    if (fs.existsSync(nativeAecDir)) {
        console.log('✅ Native AEC directory found:', nativeAecDir);
        
        // Check for key files
        const nativeFiles = [
            'aec.dll',
            'aec.lib', 
            'libaec.h'
        ];
        
        for (const file of nativeFiles) {
            const filePath = path.join(nativeAecDir, file);
            if (fs.existsSync(filePath)) {
                const stats = fs.statSync(filePath);
                console.log(`   ✅ ${file} - Found (${(stats.size / 1024).toFixed(1)} KB)`);
            } else {
                console.log(`   ❌ ${file} - Missing`);
            }
        }
    } else {
        console.log('❌ Native AEC directory not found');
    }
    
    // Test 2: Check current Glass AEC implementation
    console.log('\n📋 Step 2: Check current Glass AEC integration');
    const aecJsPath = path.join(__dirname, 'src/ui/listen/audioCore/aec.js');
    const listenCapturePath = path.join(__dirname, 'src/ui/listen/audioCore/listenCapture.js');
    
    if (fs.existsSync(aecJsPath)) {
        console.log('✅ AEC JavaScript module found');
        try {
            const aecContent = fs.readFileSync(aecJsPath, 'utf8');
            
            // Check for key functions
            const hasCreateAecModule = aecContent.includes('createAecModule');
            const hasWasmExports = aecContent.includes('_malloc') || aecContent.includes('cwrap');
            
            console.log(`   📝 Has createAecModule: ${hasCreateAecModule ? '✅' : '❌'}`);
            console.log(`   📝 Has WASM exports: ${hasWasmExports ? '✅' : '❌'}`);
            
        } catch (error) {
            console.log('   ❌ Error reading AEC module:', error.message);
        }
    } else {
        console.log('❌ AEC JavaScript module not found');
    }
    
    if (fs.existsSync(listenCapturePath)) {
        console.log('✅ Listen capture module found');
        try {
            const captureContent = fs.readFileSync(listenCapturePath, 'utf8');
            
            // Check for AEC integration
            const hasGetAec = captureContent.includes('getAec');
            const hasRunAecSync = captureContent.includes('runAecSync');
            const hasAecPtr = captureContent.includes('aecPtr');
            const hasSystemAudioBuffer = captureContent.includes('systemAudioBuffer');
            
            console.log(`   📝 Has getAec function: ${hasGetAec ? '✅' : '❌'}`);
            console.log(`   📝 Has runAecSync function: ${hasRunAecSync ? '✅' : '❌'}`);
            console.log(`   📝 Has aecPtr reference: ${hasAecPtr ? '✅' : '❌'}`);
            console.log(`   📝 Has systemAudioBuffer: ${hasSystemAudioBuffer ? '✅' : '❌'}`);
            
        } catch (error) {
            console.log('   ❌ Error reading listen capture module:', error.message);
        }
    } else {
        console.log('❌ Listen capture module not found');
    }
    
    // Test 3: Check build requirements
    console.log('\n📋 Step 3: Check build environment');
    
    // Check if Rust is available
    try {
        const { execSync } = require('child_process');
        const rustVersion = execSync('rustc --version', { encoding: 'utf8' });
        console.log('✅ Rust compiler found:', rustVersion.trim());
    } catch (error) {
        console.log('❌ Rust compiler not found - needed for WASM AEC compilation');
    }
    
    // Check if Python is available (for native AEC)
    try {
        const { execSync } = require('child_process');
        const pythonVersion = execSync('python --version', { encoding: 'utf8' });
        console.log('✅ Python found:', pythonVersion.trim());
    } catch (error) {
        console.log('❌ Python not found - check if needed for native AEC');
    }
    
    // Test 4: Recommendation
    console.log('\n📊 Recommendations:');
    
    const hasWasmAec = fs.existsSync(aecDir) && fs.existsSync(aecJsPath);
    const hasNativeAec = fs.existsSync(nativeAecDir) && fs.existsSync(path.join(nativeAecDir, 'aec.dll'));
    
    if (hasWasmAec && hasNativeAec) {
        console.log('🎯 Both WASM and Native AEC available:');
        console.log('   1. Continue with enhanced WASM AEC with fallback (current approach)');
        console.log('   2. Test if current WASM implementation resolves intermittent issues');
        console.log('   3. If issues persist, consider native DLL integration');
    } else if (hasWasmAec) {
        console.log('🎯 WASM AEC available:');
        console.log('   1. Test current enhanced implementation with error handling');
        console.log('   2. Monitor for intermittent issues');
    } else if (hasNativeAec) {
        console.log('🎯 Native AEC available:');
        console.log('   1. Focus on native DLL integration');
        console.log('   2. May require additional FFI setup or C++ addon');
    } else {
        console.log('⚠️ No AEC implementation found:');
        console.log('   1. Build AEC module from source');
        console.log('   2. Or continue without AEC (direct audio processing)');
    }
    
    console.log('\n✅ AEC Integration Test Complete');
}

testAecIntegration().catch(console.error);