const { createLogger } = require('../../services/logger.js');

const logger = createLogger('Whisper');
let spawn, path, EventEmitter;

if (typeof window === 'undefined') {
    spawn = require('child_process').spawn;
    path = require('path');
    EventEmitter = require('events').EventEmitter;
} else {
    class DummyEventEmitter {
        on() {}
        emit() {}
        removeAllListeners() {}
    }
    EventEmitter = DummyEventEmitter;
}

class WhisperSTTSession extends EventEmitter {
    constructor(model, whisperService, sessionId) {
        super();
        this.model = model;
        this.whisperService = whisperService;
        this.sessionId = sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.process = null;
        this.isRunning = false;
        this.audioBuffer = Buffer.alloc(0);
        this.processingInterval = null;
        this.lastTranscription = '';
    }

    async initialize() {
        try {
            await this.whisperService.ensureModelAvailable(this.model);
            this.isRunning = true;
            this.startProcessingLoop();
            return true;
        } catch (error) {
            logger.error('Initialization error:', { error });
            this.emit('error', error);
            return false;
        }
    }

    startProcessingLoop() {
        this.processingInterval = setInterval(async () => {
            // Safety check: only process if session is running and properly initialized
            if (!this.isRunning || !this.whisperService) {
                return;
            }
            
            const minBufferSize = 24000 * 2 * 0.15;
            if (this.audioBuffer.length >= minBufferSize && !this.process) {
                logger.info('Processing audio chunk, buffer size:', this.audioBuffer.length);
                await this.processAudioChunk();
            }
        }, 1500);
    }

    async processAudioChunk() {
        if (!this.isRunning || this.audioBuffer.length === 0) return;

        const audioData = this.audioBuffer;
        this.audioBuffer = Buffer.alloc(0);

        try {
            const tempFile = await this.whisperService.saveAudioToTemp(audioData, this.sessionId);
            
            if (!tempFile || typeof tempFile !== 'string') {
                logger.error('Invalid temp file path:', { tempFile });
                return;
            }
            
            const whisperPath = await this.whisperService.getWhisperPath();
            const modelPath = await this.whisperService.getModelPath(this.model);

            if (!whisperPath || !modelPath) {
                logger.error('Invalid whisper or model path:', { whisperPath, modelPath });
                return;
            }

            this.process = spawn(whisperPath, [
                '-m', modelPath,
                '-f', tempFile,
                '--no-timestamps',
                '--output-txt',
                '--output-json',
                '--language', 'auto',
                '--threads', '4',
                '--print-progress', 'false'
            ]);

            let output = '';
            let errorOutput = '';

            this.process.stdout.on('data', (data) => {
                output += data.toString();
            });

            this.process.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });

            this.process.on('close', async (code) => {
                this.process = null;
                
                if (code === 0 && output.trim()) {
                    const transcription = output.trim();
                    if (transcription && transcription !== this.lastTranscription) {
                        this.lastTranscription = transcription;
                        logger.info('Transcription: ""');
                        this.emit('transcription', {
                            text: transcription,
                            timestamp: Date.now(),
                            confidence: 1.0,
                            sessionId: this.sessionId
                        });
                    }
                } else if (errorOutput) {
                    logger.error('Process error:', { errorOutput });
                }

                await this.whisperService.cleanupTempFile(tempFile);
            });

        } catch (error) {
            logger.error('Processing error:', { error });
            this.emit('error', error);
        }
    }

    sendRealtimeInput(audioData) {
        if (!this.isRunning) {
            logger.warn('Session not running, cannot accept audio');
            return;
        }

        if (typeof audioData === 'string') {
            try {
                audioData = Buffer.from(audioData, 'base64');
            } catch (error) {
                logger.error('Failed to decode base64 audio data:', { error });
                return;
            }
        } else if (audioData instanceof ArrayBuffer) {
            audioData = Buffer.from(audioData);
        } else if (!Buffer.isBuffer(audioData) && !(audioData instanceof Uint8Array)) {
            logger.error('Invalid audio data type:', { audioDataType: typeof audioData });
            return;
        }

        if (!Buffer.isBuffer(audioData)) {
            audioData = Buffer.from(audioData);
        }

        if (audioData.length > 0) {
            this.audioBuffer = Buffer.concat([this.audioBuffer, audioData]);
            // Log every 10th audio chunk to avoid spam
            if (Math.random() < 0.1) {
                logger.info('Received audio chunk:  bytes, total buffer:  bytes');
            }
        }
    }

    async close() {
        logger.info('Closing session');
        this.isRunning = false;

        if (this.processingInterval) {
            clearInterval(this.processingInterval);
            this.processingInterval = null;
        }

        if (this.process) {
            this.process.kill('SIGTERM');
            this.process = null;
        }

        this.removeAllListeners();
    }
}

class WhisperProvider {
    static async validateApiKey() {
        // Whisper is a local service, no API key validation needed.
        return { success: true };
    }

    constructor() {
        this.whisperService = null;
    }

    async initialize() {
        if (!this.whisperService) {
            this.whisperService = require('../../services/whisperService');
            if (!this.whisperService.isInitialized) {
                await this.whisperService.initialize();
            }
        }
    }

    async createSTT(config) {
        await this.initialize();
        
        const model = config.model || 'whisper-tiny';
        const sessionType = config.sessionType || 'unknown';
        logger.info('Creating  STT session with model:');
        
        // Create unique session ID based on type
        const sessionId = `${sessionType}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        const session = new WhisperSTTSession(model, this.whisperService, sessionId);
        
        // Log session creation
        logger.info('Created session:');
        
        const initialized = await session.initialize();
        if (!initialized) {
            throw new Error('Failed to initialize Whisper STT session');
        }

        if (config.callbacks) {
            if (config.callbacks.onmessage) {
                session.on('transcription', config.callbacks.onmessage);
            }
            if (config.callbacks.onerror) {
                session.on('error', config.callbacks.onerror);
            }
            if (config.callbacks.onclose) {
                session.on('close', config.callbacks.onclose);
            }
        }

        return session;
    }

    async createLLM() {
        throw new Error('Whisper provider does not support LLM functionality');
    }

    async createStreamingLLM() {
        logger.warn('Streaming LLM is not supported by Whisper.');
        throw new Error('Whisper does not support LLM.');
    }
}

module.exports = {
    WhisperProvider,
    WhisperSTTSession
};