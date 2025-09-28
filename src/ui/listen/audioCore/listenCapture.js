const createAecModule = require('./aec.js');
const { createLogger } = require('../../../common/services/renderer-logger.js');
const { vadInstance } = require('./voiceActivityDetection.js');

const logger = createLogger('UI.ListenCapture');

// Global audio capture configuration - enable both mic and system audio by default
window.listenCapture = window.listenCapture || {};
window.listenCapture.useSystemAudio = true; // Enable both mic and system audio by default

let aecModPromise = null;     // Load only once
let aecMod        = null;
let aecPtr        = 0;        // Reuse single Rust Aec* instance

/** Load WASM module and initialize once */
async function getAec () {
  if (aecModPromise) return aecModPromise;   // Cache

    aecModPromise = createAecModule().then((M) => {
        aecMod = M; 

        logger.info('[OK] WASM AEC Module loaded successfully'); // ✨ Simplified logging to prevent memory dumps 
        // C symbol to JS wrapper binding (once only)
        M.newPtr   = M.cwrap('AecNew',        'number',
                            ['number','number','number','number']);
        M.cancel   = M.cwrap('AecCancelEcho', null,
                            ['number','number','number','number','number']);
        M.destroy  = M.cwrap('AecDestroy',    null, ['number']);
        return M;
    });

  return aecModPromise;
}

// ✨ Pre-load WASM module to prevent first-time delays
getAec().catch(error => {
    logger.warn('[WARNING] WASM AEC pre-loading failed (will retry on demand):', error.message);
});
// ---------------------------
// Constants & Globals
// ---------------------------
const SAMPLE_RATE = 24000;
const AUDIO_CHUNK_DURATION = 0.025; // Ultra-low latency: 25ms chunks for 4x responsiveness (40 req/sec)
const BUFFER_SIZE = 4096;

// Audio processing constants

// Platform detection functions (safe lazy loading)
const isLinux = () => window.api && window.api.platform && window.api.platform.isLinux;
const isMacOS = () => window.api && window.api.platform && window.api.platform.isMacOS;

let mediaStream = null;
let micMediaStream = null;
let audioContext = null;
let audioProcessor = null;
let systemAudioContext = null;
let systemAudioProcessor = null;

let systemAudioBuffer = [];
const MAX_SYSTEM_BUFFER_SIZE = 10;

// ---------------------------
// Utility helpers (exact from renderer.js)
// ---------------------------
function isVoiceActive(audioFloat32Array, threshold = 0.005) {
    if (!audioFloat32Array || audioFloat32Array.length === 0) {
        return false;
    }

    let sumOfSquares = 0;
    for (let i = 0; i < audioFloat32Array.length; i++) {
        sumOfSquares += audioFloat32Array[i] * audioFloat32Array[i];
    }
    const rms = Math.sqrt(sumOfSquares / audioFloat32Array.length);

    // VAD RMS logging removed to prevent console flooding

    return rms > threshold;
}

function base64ToFloat32Array(base64) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);

    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }

    const int16Array = new Int16Array(bytes.buffer);
    const float32Array = new Float32Array(int16Array.length);

    for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768.0;
    }

    return float32Array;
}

function convertFloat32ToInt16(float32Array) {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
        // Improved scaling to prevent clipping
        const s = Math.max(-1, Math.min(1, float32Array[i]));
        int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return int16Array;
}

function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}


