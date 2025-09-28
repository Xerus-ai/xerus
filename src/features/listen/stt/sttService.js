const { BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const { createSTT } = require('../../../common/ai/factory');
const modelStateService = require('../../../common/services/modelStateService');
const { notificationManager } = require('../../../main/notification-manager');
const { createLogger } = require('../../../common/services/logger.js');

const logger = createLogger('SttService');
// const { getStoredApiKey, getStoredProvider, getCurrentModelInfo } = require('../../../window/windowManager');

const COMPLETION_DEBOUNCE_MS = 500; // Reduced from 2000ms for lower latency

// ── New heartbeat / renewal constants ────────────────────────────────────────────
// Interval to send low-cost keep-alive messages so the remote service does not
// treat the connection as idle. One minute is safely below the typical 2-5 min
// idle timeout window seen on provider websockets.
const KEEP_ALIVE_INTERVAL_MS = 60 * 1000;         // 1 minute

// Interval after which we pro-actively tear down and recreate the STT sessions
// to dodge the 30-minute hard timeout enforced by some providers. 20 minutes
// gives a 10-minute safety buffer.
const SESSION_RENEW_INTERVAL_MS = 20 * 60 * 1000; // 20 minutes

// Duration to allow the old and new sockets to run in parallel so we don't
// miss any packets at the exact swap moment.
const SOCKET_OVERLAP_MS = 2 * 1000; // 2 seconds

class SttService {
    constructor() {
        this.mySttSession = null;
        this.theirSttSession = null;
        this.myCurrentUtterance = '';
        this.theirCurrentUtterance = '';
        
        // Turn-completion debouncing
        this.myCompletionBuffer = '';
        this.theirCompletionBuffer = '';
        this.myCompletionTimer = null;
        this.theirCompletionTimer = null;
        
        // System audio capture
        this.systemAudioProc = null;
        this.systemAudioPaused = false;  // Flag to pause system audio during TTS
        this.microphonePaused = false;   // Flag to pause microphone during TTS

        // Keep-alive / renewal timers
        this.keepAliveInterval = null;
        this.sessionRenewTimeout = null;
        
        
        // Callbacks
        this.onTranscriptionComplete = null;
        this.onStatusUpdate = null;

        this.modelInfo = null; 
    }

    setCallbacks({ onTranscriptionComplete, onStatusUpdate }) {
        this.onTranscriptionComplete = onTranscriptionComplete;
        this.onStatusUpdate = onStatusUpdate;
    }

    sendToRenderer(channel, data) {
        // Listen [Korean comment translated] [Korean comment translated] Listen [Korean comment translated] [Korean comment translated] (Ask [Korean comment translated] [Korean comment translated] [Korean comment translated])
        const { windowPool } = require('../../../window/windowManager');
        const listenWindow = windowPool?.get('listen');
        
        if (listenWindow && !listenWindow.isDestroyed()) {
            listenWindow.webContents.send(channel, data);
        }
    }

    async handleSendSystemAudioContent(data, mimeType) {
        const result = await this.sendSystemAudioContent(data, mimeType);
        if (result.success) {
            this.sendToRenderer('system-audio-data', { data });
        }
        return result;
    }

    flushMyCompletion() {
        const finalText = (this.myCompletionBuffer + this.myCurrentUtterance).trim();
        
        // Microphone completion flush
        
        if (!this.modelInfo || !finalText) return;

        if (this.microphonePaused) {
            this.myCompletionBuffer = '';
            this.myCompletionTimer = null;
            this.myCurrentUtterance = '';
            return;
        }

        // Complete microphone transcription

        // Notify completion callback with correct speaker identification
        if (this.onTranscriptionComplete) {
            this.onTranscriptionComplete('user', finalText); // Fixed: microphone audio should be 'user' not 'Me'
        }
        
        // Send to renderer as final
        console.log('DEBUG sending stt-update to frontend:', { speaker: 'Me', text: finalText, length: finalText.length });
        this.sendToRenderer('stt-update', {
            speaker: 'Me',
            text: finalText,
            isPartial: false,
            isFinal: true,
            timestamp: Date.now(),
        });

        // Show notification for transcription completion
        notificationManager.showSTTComplete('Me', finalText);

        this.myCompletionBuffer = '';
        this.myCompletionTimer = null;
        this.myCurrentUtterance = '';
        
        if (this.onStatusUpdate) {
            this.onStatusUpdate('Listening...');
        }
    }

    flushTheirCompletion() {
        if (this.systemAudioPaused) {
            this.theirCompletionBuffer = '';
            this.theirCompletionTimer = null;
            this.theirCurrentUtterance = '';
            return;
        }
        
        const finalText = (this.theirCompletionBuffer + this.theirCurrentUtterance).trim();
        
        // System audio completion flush
        
        if (!this.modelInfo || !finalText) return;
        
        // Complete system audio transcription
        
        // Notify completion callback with correct speaker identification
        if (this.onTranscriptionComplete) {
            this.onTranscriptionComplete('system', finalText); // Fixed: system audio should be 'system' not 'Them'
        }
        
        // Send to renderer as final (no filtering needed - agent response shows immediately)
        this.sendToRenderer('stt-update', {
            speaker: 'Them',
            text: finalText,
            isPartial: false,
            isFinal: true,
            timestamp: Date.now(),
        });

        // Show notification for transcription completion
        notificationManager.showSTTComplete('Them', finalText);

        this.theirCompletionBuffer = '';
        this.theirCompletionTimer = null;
        this.theirCurrentUtterance = '';
        
        if (this.onStatusUpdate) {
            this.onStatusUpdate('Listening...');
        }
    }

    debounceMyCompletion(text) {
        if (this.modelInfo?.provider === 'gemini') {
            this.myCompletionBuffer += text;
        } else {
            this.myCompletionBuffer += (this.myCompletionBuffer ? ' ' : '') + text;
        }

        if (this.myCompletionTimer) clearTimeout(this.myCompletionTimer);
        this.myCompletionTimer = setTimeout(() => this.flushMyCompletion(), COMPLETION_DEBOUNCE_MS);
    }

    debounceTheirCompletion(text) {
        if (this.modelInfo?.provider === 'gemini') {
            this.theirCompletionBuffer += text;
        } else {
            this.theirCompletionBuffer += (this.theirCompletionBuffer ? ' ' : '') + text;
        }

        if (this.theirCompletionTimer) clearTimeout(this.theirCompletionTimer);
        this.theirCompletionTimer = setTimeout(() => this.flushTheirCompletion(), COMPLETION_DEBOUNCE_MS);
    }

    async initializeSttSessions(language = 'en') {
        const effectiveLanguage = process.env.OPENAI_TRANSCRIBE_LANG || language || 'en';

        const modelInfo = modelStateService.getCurrentModelInfo('stt');
        logger.info('[SttService] Retrieved STT model info:', {
            hasModelInfo: !!modelInfo,
            provider: modelInfo?.provider,
            model: modelInfo?.model,
            hasApiKey: !!modelInfo?.apiKey,
            apiKeyPreview: modelInfo?.apiKey ? modelInfo.apiKey.substring(0, 8) + '...' : 'none'
        });
        
        if (!modelInfo || !modelInfo.apiKey) {
            logger.error('[SttService] STT configuration error:', {
                hasModelInfo: !!modelInfo,
                hasApiKey: !!modelInfo?.apiKey,
                provider: modelInfo?.provider
            });
            throw new Error('AI model or API key is not configured.');
        }
        this.modelInfo = modelInfo;
        logger.info(`Initializing STT for ${modelInfo.provider} using model ${modelInfo.model}`);

        const handleMyMessage = message => {
            if (this.microphonePaused) {
                return;
            }

            if (!this.modelInfo) {
                logger.info('[SttService] Ignoring message - session already closed');
                return;
            }
            
            // Enhanced debugging for incoming messages (logging removed to prevent terminal flooding)
            
            if (this.modelInfo.provider === 'whisper') {
                // Whisper STT emits 'transcription' events with different structure
                if (message.text && message.text.trim()) {
                    const finalText = message.text.trim();
                    
                    // Filter out Whisper noise transcriptions
                    const noisePatterns = [
                        '[BLANK_AUDIO]',
                        '[INAUDIBLE]',
                        '[MUSIC]',
                        '[SOUND]',
                        '[NOISE]',
                        '(BLANK_AUDIO)',
                        '(INAUDIBLE)',
                        '(MUSIC)',
                        '(SOUND)',
                        '(NOISE)'
                    ];
                    
                    const isNoise = noisePatterns.some(pattern => 
                        finalText.includes(pattern) || finalText === pattern
                    );
                    
                    
                    if (!isNoise && finalText.length > 2) {
                        this.debounceMyCompletion(finalText);
                        
                        this.sendToRenderer('stt-update', {
                            speaker: 'Me',
                            text: finalText,
                            isPartial: false,
                            isFinal: true,
                            timestamp: Date.now(),
                        });
                    } else {
                        logger.info('Filtered noise: ""');
                    }
                }
                return;
            } else if (this.modelInfo.provider === 'gemini') {
                if (!message.serverContent?.modelTurn) {
                    logger.info('[Gemini STT - Me]', JSON.stringify(message, null, 2));
                }

                if (message.serverContent?.turnComplete) {
                    if (this.myCompletionTimer) {
                        clearTimeout(this.myCompletionTimer);
                        this.flushMyCompletion();
                    }
                    return;
                }
            
                const transcription = message.serverContent?.inputTranscription;
                if (!transcription || !transcription.text) return;
                
                const textChunk = transcription.text;
                if (!textChunk.trim() || textChunk.trim() === '<noise>') {
                    return; // 1. Ignore whitespace-only chunks or noise
                }
            
                this.debounceMyCompletion(textChunk);
                
                this.sendToRenderer('stt-update', {
                    speaker: 'Me',
                    text: this.myCompletionBuffer,
                    isPartial: true,
                    isFinal: false,
                    timestamp: Date.now(),
                });
                
            // Deepgram 
            } else if (this.modelInfo.provider === 'deepgram') {
                // Handle optimized Deepgram message format
                if (message.type === 'speech_started') {
                    // Voice activity detected - prepare for incoming audio
                    return;
                } else if (message.type === 'utterance_end') {
                    // Utterance completed - finalize any pending text
                    if (this.myCompletionTimer) {
                        clearTimeout(this.myCompletionTimer);
                        this.flushMyCompletion();
                    }
                    return;
                }
                
                // Handle transcript results (both old and new format)
                const text = message.transcript || message.channel?.alternatives?.[0]?.transcript;
                if (!text || text.trim().length === 0) return;

                const isFinal = message.is_final;
                const confidence = message.confidence || message.channel?.alternatives?.[0]?.confidence || 0;

                if (isFinal) {
                    this.myCurrentUtterance = ''; 
                    this.debounceMyCompletion(text); 
                } else {
                    if (this.myCompletionTimer) clearTimeout(this.myCompletionTimer);
                    this.myCompletionTimer = null;

                    this.myCurrentUtterance = text;
                    
                    const continuousText = (this.myCompletionBuffer + ' ' + this.myCurrentUtterance).trim();

                    this.sendToRenderer('stt-update', {
                        speaker: 'Me',
                        text: continuousText,
                        isPartial: true,
                        isFinal: false,
                        confidence: confidence,
                        timestamp: Date.now(),
                    });
                }
                
            } else {
                const type = message.type;
                const text = message.transcript || message.delta || (message.alternatives && message.alternatives[0]?.transcript) || '';

                if (type === 'conversation.item.input_audio_transcription.delta') {
                    if (this.myCompletionTimer) clearTimeout(this.myCompletionTimer);
                    this.myCompletionTimer = null;
                    this.myCurrentUtterance += text;
                    const continuousText = this.myCompletionBuffer + (this.myCompletionBuffer ? ' ' : '') + this.myCurrentUtterance;
                    if (text && !text.includes('vq_lbr_audio_')) {
                        this.sendToRenderer('stt-update', {
                            speaker: 'Me',
                            text: continuousText,
                            isPartial: true,
                            isFinal: false,
                            timestamp: Date.now(),
                        });
                    }
                } else if (type === 'conversation.item.input_audio_transcription.completed') {
                    if (text && text.trim()) {
                        const finalUtteranceText = text.trim();
                        this.myCurrentUtterance = '';
                        this.debounceMyCompletion(finalUtteranceText);
                    }
                }
            }

            if (message.error) {
                logger.error('STT Session Error:', { error: message.error });
            }
        };

        const handleTheirMessage = message => {
            if (!message || typeof message !== 'object') return;

            if (this.systemAudioPaused) {
                return;
            }

            if (!this.modelInfo) {
                logger.info('[SttService] Ignoring message - session already closed');
                return;
            }
            
            // Enhanced debugging for incoming messages (logging removed to prevent terminal flooding)
            
            if (this.modelInfo.provider === 'whisper') {
                // Whisper STT emits 'transcription' events with different structure
                if (message.text && message.text.trim()) {
                    const finalText = message.text.trim();
                    
                    // Filter out Whisper noise transcriptions
                    const noisePatterns = [
                        '[BLANK_AUDIO]',
                        '[INAUDIBLE]',
                        '[MUSIC]',
                        '[SOUND]',
                        '[NOISE]',
                        '(BLANK_AUDIO)',
                        '(INAUDIBLE)',
                        '(MUSIC)',
                        '(SOUND)',
                        '(NOISE)'
                    ];
                    
                    const isNoise = noisePatterns.some(pattern => 
                        finalText.includes(pattern) || finalText === pattern
                    );
                    
                    
                    // Only process if it's not noise, not a false positive, and has meaningful content
                    if (!isNoise && finalText.length > 2) {
                        this.debounceTheirCompletion(finalText);
                        
                        this.sendToRenderer('stt-update', {
                            speaker: 'Them',
                            text: finalText,
                            isPartial: false,
                            isFinal: true,
                            timestamp: Date.now(),
                        });
                    } else {
                        logger.info('Filtered noise: ""');
                    }
                }
                return;
            } else if (this.modelInfo.provider === 'gemini') {
                if (!message.serverContent?.modelTurn) {
                    logger.info('[Gemini STT - Them]', JSON.stringify(message, null, 2));
                }

                if (message.serverContent?.turnComplete) {
                    if (this.theirCompletionTimer) {
                        clearTimeout(this.theirCompletionTimer);
                        this.flushTheirCompletion();
                    }
                    return;
                }
            
                const transcription = message.serverContent?.inputTranscription;
                if (!transcription || !transcription.text) return;

                const textChunk = transcription.text;
                if (!textChunk.trim() || textChunk.trim() === '<noise>') {
                    return; // 1. Ignore whitespace-only chunks or noise
                }

                this.debounceTheirCompletion(textChunk);
                
                this.sendToRenderer('stt-update', {
                    speaker: 'Them',
                    text: this.theirCompletionBuffer,
                    isPartial: true,
                    isFinal: false,
                    timestamp: Date.now(),
                });

            // Deepgram
            } else if (this.modelInfo.provider === 'deepgram') {
                // Handle optimized Deepgram message format
                if (message.type === 'speech_started') {
                    // Voice activity detected - prepare for incoming audio
                    return;
                } else if (message.type === 'utterance_end') {
                    // Utterance completed - finalize any pending text
                    if (this.theirCompletionTimer) {
                        clearTimeout(this.theirCompletionTimer);
                        this.flushTheirCompletion();
                    }
                    return;
                }
                
                // Handle transcript results (both old and new format)
                const text = message.transcript || message.channel?.alternatives?.[0]?.transcript;
                if (!text || text.trim().length === 0) return;

                const isFinal = message.is_final;
                const confidence = message.confidence || message.channel?.alternatives?.[0]?.confidence || 0;

                if (isFinal) {
                    this.theirCurrentUtterance = ''; 
                    this.debounceTheirCompletion(text); 
                } else {
                    if (this.theirCompletionTimer) clearTimeout(this.theirCompletionTimer);
                    this.theirCompletionTimer = null;

                    this.theirCurrentUtterance = text;
                    
                    const continuousText = (this.theirCompletionBuffer + ' ' + this.theirCurrentUtterance).trim();

                    this.sendToRenderer('stt-update', {
                        speaker: 'Them',
                        text: continuousText,
                        isPartial: true,
                        isFinal: false,
                        confidence: confidence,
                        timestamp: Date.now(),
                    });
                }

            } else {
                const type = message.type;
                const text = message.transcript || message.delta || (message.alternatives && message.alternatives[0]?.transcript) || '';
                if (type === 'conversation.item.input_audio_transcription.delta') {
                    if (this.theirCompletionTimer) clearTimeout(this.theirCompletionTimer);
                    this.theirCompletionTimer = null;
                    this.theirCurrentUtterance += text;
                    const continuousText = this.theirCompletionBuffer + (this.theirCompletionBuffer ? ' ' : '') + this.theirCurrentUtterance;
                    if (text && !text.includes('vq_lbr_audio_')) {
                        this.sendToRenderer('stt-update', {
                            speaker: 'Them',
                            text: continuousText,
                            isPartial: true,
                            isFinal: false,
                            timestamp: Date.now(),
                        });
                    }
                } else if (type === 'conversation.item.input_audio_transcription.completed') {
                    if (text && text.trim()) {
                        const finalUtteranceText = text.trim();
                        this.theirCurrentUtterance = '';
                        this.debounceTheirCompletion(finalUtteranceText);
                    }
                }
            }
            
            if (message.error) {
                logger.error('STT Session Error:', { error: message.error });
            }
        };

        const mySttConfig = {
            language: effectiveLanguage,
            callbacks: {
                onmessage: handleMyMessage,
                onerror: error => logger.error('My STT session error:', { message: error.message }),
                onclose: event => logger.info('My STT session closed:', event.reason),
            },
        };
        
        const theirSttConfig = {
            language: effectiveLanguage,
            callbacks: {
                onmessage: handleTheirMessage,
                onerror: error => logger.error('Their STT session error:', { message: error.message }),
                onclose: event => logger.info('Their STT session closed:', event.reason),
            },
        };
        
        // Provider-specific options to avoid parameter conflicts
        let sttOptions = {
            apiKey: this.modelInfo.apiKey,
            language: effectiveLanguage,
        };
        
        // Add provider-specific parameters
        if (this.modelInfo.provider === 'openai-glass') {
            sttOptions.usePortkey = true;
            sttOptions.portkeyVirtualKey = this.modelInfo.apiKey;
        } else if (this.modelInfo.provider === 'whisper') {
            // Whisper-specific options
            sttOptions.sessionType = 'whisper'; // Will be overridden per session
        } else if (this.modelInfo.provider === 'deepgram') {
            // Deepgram-specific options
            sttOptions.sampleRate = 24000;
        }

        // Add sessionType for Whisper to distinguish between My and Their sessions
        const myOptions = { 
            ...sttOptions, 
            callbacks: mySttConfig.callbacks, 
            sessionType: this.modelInfo.provider === 'whisper' ? 'my' : undefined 
        };
        const theirOptions = { 
            ...sttOptions, 
            callbacks: theirSttConfig.callbacks, 
            sessionType: this.modelInfo.provider === 'whisper' ? 'their' : undefined 
        };

        logger.info('[LOADING] Creating STT sessions...', {
            provider: this.modelInfo.provider,
            language: effectiveLanguage
        });

        // [TOOL] Add timeout to prevent hanging on first initialization
        const createWithTimeout = (provider, options, sessionName) => {
            return Promise.race([
                createSTT(provider, options),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error(`${sessionName} STT session creation timeout after 10s`)), 10000)
                )
            ]).catch(error => {
                logger.error(`[ERROR] ${sessionName} STT session creation failed:`, { error: error.message });
                throw error;
            });
        };

        [this.mySttSession, this.theirSttSession] = await Promise.all([
            createWithTimeout(this.modelInfo.provider, myOptions, 'My'),
            createWithTimeout(this.modelInfo.provider, theirOptions, 'Their'),
        ]);

        logger.info('[OK] Both STT sessions initialized successfully:', {
            mySttSession: !!this.mySttSession,
            theirSttSession: !!this.theirSttSession,
            provider: this.modelInfo.provider
        });

        // ── Setup keep-alive heart-beats ────────────────────────────────────────
        if (this.keepAliveInterval) clearInterval(this.keepAliveInterval);
        this.keepAliveInterval = setInterval(() => {
            this._sendKeepAlive();
        }, KEEP_ALIVE_INTERVAL_MS);

        // ── Schedule session auto-renewal ───────────────────────────────────────
        if (this.sessionRenewTimeout) clearTimeout(this.sessionRenewTimeout);
        this.sessionRenewTimeout = setTimeout(async () => {
            try {
                logger.info('[SttService] Auto-renewing STT sessions…');
                await this.renewSessions(effectiveLanguage);
            } catch (err) {
                logger.error('[SttService] Failed to renew STT sessions:', err);
            }
        }, SESSION_RENEW_INTERVAL_MS);

        return true;
    }

    /**
     * Send a lightweight keep-alive to prevent idle disconnects.
     * Currently only implemented for OpenAI provider because Gemini's SDK
     * already performs its own heart-beats.
     */
    _sendKeepAlive() {
        if (!this.isSessionActive()) return;

        if (this.modelInfo?.provider === 'openai') {
            try {
                this.mySttSession?.keepAlive?.();
                this.theirSttSession?.keepAlive?.();
            } catch (err) {
                logger.error('[SttService] keepAlive error:', err.message);
            }
        }
    }

    /**
     * Gracefully tears down then recreates the STT sessions. Should be invoked
     * on a timer to avoid provider-side hard timeouts.
     */
    async renewSessions(language = 'en') {
        if (!this.isSessionActive()) {
            logger.warn('[SttService] renewSessions called but no active session.');
            return;
        }

        const oldMySession = this.mySttSession;
        const oldTheirSession = this.theirSttSession;

        logger.info('[SttService] Spawning fresh STT sessions in the background…');

        // We reuse initializeSttSessions to create fresh sessions with the same
        // language and handlers. The method will update the session pointers
        // and timers, but crucially it does NOT touch the system audio capture
        // pipeline, so audio continues flowing uninterrupted.
        await this.initializeSttSessions(language);

        // Close the old sessions after a short overlap window.
        setTimeout(() => {
            try {
                oldMySession?.close?.();
                oldTheirSession?.close?.();
                logger.info('[SttService] Old STT sessions closed after hand-off.');
            } catch (err) {
                logger.error('[SttService] Error closing old STT sessions:', err.message);
            }
        }, SOCKET_OVERLAP_MS);
    }

    async sendMicAudioContent(data, mimeType) {
        // Enhanced debugging for microphone audio processing
        // Audio chunk processing (debug logging removed to prevent terminal flooding)
        
        if (!this.mySttSession) {
            // Only log warning occasionally to avoid spam during shutdown
            if (Math.random() < 0.1) { // Log ~10% of ignored audio chunks
                logger.warn('Microphone audio ignored - STT session not active yet (buffered audio during shutdown/startup)');
            }
            return { success: false, error: 'STT session not active' };
        }

        let modelInfo = this.modelInfo;
        if (!modelInfo) {
            logger.warn('modelInfo not found, fetching on-the-fly as a fallback...');
            modelInfo = modelStateService.getCurrentModelInfo('stt');
        }
        if (!modelInfo) {
            return { success: false, error: 'STT model info could not be retrieved' };
        }

        let payload;
        try {
            if (modelInfo.provider === 'gemini') {
                payload = { audio: { data, mimeType: mimeType || 'audio/pcm;rate=24000' } };
            } else if (modelInfo.provider === 'deepgram') {
                // Deepgram expects raw audio buffer, not base64
                payload = Buffer.from(data, 'base64'); 
                // Deepgram payload prepared (debug logging removed to prevent terminal flooding)
            } else {
                // OpenAI and others expect base64 string directly
                payload = data;
            }

            await this.mySttSession.sendRealtimeInput(payload);
            // Microphone audio sent to STT session (debug logging removed to prevent terminal flooding)
            return { success: true };
        } catch (error) {
            logger.error('[SttService] [ERROR] Error sending microphone audio to STT session:', { 
                error: error.message,
                provider: modelInfo.provider,
                dataType: typeof data,
                payloadType: typeof payload
            });
            return { success: false, error: error.message };
        }
    }

    async sendSystemAudioContent(data, mimeType) {
        if (!this.theirSttSession) {
            logger.warn('System audio ignored - Their STT session not active yet', {
                theirSttSession: !!this.theirSttSession,
                mySttSession: !!this.mySttSession,
                modelInfo: !!this.modelInfo
            });
            return { success: false, error: 'Their STT session not active' };
        }

        let modelInfo = this.modelInfo;
        if (!modelInfo) {
            logger.warn('modelInfo not found, fetching on-the-fly as a fallback...');
            modelInfo = modelStateService.getCurrentModelInfo('stt');
        }
        if (!modelInfo) {
            return { success: false, error: 'STT model info could not be retrieved' };
        }

        let payload;
        if (modelInfo.provider === 'gemini') {
            payload = { audio: { data, mimeType: mimeType || 'audio/pcm;rate=24000' } };
        } else if (modelInfo.provider === 'deepgram') {
            payload = Buffer.from(data, 'base64');
        } else {
            payload = data;
        }

        try {
            await this.theirSttSession.sendRealtimeInput(payload);
            return { success: true };
        } catch (error) {
            logger.error('Error sending system audio to STT session:', { error: error.message });
            return { success: false, error: error.message };
        }
    }

    killExistingSystemAudioDump() {
        return new Promise(resolve => {
            logger.info('Checking for existing SystemAudioDump processes...');

            const killProc = spawn('pkill', ['-f', 'SystemAudioDump'], {
                stdio: 'ignore',
            });

            killProc.on('close', code => {
                if (code === 0) {
                    logger.info('Killed existing SystemAudioDump processes');
                } else {
                    logger.info('No existing SystemAudioDump processes found');
                }
                resolve();
            });

            killProc.on('error', err => {
                logger.info('Error checking for existing processes (this is normal):', err.message);
                resolve();
            });

            setTimeout(() => {
                killProc.kill();
                resolve();
            }, 2000);
        });
    }

    async startParallelAudioCapture() {
        logger.info('Starting parallel audio capture for both microphone and system audio...');
        
        // Start both microphone and system audio capture simultaneously
        const promises = [];
        
        // Always start system audio capture if available
        if (process.platform === 'darwin') {
            promises.push(this.startMacOSAudioCapture().catch(error => {
                logger.warn('System audio capture failed but continuing with microphone:', error);
                return false;
            }));
        } else if (process.platform === 'win32') {
            // For Windows, start browser-based system audio capture
            promises.push(this.startWindowsSystemAudioCapture().catch(error => {
                logger.warn('Windows system audio capture failed but continuing with microphone:', error);
                return false;
            }));
        }
        
        // Note: Microphone capture is handled by the renderer process (listenCapture.js)
        // This just ensures STT sessions are ready for both streams
        
        const results = await Promise.allSettled(promises);
        logger.info('Parallel audio capture initialization results:', {
            systemAudio: results[0]?.status === 'fulfilled' && results[0]?.value
        });
        
        return true;
    }

    async startMacOSAudioCapture() {
        if (process.platform !== 'darwin' || !this.theirSttSession) return false;

        await this.killExistingSystemAudioDump();
        logger.info('Starting macOS audio capture for "Them"...');

        const { app } = require('electron');
        const path = require('path');
        const systemAudioPath = app.isPackaged
            ? path.join(process.resourcesPath, 'app.asar.unpacked', 'src', 'ui', 'assets', 'SystemAudioDump')
            : path.join(app.getAppPath(), 'src', 'ui', 'assets', 'SystemAudioDump');

        logger.info('SystemAudioDump path:', systemAudioPath);

        this.systemAudioProc = spawn(systemAudioPath, [], {
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        if (!this.systemAudioProc.pid) {
            logger.error('Failed to start SystemAudioDump');
            return false;
        }

        logger.info('SystemAudioDump started with PID:', this.systemAudioProc.pid);

        const CHUNK_DURATION = 0.025; // Ultra-low latency: 25ms chunks
        const SAMPLE_RATE = 24000;
        const BYTES_PER_SAMPLE = 2;
        const CHANNELS = 2;
        const CHUNK_SIZE = SAMPLE_RATE * BYTES_PER_SAMPLE * CHANNELS * CHUNK_DURATION;

        let audioBuffer = Buffer.alloc(0);

        // const provider = await this.getAiProvider();
        // const isGemini = provider === 'gemini';

        let modelInfo = this.modelInfo;
        if (!modelInfo) {
            logger.warn('modelInfo not found, fetching on-the-fly as a fallback...');
            modelInfo = modelStateService.getCurrentModelInfo('stt');
        }
        if (!modelInfo) {
            throw new Error('STT model info could not be retrieved.');
        }

        this.systemAudioProc.stdout.on('data', async data => {
            audioBuffer = Buffer.concat([audioBuffer, data]);

            while (audioBuffer.length >= CHUNK_SIZE) {
                const chunk = audioBuffer.slice(0, CHUNK_SIZE);
                audioBuffer = audioBuffer.slice(CHUNK_SIZE);

                const monoChunk = CHANNELS === 2 ? this.convertStereoToMono(chunk) : chunk;
                const base64Data = monoChunk.toString('base64');

                this.sendToRenderer('system-audio-data', { data: base64Data });

                if (this.theirSttSession) {
                    try {
                        let payload;
                        if (modelInfo.provider === 'gemini') {
                            payload = { audio: { data: base64Data, mimeType: 'audio/pcm;rate=24000' } };
                        } else if (modelInfo.provider === 'deepgram') {
                            payload = Buffer.from(base64Data, 'base64');
                        } else {
                            payload = base64Data;
                        }

                        await this.theirSttSession.sendRealtimeInput(payload);
                    } catch (err) {
                        logger.error('Error sending system audio:', err.message);
                    }
                }
            }
        });

        this.systemAudioProc.stderr.on('data', data => {
            logger.error('SystemAudioDump stderr:', data.toString());
        });

        this.systemAudioProc.on('close', code => {
            logger.info('SystemAudioDump process closed with code:', code);
            this.systemAudioProc = null;
        });

        this.systemAudioProc.on('error', err => {
            logger.error('Error occurred:', { error: err });
            this.systemAudioProc = null;
        });

        return true;
    }

    async startWindowsSystemAudioCapture() {
        if (process.platform !== 'win32' || !this.theirSttSession) return false;

        logger.info('Starting Windows system audio capture for "Them"...');

        // Send message to renderer to start system audio capture using browser APIs
        this.sendToRenderer('start-system-audio-capture', {});
        
        // Add minimal delay to allow renderer to process the start request
        await new Promise(resolve => setTimeout(resolve, 10));
        
        logger.info('[OK] Windows system audio capture request sent to renderer');
        return true;
    }

    async stopWindowsSystemAudioCapture() {
        logger.info('Stopping Windows system audio capture...');
        this.sendToRenderer('stop-system-audio-capture', {});
        
        // Add minimal delay to allow renderer to process the stop request
        await new Promise(resolve => setTimeout(resolve, 5));
        
        logger.info('[OK] Windows system audio stop request sent to renderer');
    }

    convertStereoToMono(stereoBuffer) {
        const samples = stereoBuffer.length / 4;
        const monoBuffer = Buffer.alloc(samples * 2);

        for (let i = 0; i < samples; i++) {
            const leftSample = stereoBuffer.readInt16LE(i * 4);
            monoBuffer.writeInt16LE(leftSample, i * 2);
        }

        return monoBuffer;
    }

    stopMacOSAudioCapture() {
        if (this.systemAudioProc) {
            logger.info('Stopping SystemAudioDump...');
            this.systemAudioProc.kill('SIGTERM');
            this.systemAudioProc = null;
        }
    }

    // TTS Audio Interference Prevention Methods
    async pauseSystemAudioCapture() {
        try {
            this.systemAudioPaused = true;
            
            // Platform-specific pause logic
            if (process.platform === 'darwin') {
                // macOS: Stop SystemAudioDump process
                if (this.systemAudioProc) {
                    logger.info('🔇 [CRITICAL] Temporarily stopping SystemAudioDump process during TTS');
                    this.systemAudioProc.kill('SIGTERM');
                    this.systemAudioProc = null;
                    this.systemAudioWasRunning = true; // Flag to restart it later
                }
            } else if (process.platform === 'win32') {
                // Windows: Stop browser-based system audio capture
                logger.info('🔇 [CRITICAL] Stopping Windows system audio capture during TTS');
                await this.stopWindowsSystemAudioCapture();
                this.systemAudioWasRunning = true; // Flag to restart it later
            }
            
            logger.info('🔇 System audio capture paused for TTS playback');
            return { success: true };
        } catch (error) {
            logger.error('🔇 Failed to pause system audio capture:', error.message);
            return { success: false, error: error.message };
        }
    }

    async resumeSystemAudioCapture() {
        try {
            this.systemAudioPaused = false;
            
            // CRITICAL: Restart SystemAudioDump process if it was previously running (works on both macOS and Windows)
            if (this.systemAudioWasRunning && this.theirSttSession) {
                logger.info('[AUDIO] [CRITICAL] Restarting SystemAudioDump process after TTS');
                this.systemAudioWasRunning = false;
                
                // Restart the system audio capture - platform-specific
                if (process.platform === 'darwin') {
                    await this.startMacOSAudioCapture();
                } else if (process.platform === 'win32') {
                    await this.startWindowsSystemAudioCapture();
                }
            }
            
            logger.info('[AUDIO] System audio capture resumed after TTS playback');
            return { success: true };
        } catch (error) {
            logger.error('[AUDIO] Failed to resume system audio capture:', error.message);
            return { success: false, error: error.message };
        }
    }

    async pauseMicrophoneCapture() {
        try {
            logger.info('🔇 [STT SERVICE] Pausing microphone capture for TTS');
            this.microphonePaused = true;
            
            // Actually pause the microphone MediaStream in renderer
            this.sendToRenderer('pause-microphone-stream', {});
            
            // Add minimal delay to allow renderer to process the pause request
            await new Promise(resolve => setTimeout(resolve, 5));
            
            logger.info('🔇 Microphone capture paused for TTS playback');
            return { success: true };
        } catch (error) {
            logger.error('🔇 Failed to pause microphone capture:', error.message);
            return { success: false, error: error.message };
        }
    }

    async resumeMicrophoneCapture() {
        try {
            this.microphonePaused = false;
            
            // Actually resume the microphone MediaStream in renderer
            this.sendToRenderer('resume-microphone-stream', {});
            
            // Add minimal delay to allow renderer to process the resume request
            await new Promise(resolve => setTimeout(resolve, 10));
            
            logger.info('[AUDIO] Microphone capture resumed after TTS playback');
            return { success: true };
        } catch (error) {
            logger.error('[AUDIO] Failed to resume microphone capture:', error.message);
            return { success: false, error: error.message };
        }
    }


    // REMOVED: Complex TTS audio filtering - no longer needed since agent responses show immediately in transcript

    /**
     * Restart microphone STT session to ensure responsiveness after TTS playback
     * This fixes the issue where STT gets stuck after the first transcript
     */
    async restartMicrophoneSTTSession() {
        logger.info('[SttService] [LOADING] Restarting microphone STT session after TTS playback...');
        
        try {
            // Store current session state
            const wasActive = !!this.mySttSession;
            
            if (!wasActive) {
                logger.warn('[SttService] No active microphone STT session to restart');
                return { success: true, message: 'No session to restart' };
            }
            
            // Close current session gracefully
            if (this.mySttSession) {
                try {
                    await this.mySttSession.close();
                    logger.info('[SttService] 🔚 Previous microphone STT session closed');
                } catch (closeError) {
                    logger.warn('[SttService] [WARNING] Error closing previous STT session:', closeError.message);
                }
                this.mySttSession = null;
            }
            
            // Small delay to ensure clean session closure
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Restart session with current configuration
            const modelInfo = this.modelInfo || modelStateService.getCurrentModelInfo('stt');
            if (!modelInfo || !modelInfo.apiKey) {
                throw new Error('STT model configuration not available for restart');
            }
            
            // Recreate the "My" STT session using the same logic as initialization
            logger.info('[SttService] 🎤 Creating new microphone STT session...');
            
            const handleMyMessage = message => {
                if (this.microphonePaused) {
                    return;
                }

                if (!this.modelInfo) {
                    logger.info('[SttService] Ignoring message - session already closed');
                    return;
                }
                
                if (this.modelInfo.provider === 'whisper') {
                    if (message.text && message.text.trim()) {
                        const finalText = message.text.trim();
                        
                        const noisePatterns = [
                            '[BLANK_AUDIO]', '[INAUDIBLE]', '[MUSIC]', '[SOUND]', '[NOISE]',
                            '(BLANK_AUDIO)', '(INAUDIBLE)', '(MUSIC)', '(SOUND)', '(NOISE)'
                        ];
                        
                        const isNoise = noisePatterns.some(pattern => 
                            finalText.includes(pattern) || finalText === pattern
                        );
                        
                        if (!isNoise && finalText.length > 2) {
                            this.debounceMyCompletion(finalText);
                            
                            this.sendToRenderer('stt-update', {
                                speaker: 'Me',
                                text: finalText,
                                isPartial: false,
                                isFinal: true,
                                timestamp: Date.now(),
                            });
                        }
                    }
                    return;
                } else if (this.modelInfo.provider === 'gemini') {
                    if (message.serverContent?.turnComplete) {
                        if (this.myCompletionTimer) {
                            clearTimeout(this.myCompletionTimer);
                            this.flushMyCompletion();
                        }
                        return;
                    }
                
                    const transcription = message.serverContent?.inputTranscription;
                    if (!transcription || !transcription.text) return;
                    
                    const textChunk = transcription.text;
                    if (!textChunk.trim() || textChunk.trim() === '<noise>') {
                        return;
                    }
                
                    this.debounceMyCompletion(textChunk);
                    
                    this.sendToRenderer('stt-update', {
                        speaker: 'Me',
                        text: this.myCompletionBuffer,
                        isPartial: true,
                        isFinal: false,
                        timestamp: Date.now(),
                    });
                    
                } else if (this.modelInfo.provider === 'deepgram') {
                    if (message.type === 'speech_started') {
                        return;
                    } else if (message.type === 'utterance_end') {
                        if (this.myCompletionTimer) {
                            clearTimeout(this.myCompletionTimer);
                            this.flushMyCompletion();
                        }
                        return;
                    }
                    
                    const text = message.transcript || message.channel?.alternatives?.[0]?.transcript;
                    if (!text || text.trim().length === 0) return;

                    const isFinal = message.is_final;
                    const confidence = message.confidence || message.channel?.alternatives?.[0]?.confidence || 0;

                    if (isFinal && confidence > 0.5 && text.trim().length > 1) {
                        this.debounceMyCompletion(text.trim());
                    }
                    
                    this.sendToRenderer('stt-update', {
                        speaker: 'Me',
                        text: isFinal ? this.myCompletionBuffer : text,
                        isPartial: !isFinal,
                        isFinal,
                        confidence,
                        timestamp: Date.now(),
                    });
                }
                
                if (message.error) {
                    logger.error('STT Session Error:', { error: message.error });
                }
            };

            const mySttConfig = {
                language: this.modelInfo.language || 'en',
                callbacks: {
                    onmessage: handleMyMessage,
                    onerror: error => logger.error('My STT session error:', { message: error.message }),
                    onclose: event => logger.info('My STT session closed:', event.reason),
                },
            };
            
            let sttOptions = {
                apiKey: modelInfo.apiKey,
                language: this.modelInfo.language || 'en',
                callbacks: mySttConfig.callbacks,
            };
            
            if (modelInfo.provider === 'openai-glass') {
                sttOptions.usePortkey = true;
                sttOptions.portkeyVirtualKey = modelInfo.apiKey;
            } else if (modelInfo.provider === 'whisper') {
                sttOptions.sessionType = 'my';
            } else if (modelInfo.provider === 'deepgram') {
                sttOptions.sampleRate = 24000;
            }

            this.mySttSession = await Promise.race([
                createSTT(modelInfo.provider, sttOptions),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Microphone STT session restart timeout after 10s')), 10000)
                )
            ]);
            
            if (this.mySttSession) {
                logger.info('[SttService] [OK] Microphone STT session successfully restarted');
                return { success: true, message: 'STT session restarted successfully' };
            } else {
                throw new Error('Failed to create new STT session');
            }
            
        } catch (error) {
            logger.error('[SttService] [ERROR] Failed to restart microphone STT session:', error);
            return { success: false, error: error.message };
        }
    }

    isSessionActive() {
        const myActive = !!this.mySttSession;
        const theirActive = !!this.theirSttSession;
        const overallActive = myActive && theirActive;
        
        if (!overallActive) {
            // logger.warn('[SttService] Session not fully active:', {
            //     mySttSession: myActive,
            //     theirSttSession: theirActive,
            //     overallActive: overallActive
            // });
        }
        
        return overallActive;
    }

    async closeSessions() {
        // Stop system audio capture directly
        this.stopMacOSAudioCapture();

        // Clear heartbeat / renewal timers
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
        }
        if (this.sessionRenewTimeout) {
            clearTimeout(this.sessionRenewTimeout);
            this.sessionRenewTimeout = null;
        }

        // Clear timers
        if (this.myCompletionTimer) {
            clearTimeout(this.myCompletionTimer);
            this.myCompletionTimer = null;
        }
        if (this.theirCompletionTimer) {
            clearTimeout(this.theirCompletionTimer);
            this.theirCompletionTimer = null;
        }

        const closePromises = [];
        if (this.mySttSession) {
            closePromises.push(this.mySttSession.close());
            this.mySttSession = null;
        }
        if (this.theirSttSession) {
            closePromises.push(this.theirSttSession.close());
            this.theirSttSession = null;
        }

        await Promise.all(closePromises);
        logger.info('All STT sessions closed.');

        // Reset state
        this.myCurrentUtterance = '';
        this.theirCurrentUtterance = '';
        this.myCompletionBuffer = '';
        this.theirCompletionBuffer = '';
        this.modelInfo = null; 
    }
}

module.exports = SttService; 