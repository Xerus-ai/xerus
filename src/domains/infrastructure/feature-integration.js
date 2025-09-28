/**
 * XERUS FEATURE INTEGRATION SERVICE
 * Centralizes integration of all implemented features
 * 
 * Features:
 * - Tool system integration
 * - Enhanced context management
 * - Cross-platform optimization
 * - Audio processing integration
 * - Notification system
 * - Performance monitoring
 */

const { EventEmitter } = require('events');
const { createLogger } = require('../../common/services/logger.js');

const logger = createLogger('FeatureIntegration');

// Try to import optional dependencies gracefully
let fastContextManager, platformManager, notificationManager, modelStateService;
let audioProcessor, audioDeviceManager, demoTutorialAgent;


try {
    ({ fastContextManager } = require('../ai/fast-context-manager'));
} catch (error) {
    logger.warn('Fast context manager not available:', error.message);
}

try {
    ({ platformManager } = require('../../main/platform-manager'));
    if (!platformManager) {
        logger.warn('Platform manager import returned null/undefined');
    }
} catch (error) {
    logger.warn('Platform manager not available:', error.message);
}

try {
    ({ notificationManager } = require('../../main/notification-manager'));
    if (!notificationManager) {
        logger.warn('Notification manager import returned null/undefined');
    }
} catch (error) {
    logger.warn('Notification manager not available:', error.message);
}

try {
    // Import from audio domain instead of individual services
    ({ audioProcessor, audioDeviceManager } = require('../audio'));
} catch (error) {
    logger.warn('Audio domain services not available:', error.message);
}


try {
    ({ demoTutorialAgent } = require('../../agents/demo-tutorial-agent'));
} catch (error) {
    logger.warn('Demo tutorial agent not available:', error.message);
}

try {
    ({ modelStateService } = require('../../common/services/modelStateService'));
} catch (error) {
    logger.warn('Model state service not available:', error.message);
}

// Logger already declared above

class FeatureIntegrationService extends EventEmitter {
    constructor() {
        super();
        
        this.features = {
            context: false,
            platform: false,
            notifications: false,
            audio: false,
            speechToText: false,
            voiceCommands: false,
            audioDevices: false,
            demoTutorial: false,
            performance: false
        };
        
        this.initialized = false;
        this.initializationPromise = null;
        
        logger.info('[FeatureIntegration] Feature integration service created');
    }

    /**
     * Initialize all features
     */
    async initialize() {
        if (this.initialized) {
            return;
        }
        
        if (this.initializationPromise) {
            return this.initializationPromise;
        }
        
        this.initializationPromise = this._performInitialization();
        return this.initializationPromise;
    }