/* ───────────────────────── JS ↔ WASM helpers ───────────────────────── */
function int16PtrFromFloat32(mod, f32) {
  const len   = f32.length;
  const bytes = len * 2;
  const ptr   = mod._malloc(bytes);
  // If HEAP16 not available, wrap directly with HEAPU8.buffer
  const heapBuf = (mod.HEAP16 ? mod.HEAP16.buffer : mod.HEAPU8.buffer);
  const i16   = new Int16Array(heapBuf, ptr, len);
  for (let i = 0; i < len; ++i) {
    const s = Math.max(-1, Math.min(1, f32[i]));
    i16[i]  = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return { ptr, view: i16 };
}

function float32FromInt16View(i16) {
  const out = new Float32Array(i16.length);
  for (let i = 0; i < i16.length; ++i) out[i] = i16[i] / 32768;
  return out;
}

/* On shutdown if needed */
function disposeAec () {
  getAec().then(mod => { if (aecPtr) mod.destroy(aecPtr); });
}

// listenCapture.js

function runAecSync(micF32, sysF32) {
    if (!aecMod || !aecPtr || !aecMod.HEAPU8) {
        // logger.info('[AUDIO] No AEC module or heap buffer');
        return micF32;
    }

    const frameSize = 160; // Frame size set during AEC module initialization
    const numFrames = Math.floor(micF32.length / frameSize);

    // Buffer for final processed audio data
    const processedF32 = new Float32Array(micF32.length);

    // Align system audio and mic audio lengths (stability)
    let alignedSysF32 = new Float32Array(micF32.length);
    if (sysF32.length > 0) {
        // Trim or pad sysF32 to match micF32 length
        const lengthToCopy = Math.min(micF32.length, sysF32.length);
        alignedSysF32.set(sysF32.slice(0, lengthToCopy));
    }


    // Divide 2400 samples into 160 frame loops
    for (let i = 0; i < numFrames; i++) {
        const offset = i * frameSize;

        // Extract 160 samples for current frame
        const micFrame = micF32.subarray(offset, offset + frameSize);
        const echoFrame = alignedSysF32.subarray(offset, offset + frameSize);

        // Write frame data to WASM memory
        const micPtr = int16PtrFromFloat32(aecMod, micFrame);
        const echoPtr = int16PtrFromFloat32(aecMod, echoFrame);
        const outPtr = aecMod._malloc(frameSize * 2); // 160 * 2 bytes

        // Execute AEC (160 sample units)
        aecMod.cancel(aecPtr, micPtr.ptr, echoPtr.ptr, outPtr, frameSize);

        // Read processed frame data from WASM memory
        const heapBuf = (aecMod.HEAP16 ? aecMod.HEAP16.buffer : aecMod.HEAPU8.buffer);
        const outFrameI16 = new Int16Array(heapBuf, outPtr, frameSize);
        const outFrameF32 = float32FromInt16View(outFrameI16);

        // Copy processed frame to correct position in final buffer
        processedF32.set(outFrameF32, offset);

        // Free allocated memory
        aecMod._free(micPtr.ptr);
        aecMod._free(echoPtr.ptr);
        aecMod._free(outPtr);
    }

    return processedF32;
    // ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲
    //                      New logic ends here
    // ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲
}


// System audio data handler
window.api.listenCapture.onSystemAudioData((event, { data }) => {
    systemAudioBuffer.push({
        data: data,
        timestamp: Date.now(),
    });

    // Remove old data
    if (systemAudioBuffer.length > MAX_SYSTEM_BUFFER_SIZE) {
        systemAudioBuffer = systemAudioBuffer.slice(-MAX_SYSTEM_BUFFER_SIZE);
    }
});

// ---------------------------
// Complete token tracker (exact from renderer.js)
// ---------------------------
let tokenTracker = {
    tokens: [],
    audioStartTime: null,

    addTokens(count, type = 'image') {
        const now = Date.now();
        this.tokens.push({
            timestamp: now,
            count: count,
            type: type,
        });

        this.cleanOldTokens();
    },

    calculateImageTokens(width, height) {
        const pixels = width * height;
        if (pixels <= 384 * 384) {
            return 85;
        }

        const tiles = Math.ceil(pixels / (768 * 768));
        return tiles * 85;
    },

    trackAudioTokens() {
        if (!this.audioStartTime) {
            this.audioStartTime = Date.now();
            return;
        }

        const now = Date.now();
        const elapsedSeconds = (now - this.audioStartTime) / 1000;

        const audioTokens = Math.floor(elapsedSeconds * 16);

        if (audioTokens > 0) {
            this.addTokens(audioTokens, 'audio');
            this.audioStartTime = now;
        }
    },

    cleanOldTokens() {
        const oneMinuteAgo = Date.now() - 60 * 1000;
        this.tokens = this.tokens.filter(token => token.timestamp > oneMinuteAgo);
    },

    getTokensInLastMinute() {
        this.cleanOldTokens();
        return this.tokens.reduce((total, token) => total + token.count, 0);
    },

    shouldThrottle() {
        const throttleEnabled = localStorage.getItem('throttleTokens') === 'true';
        if (!throttleEnabled) {
            return false;
        }

        const maxTokensPerMin = parseInt(localStorage.getItem('maxTokensPerMin') || '500000', 10);
        const throttleAtPercent = parseInt(localStorage.getItem('throttleAtPercent') || '75', 10);

        const currentTokens = this.getTokensInLastMinute();
        const throttleThreshold = Math.floor((maxTokensPerMin * throttleAtPercent) / 100);

        // logger.info(`Token check: ${currentTokens}/${maxTokensPerMin} (throttle at ${throttleThreshold})`);

        return currentTokens >= throttleThreshold;
    },

    // Reset the tracker
    reset() {
        this.tokens = [];
        this.audioStartTime = null;
    },
};

// Track audio tokens every few seconds
setInterval(() => {
    tokenTracker.trackAudioTokens();
}, 2000);

// ---------------------------
// Audio processing functions (exact from renderer.js)
// ---------------------------
async function setupMicProcessing(micStream) {
    // ✨ Enhanced microphone processing with robust AEC and fallback
    logger.info('🎤 Setting up microphone processing with AEC (robust fallback)');

    let aecAvailable = false;
    let mod = null;
    
    // Try to initialize AEC with proper error handling
    try {
        mod = await getAec();
        if (!aecPtr && mod) {
            aecPtr = mod.newPtr(160, 1600, 24000, 1);
            aecAvailable = true;
            logger.info('[OK] AEC initialized successfully');
        } else if (aecPtr && mod) {
            // AEC already initialized (from pre-loading)
            aecAvailable = true;
            logger.info('[OK] AEC already available (pre-loaded)');
        }
    } catch (error) {
        logger.warn('[WARNING] AEC initialization failed, continuing without AEC:', error.message);
        aecAvailable = false;
    }

    const micAudioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
    await micAudioContext.resume(); 
    const micSource = micAudioContext.createMediaStreamSource(micStream);
    const micProcessor = micAudioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);

    let audioBuffer = [];
    const samplesPerChunk = SAMPLE_RATE * AUDIO_CHUNK_DURATION;

    micProcessor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        audioBuffer.push(...inputData);

        // Process chunks when we have enough samples
        while (audioBuffer.length >= samplesPerChunk) {
            const chunk = audioBuffer.splice(0, samplesPerChunk);
            let processedChunk = new Float32Array(chunk);
            
            // ✨ AEC RE-ENABLED - Apply AEC if available and system audio is present
            if (aecAvailable && mod && aecPtr && systemAudioBuffer.length > 0) {
                try {
                    const latest = systemAudioBuffer[systemAudioBuffer.length - 1];
                    const sysF32 = base64ToFloat32Array(latest.data);
                    
                    // Apply AEC with error handling
                    processedChunk = runAecSync(processedChunk, sysF32);
                } catch (aecError) {
                    logger.warn('[WARNING] AEC processing failed, using raw audio:', aecError.message);
                }
            }
            
            // Convert to 16-bit PCM and send to microphone channel
            const pcm16 = convertFloat32ToInt16(processedChunk);
            const b64 = arrayBufferToBase64(pcm16.buffer);

            // Send microphone audio to "Me:" channel only
            window.api.listenCapture.sendMicAudioContent({
                data: b64,
                mimeType: 'audio/pcm;rate=24000',
            });
        }
    };

    micSource.connect(micProcessor);
    micProcessor.connect(micAudioContext.destination);

    audioProcessor = micProcessor;
    return { context: micAudioContext, processor: micProcessor };
}

