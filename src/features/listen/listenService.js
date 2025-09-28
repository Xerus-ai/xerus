const { BrowserWindow } = require('electron');
const SttService = require('./stt/sttService');
const SummaryService = require('./summary/summaryService');
const authService = require('../../common/services/authService');
const sessionRepository = require('../../common/repositories/session');
const sttRepository = require('./stt/repositories');
const internalBridge = require('../../bridge/internalBridge');
const { createLogger } = require('../../common/services/logger.js');

// Import platform manager for screenshot capture
const { platformManager } = require('../../main/platform-manager');

/**
 * Capture screenshot for TTS context
 * @param {Object} options - Screenshot options
 * @returns {Object} Screenshot result with base64 data
 */
async function captureScreenshotForTTS(options = {}) {
    try {
        logger.info('[ListenService] Capturing screenshot for TTS context');
        
        // Use the enhanced platform manager for cross-platform screen capture
        const screenCaptureService = platformManager.getScreenCaptureService();
        const result = await screenCaptureService.captureScreen({
            quality: 60, // Further optimize for TTS context - lower quality than Ask service (75)
            maxWidth: 1280, // Limit resolution for TTS context to reduce data size
            maxHeight: 720,
            ...options
        });
        
        if (result.success) {
            logger.info('[ListenService] [OK] Screenshot captured for TTS', {
                width: result.width,
                height: result.height,
                dataLength: result.base64?.length || 0
            });
            
            return {
                success: true,
                base64: result.base64,
                width: result.width,
                height: result.height
            };
        } else {
            logger.warn('[ListenService] [WARNING] Screenshot capture failed:', result.error);
            return {
                success: false,
                error: result.error
            };
        }
    } catch (error) {
        logger.error('[ListenService] [ERROR] Screenshot capture error:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// Try to import optional enhanced services gracefully
let notificationManager, featureIntegrationService, audioProcessor, audioDeviceManager;

try {
    ({ notificationManager } = require('../../main/notification-manager'));
} catch (error) {
    console.warn('[ListenService] Notification manager not available:', error.message);
}

try {
    ({ featureIntegrationService } = require('../../domains/infrastructure/feature-integration'));
} catch (error) {
    console.warn('[ListenService] Feature integration service not available:', error.message);
}

try {
    // Import from audio domain instead of individual services
    ({ audioProcessor, audioDeviceManager } = require('../../domains/audio'));
} catch (error) {
    console.warn('[ListenService] Audio domain services not available:', error.message);
}



// Lazy import personality manager to avoid circular dependency

// Import memory API client for backend memory storage
const MemoryApiClient = require('../../domains/conversation/memory-api-client');

const logger = createLogger('ListenService');


class ListenService {
    constructor() {
        this.sttService = new SttService();
        this.summaryService = new SummaryService();
        this.currentSessionId = null;
        this.isInitializingSession = false;
        
        // Enhanced audio integration state
        this.enhancedAudioEnabled = false;
        this.voiceCommandsEnabled = false;
        this.selectedAudioDevice = null;
        this.audioProcessingActive = false;
        
        // Agent mode tracking
        this.agentModeActive = false;
        
        // Personality manager integration
        this.agentPersonalityManager = null;
        this.personalityInitialized = false;
        
        // Memory API client for backend memory storage
        this.memoryApiClient = new MemoryApiClient();
        this.initializeMemoryClient();

        this.setupServiceCallbacks();
        this.initializePersonalityManager();
        logger.info('[ListenService] Service instance created.');
    }
    
    /**
     * Initialize personality manager integration
     */
    async initializePersonalityManager() {
        try {
            // Use lazy import from agents domain to avoid circular dependency
            const { agentPersonalityManager } = require('../../domains/agents');
            this.agentPersonalityManager = agentPersonalityManager;
            
            if (!this.agentPersonalityManager.initialized) {
                await this.agentPersonalityManager.initialize();
            }
            
            this.personalityInitialized = true;
            logger.info('[ListenService] Personality manager integration initialized');
            
            // Listen for personality changes
            this.agentPersonalityManager.on('personalitySwitched', (event) => {
                logger.info(`[ListenService] Personality switched: ${event.previous} → ${event.current}`);
                this.sendToRenderer('personality-changed', {
                    current: event.current,
                    personality: event.personality
                });
            });
            
        } catch (error) {
            logger.warn('[ListenService] Failed to initialize personality manager:', { error });
            this.personalityInitialized = false;
        }
    }
    
    /**
     * Initialize memory API client with authentication context
     */
    async initializeMemoryClient() {
        try {
            // Set memory client auth context
            const currentUser = authService.getCurrentUser();
            if (currentUser) {
                this.memoryApiClient.setAuthContext({
                    userId: currentUser.uid || currentUser.id || 'guest',
                    token: currentUser.accessToken,
                    isGuest: currentUser.isGuest || false,
                    permissions: currentUser.permissions || []
                });
                
                logger.info('[ListenService] Memory client initialized with auth context', {
                    userId: currentUser.uid || currentUser.id,
                    isGuest: currentUser.isGuest || false
                });
            } else {
                logger.info('[ListenService] Memory client initialized without auth context (guest mode)');
            }
            
        } catch (error) {
            logger.warn('[ListenService] Failed to initialize memory client:', { error });
        }
    }

    setupServiceCallbacks() {
        // STT service callbacks
        this.sttService.setCallbacks({
            onTranscriptionComplete: (speaker, text) => {
                this.handleTranscriptionComplete(speaker, text);
            },
            onStatusUpdate: (status) => {
                this.sendToRenderer('update-status', status);
            }
        });

        // Summary service callbacks
        this.summaryService.setCallbacks({
            onAnalysisComplete: (data) => {
                logger.info('[DATA] Analysis completed:', data);
            },
            onStatusUpdate: (status) => {
                this.sendToRenderer('update-status', status);
            }
        });
    }


    /**
     * Handle voice actions from voice command processor
     */
    async handleVoiceAction(action) {
        logger.info('Handling voice action:');
        
        try {
            switch (action.action) {
                case 'startListening':
                    await this.handleListenRequest('Listen');
                    break;
                    
                case 'stopListening':
                    await this.handleListenRequest('Stop');
                    break;
                    
                case 'hideWindow':
                    await this.handleListenRequest('Done');
                    break;
                    
                case 'askQuestion':
                    if (action.question) {
                        // Update personality context based on voice question
                        if (this.personalityInitialized && this.agentPersonalityManager) {
                            this.updatePersonalityContextForVoice(action.question);
                        }
                        
                        // Forward to ask service
                        const askService = require('../ask/askService');
                        await askService.sendMessage(action.question);
                    }
                    break;
                    
                case 'adjustTransparency':
                    // Emit to main process for transparency adjustment
                    internalBridge.emit('window:adjustTransparency', { 
                        direction: action.direction 
                    });
                    break;
                    
                case 'takeScreenshot':
                    // Emit to main process for screenshot
                    internalBridge.emit('window:takeScreenshot');
                    break;
                    
                default:
                    logger.warn(`Unknown voice action: ${action.action}'`);
            }
        } catch (error) {
            logger.error('Error handling voice action:', { error });
            if (notificationManager) {
                notificationManager.showError(`Voice command failed: ${error.message}`);
            }
        }
    }

    /**
     * Handle enhanced transcriptions
     */
    async handleEnhancedTranscription(transcription) {
        logger.info('Enhanced transcription: "" (confidence: )');
        
        // Use the enhanced transcription if confidence is high enough
        if (transcription.confidence >= 0.7) {
            await this.handleTranscriptionComplete('user', transcription.text);
        }
        
        // Send enhanced transcription data to renderer
        this.sendToRenderer('enhanced-transcription', {
            text: transcription.text,
            confidence: transcription.confidence,
            language: transcription.language,
            timestamp: transcription.timestamp
        });
    }

    /**
     * Handle audio device changes
     */
    handleAudioDeviceChanges(changes) {
        logger.info('Audio devices changed: +, -');
        
        // Notify renderer of device changes
        this.sendToRenderer('audio-devices-changed', {
            added: changes.added,
            removed: changes.removed,
            available: audioDeviceManager.getAllDevices()
        });
        
        // Show notification for significant changes (if available)
        if (notificationManager) {
            if (changes.removed.length > 0) {
                notificationManager.showWarning(`${changes.removed.length} audio device(s) disconnected`);
            }
            if (changes.added.length > 0) {
                notificationManager.showInfo(`${changes.added.length} new audio device(s) detected`);
            }
        }
    }

    /**
     * Handle voice activity detection
     */
    handleVoiceActivity(activity) {
        // Send voice activity status to renderer for UI updates
        this.sendToRenderer('voice-activity', {
            active: activity.active,
            confidence: activity.confidence,
            timestamp: activity.timestamp
        });
    }

    /**
     * Handle feature integration actions
     */
    async handleFeatureIntegrationAction(action) {
        logger.info('Feature integration action:');
        
        // Delegate to voice action handler
        await this.handleVoiceAction(action);
    }

    sendToRenderer(channel, data) {
        const { windowPool } = require('../../window/windowManager');
        const listenWindow = windowPool?.get('listen');
        
        if (listenWindow && !listenWindow.isDestroyed()) {
            listenWindow.webContents.send(channel, data);
        }
    }

    /**
     * Set up IPC handlers for enhanced audio features
     */
    setupIpcHandlers() {
        const { ipcMain } = require('electron');
        
        // TTS Audio Interference Prevention Handlers
        ipcMain.handle('listen:pause-system-audio', async (event) => {
            try {
                const result = await this.sttService.pauseSystemAudioCapture();
                logger.info('[ListenService] System audio capture paused for TTS playback');
                return result;
            } catch (error) {
                logger.error('Failed to pause system audio capture:', { error });
                return { success: false, error: error.message };
            }
        });
        
        ipcMain.handle('listen:resume-system-audio', async (event) => {
            try {
                const result = await this.sttService.resumeSystemAudioCapture();
                logger.info('[ListenService] System audio capture resumed after TTS playback');
                return result;
            } catch (error) {
                logger.error('Failed to resume system audio capture:', { error });
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle('listen:pause-microphone', async (event) => {
            try {
                const result = await this.sttService.pauseMicrophoneCapture();
                logger.info('[ListenService] Microphone capture paused for TTS playback');
                return result;
            } catch (error) {
                logger.error('Failed to pause microphone capture:', { error });
                return { success: false, error: error.message };
            }
        });
        
        ipcMain.handle('listen:resume-microphone', async (event) => {
            try {
                const result = await this.sttService.resumeMicrophoneCapture();
                logger.info('[ListenService] Microphone capture resumed after TTS playback');
                return result;
            } catch (error) {
                logger.error('Failed to resume microphone capture:', { error });
                return { success: false, error: error.message };
            }
        });
        
        logger.info('[ListenService] IPC handlers configured');
    }

    initialize() {
        this.setupIpcHandlers();
        logger.info('[ListenService] Initialized and ready.');
    }

    async handleListenRequest(listenButtonText) {
        logger.info('[SEARCH] DEBUG: handleListenRequest called with:', listenButtonText);
        
        const { windowPool, updateLayout } = require('../../window/windowManager');
        const listenWindow = windowPool.get('listen');
        const header = windowPool.get('header');

        logger.info('[SEARCH] DEBUG: Windows obtained:', {
            listenWindow: !!listenWindow,
            header: !!header
        });

        try {
            switch (listenButtonText) {
                case 'Listen':
                    logger.info('[ListenService] [SEARCH] DEBUG: Processing "Listen" case');
                    logger.info('[ListenService] [START] Enhanced session start with pre-initialization');
                    
                    logger.info('[SEARCH] DEBUG: About to emit window:requestVisibility');
                    internalBridge.emit('window:requestVisibility', { name: 'listen', visible: true });
                    logger.info('[SEARCH] DEBUG: window:requestVisibility emitted successfully');
                    
                    logger.info('[SEARCH] DEBUG: About to call preInitializeComponents');
                    // [TOOL] Pre-initialize critical components before session start
                    await this.preInitializeComponents();
                    logger.info('[SEARCH] DEBUG: preInitializeComponents completed');
                    
                    logger.info('[SEARCH] DEBUG: About to call initializeSession');
                    const sessionInitialized = await this.initializeSession();
                    logger.info('[SEARCH] DEBUG: initializeSession returned:', sessionInitialized);
                    
                    if (sessionInitialized) {
                        logger.info('[SEARCH] DEBUG: Session initialized successfully, sending session-state-changed');
                        listenWindow.webContents.send('session-state-changed', { isActive: true });
                        logger.info('[SEARCH] DEBUG: session-state-changed sent successfully');
                        
                        // Start audio capture when user actually clicks the listen button
                        logger.info('[ListenService] Starting audio capture for user-initiated listen request');
                        logger.info('[SEARCH] DEBUG: About to call sendToRenderer with change-listen-capture-state');
                        this.sendToRenderer('change-listen-capture-state', { status: "start" });
                        logger.info('[SEARCH] DEBUG: change-listen-capture-state sent successfully');
                        
                        logger.info('[ListenService] Session successfully started and activated');
                    } else {
                        logger.error('[ListenService] [SEARCH] DEBUG: Session initialization failed - not activating');
                        listenWindow.webContents.send('session-state-changed', { isActive: false });
                        throw new Error('Session initialization failed');
                    }
                    break;
        
                case 'Stop':
                    logger.info('[ListenService] changeSession to "Stop"');
                    await this.closeSession();
                    listenWindow.webContents.send('session-state-changed', { isActive: false });
                    break;
        
                case 'Done':
                    logger.info('[ListenService] changeSession to "Done"');
                    internalBridge.emit('window:requestVisibility', { name: 'listen', visible: false });
                    listenWindow.webContents.send('session-state-changed', { isActive: false });
                    break;
        
                default:
                    throw new Error(`[ListenService] unknown listenButtonText: ${listenButtonText}`);
            }
            
            logger.info('[SEARCH] DEBUG: About to send listen:changeSessionResult success to header');
            header.webContents.send('listen:changeSessionResult', { success: true });
            logger.info('[SEARCH] DEBUG: listen:changeSessionResult success sent successfully');

        } catch (error) {
            logger.error('[SEARCH] DEBUG: error in handleListenRequest:', { error });
            logger.error('[SEARCH] DEBUG: About to send listen:changeSessionResult failure to header');
            header.webContents.send('listen:changeSessionResult', { success: false });
            logger.error('[SEARCH] DEBUG: listen:changeSessionResult failure sent successfully');
            throw error; 
        }
    }

    async preInitializeComponents() {
        logger.info('[ListenService] [TOOL] Pre-initializing components for reliable startup...');
        
        try {
            // Pre-initialize model state service
            const modelStateService = require('../../common/services/modelStateService');
            
            // Ensure Deepgram is selected and ready
            const modelInfo = modelStateService.getCurrentModelInfo('stt');
            if (!modelInfo || modelInfo.provider !== 'deepgram') {
                logger.info('[ListenService] [LOADING] Pre-initializing Deepgram selection...');
                const deepgramKey = modelStateService.getApiKey('deepgram');
                if (deepgramKey) {
                    if (modelStateService.state?.selectedModels) {
                        modelStateService.state.selectedModels.stt = null;
                    }
                    modelStateService._autoSelectAvailableModels(['stt']);
                    
                    // Wait a moment for selection to complete
                    await new Promise(resolve => setTimeout(resolve, 100));
                    
                    // Verify selection worked
                    const updatedModelInfo = modelStateService.getCurrentModelInfo('stt');
                    logger.info('[ListenService] [SEARCH] Post-selection model info:', {
                        provider: updatedModelInfo?.provider,
                        model: updatedModelInfo?.model,
                        hasApiKey: !!updatedModelInfo?.apiKey
                    });
                }
            } else {
                logger.info('[ListenService] [OK] Deepgram already selected:', {
                    provider: modelInfo.provider,
                    model: modelInfo.model
                });
            }
            
            // Pre-warm audio context (helps prevent browser audio context suspension)
            if (typeof window !== 'undefined' && window.AudioContext) {
                try {
                    const tempContext = new AudioContext();
                    await tempContext.resume();
                    tempContext.close();
                    logger.info('[ListenService] [MUSIC] Audio context pre-warmed');
                } catch (audioError) {
                    logger.warn('[ListenService] Audio context pre-warm failed:', audioError.message);
                }
            }
            
            logger.info('[ListenService] [OK] Components pre-initialized successfully');
        } catch (error) {
            logger.warn('[ListenService] [WARNING] Component pre-initialization failed (continuing anyway):', error.message);
        }
    }

    async handleTranscriptionComplete(speaker, text) {
        // Handle transcription completion
        
        // Update personality context based on transcription
        if (speaker === 'user' && this.personalityInitialized && this.agentPersonalityManager) {
            this.updatePersonalityContextForVoice(text);
        }
        
        // Add to summary service conversation history for analysis
        this.summaryService.addConversationTurn(speaker, text);
        
        // Save to database
        await this.saveConversationTurn(speaker, text);
        
        // ============================================================================
        // MEMORY STORAGE: Store voice transcription in backend memory system
        // ============================================================================
        
        // Store voice transcription in backend memory for learning and context
        if (speaker === 'user' && text.trim()) {
            // Get current user and agent context (outside try block for scope)
            const currentUser = authService.getCurrentUser();
            const userId = currentUser?.uid || currentUser?.id || 'guest';
            
            try {
                const currentPersonality = this.agentPersonalityManager?.getCurrentPersonalityStatus();
                const agentId = currentPersonality?.id || 1; // Agent ID is already numeric from database
                
                logger.info('[ListenService] Current agent info', {
                    agentId,
                    agentName: currentPersonality?.name,
                    personalityType: currentPersonality?.personalityType
                });
                
                logger.info('[ListenService] Storing voice transcription in memory', {
                    agentId,
                    userId,
                    speaker,
                    textLength: text.length
                });
                
                // Store voice interaction in Episodic Memory (for learning)
                await this.memoryApiClient.storeEpisodicMemory(agentId, userId, {
                    content: {
                        type: 'voice_interaction',
                        transcription: text,
                        speaker: speaker,
                        interaction_type: 'listening_session',
                        metadata: {
                            sessionId: this.currentSessionId,
                            captureTime: new Date().toISOString(),
                            textLength: text.length,
                            processingMode: 'voice_to_text'
                        }
                    },
                    context: {
                        sessionId: this.currentSessionId,
                        mode: 'listening',
                        speaker: speaker
                    },
                    importance: 0.6 // Medium importance for voice transcriptions
                });
                
                // Store interaction pattern in Procedural Memory (for behavior learning)
                await this.memoryApiClient.storeProceduralMemory(agentId, userId, {
                    pattern: {
                        type: 'voice_interaction_pattern',
                        action: 'voice_input',
                        context: 'listening_session',
                        outcome: 'transcription_successful',
                        metadata: {
                            textLength: text.length,
                            sessionDuration: Date.now() - (this.sessionStartTime || Date.now()),
                            mode: 'listen'
                        }
                    },
                    context: {
                        sessionId: this.currentSessionId,
                        interactionMode: 'voice',
                        userEngagement: 'active'
                    },
                    success: true
                });
                
                logger.info('[ListenService] [OK] Voice transcription stored in memory system', {
                    agentId,
                    userId,
                    textPreview: text.substring(0, 50) + '...'
                });
                
            } catch (memoryError) {
                // Don't fail the main flow if memory storage fails
                logger.warn('[ListenService] [WARNING] Failed to store transcription in memory (non-blocking):', {
                    error: memoryError.message,
                    speaker,
                    userId: currentUser?.uid || 'unknown'
                });
            }
        }
        
        // ============================================================================
        // FIXED TTS ARCHITECTURE: Send raw transcript directly to TTS WebSocket
        // ============================================================================
        
        // Send raw user transcript directly to TTS WebSocket for agent analysis + TTS generation  
        // Note: STT sends 'Me' for microphone input, but we check for both 'user' and 'Me'
        // IMPORTANT: Only trigger agent in agent mode (purple), not in listen mode (green)
        
        // Use local agent mode state (updated via internal bridge events)
        const isInAgentMode = this.agentModeActive;
        
        logger.info(`[ListenService] [TOOL] DEBUG TTS check: speaker="${speaker}", text="${text.trim()}", isInAgentMode=${isInAgentMode}, shouldSend=${(speaker === 'user' || speaker === 'Me') && text.trim() && isInAgentMode}`);
        
        if ((speaker === 'user' || speaker === 'Me') && text.trim() && isInAgentMode) {
            try {
                const currentUser = authService.getCurrentUser();
                const userId = currentUser?.uid || currentUser?.id || 'guest';
                const currentPersonality = this.agentPersonalityManager?.getCurrentPersonalityStatus();
                const agentId = currentPersonality?.id || 1; // Agent ID is already numeric from database
                
                // Sending transcript to TTS agent for voice response
                
                // Capture screenshot for TTS context
                const screenshotResult = await captureScreenshotForTTS();
                
                // Build context with actual screenshot data if available
                const context = {
                    userId: userId,
                    sessionId: this.currentSessionId,
                    speaker: speaker,
                    includeScreenshot: screenshotResult.success,
                    includeKnowledge: true,   // TTS agent can use RAG knowledge
                    timestamp: new Date().toISOString()
                };
                
                // Add screenshot data if capture was successful
                if (screenshotResult.success) {
                    context.screenshot = screenshotResult.base64;
                    context.imageContext = `full screen (${screenshotResult.width}x${screenshotResult.height})`;
                    logger.info('[ListenService] 📸 Screenshot included in TTS context', {
                        width: screenshotResult.width,
                        height: screenshotResult.height,
                        dataSize: `${Math.round(screenshotResult.base64.length / 1024)}KB`
                    });
                } else {
                    logger.warn('[ListenService] [WARNING] No screenshot data - TTS will use text-only context');
                }
                
                // Send raw transcript to frontend for TTS WebSocket processing
                this.sendToRenderer('raw-transcript-for-tts', {
                    agentId: agentId,
                    transcript: text, // Raw transcript from STT
                    context: context
                });
                
                logger.info('[ListenService] [OK] Raw transcript sent to TTS system');
                
            } catch (ttsError) {
                // Don't fail the main flow if TTS fails
                logger.warn('[ListenService] [WARNING] Failed to send transcript to TTS (non-blocking):', {
                    error: ttsError.message,
                    speaker,
                    textLength: text.length
                });
            }
        } else if ((speaker === 'user' || speaker === 'Me') && text.trim() && !isInAgentMode) {
            // User spoke but we're in listen mode (green) - only transcribe, don't trigger agent
            logger.info('[ListenService] [TEXT] Listen mode active - transcribing only, agent not triggered', {
                speaker,
                textLength: text.length,
                isInAgentMode,
                mode: 'listen-only'
            });
        }
        
        // Keep original agent analysis for listen view (summary service)
        await this.triggerAgentAnalysis();
    }

    async triggerAgentAnalysis() {
        try {
            const conversationHistory = this.summaryService.conversationHistory;
            logger.info('[AI] Checking if agent analysis should trigger based on conversation count');
            
            // Use the proper threshold-based analysis (only triggers at 5, 10, 15+ conversations)
            await this.summaryService.triggerAnalysisIfNeeded();
            
            // NOTE: TTS handling is done separately in handleTranscriptionComplete()
            // with raw transcript data for TTS Agent integration
            
        } catch (error) {
            logger.error('[ERROR] Agent analysis failed:', error);
            this.sendToRenderer('analysis-error', {
                error: error.message,
                timestamp: Date.now()
            });
        }
    }

    // REMOVED: Legacy TTS methods - now using raw transcript architecture
    // Old handleTTSForAnalysis and formatAnalysisForTTS methods removed
    // TTS processing now happens in handleTranscriptionComplete with raw transcript data

    async saveConversationTurn(speaker, transcription) {
        if (!this.currentSessionId) {
            logger.error('Cannot save turn, no active session ID.');
            return;
        }
        if (transcription.trim() === '') return;

        try {
            await sessionRepository.touch(this.currentSessionId);
            await sttRepository.addTranscript({
                sessionId: this.currentSessionId,
                speaker: speaker,
                text: transcription.trim(),
            });
            logger.info('Saved transcript for session : ()');
        } catch (error) {
            logger.error('Error occurred', { error  });
        }
    }

    async initializeNewSession() {
        try {
            // The UID is no longer passed to the repository method directly.
            // The adapter layer handles UID injection. We just ensure a user is available.
            const user = authService.getCurrentUser();
            if (!user) {
                // This case should ideally not happen as authService initializes a default user.
                throw new Error("Cannot initialize session: auth service not ready.");
            }
            
            this.currentSessionId = await sessionRepository.getOrCreateActive('listen');
            logger.info('New listen session ensured:');

            // Set session ID for summary service
            this.summaryService.setSessionId(this.currentSessionId);
            
            // Reset conversation history
            this.summaryService.resetConversationHistory();

            logger.info('New conversation session started:', this.currentSessionId);
            return true;
        } catch (error) {
            logger.error('Error occurred', { error  });
            this.currentSessionId = null;
            return false;
        }
    }

    async initializeSession(language = 'en') {
        if (this.isInitializingSession) {
            logger.info('Session initialization already in progress.');
            return false;
        }

        this.isInitializingSession = true;
        this.sendToRenderer('session-initializing', true);
        this.sendToRenderer('update-status', 'Initializing sessions...');

        try {
            // Force Deepgram selection if available for ultra-low latency
            try {
                const modelStateService = require('../../common/services/modelStateService');
                const deepgramKey = modelStateService.getApiKey('deepgram');
                const currentSTT = modelStateService.getCurrentModelInfo('stt');
                
                if (deepgramKey && currentSTT?.provider !== 'deepgram') {
                    logger.info('[ListenService] [START] Forcing Deepgram selection for ultra-low latency STT');
                    // Clear current selection and force reselection
                    if (modelStateService.state?.selectedModels) {
                        modelStateService.state.selectedModels.stt = null;
                    }
                    modelStateService._autoSelectAvailableModels(['stt']);
                    logger.info('[ListenService] [OK] Deepgram auto-selection completed');
                }
            } catch (error) {
                logger.warn('[ListenService] Could not force Deepgram selection:', error.message);
            }
            
            // Initialize database session
            const sessionInitialized = await this.initializeNewSession();
            if (!sessionInitialized) {
                // Fallback: Create temporary session ID for STT functionality
                logger.warn('[ListenService] Database session initialization failed, using temporary session');
                this.currentSessionId = 'temp_session_' + Date.now();
                this.summaryService.setSessionId(this.currentSessionId);
                this.summaryService.resetConversationHistory();
            }

            // Enhanced audio services have been removed

            /* ---------- STT Initialization Retry Logic ---------- */
            logger.info('[SEARCH] DEBUG: About to start STT initialization retry logic');
            const MAX_RETRY = 10;
            const RETRY_DELAY_MS = 300;   // 0.3 seconds

            let sttReady = false;
            let lastError = null;
            for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
                try {
                    logger.info(`[SEARCH] DEBUG: STT init attempt ${attempt}/${MAX_RETRY} - calling sttService.initializeSttSessions(${language})`);
                    await this.sttService.initializeSttSessions(language);
                    logger.info(`[SEARCH] DEBUG: STT init attempt ${attempt}/${MAX_RETRY} SUCCESS!`);
                    sttReady = true;
                    break;                         // Exit on success
                } catch (err) {
                    lastError = err;
                    logger.error(`[SEARCH] DEBUG: STT init attempt ${attempt}/${MAX_RETRY} FAILED:`, {
                        error: err.message,
                        stack: err.stack,
                        name: err.name
                    });
                    logger.warn(`[ListenService] STT init attempt ${attempt}/${MAX_RETRY} failed:`, {
                        error: err.message,
                        stack: err.stack,
                        name: err.name
                    });
                    if (attempt < MAX_RETRY) {
                        logger.info(`[SEARCH] DEBUG: Waiting ${RETRY_DELAY_MS}ms before retry...`);
                        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
                    }
                }
            }
            if (!sttReady) {
                const errorMessage = `STT init failed after ${MAX_RETRY} retries. Last error: ${lastError?.message || 'Unknown error'}`;
                logger.error('[SEARCH] DEBUG: STT initialization completely failed after all retries');
                logger.error('[ListenService] STT initialization completely failed:', {
                    lastError: lastError?.message,
                    stack: lastError?.stack,
                    retryCount: MAX_RETRY
                });
                throw new Error(errorMessage);
            }
            logger.info('[SEARCH] DEBUG: STT initialization retry logic completed successfully');
            /* ------------------------------------------- */

            // Start system audio capture after STT sessions are ready (simplified - no TTS coordination needed)
            logger.info('🎛️ Starting system audio capture...');
            try {
                await this.sttService.startParallelAudioCapture();
                logger.info('🎛️ [OK] System audio capture started');
            } catch (error) {
                logger.warn('🎛️ [ERROR] System audio initialization error (continuing anyway):', error.message);
            }

            logger.info('[OK] Listen service initialized successfully.');
            
            this.sendToRenderer('update-status', 'Connected. Ready to listen.');
            
            // NOTE: Removed automatic audio capture start - should only start when user clicks listen button
            // this.sendToRenderer('change-listen-capture-state', { status: "start" });
            
            // Show session started notification (if available)
            if (notificationManager) {
                notificationManager.showSessionChange('started');
            }
            
            return true;
        } catch (error) {
            logger.error('Error occurred', { error  });
            this.sendToRenderer('update-status', 'Initialization failed.');
            
            // Show error notification (if available)
            if (notificationManager) {
                notificationManager.showError(`Failed to initialize session: ${error.message}`);
            }
            
            return false;
        } finally {
            this.isInitializingSession = false;
            this.sendToRenderer('session-initializing', false);
        }
    }


    async sendMicAudioContent(data, mimeType) {
        return await this.sttService.sendMicAudioContent(data, mimeType);
    }

    async startMacOSAudioCapture() {
        if (process.platform !== 'darwin') {
            throw new Error('macOS audio capture only available on macOS');
        }
        return await this.sttService.startMacOSAudioCapture();
    }

    async stopMacOSAudioCapture() {
        this.sttService.stopMacOSAudioCapture();
    }

    isSessionActive() {
        return this.sttService.isSessionActive();
    }

    async closeSession() {
        try {
            this.sendToRenderer('change-listen-capture-state', { status: "stop" });
            
            // Stop enhanced audio services if they were enabled
            if (this.enhancedAudioEnabled && featureIntegrationService) {
                await this.stopEnhancedAudioServices();
            }
            
            // Close STT sessions
            await this.sttService.closeSessions();

            await this.stopMacOSAudioCapture();

            // End database session
            if (this.currentSessionId) {
                await sessionRepository.end(this.currentSessionId);
                logger.info('Session  ended.');
            }

            // Reset state
            this.currentSessionId = null;
            this.enhancedAudioEnabled = false;
            this.voiceCommandsEnabled = false;
            this.selectedAudioDevice = null;
            this.audioProcessingActive = false;
            this.summaryService.resetConversationHistory();

            logger.info('Listen service session closed.');
            
            // Show session stopped notification (if available)
            if (notificationManager) {
                notificationManager.showSessionChange('stopped');
            }
            
            return { success: true };
        } catch (error) {
            logger.error('Error occurred', { error  });
            
            // Show error notification (if available)
            if (notificationManager) {
                notificationManager.showError(`Failed to close session: ${error.message}`);
            }
            
            return { success: false, error: error.message };
        }
    }

    /**
     * Stop enhanced audio services
     */
    async stopEnhancedAudioServices() {
        logger.info('[ListenService] Stopping enhanced audio services...');
        
        try {
            // Check if feature integration service is available
            if (!featureIntegrationService) {
                logger.warn('[ListenService] Feature integration service not available for stopping enhanced audio services');
                return;
            }
            
            // Stop voice command processing
            if (this.voiceCommandsEnabled) {
                await featureIntegrationService.stopVoiceCommands();
                this.voiceCommandsEnabled = false;
            }
            
            // Stop speech-to-text processing
            if (this.enhancedAudioEnabled) {
                await featureIntegrationService.stopSpeechToText();
                this.enhancedAudioEnabled = false;
            }
            
            // Stop audio processing
            await featureIntegrationService.stopAudioProcessing();
            this.audioProcessingActive = false;
            
            logger.info('[ListenService] Enhanced audio services stopped');
            this.sendToRenderer('enhanced-audio-status', {
                enabled: false,
                voiceCommands: false,
                devices: null
            });
            
        } catch (error) {
            logger.warn('Error stopping enhanced audio services:', { error });
        }
    }

    getCurrentSessionData() {
        return {
            sessionId: this.currentSessionId,
            conversationHistory: this.summaryService.getConversationHistory(),
            totalTexts: this.summaryService.getConversationHistory().length,
            analysisData: this.summaryService.getCurrentAnalysisData(),
        };
    }

    getConversationHistory() {
        return this.summaryService.getConversationHistory();
    }

    _createHandler(asyncFn, successMessage, errorMessage) {
        return async (...args) => {
            try {
                const result = await asyncFn.apply(this, args);
                if (successMessage) logger.info('Debug', { data: successMessage });
                // `startMacOSAudioCapture` does not return a { success, error } object on success,
                // so we return a success object here to ensure consistent handler responses.
                // Other functions already return success objects.
                return result && typeof result.success !== 'undefined' ? result : { success: true };
            } catch (e) {
                logger.error('Error occurred', { error: errorMessage, e });
                return { success: false, error: e.message };
            }
        };
    }

    // `_createHandler`[Korean comment translated] [Korean comment translated] [Korean comment translated] [Korean comment translated] [Korean comment translated].
    handleSendMicAudioContent = this._createHandler(
        this.sendMicAudioContent,
        null,
        'Error sending user audio:'
    );

    handleStartMacosAudio = this._createHandler(
        async () => {
            if (process.platform !== 'darwin') {
                return { success: false, error: 'macOS audio capture only available on macOS' };
            }
            if (this.sttService.isMacOSAudioRunning?.()) {
                return { success: false, error: 'already_running' };
            }
            await this.startMacOSAudioCapture();
            return { success: true, error: null };
        },
        'macOS audio capture started.',
        'Error starting macOS audio capture:'
    );
    
    handleStopMacosAudio = this._createHandler(
        this.stopMacOSAudioCapture,
        'macOS audio capture stopped.',
        'Error stopping macOS audio capture:'
    );

    handleUpdateGoogleSearchSetting = this._createHandler(
        async (enabled) => {
            logger.info('Google Search setting updated to:', enabled);
        },
        null,
        'Error updating Google Search setting:'
    );

    // Speaker Control for Hardware Acoustic Coupling Prevention
    handleMuteSpeakers = this._createHandler(
        async () => {
            if (process.platform !== 'win32') {
                return { success: false, error: 'Speaker control only available on Windows' };
            }
            
            // Get current system volume before muting
            const currentVolume = await this.getSystemVolume();
            if (currentVolume === null) {
                return { success: false, error: 'Failed to get current volume' };
            }
            
            // Mute speakers by setting volume to 0
            const muteResult = await this.setSystemVolume(0);
            if (!muteResult) {
                return { success: false, error: 'Failed to mute speakers' };
            }
            
            logger.info(`[ListenService] 🔇 Speakers muted (volume: ${currentVolume} → 0)`);
            return { success: true, originalVolume: currentVolume };
        },
        null,
        'Error muting speakers:'
    );
    
    handleUnmuteSpeakers = this._createHandler(
        async (originalVolume) => {
            if (process.platform !== 'win32') {
                return { success: false, error: 'Speaker control only available on Windows' };
            }
            
            const volume = originalVolume || 50; // Default to 50% if no original volume
            const unmuteResult = await this.setSystemVolume(volume);
            if (!unmuteResult) {
                return { success: false, error: 'Failed to unmute speakers' };
            }
            
            logger.info(`[ListenService] [AUDIO] Speakers unmuted (volume: 0 → ${volume})`);
            return { success: true, volume: volume };
        },
        null,
        'Error unmuting speakers:'
    );

    /**
     * Set audio input device for enhanced audio processing
     */
    async setAudioInputDevice(deviceId) {
        try {
            if (!this.enhancedAudioEnabled) {
                throw new Error('Enhanced audio services not enabled');
            }
            
            const result = await featureIntegrationService.setAudioInputDevice(deviceId);
            
            if (result) {
                this.selectedAudioDevice = deviceId;
                
                // Notify renderer of device change
                this.sendToRenderer('audio-input-device-changed', {
                    deviceId,
                    success: true
                });
                
                logger.info('Audio input device set to:');
            }
            
            return { success: true };
        } catch (error) {
            logger.error('Failed to set audio input device:', { error });
            
            this.sendToRenderer('audio-input-device-changed', {
                deviceId,
                success: false,
                error: error.message
            });
            
            return { success: false, error: error.message };
        }
    }

    /**
     * Get available audio devices
     */
    getAvailableAudioDevices() {
        try {
            if (!this.enhancedAudioEnabled) {
                return { input: [], output: [], system: [] };
            }
            
            return featureIntegrationService.getAudioDevices();
        } catch (error) {
            logger.error('Failed to get audio devices:', { error });
            return { input: [], output: [], system: [] };
        }
    }

    /**
     * Add custom voice command
     */
    addCustomVoiceCommand(phrase, action, description = '') {
        try {
            if (!this.voiceCommandsEnabled) {
                throw new Error('Voice commands not enabled');
            }
            
            const handler = async () => {
                this.handleVoiceAction({ action, phrase });
            };
            
            const result = featureIntegrationService.addVoiceCommand(phrase, handler, description);
            
            if (result) {
                logger.info('Added custom voice command: "" ->');
                
                // Notify renderer
                this.sendToRenderer('voice-command-added', {
                    phrase,
                    action,
                    description,
                    success: true
                });
            }
            
            return { success: true };
        } catch (error) {
            logger.error('Failed to add voice command:', { error });
            
            this.sendToRenderer('voice-command-added', {
                phrase,
                action,
                description,
                success: false,
                error: error.message
            });
            
            return { success: false, error: error.message };
        }
    }

    /**
     * Get voice command statistics
     */
    getVoiceCommandStats() {
        try {
            if (!this.voiceCommandsEnabled) {
                return null;
            }
            
            return featureIntegrationService.getVoiceCommandStats();
        } catch (error) {
            logger.error('Failed to get voice command stats:', { error });
            return null;
        }
    }

    /**
     * Get audio processing statistics
     */
    getAudioProcessingStats() {
        try {
            if (!this.enhancedAudioEnabled) {
                return null;
            }
            
            return featureIntegrationService.getAudioStats();
        } catch (error) {
            logger.error('Failed to get audio stats:', { error });
            return null;
        }
    }

    /**
     * Update personality context based on voice input
     * @param {string} text - Voice/transcription text
     */
    updatePersonalityContextForVoice(text) {
        if (!this.personalityInitialized || !this.agentPersonalityManager) {
            return;
        }
        
        const textLower = text.toLowerCase();
        
        // Check if user is explicitly requesting personality change
        const personalityChangePatterns = [
            /switch to (.*) personality/,
            /use (.*) personality/,
            /change to (.*) mode/,
            /be more (.*)/,
            /act like a (.*)/
        ];
        
        for (const pattern of personalityChangePatterns) {
            const match = textLower.match(pattern);
            if (match) {
                const requested = match[1].trim();
                const recommendations = this.agentPersonalityManager.getPersonalityRecommendations('general');
                
                // Try to match the requested personality
                const personality = recommendations.find(p => 
                    p.personality.name.toLowerCase().includes(requested) ||
                    p.personality.id.includes(requested.replace(' ', '_'))
                );
                
                if (personality) {
                    this.agentPersonalityManager.switchPersonality(personality.id);
                    logger.info(`[ListenService] Switched to ${personality.id} via voice command`);
                }
                return;
            }
        }
        
        // Determine context factors for adaptive behavior
        const contextFactors = {
            taskType: this.detectTaskTypeFromVoice(textLower),
            urgency: this.detectUrgencyFromVoice(textLower),
            complexity: this.detectComplexityFromVoice(textLower),
            userMood: this.detectUserMoodFromVoice(textLower),
            userLevel: 'intermediate' // Default for voice interaction
        };
        
        // Update context in personality manager
        this.agentPersonalityManager.updateContextFactors(contextFactors);
        
        logger.info('[ListenService] Updated personality context from voice:', contextFactors);
    }
    
    /**
     * Detect task type from voice input
     */
    detectTaskTypeFromVoice(text) {
        const taskMappings = {
            'educational': ['explain', 'teach', 'learn', 'understand', 'what is', 'how does'],
            'technical': ['debug', 'code', 'programming', 'error', 'fix', 'technical'],
            'creative': ['create', 'design', 'brainstorm', 'idea', 'creative'],
            'research': ['search', 'find', 'research', 'investigate', 'look up'],
            'business': ['meeting', 'schedule', 'plan', 'organize', 'management']
        };
        
        for (const [type, keywords] of Object.entries(taskMappings)) {
            if (keywords.some(keyword => text.includes(keyword))) {
                return type;
            }
        }
        
        return 'general';
    }
    
    /**
     * Detect urgency from voice input
     */
    detectUrgencyFromVoice(text) {
        const urgentPatterns = ['urgent', 'quickly', 'asap', 'immediately', 'right now', 'emergency'];
        return urgentPatterns.some(pattern => text.includes(pattern)) ? 'high' : 'normal';
    }
    
    /**
     * Detect complexity from voice input
     */
    detectComplexityFromVoice(text) {
        const complexPatterns = ['complex', 'advanced', 'detailed', 'comprehensive', 'thorough'];
        const simplePatterns = ['simple', 'basic', 'quick', 'brief', 'short'];
        
        if (complexPatterns.some(pattern => text.includes(pattern))) {
            return 'high';
        } else if (simplePatterns.some(pattern => text.includes(pattern))) {
            return 'low';
        }
        
        return 'medium';
    }
    
    /**
     * Detect user mood from voice input
     */
    detectUserMoodFromVoice(text) {
        const frustratedPatterns = ['frustrated', 'stuck', 'confused', 'help me', 'not working'];
        const positivePatterns = ['great', 'awesome', 'perfect', 'thanks', 'excellent'];
        
        if (frustratedPatterns.some(pattern => text.includes(pattern))) {
            return 'frustrated';
        } else if (positivePatterns.some(pattern => text.includes(pattern))) {
            return 'positive';
        }
        
        return 'neutral';
    }

    /**
     * Get enhanced audio service status
     */
    getEnhancedAudioStatus() {
        return {
            enhanced: this.enhancedAudioEnabled,
            voiceCommands: this.voiceCommandsEnabled,
            selectedDevice: this.selectedAudioDevice,
            audioProcessing: this.audioProcessingActive,
            devices: this.getAvailableAudioDevices(),
            stats: {
                voiceCommands: this.getVoiceCommandStats(),
                audioProcessing: this.getAudioProcessingStats()
            }
        };
    }

    /**
     * Get current system volume on Windows
     * @returns {Promise<number|null>} Volume percentage (0-100) or null if failed
     */
    async getSystemVolume() {
        if (process.platform !== 'win32') return null;
        
        try {
            const { exec } = require('child_process');
            const util = require('util');
            const execAsync = util.promisify(exec);
            
            // Use Windows PowerShell to get master volume
            const command = `powershell -Command "[audio]::Volume * 100" 2>$null || powershell -Command "Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public class Win32Volume { [DllImport(\\"winmm.dll\\")] public static extern int waveOutGetVolume(IntPtr hwo, out uint dwVolume); }'; [Win32Volume]::waveOutGetVolume([IntPtr]::Zero, [ref]$vol); ($vol -band 0xFFFF) / 655.35"`;
            
            const { stdout } = await execAsync(command);
            const volume = Math.round(parseFloat(stdout.trim()));
            
            return !isNaN(volume) ? Math.max(0, Math.min(100, volume)) : null;
        } catch (error) {
            logger.warn('[ListenService] Failed to get system volume:', error.message);
            return null;
        }
    }

    /**
     * Set system volume on Windows
     * @param {number} volume - Volume percentage (0-100)
     * @returns {Promise<boolean>} Success status
     */
    async setSystemVolume(volume) {
        if (process.platform !== 'win32') return false;
        
        try {
            const { exec } = require('child_process');
            const util = require('util');
            const execAsync = util.promisify(exec);
            
            const volumeDecimal = Math.max(0, Math.min(100, volume)) / 100;
            
            // Use Windows PowerShell to set master volume
            const command = `powershell -Command "[audio]::Volume = ${volumeDecimal}" 2>$null || powershell -Command "Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public class Win32Volume { [DllImport(\\"winmm.dll\\")] public static extern int waveOutSetVolume(IntPtr hwo, uint dwVolume); }'; $vol = [uint32]($volumeDecimal * 65535); [Win32Volume]::waveOutSetVolume([IntPtr]::Zero, ($vol -shl 16) -bor $vol)"`;
            
            await execAsync(command);
            return true;
        } catch (error) {
            logger.warn('[ListenService] Failed to set system volume:', error.message);
            return false;
        }
    }
}

const listenService = new ListenService();
module.exports = listenService;