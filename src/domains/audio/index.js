/**
 * Audio Domain - Main Export
 * Comprehensive Audio Processing & Management Domain
 * 
 * This domain handles:
 * - Audio device management and selection
 * - Real-time audio processing and enhancement
 * - Voice activity detection (VAD)
 * - Audio format conversion and streaming
 * - Echo cancellation and noise reduction
 * - Cross-platform audio optimization
 * - Integration with STT/Listen services
 */

const { createLogger } = require('../../common/services/logger.js');

const logger = createLogger('AudioDomain');

// Note: Individual audio services have been removed - audio functionality 
// is now handled directly by the existing STT and Listen services

/**
 * Enhanced Audio Domain with unified audio management
 * Provides comprehensive audio processing capabilities
 */
class AudioDomain {
    constructor() {
        this.initialized = false;
        
        // Domain configuration
        this.config = {
            audio: {
                sampleRate: 24000,
                channels: 1,
                bufferSize: 4096,
                enableProcessing: true
            },
            
            devices: {
                autoSwitch: true,
                preferSystemDefault: true,
                monitoringInterval: 2000
            },
            
            processing: {
                enableVAD: true,
                vadThreshold: 0.005,
                enableNoiseReduction: true,
                enableEchoCancellation: true,
                enableAutoGainControl: true
            },
            
            performance: {
                maxLatency: 50, // ms
                targetChunkSize: 25, // ms for ultra-low latency
                enableMetrics: true
            }
        };
        
        // Audio state tracking
        this.state = {
            activeDevice: null,
            isProcessing: false,
            isRecording: false,
            metrics: {
                latency: 0,
                processedChunks: 0,
                droppedFrames: 0
            }
        };
        
        // Event handlers
        this.eventHandlers = new Map();
    }

    /**
     * Initialize the audio domain
     */
    async initialize() {
        if (this.initialized) {
            return;
        }

        try {
            // Audio functionality is handled by existing STT and Listen services
            // This domain now serves as a placeholder for future audio enhancements
            
            this.initialized = true;
            console.log('[AudioDomain] Initialized successfully (placeholder mode)');
            
        } catch (error) {
            throw new Error(`Failed to initialize audio domain: ${error.message}`);
        }
    }
    
    /**
     * Setup device manager event handlers
     */
    setupDeviceEventHandlers() {
        if (!this.audioDeviceManager) return;
        
        this.audioDeviceManager.on('deviceConnected', (device) => {
            console.log('[AudioDomain] Device connected:', device.name);
            this.emit('deviceConnected', device);
        });
        
        this.audioDeviceManager.on('deviceDisconnected', (device) => {
            console.log('[AudioDomain] Device disconnected:', device.name);
            this.emit('deviceDisconnected', device);
        });
        
        this.audioDeviceManager.on('deviceChanged', (event) => {
            console.log('[AudioDomain] Active device changed:', event);
            this.state.activeDevice = event.newDevice;
            this.emit('deviceChanged', event);
        });
    }
    
    /**
     * Setup audio processor event handlers
     */
    setupProcessorEventHandlers() {
        if (!this.audioProcessor) return;
        
        this.audioProcessor.on('voiceStart', () => {
            this.emit('voiceActivityStart');
        });
        
        this.audioProcessor.on('voiceEnd', () => {
            this.emit('voiceActivityEnd');
        });
        
        this.audioProcessor.on('audioProcessed', (data) => {
            this.state.metrics.processedChunks++;
            this.emit('audioChunk', data);
        });
        
        this.audioProcessor.on('performanceMetrics', (metrics) => {
            this.state.metrics = { ...this.state.metrics, ...metrics };
            this.emit('performanceUpdate', metrics);
        });
    }
    
    /**
     * Setup cross-service coordination
     */
    setupCrossServiceCoordination() {
        // Coordinate device changes with processor
        this.on('deviceChanged', async (event) => {
            if (this.audioProcessor && this.state.isProcessing) {
                await this.audioProcessor.switchDevice(event.newDevice);
            }
        });
    }

    /**
     * Get available audio devices
     */
    async getAvailableDevices() {
        if (!this.initialized) {
            await this.initialize();
        }

        if (this.audioDeviceManager && typeof this.audioDeviceManager.enumerateDevices === 'function') {
            return await this.audioDeviceManager.enumerateDevices();
        }
        
        // Fallback for basic device enumeration
        try {
            if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
                const devices = await navigator.mediaDevices.enumerateDevices();
                return {
                    input: devices.filter(d => d.kind === 'audioinput'),
                    output: devices.filter(d => d.kind === 'audiooutput')
                };
            }
        } catch (error) {
            console.error('[AudioDomain] Failed to enumerate devices:', error);
        }
        