function setupLinuxMicProcessing(micStream) {
    // Setup microphone audio processing for Linux
    const micAudioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
    const micSource = micAudioContext.createMediaStreamSource(micStream);
    const micProcessor = micAudioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);

    let audioBuffer = [];
    const samplesPerChunk = SAMPLE_RATE * AUDIO_CHUNK_DURATION;

    micProcessor.onaudioprocess = async e => {
        const inputData = e.inputBuffer.getChannelData(0);
        audioBuffer.push(...inputData);

        // Process audio in chunks
        while (audioBuffer.length >= samplesPerChunk) {
            const chunk = audioBuffer.splice(0, samplesPerChunk);
            const pcmData16 = convertFloat32ToInt16(chunk);
            const base64Data = arrayBufferToBase64(pcmData16.buffer);

            await window.api.listenCapture.sendMicAudioContent({
                data: base64Data,
                mimeType: 'audio/pcm;rate=24000',
            });
        }
    };

    micSource.connect(micProcessor);
    micProcessor.connect(micAudioContext.destination);

    // Store processor reference for cleanup
    audioProcessor = micProcessor;
}

// Simple audio channel separation - no cross-contamination detection needed

// Simple correlation function to detect audio similarity (legacy - unused)
function calculateCorrelation(data1, data2) {
    if (data1.length !== data2.length) return 0;
    
    let sum1 = 0, sum2 = 0, sum12 = 0, sum11 = 0, sum22 = 0;
    const n = data1.length;
    
    for (let i = 0; i < n; i++) {
        sum1 += data1[i];
        sum2 += data2[i];
        sum12 += data1[i] * data2[i];
        sum11 += data1[i] * data1[i];
        sum22 += data2[i] * data2[i];
    }
    
    const numerator = n * sum12 - sum1 * sum2;
    const denominator = Math.sqrt((n * sum11 - sum1 * sum1) * (n * sum22 - sum2 * sum2));
    
    return denominator === 0 ? 0 : Math.abs(numerator / denominator);
}

function setupSystemAudioProcessing(systemStream) {
    const systemAudioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
    const systemSource = systemAudioContext.createMediaStreamSource(systemStream);
    const systemProcessor = systemAudioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);

    let audioBuffer = [];
    const samplesPerChunk = SAMPLE_RATE * AUDIO_CHUNK_DURATION;

    systemProcessor.onaudioprocess = async e => {
        const inputData = e.inputBuffer.getChannelData(0);
        if (!inputData || inputData.length === 0) return;
        
        audioBuffer.push(...inputData);

        while (audioBuffer.length >= samplesPerChunk) {
            const chunk = audioBuffer.splice(0, samplesPerChunk);
            
            // Convert to 16-bit PCM and send to system audio channel
            const pcmData16 = convertFloat32ToInt16(chunk);
            const base64Data = arrayBufferToBase64(pcmData16.buffer);

            try {
                // Send system audio to "Them:" channel only
                await window.api.listenCapture.sendSystemAudioContent({
                    data: base64Data,
                    mimeType: 'audio/pcm;rate=24000',
                });
            } catch (error) {
                logger.error('Failed to send system audio:', { error: error.message || error });
            }
        }
    };

    systemSource.connect(systemProcessor);
    systemProcessor.connect(systemAudioContext.destination);

    return { context: systemAudioContext, processor: systemProcessor };
}

