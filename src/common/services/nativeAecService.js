// nativeAecService.js - Native AEC integration for Windows
const path = require('path');
const ffi = require('ffi-napi');
const ref = require('ref-napi');
const { createLogger } = require('./logger.js');

const logger = createLogger('NativeAEC');

class NativeAecService {
    constructor() {
        this.aecPtr = null;
        this.aecLib = null;
        this.isInitialized = false;
        this.frameSize = 160; // 160 samples for 24kHz (6.67ms frames)
        this.filterLength = 1600; // Filter length for echo cancellation
        this.sampleRate = 24000;
    }

    async initialize() {
        if (this.isInitialized) {
            return true;
        }

        try {
            // Load the native AEC DLL
            const dllPath = path.join(__dirname, '../../../libaec-win-x86-64/aec.dll');
            logger.info('Loading native AEC DLL from:', dllPath);

            // Define the FFI interface
            this.aecLib = ffi.Library(dllPath, {
                'AecNew': ['pointer', ['size_t', 'int32', 'uint32', 'bool']],
                'AecCancelEcho': ['void', ['pointer', 'pointer', 'pointer', 'pointer', 'size_t']],
                'AecDestroy': ['void', ['pointer']]
            });

            // Create AEC instance
            this.aecPtr = this.aecLib.AecNew(
                this.frameSize,     // frame_size
                this.filterLength,  // filter_length  
                this.sampleRate,    // sample_rate
                true               // enable_preprocess
            );

            if (this.aecPtr.isNull()) {
                throw new Error('Failed to create AEC instance');
            }

            this.isInitialized = true;
            logger.info('[OK] Native AEC initialized successfully', {
                frameSize: this.frameSize,
                filterLength: this.filterLength,
                sampleRate: this.sampleRate
            });

            return true;

        } catch (error) {
            logger.error('[ERROR] Failed to initialize native AEC:', error);
            this.isInitialized = false;
            return false;
        }
    }

    /**
     * Process audio with echo cancellation
     * @param {Int16Array} micBuffer - Microphone audio buffer
     * @param {Int16Array} echoBuffer - System audio (echo reference) buffer  
     * @returns {Int16Array} - Processed audio with echo cancelled
     */
    cancelEcho(micBuffer, echoBuffer) {
        if (!this.isInitialized || !this.aecPtr || this.aecPtr.isNull()) {
            logger.warn('AEC not initialized, returning original audio');
            return micBuffer;
        }

        try {
            // Ensure buffers are the right size
            const bufferLength = Math.min(micBuffer.length, echoBuffer.length, this.frameSize);
            
            if (bufferLength !== this.frameSize) {
                logger.debug(`Buffer size mismatch: expected ${this.frameSize}, got ${bufferLength}`);
                // For now, return original if size doesn't match
                return micBuffer;
            }

            // Allocate output buffer
            const outputBuffer = new Int16Array(bufferLength);

            // Create buffers for FFI
            const micBuf = Buffer.from(micBuffer.buffer);
            const echoBuf = Buffer.from(echoBuffer.buffer); 
            const outBuf = Buffer.alloc(bufferLength * 2); // 2 bytes per sample

            // Call the native AEC function
            this.aecLib.AecCancelEcho(
                this.aecPtr,
                micBuf,
                echoBuf,
                outBuf,
                bufferLength
            );

            // Convert output buffer back to Int16Array
            const result = new Int16Array(outBuf.buffer, outBuf.byteOffset, bufferLength);
            
            logger.debug('[AUDIO] Applied native AEC processing', {
                inputLength: micBuffer.length,
                outputLength: result.length
            });

            return result;

        } catch (error) {
            logger.warn('[WARNING] Native AEC processing failed, returning original audio:', error.message);
            return micBuffer;
        }
    }

    destroy() {
        if (this.aecPtr && !this.aecPtr.isNull()) {
            try {
                this.aecLib.AecDestroy(this.aecPtr);
                logger.info('[CLEAN] Native AEC instance destroyed');
            } catch (error) {
                logger.warn('Warning during AEC cleanup:', error.message);
            }
        }
        
        this.aecPtr = null;
        this.aecLib = null;
        this.isInitialized = false;
    }

    // Check if AEC is available and working
    isAvailable() {
        return this.isInitialized && this.aecPtr && !this.aecPtr.isNull();
    }

    // Get current configuration
    getConfig() {
        return {
            frameSize: this.frameSize,
            filterLength: this.filterLength,
            sampleRate: this.sampleRate,
            isInitialized: this.isInitialized
        };
    }
}

// Export singleton instance
const nativeAecService = new NativeAecService();

module.exports = {
    NativeAecService,
    nativeAecService
};