        return { input: [], output: [] };
    }

    /**
     * Set active audio device
     */
    async setActiveDevice(deviceId, type = 'input') {
        if (!this.initialized) {
            await this.initialize();
        }

        if (this.audioDeviceManager && typeof this.audioDeviceManager.setDevice === 'function') {
            const result = await this.audioDeviceManager.setDevice(deviceId, type);
            if (result.success) {
                this.state.activeDevice = result.device;
            }
            return result;
        }
        
        return {
            success: false,
            error: 'Audio device manager not available'
        };
    }

    /**
     * Start audio processing
     */
    async startProcessing(options = {}) {
        if (!this.initialized) {
            await this.initialize();
        }

        if (this.state.isProcessing) {
            return {
                success: false,
                error: 'Audio processing already active'
            };
        }

        try {
            const config = {
                ...this.config.audio,
                ...this.config.processing,
                ...options
            };
            
            if (this.audioProcessor && typeof this.audioProcessor.startProcessing === 'function') {
                await this.audioProcessor.startProcessing(config);
            }
            
            this.state.isProcessing = true;
            this.emit('processingStarted');
            
            return { success: true };
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Stop audio processing
     */
    async stopProcessing() {
        if (!this.state.isProcessing) {
            return { success: true };
        }

        try {
            if (this.audioProcessor && typeof this.audioProcessor.stopProcessing === 'function') {
                await this.audioProcessor.stopProcessing();
            }
            
            this.state.isProcessing = false;
            this.emit('processingStopped');
            
            return { success: true };
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Process audio buffer
     */
    async processAudioBuffer(buffer, options = {}) {
        if (!this.audioProcessor) {
            return {
                success: false,
                error: 'Audio processor not available'
            };
        }

        try {
            const processed = await this.audioProcessor.processBuffer(buffer, options);
            return {
                success: true,
                data: processed
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get audio metrics
     */
    getMetrics() {
        const metrics = {
            ...this.state.metrics,
            devices: {
                active: this.state.activeDevice,
                available: 0
            }
        };
        
        if (this.audioDeviceManager) {
            const devices = this.audioDeviceManager.getDeviceCount();
            metrics.devices.available = devices.input + devices.output;
        }
        
        if (this.audioProcessor && typeof this.audioProcessor.getMetrics === 'function') {
            const processorMetrics = this.audioProcessor.getMetrics();
            metrics.processor = processorMetrics;
        }
        
        return metrics;
    }

    /**
     * Update configuration
     */
    updateConfig(newConfig) {
        this.config = {
            ...this.config,
            ...newConfig
        };
        
        // Propagate config updates to services
        if (this.audioDeviceManager && typeof this.audioDeviceManager.updateConfig === 'function') {
            this.audioDeviceManager.updateConfig(this.config.devices);
        }
        
        if (this.audioProcessor && typeof this.audioProcessor.updateConfig === 'function') {
            this.audioProcessor.updateConfig({
                ...this.config.audio,
                ...this.config.processing
            });
        }
        
        this.emit('configUpdated', this.config);
    }

    /**
     * Event emitter functionality
     */
    on(event, handler) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, []);
        }
        this.eventHandlers.get(event).push(handler);
    }
    
    off(event, handler) {
        if (this.eventHandlers.has(event)) {
            const handlers = this.eventHandlers.get(event);
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
    }
    
    emit(event, ...args) {
        if (this.eventHandlers.has(event)) {
            const handlers = this.eventHandlers.get(event);
            handlers.forEach(handler => {
                try {
                    handler(...args);
                } catch (error) {
                    console.error(`[AudioDomain] Error in event handler for ${event}:`, error);
                }
            });
        }
    }

    /**
     * Get comprehensive audio domain status
     */
    getStatus() {
        return {
            initialized: this.initialized,
            audioDeviceManager: {
                available: !!this.audioDeviceManager,
                initialized: this.audioDeviceManager?.initialized || false
            },
            audioProcessor: {
                available: !!this.audioProcessor,
                initialized: this.audioProcessor?.initialized || false
            },
            state: this.state,
            config: this.config
        };
    }

    /**
     * Shutdown the audio domain
     */
    async shutdown() {
        try {
            // Stop any active processing
            if (this.state.isProcessing) {
                await this.stopProcessing();
            }
            
            // Shutdown individual services
            if (this.audioProcessor && typeof this.audioProcessor.shutdown === 'function') {
                await this.audioProcessor.shutdown();
            }
            
            if (this.audioDeviceManager && typeof this.audioDeviceManager.shutdown === 'function') {
                await this.audioDeviceManager.shutdown();
            }

            // Clear event handlers
            this.eventHandlers.clear();
            
            this.initialized = false;
            console.log('[AudioDomain] Shutdown complete');
            
        } catch (error) {
            throw new Error(`Failed to shutdown audio domain: ${error.message}`);
        }
    }
}

// Create singleton instance
const audioDomain = new AudioDomain();

// Export domain interface and services
module.exports = {
    audioDomain,
    AudioDomain,
    
    // Individual audio services removed - functionality handled by STT/Listen services
    audioDeviceManager: null,
    audioProcessor: null,
    
    // Enhanced Audio Domain Convenience Functions
    async initializeAudio() {
        return await audioDomain.initialize();
    },
    
    async getAvailableDevices() {
        return await audioDomain.getAvailableDevices();
    },
    
    async setActiveDevice(deviceId, type) {
        return await audioDomain.setActiveDevice(deviceId, type);
    },
    
    async startAudioProcessing(options) {
        return await audioDomain.startProcessing(options);
    },
    
    async stopAudioProcessing() {
        return await audioDomain.stopProcessing();
    },
    
    async processAudioBuffer(buffer, options) {
        return await audioDomain.processAudioBuffer(buffer, options);
    },
    
    getAudioMetrics() {
        return audioDomain.getMetrics();
    },
    
    updateAudioConfig(config) {
        return audioDomain.updateConfig(config);
    },
    
    // Legacy functions for backward compatibility
    async enumerateDevices() {
        const devices = await audioDomain.getAvailableDevices();
        return [...(devices.input || []), ...(devices.output || [])];
    },
    
    async selectDevice(deviceId) {
        return await audioDomain.setActiveDevice(deviceId);
    }
};