// ---------------------------
// Main capture functions (exact from renderer.js)
// ---------------------------
async function startCapture(screenshotIntervalSeconds = 5, imageQuality = 'medium') {

    // Reset token tracker when starting new capture session
    tokenTracker.reset();
    logger.info('[TARGET] Token tracker reset for new capture session');

    try {
        if (isMacOS()) {
            // On macOS, use SystemAudioDump for audio and getDisplayMedia for screen
            logger.info('Starting macOS capture with SystemAudioDump...');

            // Start macOS audio capture
            const audioResult = await window.api.listenCapture.startMacosSystemAudio();
            if (!audioResult.success) {
                logger.warn('macOS audio start failed:', { error: audioResult.error });

                // Already running → stop and retry
                if (audioResult.error === 'already_running') {
                    await window.api.listenCapture.stopMacosSystemAudio();
                    await new Promise(r => setTimeout(r, 500));
                    const retry = await window.api.listenCapture.startMacosSystemAudio();
                    if (!retry.success) {
                        throw new Error('Retry failed: ' + retry.error);
                    }
                } else {
                    throw new Error('Failed to start macOS audio capture: ' + audioResult.error);
                }
            }

            try {
                micMediaStream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        sampleRate: SAMPLE_RATE,
                        channelCount: 1,
                        echoCancellation: false, // BLEEDING TEST: Disable browser echo cancellation 
                        noiseSuppression: true,
                        autoGainControl: true,
                        // Prevent system audio bleeding (consistent across platforms)
                        suppressLocalAudioPlayback: true,
                        deviceId: { exact: 'default' }
                    },
                    video: false,
                });

                logger.info('macOS microphone capture started');
                const { context, processor } = await setupMicProcessing(micMediaStream);
                audioContext = context;
                audioProcessor = processor;
            } catch (micErr) {
                console.warn('Failed to get microphone on macOS:', micErr);
            }
            ////////// for index & subjects //////////

            logger.info('macOS screen capture started - audio handled by SystemAudioDump');
        } else if (isLinux()) {
            // Linux - use display media for screen capture and getUserMedia for microphone
            mediaStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    frameRate: 1,
                    width: { ideal: 1920 },
                    height: { ideal: 1080 },
                },
                audio: false, // Don't use system audio loopback on Linux
            });

            // Get microphone input for Linux
            let micMediaStream = null;
            try {
                micMediaStream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        sampleRate: SAMPLE_RATE,
                        channelCount: 1,
                        echoCancellation: false, // BLEEDING TEST: Disable browser echo cancellation 
                        noiseSuppression: true,
                        autoGainControl: true,
                        // Prevent system audio bleeding (consistent across platforms)
                        suppressLocalAudioPlayback: true,
                        deviceId: { exact: 'default' }
                    },
                    video: false,
                });

                logger.info('Linux microphone capture started');

                // Setup audio processing for microphone on Linux
                setupLinuxMicProcessing(micMediaStream);
            } catch (micError) {
                console.warn('Failed to get microphone access on Linux:', micError);
                // Continue without microphone if permission denied
            }

            logger.info('Linux screen capture started');
        } else {
            // Windows - capture mic and system audio separately using native loopback
            logger.info('Starting Windows capture with native loopback audio...');

            // Ensure STT sessions are initialized before starting audio capture
            const sessionActive = await window.api.listenCapture.isSessionActive();
            if (!sessionActive) {
                throw new Error('STT sessions not initialized - please wait for initialization to complete');
            }

            // 1. Get user's microphone with explicit constraints to avoid system audio
            try {
                // First, enumerate devices to avoid system audio devices
                const devices = await navigator.mediaDevices.enumerateDevices();
                const audioInputs = devices.filter(device => device.kind === 'audioinput');
                
                // Log available devices for debugging
                logger.info('🎤 Available audio input devices:', audioInputs.map(d => ({
                    deviceId: d.deviceId.substring(0, 8) + '...',
                    label: d.label,
                    kind: d.kind
                })));
                
                // Simple device filtering - avoid loopback devices, never use 'default'
                const loopbackKeywords = ['stereo mix', 'what u hear', 'wave out', 'speakers', 'realtek hd audio input', 'loopback', 'monitor'];
                
                const microphoneDevice = audioInputs.find(device => {
                    const label = device.label.toLowerCase();
                    // Skip loopback devices
                    if (loopbackKeywords.some(keyword => label.includes(keyword))) {
                        logger.debug(`🚫 Skipping loopback device: ${device.label}`);
                        return false;
                    }
                    // Skip 'default' device (often causes bleeding)
                    if (device.deviceId === 'default' || device.deviceId === 'communications') {
                        logger.debug(`🚫 Skipping default/communications device: ${device.label}`);
                        return false;
                    }
                    // Take first non-loopback, non-default device
                    return true;
                });
                
                if (!microphoneDevice) {
                    throw new Error('No suitable microphone device found (all devices were loopback or default)');
                }
                
                logger.info(`[OK] Selected exclusive microphone: ${microphoneDevice.label}`);
                const deviceConstraint = { exact: microphoneDevice.deviceId };
                
                micMediaStream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        deviceId: deviceConstraint,
                        sampleRate: SAMPLE_RATE,
                        channelCount: 1,
                        // BLEEDING TEST: Disable browser echo cancellation (may cause feedback but tests contamination)
                        echoCancellation: false,
                        noiseSuppression: true,
                        autoGainControl: true,
                        // Critical: Suppress any local audio playback from being captured
                        suppressLocalAudioPlayback: true,
                        // Enhanced constraints to prevent system audio mixing
                        googEchoCancellation: true,
                        googAutoGainControl: true,
                        googNoiseSuppression: true,
                        googHighpassFilter: true,
                        googAudioMirroring: false,
                        // Additional constraints to prevent system audio capture
                        googTypingNoiseDetection: false,
                        googBeamforming: false,
                        googArrayGeometry: false,
                        googExperimentalEchoCancellation: true,
                        googDAEchoCancellation: true,
                        // Force microphone-only input (no system audio mixing)
                        mediaSource: 'microphone'
                    },
                    video: false,
                });
                
                // Verify the selected device
                const audioTracks = micMediaStream.getAudioTracks();
                if (audioTracks.length > 0) {
                    const track = audioTracks[0];
                    logger.info('🎤 Selected microphone device:', {
                        label: track.label,
                        deviceId: track.getSettings().deviceId,
                        groupId: track.getSettings().groupId,
                        echoCancellation: track.getSettings().echoCancellation,
                        autoGainControl: track.getSettings().autoGainControl,
                        noiseSuppression: track.getSettings().noiseSuppression
                    });
                    
                    // Final safety check - reject if system audio somehow got through
                    const trackLabel = track.label.toLowerCase();
                    if (trackLabel.includes('stereo mix') || 
                        trackLabel.includes('what u hear') ||
                        trackLabel.includes('wave out') ||
                        trackLabel.includes('speakers') ||
                        trackLabel.includes('loopback') ||
                        trackLabel.includes('monitor')) {
                        logger.error('[ALERT] System audio device detected in microphone stream:', track.label);
                        track.stop();
                        micMediaStream = null;
                        throw new Error(`System audio device detected: ${track.label}`);
                    }
                }
                
                logger.info('Windows microphone capture started');
                const { context, processor } = await setupMicProcessing(micMediaStream);
                audioContext = context;
                audioProcessor = processor;
            } catch (micErr) {
                console.warn('Could not get microphone access on Windows:', micErr);
            }

            // 2. Get system audio using native Electron loopback (always enabled)
            try {
                mediaStream = await navigator.mediaDevices.getDisplayMedia({
                    video: true,
                    audio: true // This will now use native loopback from our handler
                });
            
                // Verify we got audio tracks
                const audioTracks = mediaStream.getAudioTracks();
                if (audioTracks.length === 0) {
                    throw new Error('No audio track in native loopback stream');
                }
                
                logger.info('Windows native loopback audio capture started');
                const { context, processor } = setupSystemAudioProcessing(mediaStream);
                systemAudioContext = context;
                systemAudioProcessor = processor;
            } catch (sysAudioErr) {
                logger.error('Failed to start Windows native loopback audio:', sysAudioErr);
                // Continue without system audio
            }
        }
    } catch (err) {
        logger.error('Error starting capture:', err);
    }
}