    async _performInitialization() {
        try {
            logger.info('[FeatureIntegration] Initializing integrated features...');
            
            // Initialize platform manager first
            await this.initializePlatformFeatures();
            
            // Initialize notification system
            await this.initializeNotificationFeatures();
            
            
            // Initialize context management
            await this.initializeContextFeatures();
            
            // Initialize audio features
            await this.initializeAudioFeatures();
            
            // Enhanced audio services have been removed
            
            // Initialize demo/tutorial system
            await this.initializeDemoTutorialFeatures();
            
            // Initialize performance monitoring
            await this.initializePerformanceFeatures();
            
            this.initialized = true;
            logger.info('[FeatureIntegration] All features initialized successfully');
            
            this.emit('initialized', {
                features: this.features,
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            logger.error('Failed to initialize features:', { 
                error: error.message || error.toString(),
                stack: error.stack,
                name: error.name
            });
            throw error;
        }
    }

    /**
     * Initialize platform-specific features
     */
    async initializePlatformFeatures() {
        try {
            logger.info('[FeatureIntegration] Initializing platform features...');
            
            if (!platformManager) {
                logger.warn('[FeatureIntegration] Platform manager not available, skipping platform features');
                this.features.platform = false;
                return;
            }
            
            // Platform manager should already be initialized
            const capabilities = platformManager.getCapabilities();
            logger.info('[FeatureIntegration] Platform capabilities:', capabilities);
            
            // Set up platform-specific optimizations
            if (capabilities.screenCapture) {
                logger.info('[FeatureIntegration] Screen capture capability available');
            }
            
            if (capabilities.systemAudio) {
                logger.info('[FeatureIntegration] System audio capability available');
            }
            
            if (capabilities.systemNotifications) {
                logger.info('[FeatureIntegration] System notifications capability available');
            }
            
            this.features.platform = true;
            logger.info('[FeatureIntegration] Platform features initialized');
            
        } catch (error) {
            logger.error('Failed to initialize platform features:', { 
                error: error.message || error.toString(),
                stack: error.stack,
                name: error.name
            });
            this.features.platform = false;
        }
    }

    /**
     * Initialize notification system
     */
    async initializeNotificationFeatures() {
        try {
            logger.info('[FeatureIntegration] Initializing notification features...');
            
            if (!notificationManager) {
                logger.warn('[FeatureIntegration] Notification manager not available, skipping notification features');
                this.features.notifications = false;
                return;
            }
            
            // Notification manager should already be initialized
            const capabilities = notificationManager.getCapabilities();
            logger.info('[FeatureIntegration] Notification capabilities:', capabilities);
            
            this.features.notifications = true;
            logger.info('[FeatureIntegration] Notification features initialized');
            
        } catch (error) {
            logger.error('Failed to initialize notification features:', { 
                error: error.message || error.toString(),
                stack: error.stack,
                name: error.name
            });
            // Don't throw - notifications are not critical
            this.features.notifications = false;
        }
    }


    /**
     * Initialize context management
     */
    async initializeContextFeatures() {
        try {
            logger.info('[FeatureIntegration] Initializing context features...');
            
            if (!fastContextManager) {
                logger.warn('[FeatureIntegration] Fast context manager not available, skipping context features');
                this.features.context = false;
                return;
            }
            
            // Context manager should already be initialized
            const contextStats = fastContextManager.getStats();
            logger.info('[FeatureIntegration] Context manager stats:', contextStats);
            
            this.features.context = true;
            logger.info('[FeatureIntegration] Context features initialized');
            
        } catch (error) {
            logger.error('Failed to initialize context features:', { 
                error: error.message || error.toString(),
                stack: error.stack,
                name: error.name
            });
            this.features.context = false;
        }
    }

    /**
     * Initialize audio features
     */
    async initializeAudioFeatures() {
        try {
            logger.info('[FeatureIntegration] Initializing audio features...');
            
            // Check if audio models are available
            if (modelStateService) {
                const modelInfo = modelStateService.getCurrentModelInfo('stt');
                
                if (modelInfo && modelInfo.apiKey) {
                    logger.info('[FeatureIntegration] STT model available:', modelInfo.provider);
                    this.features.audio = true;
                } else {
                    logger.info('[FeatureIntegration] STT model not configured');
                    this.features.audio = false;
                }
            } else {
                logger.warn('[FeatureIntegration] Model state service not available, skipping STT model check');
                this.features.audio = false;
            }
            
            logger.info('[FeatureIntegration] Audio features initialized');
            
        } catch (error) {
            logger.error('Failed to initialize audio features:', { 
                error: error.message || error.toString(),
                stack: error.stack,
                name: error.name
            });
            this.features.audio = false;
        }
    }


    /**
     * Set up audio service integrations
     */
    setupAudioServiceIntegrations() {
        // Voice command processor has been removed
        
        // Connect audio device changes to notifications (if available)
        if (audioDeviceManager && this.features.notifications && notificationManager) {
            audioDeviceManager.on('devicesChanged', (changes) => {
                if (changes.added.length > 0) {
                    notificationManager.showInfo(`${changes.added.length} new audio device(s) detected`);
                }
                if (changes.removed.length > 0) {
                    notificationManager.showWarning(`${changes.removed.length} audio device(s) disconnected`);
                }
            });
            
            logger.info('[FeatureIntegration] Audio device manager integrations configured');
        }
        
        // STT transcriptions are handled by the original STT service
        logger.info('[FeatureIntegration] STT integrations handled by original service');
        
        logger.info('[FeatureIntegration] Audio service integrations setup completed');
    }

    /**
     * Initialize demo/tutorial system
     */
    async initializeDemoTutorialFeatures() {
        try {
            logger.info('[FeatureIntegration] Initializing demo/tutorial features...');
            
            // Set up tutorial event integration
            this.setupTutorialIntegration();
            
            this.features.demoTutorial = true;
            logger.info('[FeatureIntegration] Demo/tutorial features initialized');
            
        } catch (error) {
            logger.error('Failed to initialize demo/tutorial features:', { 
                error: error.message || error.toString(),
                stack: error.stack,
                name: error.name
            });
            this.features.demoTutorial = false;
        }
    }

    /**
     * Set up tutorial system integration
     */
    setupTutorialIntegration() {
        // Forward tutorial events to main components (if available)
        if (demoTutorialAgent) {
            demoTutorialAgent.on('tutorialStarted', (data) => {
                this.emit('tutorialStarted', data);
                if (this.features.notifications && notificationManager) {
                    notificationManager.showInfo(`Tutorial started: ${data.tutorial.title}`);
                }
            });

            demoTutorialAgent.on('tutorialCompleted', (data) => {
                this.emit('tutorialCompleted', data);
                if (this.features.notifications && notificationManager) {
                    notificationManager.showSuccess(`Tutorial completed: ${data.tutorial.title}`);
                }
            });

            demoTutorialAgent.on('stepCompleted', (data) => {
                this.emit('stepCompleted', data);
            });

            demoTutorialAgent.on('voiceGuidance', (data) => {
                this.emit('voiceGuidance', data);
            });

            // Voice command processor has been removed - tutorial voice commands unavailable
        }

        logger.info('[FeatureIntegration] Tutorial integration configured');
    }

    /**
     * Initialize performance monitoring
     */
    async initializePerformanceFeatures() {
        try {
            logger.info('[FeatureIntegration] Initializing performance features...');
            
            // Set up performance monitoring
            this.startPerformanceMonitoring();
            
            this.features.performance = true;
            logger.info('[FeatureIntegration] Performance features initialized');
            
        } catch (error) {
            logger.error('Failed to initialize performance features:', { 
                error: error.message || error.toString(),
                stack: error.stack,
                name: error.name
            });
            this.features.performance = false;
        }
    }

    /**
     * Check for API keys
     */
    checkApiKeys() {
        const keys = {
            web: !!(process.env.FIRECRAWL_API_KEY || process.env.TAVILY_API_KEY),
            openai: !!process.env.OPENAI_API_KEY,
            anthropic: !!process.env.ANTHROPIC_API_KEY,
            google: !!process.env.GOOGLE_API_KEY
        };
        
        return keys;
    }

    /**
     * Start performance monitoring
     */
    startPerformanceMonitoring() {
        setInterval(() => {
            const stats = {
                memory: process.memoryUsage(),
                uptime: process.uptime(),
                timestamp: new Date().toISOString()
            };
            
            this.emit('performance-stats', stats);
            
            // Log warnings for high memory usage
            if (stats.memory.heapUsed > 200 * 1024 * 1024) { // 200MB
                logger.warn('High memory usage detected:', { 
                    usage: Math.round(stats.memory.heapUsed / 1024 / 1024) + 'MB' });
            }
        }, 30000); // Every 30 seconds
    }

    /**
     * Get feature status
     */
    getFeatureStatus() {
        return {
            initialized: this.initialized,
            features: { ...this.features },
            capabilities: {
                platform: platformManager ? platformManager.getCapabilities() : null,
                notifications: notificationManager ? notificationManager.getCapabilities() : null,
                context: fastContextManager ? fastContextManager.getStats() : null
            }
        };
    }



    /**
     * Add context to context manager
     */
    addContext(content, type = 'user') {
        if (this.features.context) {
            return fastContextManager.addContext(content, type);
        }
        return false;
    }

    /**
     * Get relevant context
     */
    getRelevantContext(query = '') {
        if (this.features.context) {
            return fastContextManager.getRelevantContext(query);
        }
        return null;
    }

    /**
     * Show notification
     */
    showNotification(type, message, options = {}) {
        if (this.features.notifications) {
            switch (type) {
                case 'info':
                    return notificationManager.showInfo(message, options);
                case 'success':
                    return notificationManager.showSuccess(message, options);
                case 'warning':
                    return notificationManager.showWarning(message, options);
                case 'error':
                    return notificationManager.showError(message, options);
                default:
                    return notificationManager.showInfo(message, options);
            }
        }
        return false;
    }

    /**
     * Start audio processing
     */
    async startAudioProcessing(deviceId = null, options = {}) {
        if (!this.features.audio) {
            throw new Error('Audio processing not initialized');
        }
        
        try {
            const result = await audioProcessor.startProcessing(deviceId, options);
            
            if (result && this.features.notifications) {
                notificationManager.showSuccess('Audio processing started');
            }
            
            return result;
        } catch (error) {
            if (this.features.notifications) {
                notificationManager.showError(`Failed to start audio: ${error.message}`);
            }
            throw error;
        }
    }

    /**
     * Stop audio processing
     */
    async stopAudioProcessing() {
        if (!this.features.audio) {
            return true;
        }
        
        try {
            const result = await audioProcessor.stopProcessing();
            
            if (result && this.features.notifications) {
                notificationManager.showInfo('Audio processing stopped');
            }
            
            return result;
        } catch (error) {
            if (this.features.notifications) {
                notificationManager.showError(`Failed to stop audio: ${error.message}`);
            }
            throw error;
        }
    }

    /**
     * Start speech-to-text processing (delegated to original STT service)
     */
    async startSpeechToText(sessionId = null) {
        logger.info('[FeatureIntegration] STT start delegated to original service');
        return { success: true, message: 'Delegated to original STT service' };
    }

    /**
     * Stop speech-to-text processing (delegated to original STT service)
     */
    async stopSpeechToText() {
        logger.info('[FeatureIntegration] STT stop delegated to original service');
        return { success: true, message: 'Delegated to original STT service' };
    }

    /**
     * Start voice command processing
     */
    async startVoiceCommands() {
        if (!this.features.voiceCommands) {
            throw new Error('Voice commands not initialized');
        }
        
        try {
            // Voice command processor has been removed
            const result = false;
            
            if (result && this.features.notifications) {
                notificationManager.showSuccess('Voice commands activated');
            }
            
            return result;
        } catch (error) {
            if (this.features.notifications) {
                notificationManager.showError(`Failed to start voice commands: ${error.message}`);
            }
            throw error;
        }
    }

    /**
     * Stop voice command processing
     */
    async stopVoiceCommands() {
        if (!this.features.voiceCommands) {
            return true;
        }
        
        try {
            // Voice command processor has been removed
            const result = false;
            
            if (result && this.features.notifications) {
                notificationManager.showInfo('Voice commands deactivated');
            }
            
            return result;
        } catch (error) {
            if (this.features.notifications) {
                notificationManager.showError(`Failed to stop voice commands: ${error.message}`);
            }
            throw error;
        }
    }

    /**
     * Get available audio devices
     */
    getAudioDevices() {
        if (!this.features.audioDevices) {
            return { input: [], output: [], system: [] };
        }
        
        return audioDeviceManager.getAllDevices();
    }

    /**
     * Set audio input device
     */
    async setAudioInputDevice(deviceId) {
        if (!this.features.audioDevices) {
            throw new Error('Audio device management not initialized');
        }
        
        try {
            const result = await audioDeviceManager.setInputDevice(deviceId);
            
            if (result && this.features.notifications) {
                const device = audioDeviceManager.getDevice(deviceId);
                notificationManager.showInfo(`Audio input switched to: ${device?.label || 'Unknown Device'}`);
            }
            
            return result;
        } catch (error) {
            if (this.features.notifications) {
                notificationManager.showError(`Failed to set audio input: ${error.message}`);
            }
            throw error;
        }
    }

    /**
     * Add custom voice command
     */
    addVoiceCommand(phrase, handler, description = '') {
        if (!this.features.voiceCommands) {
            throw new Error('Voice commands not initialized');
        }
        
        const commandName = phrase.toLowerCase().replace(/\s+/g, '_');
        
        // Voice command processor has been removed - cannot register command
        logger.warn('Voice command processor removed - cannot add voice command');
        return false;
    }

    /**
     * Get voice command statistics
     */
    getVoiceCommandStats() {
        if (!this.features.voiceCommands) {
            return null;
        }
        
        // Voice command processor has been removed
        return null;
    }

    /**
     * Get audio processing statistics
     */
    getAudioStats() {
        const stats = {};
        
        if (this.features.audio) {
            stats.audioProcessor = audioProcessor.getStatistics();
        }
        
        if (this.features.speechToText) {
            stats.speechToText = { provider: 'original-stt-service', status: 'active' };
        }
        
        if (this.features.voiceCommands) {
            // Voice command processor has been removed
            stats.voiceCommands = null;
        }
        
        if (this.features.audioDevices) {
            stats.audioDevices = audioDeviceManager.getStatistics();
        }
        
        return stats;
    }

    /**
     * Start a tutorial
     */
    async startTutorial(tutorialId, options = {}) {
        if (!this.features.demoTutorial) {
            throw new Error('Demo/tutorial features not initialized');
        }
        
        try {
            const result = await demoTutorialAgent.startTutorial(tutorialId, options);
            
            if (result && this.features.notifications) {
                const tutorial = demoTutorialAgent.tutorials.get(tutorialId);
                notificationManager.showInfo(`Starting tutorial: ${tutorial?.title || tutorialId}`);
            }
            
            return result;
        } catch (error) {
            if (this.features.notifications) {
                notificationManager.showError(`Failed to start tutorial: ${error.message}`);
            }
            throw error;
        }
    }

    /**
     * Get available tutorials
     */
    getAvailableTutorials() {
        if (!this.features.demoTutorial) {
            return [];
        }
        
        return demoTutorialAgent.getAvailableTutorials();
    }

    /**
     * Get tutorial state and progress
     */
    getTutorialState() {
        if (!this.features.demoTutorial) {
            return null;
        }
        
        return demoTutorialAgent.getState();
    }

    /**
     * Skip current tutorial
     */
    skipTutorial() {
        if (!this.features.demoTutorial) {
            return false;
        }
        
        return demoTutorialAgent.skipTutorial();
    }

    /**
     * Pause/resume tutorial
     */
    pauseTutorial() {
        if (!this.features.demoTutorial) {
            return false;
        }
        
        return demoTutorialAgent.pauseTutorial();
    }

    resumeTutorial() {
        if (!this.features.demoTutorial) {
            return false;
        }
        
        return demoTutorialAgent.resumeTutorial();
    }

    /**
     * Get tutorial analytics
     */
    getTutorialAnalytics() {
        if (!this.features.demoTutorial) {
            return null;
        }
        
        return demoTutorialAgent.getTutorialAnalytics();
    }

    /**
     * Get system capabilities
     */
    getSystemCapabilities() {
        return {
            platform: platformManager ? platformManager.getCapabilities() : null,
            audio: this.features.audio,
            speechToText: this.features.speechToText,
            voiceCommands: this.features.voiceCommands,
            audioDevices: this.features.audioDevices,
            demoTutorial: this.features.demoTutorial,
            tools: this.features.tools,
            context: this.features.context,
            notifications: this.features.notifications,
            performance: this.features.performance
        };
    }
}

// Export singleton instance
const featureIntegrationService = new FeatureIntegrationService();

module.exports = {
    featureIntegrationService,
    FeatureIntegrationService
};