function stopCapture() {
    // Clean up microphone resources
    if (audioProcessor) {
        audioProcessor.disconnect();
        audioProcessor = null;
    }
    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }

    // Clean up system audio resources
    if (systemAudioProcessor) {
        systemAudioProcessor.disconnect();
        systemAudioProcessor = null;
    }
    if (systemAudioContext) {
        systemAudioContext.close();
        systemAudioContext = null;
    }

    // Stop and release media stream tracks
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }
    if (micMediaStream) {
        micMediaStream.getTracks().forEach(t => t.stop());
        micMediaStream = null;
    }

    logger.debug('[CLEAN] Audio capture resources cleaned up');

    // Stop macOS audio capture if running
    if (isMacOS()) {
        window.api.listenCapture.stopMacosSystemAudio().catch(err => {
            logger.error('Error stopping macOS audio:', err);
        });
    }
}

// ---------------------------
// Exports & global registration
// ---------------------------
module.exports = {
    getAec,          // Newly created initialization function
    runAecSync,      // sync [Korean comment translated]
    disposeAec,      // Destroy Rust object if needed
    startCapture,
    stopCapture,
    isLinux,
    isMacOS,
};

// Expose functions to global scope for external access (exact from renderer.js)
if (typeof window !== 'undefined') {
    window.listenCapture = module.exports;
    window.xerus = window.xerus || {};
    window.xerus.startCapture = startCapture;
    window.xerus.stopCapture = stopCapture;
    
    // Expose manual audio start function for UI
    window.ensureAudioCapture = async () => {
        try {
            if (!micMediaStream && !mediaStream) {
                logger.info('🎤 [ListenCapture] Manual audio capture start requested');
                const sessionActive = await window.api.listenCapture.isSessionActive();
                if (sessionActive) {
                    await startCapture();
                    logger.info('[OK] [ListenCapture] Manual audio capture started successfully');
                } else {
                    logger.warn('[WARNING] [ListenCapture] STT session not active, waiting...');
                    // Try again in 500ms
                    setTimeout(() => window.ensureAudioCapture(), 500);
                }
            } else {
                logger.info('[INFO] [ListenCapture] Audio capture already active');
            }
        } catch (error) {
            logger.error('[ERROR] [ListenCapture] Manual audio capture start failed:', error);
        }
    };
    
    // Add IPC listeners for microphone stream pause/resume
    if (window.api && window.api.on) {
        window.api.on('pause-microphone-stream', () => {
            logger.info('🔇 [ListenCapture] Received pause-microphone-stream - STOPPING MediaStream tracks completely');
            
            let tracksStopped = 0;
            
            // Log current stream states for debugging
            logger.debug('Current stream states:', {
                micMediaStream: !!micMediaStream,
                mediaStream: !!mediaStream,
                micTracks: micMediaStream ? micMediaStream.getAudioTracks().length : 0,
                mediaTracks: mediaStream ? mediaStream.getAudioTracks().length : 0
            });
            
            // Store original streams and state for resume
            if (!window.listenCapture.pausedStreams) {
                window.listenCapture.pausedStreams = {};
            }
            
            // Store the pause timestamp for debugging
            window.listenCapture.pausedStreams.pauseTimestamp = Date.now();
            
            // STOP all microphone MediaStream tracks (not just disable)
            if (micMediaStream) {
                window.listenCapture.pausedStreams.micMediaStream = micMediaStream;
                micMediaStream.getAudioTracks().forEach((track, index) => {
                    track.stop(); // COMPLETELY STOP the track
                    tracksStopped++;
                });
                micMediaStream = null; // Clear the reference
                logger.debug('Microphone stream stopped and cleared');
            }
            
            // Also stop any global mediaStream tracks (but preserve system audio separately)
            if (mediaStream) {
                window.listenCapture.pausedStreams.mediaStream = mediaStream;
                
                // Separate microphone tracks from system audio tracks to prevent bleeding
                const audioTracks = mediaStream.getAudioTracks();
                audioTracks.forEach((track, index) => {
                    // Check track label to distinguish between mic and system audio
                    const isMicTrack = track.label.toLowerCase().includes('microphone') || 
                                     track.label.toLowerCase().includes('mic') ||
                                     track.label.toLowerCase().includes('default');
                    
                    if (isMicTrack) {
                        track.stop(); // Stop microphone tracks during TTS
                        tracksStopped++;
                    }
                    // Leave system audio tracks running but mark them for separation
                });
                
                // Only clear mediaStream if all tracks are microphone tracks
                const hasSystemTracks = audioTracks.some(track => 
                    !track.label.toLowerCase().includes('microphone') && 
                    !track.label.toLowerCase().includes('mic') &&
                    !track.label.toLowerCase().includes('default')
                );
                
                if (!hasSystemTracks) {
                    mediaStream = null;
                    logger.debug('MediaStream cleared (no system audio tracks)');
                } else {
                    logger.debug('MediaStream preserved (has system audio tracks)');
                }
            }
            
            // CRITICAL: Also disconnect the audioProcessor to stop all audio processing
            if (audioProcessor) {
                audioProcessor.disconnect();
                window.listenCapture.pausedStreams.audioProcessor = audioProcessor;
                audioProcessor = null;
                logger.debug('Audio processor disconnected');
            }
            
            // Pause the audio context instead of closing it
            if (audioContext && audioContext.state === 'running') {
                audioContext.suspend().then(() => {
                    logger.debug('AudioContext suspended successfully');
                }).catch(err => {
                    logger.error('Failed to suspend audioContext:', err);
                });
                window.listenCapture.pausedStreams.audioContext = audioContext;
            }
            
            logger.info(`Audio tracks stopped: ${tracksStopped}`);
        });
        
        window.api.on('resume-microphone-stream', async () => {
            logger.info('[AUDIO] [ListenCapture] Received resume-microphone-stream - RESTARTING MediaStream tracks');
            
            try {
                // Add delay to ensure TTS audio is fully finished
                const pauseTimestamp = window.listenCapture.pausedStreams?.pauseTimestamp;
                if (pauseTimestamp) {
                    const timeSincePause = Date.now() - pauseTimestamp;
                    
                    // Ensure minimum delay between pause and resume
                    if (timeSincePause < 100) {
                        const additionalDelay = 100 - timeSincePause;
                        await new Promise(resolve => setTimeout(resolve, additionalDelay));
                    }
                }
                
                // Resume the audio context first if it was suspended
                if (window.listenCapture.pausedStreams?.audioContext && audioContext && audioContext.state === 'suspended') {
                    try {
                        await audioContext.resume();
                        logger.debug('AudioContext resumed successfully, state:', audioContext.state);
                    } catch (resumeError) {
                        logger.error('Failed to resume audioContext:', resumeError);
                    }
                }
                
                // Need to recreate the microphone streams since we stopped them completely
                if (window.listenCapture.pausedStreams?.micMediaStream || !micMediaStream) {
                    logger.debug('Recreating microphone stream...');
                    
                    // Check current microphone state
                    logger.debug('Current microphone state:', {
                        micMediaStream: !!micMediaStream,
                        micTracks: micMediaStream ? micMediaStream.getAudioTracks().length : 0,
                        audioProcessor: !!audioProcessor,
                        audioContext: !!audioContext
                    });
                    
                    try {
                        // Use same device selection logic as initial capture
                        const devices = await navigator.mediaDevices.enumerateDevices();
                        const audioInputs = devices.filter(device => device.kind === 'audioinput');
                        
                        // Simple device filtering - avoid loopback devices, never use 'default'
                        const loopbackKeywords = ['stereo mix', 'what u hear', 'wave out', 'speakers', 'realtek hd audio input', 'loopback', 'monitor'];
                        
                        const microphoneDevice = audioInputs.find(device => {
                            const label = device.label.toLowerCase();
                            // Skip loopback devices
                            if (loopbackKeywords.some(keyword => label.includes(keyword))) {
                                logger.debug(`🚫 Skipping loopback device: ${device.label}`);
                                return false;
                            }
                            // Skip 'default' device (often causes bleeding)
                            if (device.deviceId === 'default' || device.deviceId === 'communications') {
                                logger.debug(`🚫 Skipping default/communications device: ${device.label}`);
                                return false;
                            }
                            // Take first non-loopback, non-default device
                            return true;
                        });
                        
                        if (!microphoneDevice) {
                            throw new Error('No suitable microphone device found (all devices were loopback or default)');
                        }
                        
                        const deviceConstraint = { exact: microphoneDevice.deviceId };
                        
                        micMediaStream = await navigator.mediaDevices.getUserMedia({
                            audio: {
                                deviceId: deviceConstraint,
                                sampleRate: SAMPLE_RATE,
                                channelCount: 1,
                                // BLEEDING TEST: Disable browser echo cancellation (may cause feedback but tests contamination) 
                                echoCancellation: false,
                                noiseSuppression: true,
                                autoGainControl: true,
                                // Critical: Suppress any local audio playback from being captured
                                suppressLocalAudioPlayback: true,
                                // Enhanced constraints to prevent system audio mixing
                                googEchoCancellation: true,
                                googAutoGainControl: true,
                                googNoiseSuppression: true,
                                googHighpassFilter: true,
                                googAudioMirroring: false,
                                // Additional constraints to prevent system audio capture
                                googTypingNoiseDetection: false,
                                googBeamforming: false,
                                googArrayGeometry: false,
                                googExperimentalEchoCancellation: true,
                                googDAEchoCancellation: true,
                                // Force microphone-only input (no system audio mixing)
                                mediaSource: 'microphone'
                            }
                        });
                        
                        logger.info('[AUDIO] Microphone stream recreated successfully');
                    } catch (micError) {
                        logger.error('Failed to get new microphone stream:', micError);
                        throw micError;
                    }
                    
                    // Restart audio processing using proper setup function
                    if (window.listenCapture.pausedStreams?.audioProcessor || !audioProcessor) {
                        logger.debug('Setting up audio processing...');
                        
                        try {
                            // Use the proper setupMicProcessing function that handles AEC and fallbacks
                            const setupResult = await setupMicProcessing(micMediaStream);
                            audioContext = setupResult.context;
                            audioProcessor = setupResult.processor;
                            
                            logger.info('[AUDIO] Audio processing setup complete');
                        } catch (setupError) {
                            logger.error('Audio processing setup failed:', setupError);
                            throw setupError;
                        }
                    }
                }
                
                // Restart system audio processing if it was preserved during pause
                if (window.listenCapture.pausedStreams?.mediaStream && mediaStream) {
                    logger.debug('Reconnecting system audio processing...');
                    
                    try {
                        // Check if system audio tracks are still active
                        const systemTracks = mediaStream.getAudioTracks().filter(track => 
                            !track.label.toLowerCase().includes('microphone') && 
                            !track.label.toLowerCase().includes('mic') &&
                            !track.label.toLowerCase().includes('default')
                        );
                        
                        if (systemTracks.length > 0 && systemTracks[0].readyState === 'live') {
                            // Restart system audio processing
                            if (!systemAudioContext || systemAudioContext.state === 'closed') {
                                const { context, processor } = setupSystemAudioProcessing(mediaStream);
                                systemAudioContext = context;
                                systemAudioProcessor = processor;
                                logger.info('[AUDIO] System audio processing resumed');
                            }
                        } else {
                            logger.debug('System audio tracks not available for resumption');
                        }
                    } catch (systemError) {
                        logger.warn('Failed to restart system audio processing:', systemError);
                        // Continue without system audio - microphone still works
                    }
                }
                
                // Clear the paused streams storage
                if (window.listenCapture.pausedStreams) {
                    delete window.listenCapture.pausedStreams;
                }
                
                logger.info('[AUDIO] Microphone and system audio stream resume completed');
                
            } catch (error) {
                logger.error('Failed to recreate microphone stream:', error);
                
                // Clear paused streams on failure
                if (window.listenCapture.pausedStreams) {
                    delete window.listenCapture.pausedStreams;
                }
                
                throw error;
            }
        });
        
        // Initialize audio capture when Listen view loads
        window.addEventListener('DOMContentLoaded', async () => {
            // Wait for STT session to be ready, then start audio capture
            setTimeout(async () => {
                try {
                    const sessionActive = await window.api.listenCapture.isSessionActive();
                    if (sessionActive && !micMediaStream && !mediaStream) {
                        logger.info('🎤 [ListenCapture] Auto-starting audio capture for Listen view');
                        await startCapture();
                    }
                } catch (error) {
                    logger.warn('[WARNING] [ListenCapture] Auto-start audio capture failed:', error.message);
                }
            }, 1000); // Give STT session time to initialize
        });

        // Add IPC listeners for Windows system audio capture
        window.api.on('start-system-audio-capture', async () => {
            logger.info('[AUDIO] [ListenCapture] Received start-system-audio-capture - Starting Windows system audio capture');
            
            try {
                if (systemAudioContext && systemAudioProcessor) {
                    logger.info('[WARNING] System audio capture already active, skipping...');
                    return;
                }
                
                // Start Windows native loopback audio capture
                mediaStream = await navigator.mediaDevices.getDisplayMedia({
                    video: true, // Required for getDisplayMedia to work with audio
                    audio: true // Use native loopback audio
                });
                
                // Verify we got audio tracks
                const audioTracks = mediaStream.getAudioTracks();
                if (audioTracks.length === 0) {
                    throw new Error('No audio track in Windows system audio stream');
                }
                
                logger.info('[AUDIO] Windows system audio stream acquired');
                
                // Setup system audio processing
                const { context, processor } = setupSystemAudioProcessing(mediaStream);
                systemAudioContext = context;
                systemAudioProcessor = processor;
                
                logger.info('[OK] Windows system audio capture started successfully');
                
            } catch (error) {
                logger.error('[ERROR] Failed to start Windows system audio capture:', error);
                logger.error('[ERROR] Error details:', { 
                    message: error.message, 
                    name: error.name,
                    code: error.code
                });
                
                // Provide helpful error context
                if (error.name === 'NotAllowedError' || error.message.includes('Permission denied')) {
                    logger.warn('[WARNING] System audio capture permission denied. User may have canceled the screen sharing dialog.');
                } else if (error.name === 'NotFoundError' || error.message.includes('No audio track')) {
                    logger.warn('[WARNING] No system audio sources available. System audio may be muted or no applications playing audio.');
                } else if (error.name === 'NotSupportedError') {
                    logger.warn('[WARNING] System audio capture not supported on this system configuration.');
                } else {
                    logger.warn('[WARNING] System audio capture failed with unknown error. Microphone-only mode will continue to work.');
                }
                
                // Clean up on failure
                if (systemAudioContext) {
                    try { systemAudioContext.close(); } catch (e) {}
                    systemAudioContext = null;
                }
                if (systemAudioProcessor) {
                    try { systemAudioProcessor.disconnect(); } catch (e) {}
                    systemAudioProcessor = null;
                }
                if (mediaStream) {
                    try { 
                        mediaStream.getTracks().forEach(track => track.stop()); 
                    } catch (e) {}
                    mediaStream = null;
                }
                
                logger.debug('System audio capture failed, but microphone capture will continue to work normally.');
            }
        });
        
        window.api.on('stop-system-audio-capture', () => {
            logger.info('🔇 [ListenCapture] Received stop-system-audio-capture - Stopping Windows system audio capture');
            
            // Clean up system audio resources
            if (systemAudioProcessor) {
                systemAudioProcessor.disconnect();
                systemAudioProcessor = null;
            }
            
            if (systemAudioContext) {
                systemAudioContext.close();
                systemAudioContext = null;
            }
            
            // Stop system audio stream tracks
            if (mediaStream) {
                mediaStream.getAudioTracks().forEach((track, index) => {
                    track.stop();
                });
                mediaStream = null;
            }
            
            // Clear system audio buffer
            systemAudioBuffer = [];
            
            logger.info('Windows system audio capture stopped successfully');
        });
        
        logger.info('[ListenCapture] IPC listeners for microphone pause/resume and Windows system audio added');
    }
} 