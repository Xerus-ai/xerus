const { BrowserWindow } = require('electron');
const { createStreamingLLM } = require('../../common/ai/factory');
// Lazy require helper to avoid circular dependency issues
const getWindowManager = () => require('../../window/windowManager');
const internalBridge = require('../../bridge/internalBridge');

const getWindowPool = () => {
    try {
        return getWindowManager().windowPool;
    } catch {
        return null;
    }
};

const sessionRepository = require('../../common/repositories/session');
const askRepository = require('./repositories');
// Lazy import prompt manager to avoid circular dependency
const path = require('node:path');
const fs = require('node:fs');
const os = require('os');
const util = require('util');
const execFile = util.promisify(require('child_process').execFile);
const { desktopCapturer } = require('electron');
const modelStateService = require('../../common/services/modelStateService');

// Import enhanced platform manager
const { platformManager } = require('../../main/platform-manager');

// Import auth service for user context
const authService = require('../../common/services/authService');

// Import memory API client for backend memory storage
const MemoryApiClient = require('../../domains/conversation/memory-api-client');

const { fastContextManager } = require('../../domains/ai/fast-context-manager');
const { aiProviderManager } = require('../../domains/ai');
const { performanceMonitor } = require('../../domains/system');
const { createLogger } = require('../../common/services/logger.js');

// Lazy import personality manager to avoid circular dependency

const logger = createLogger('AskService');

// Initialize memory API client for backend memory storage
const memoryApiClient = new MemoryApiClient();

// Set memory client auth context
const currentUser = authService.getCurrentUser();
if (currentUser) {
    memoryApiClient.setAuthContext({
        userId: currentUser.uid || currentUser.id || 'guest',
        token: currentUser.accessToken,
        isGuest: currentUser.isGuest || false,
        permissions: currentUser.permissions || []
    });
}

// Try to load sharp, but don't fail if it's not available
let sharp;
try {
    sharp = require('sharp');
    logger.info('[AskService] Sharp module loaded successfully');
} catch (error) {
    logger.warn('Sharp module not available:', { message: error.message });
    logger.warn('Screenshot functionality will work with reduced image processing capabilities');
    sharp = null;
}
let lastScreenshot = null;

async function captureScreenshot(options = {}) {
    logger.info('[AskService] Capturing screenshot using platform manager');
    
    try {
        // Use the enhanced platform manager for cross-platform screen capture
        const screenCaptureService = platformManager.getScreenCaptureService();
        const result = await screenCaptureService.captureScreen(options);
        
        if (result.success) {
            lastScreenshot = {
                base64: result.base64,
                width: result.width,
                height: result.height,
                timestamp: result.timestamp,
            };
            
            logger.info('Screenshot captured successfully');
            return {
                success: true,
                base64: result.base64,
                width: result.width,
                height: result.height
            };
        } else {
            logger.error('Platform manager screenshot failed:', { error: result.error });
            return {
                success: false,
                error: result.error
            };
        }
    } catch (error) {
        logger.error('Screenshot capture error:', { error });
        return {
            success: false,
            error: error.message
        };
    }
}

// Legacy fallback function for backward compatibility
async function legacyCaptureScreenshot(options = {}) {
    if (process.platform === 'darwin') {
        try {
            const tempPath = path.join(os.tmpdir(), `screenshot-${Date.now()}.jpg`);

            await execFile('screencapture', ['-x', '-t', 'jpg', tempPath]);

            const imageBuffer = await fs.promises.readFile(tempPath);
            await fs.promises.unlink(tempPath);

            if (sharp) {
                try {
                    // Try using sharp for optimal image processing
                    const resizedBuffer = await sharp(imageBuffer)
                        .resize({ height: 384 })
                        .jpeg({ quality: 80 })
                        .toBuffer();

                    const base64 = resizedBuffer.toString('base64');
                    const metadata = await sharp(resizedBuffer).metadata();

                    lastScreenshot = {
                        base64,
                        width: metadata.width,
                        height: metadata.height,
                        timestamp: Date.now(),
                    };

                    return { success: true, base64, width: metadata.width, height: metadata.height };
                } catch (sharpError) {
                    logger.warn('Sharp module failed, falling back to basic image processing:', sharpError.message);
                }
            }
            
            // Fallback: Return the original image without resizing
            logger.info('[AskService] Using fallback image processing (no resize/compression)');
            const base64 = imageBuffer.toString('base64');
            
            lastScreenshot = {
                base64,
                width: null, // We don't have metadata without sharp
                height: null,
                timestamp: Date.now(),
            };

            return { success: true, base64, width: null, height: null };
        } catch (error) {
            logger.error('Error occurred', { error  });
            return { success: false, error: error.message };
        }
    }

    try {
        const sources = await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: {
                width: 1920,
                height: 1080,
            },
        });

        if (sources.length === 0) {
            throw new Error('No screen sources available');
        }
        const source = sources[0];
        const buffer = source.thumbnail.toJPEG(70);
        const base64 = buffer.toString('base64');
        const size = source.thumbnail.getSize();

        return {
            success: true,
            base64,
            width: size.width,
            height: size.height,
        };
    } catch (error) {
        logger.error('Error occurred', { error  });
        return {
            success: false,
            error: error.message,
        };
    }
}

/**
 * @class
 * @description
 */
class AskService {
    constructor() {
        this.abortController = null;
        this.state = {
            isVisible: false,
            isLoading: false,
            isStreaming: false,
            currentQuestion: '',
            currentResponse: '',
            showTextInput: true,
            currentProvider: null,
            contextOptimized: false,
        };
        
        // Enhanced features from provider manager
        this.aiProviderManager = aiProviderManager;
        this.performanceMonitor = performanceMonitor;
        this.requestHistory = [];
        
        // Personality manager integration
        this.agentPersonalityManager = null;
        this.personalityInitialized = false;
        
        // Agent data manager integration
        this.agentDataManager = null;
        
        // Ask repository for database operations
        this.askRepository = askRepository;
        
        this.initializePersonalityManager();
        this.initializeAgentDataManager();
        logger.info('[AskService] Service instance created.');
    }
    
    /**
     * Initialize personality manager integration
     */
    async initializePersonalityManager() {
        try {
            // Get personality manager - lazy import to avoid circular dependency
            const { agentPersonalityManager } = require('../../domains/agents');
            this.agentPersonalityManager = agentPersonalityManager;
            
            if (!this.agentPersonalityManager.initialized) {
                await this.agentPersonalityManager.initialize();
            }
            
            this.personalityInitialized = true;
            logger.info('[AskService] Personality manager integration initialized');
            
            // Listen for personality changes
            this.agentPersonalityManager.on('personalitySwitched', (event) => {
                logger.info(`[AskService] Personality switched: ${event.previous} → ${event.current}`);
                this._broadcastPersonalityUpdate(event);
            });
            
        } catch (error) {
            logger.warn('[AskService] Failed to initialize personality manager:', { error });
            this.personalityInitialized = false;
        }
    }
    
    /**
     * Initialize agent data manager integration
     */
    async initializeAgentDataManager() {
        try {
            // Get agent data manager from domains
            const { agentDataManager } = require('../../domains/agents/agent-data-manager.js');
            this.agentDataManager = agentDataManager;
            
            if (!this.agentDataManager.state.isInitialized) {
                await this.agentDataManager.initialize();
            }
            
            logger.info('[AskService] Agent data manager integration initialized');
        } catch (error) {
            logger.warn('[AskService] Failed to initialize agent data manager:', { error });
            this.agentDataManager = null;
        }
    }
    
    /**
     * Broadcast personality updates to UI
     */
    _broadcastPersonalityUpdate(event) {
        const askWindow = getWindowPool()?.get('ask');
        if (askWindow && !askWindow.isDestroyed()) {
            global.safeWebContentsSend(askWindow.webContents, 'ask:personalityChanged', {
                current: event.current,
                personality: event.personality,
                systemPrompt: event.personality ? this.agentPersonalityManager.getSystemPrompt() : null
            });
        }
    }
    
    // Handler methods for featureBridge delegation
    
    
    
    
    async handleStartTutorial(tutorialId) {
        try {
            const { featureIntegrationService } = require('../../services/feature-integration');
            const result = await featureIntegrationService.startTutorial(tutorialId || 'glass_basics');
            return { success: true, result };
        } catch (error) {
            logger.error('Failed to start tutorial:', { error });
            return { success: false, error: error.message };
        }
    }
    
    async handleTutorialNext() {
        try {
            const { demoTutorialAgent } = require('../../agents/demo-tutorial-agent');
            const result = demoTutorialAgent.advanceToNextStep();
            return { success: true, result };
        } catch (error) {
            logger.error('Failed to advance tutorial:', { error });
            return { success: false, error: error.message };
        }
    }
    
    async handleTutorialSkip() {
        try {
            const { demoTutorialAgent } = require('../../agents/demo-tutorial-agent');
            const result = demoTutorialAgent.skipTutorial();
            return { success: true, result };
        } catch (error) {
            logger.error('Failed to skip tutorial:', { error });
            return { success: false, error: error.message };
        }
    }
    
    async handleGetPersonalities() {
        try {
            // Use agentDataManager to get real agents from backend/database
            const agents = await this.agentDataManager.getAllAgents({ is_active: true });
            
            // Transform agents to personality format for compatibility
            const personalities = agents.map(agent => ({
                id: agent.id,
                name: agent.name,
                description: agent.description || 'No description available',
                capabilities: agent.capabilities || []
            }));
            
            // Get current personality state if available
            let current = null;
            if (this.personalityInitialized) {
                current = this.agentPersonalityManager.getCurrentPersonalityStatus();
            }
            
            logger.info('Loaded agents as personalities:', { count: personalities.length });
            
            return {
                success: true,
                personalities,
                current,
                isAdaptive: this.personalityInitialized ? 
                    this.agentPersonalityManager.getState().isAdaptive : false
            };
        } catch (error) {
            logger.error('Failed to get personalities from agents:', { error });
            
            // Fallback to hardcoded personalities if agents unavailable
            try {
                if (this.personalityInitialized) {
                    const personalities = this.agentPersonalityManager.getAvailablePersonalities();
                    const current = this.agentPersonalityManager.getCurrentPersonalityStatus();
                    
                    logger.warn('Using fallback hardcoded personalities');
                    return {
                        success: true,
                        personalities,
                        current,
                        isAdaptive: this.agentPersonalityManager.getState().isAdaptive
                    };
                }
            } catch (fallbackError) {
                logger.error('Fallback personalities also failed:', { fallbackError });
            }
            
            return { success: false, error: error.message };
        }
    }
    
    async handleSetPersonality(personalityId) {
        try {
            if (!this.personalityInitialized) {
                return { success: false, error: 'Personality manager not initialized' };
            }
            
            await this.agentPersonalityManager.switchPersonality(personalityId);
            const current = this.agentPersonalityManager.getCurrentPersonalityStatus();
            
            return { success: true, current };
        } catch (error) {
            logger.error('Failed to set personality:', { error });
            return { success: false, error: error.message };
        }
    }
    
    async handleGetPersonalityRecommendations(taskType, userLevel) {
        try {
            if (!this.personalityInitialized) {
                return { success: false, error: 'Personality manager not initialized' };
            }
            
            const recommendations = this.agentPersonalityManager.getPersonalityRecommendations(taskType, userLevel);
            return { success: true, recommendations };
        } catch (error) {
            logger.error('Failed to get personality recommendations:', { error });
            return { success: false, error: error.message };
        }
    }
    
    async handleToggleAdaptivePersonality(enabled) {
        try {
            if (!this.personalityInitialized) {
                return { success: false, error: 'Personality manager not initialized' };
            }
            
            this.agentPersonalityManager.updateConfig({ isAdaptive: enabled });
            const state = this.agentPersonalityManager.getState();
            
            return { success: true, isAdaptive: state.isAdaptive };
        } catch (error) {
            logger.error('Failed to toggle adaptive personality:', { error });
            return { success: false, error: error.message };
        }
    }

    _broadcastState() {
        const askWindow = getWindowPool()?.get('ask');
        if (askWindow && !askWindow.isDestroyed()) {
            // Create serializable state copy to prevent "Failed to serialize arguments" errors
            const serializableState = {
                isVisible: Boolean(this.state.isVisible),
                isLoading: Boolean(this.state.isLoading),
                isStreaming: Boolean(this.state.isStreaming),
                currentQuestion: String(this.state.currentQuestion || ''),
                currentResponse: String(this.state.currentResponse || ''),
                showTextInput: Boolean(this.state.showTextInput),
                currentProvider: this.state.currentProvider ? String(this.state.currentProvider) : null,
                contextOptimized: Boolean(this.state.contextOptimized)
            };
            global.safeWebContentsSend(askWindow.webContents, 'ask:stateUpdate', serializableState);
        }
    }

    async toggleAskButton(inputScreenOnly = false) {
        const askWindow = getWindowPool()?.get('ask');

        let shouldSendScreenOnly = false;
        if (inputScreenOnly && this.state.showTextInput && askWindow && askWindow.isVisible()) {
            shouldSendScreenOnly = true;
            await this.sendMessage('', []);
            return;
        }

        const hasContent = this.state.isLoading || this.state.isStreaming || (this.state.currentResponse && this.state.currentResponse.length > 0);

        if (askWindow && askWindow.isVisible() && hasContent) {
            this.state.showTextInput = !this.state.showTextInput;
            this._broadcastState();
        } else {
            if (askWindow && askWindow.isVisible()) {
                internalBridge.emit('window:requestVisibility', { name: 'ask', visible: false });
                this.state.isVisible = false;
            } else {
                logger.info('[AskService] Showing hidden Ask window');
                internalBridge.emit('window:requestVisibility', { name: 'ask', visible: true });
                this.state.isVisible = true;
            }
            if (this.state.isVisible) {
                this.state.showTextInput = true;
                this._broadcastState();
            }
        }
    }

    async closeAskWindow () {
            if (this.abortController) {
                this.abortController.abort('Window closed by user');
                this.abortController = null;
            }
    
            this.state = {
                isVisible      : false,
                isLoading      : false,
                isStreaming    : false,
                currentQuestion: '',
                currentResponse: '',
                showTextInput  : true,
            };
            this._broadcastState();
    
            internalBridge.emit('window:requestVisibility', { name: 'ask', visible: false });
    
            return { success: true };
        }
    

    /**
     * 
     * @param {string[]} conversationTexts
     * @returns {string}
     * @private
     */
    _formatConversationForPrompt(conversationTexts) {
        if (!conversationTexts || conversationTexts.length === 0) {
            return 'No conversation history available.';
        }
        return conversationTexts.slice(-30).join('\n');
    }

    /**
     * 
     * @param {string} userPrompt
     * @returns {Promise<{success: boolean, response?: string, error?: string}>}
     */
    async sendMessage(userPrompt, conversationHistoryRaw=[]) {
        const startTime = Date.now();
        const requestId = this.generateRequestId();
        
        internalBridge.emit('window:requestVisibility', { name: 'ask', visible: true });
        this.state = {
            ...this.state,
            isLoading: true,
            isStreaming: false,
            currentQuestion: userPrompt,
            currentResponse: '',
            showTextInput: false,
            contextOptimized: false,
        };
        this._broadcastState();

        if (this.abortController) {
            this.abortController.abort('New request received.');
        }
        this.abortController = new AbortController();
        const { signal } = this.abortController;

        let sessionId;
        let selectedProvider = null;

        try {
            logger.info('Processing message');
            
            // Initialize prompt manager if not already initialized (lazy import)
            const { promptManager } = require('../../domains/agents');
            if (!promptManager.state.initialized) {
                logger.info('[AskService] Initializing prompt manager...');
                await promptManager.initialize();
            }

            sessionId = await sessionRepository.getOrCreateActive('ask');
            
            console.log('[SEARCH] [DEBUG] Session created:', {
                sessionId
            });
            
            // Debug: Using backend API for conversation storage (Firebase removed)
            console.log('[SEARCH] [DEBUG] Using backend conversation API for message storage');
            
            await askRepository.addAiMessage({ sessionId, role: 'user', content: userPrompt.trim() });
            logger.info('DB: Saved user prompt to session');
            
            const modelInfo = modelStateService.getCurrentModelInfo('llm');
            if (!modelInfo || !modelInfo.apiKey) {
                throw new Error('AI model or API key not configured.');
            }
            logger.info(`Using model: ${modelInfo.model} for provider: ${modelInfo.provider}`);

            // Check if there's a persistent area selected, use it instead of full screen
            let screenshotResult;
            let screenshotBase64 = null;
            let screenshotContext = 'full screen';
            
            try {
                // Try to get persistent area capture first
                const { ipcMain } = require('electron');
                const { enhancedScreenCapture } = require('../../main/enhanced-screen-capture');
                
                // First check if there's a persistent area selected
                const status = enhancedScreenCapture.getStatus();
                logger.info('[AskService] Checking for persistent area:', {
                    hasSelectedArea: status.hasSelectedArea,
                    hasPersistentArea: status.hasPersistentArea,
                    selectedArea: status.selectedArea
                });
                
                const persistentAreaResult = await enhancedScreenCapture.capturePersistentArea();
                if (persistentAreaResult.success) {
                    // Use persistent area capture
                    screenshotResult = persistentAreaResult;
                    // The platform service returns base64 data in different fields depending on capture type
                    screenshotBase64 = persistentAreaResult.base64 || persistentAreaResult.data;
                    const area = persistentAreaResult.metadata?.area;
                    screenshotContext = `selected area (${area?.width}x${area?.height} pixels)`;
                    
                    // Debug logging
                    const contextWidth = persistentAreaResult.width || area?.width;
                    const contextHeight = persistentAreaResult.height || area?.height;
                    
                    logger.info('[AskService] Using persistent area capture for screenshot', {
                        hasBase64: !!screenshotBase64,
                        base64Length: screenshotBase64?.length,
                        base64Preview: screenshotBase64?.substring(0, 50) + '...',
                        areaInfo: area,
                        screenshotWidth: contextWidth,
                        screenshotHeight: contextHeight,
                        screenshotContext: screenshotContext
                    });

                    // DEBUG: Save what we're sending to AI for verification
                    if (screenshotBase64) {
                        try {
                            const os = require('os');
                            const path = require('path');
                            const fs = require('fs').promises;
                            
                            const tempDir = os.tmpdir();
                            const debugImagePath = path.join(tempDir, `ai-input-debug-${Date.now()}.jpg`);
                            const imageBuffer = Buffer.from(screenshotBase64, 'base64');
                            await fs.writeFile(debugImagePath, imageBuffer);
                            
                        } catch (debugError) {
                            logger.warn('[AskService] Failed to save AI input debug image:', debugError.message);
                        }
                    }
                } else {
                    // Fall back to full screen capture
                    logger.warn('[AskService] Persistent area capture failed, falling back to full screen:', {
                        error: persistentAreaResult.error,
                        persistentAreaResult: persistentAreaResult
                    });
                    screenshotResult = await captureScreenshot({ quality: 75 });
                    screenshotBase64 = screenshotResult.success ? screenshotResult.base64 : null;
                    screenshotContext = 'full screen';
                    logger.info('[AskService] Using full screen capture (persistent area failed)');
                }
            } catch (error) {
                logger.warn('[AskService] Failed to check persistent area, using full screen:', error);
                screenshotResult = await captureScreenshot({ quality: 75 });
                screenshotBase64 = screenshotResult.success ? screenshotResult.base64 : null;
                screenshotContext = 'full screen';
            }

            // Add user message to context manager
            fastContextManager.addContext({
                type: 'USER_MESSAGE',
                content: userPrompt,
                sessionId,
                timestamp: Date.now()
            });

            // Add screenshot to context manager if available
            if (screenshotBase64) {
                const contextWidth = screenshotResult.width || screenshotResult.metadata?.area?.width;
                const contextHeight = screenshotResult.height || screenshotResult.metadata?.area?.height;
                
                fastContextManager.addContext({
                    type: 'SCREENSHOT',
                    content: `Screenshot captured from ${screenshotContext}: ${contextWidth}x${contextHeight}`,
                    sessionId,
                    width: contextWidth,
                    height: contextHeight,
                    persistent: screenshotResult.metadata?.persistent || false,
                    base64: screenshotBase64.substring(0, 100) + '...' // Store truncated reference
                });
                
                // ============================================================================
                // MEMORY STORAGE: Store screenshot in backend memory system
                // ============================================================================
                
                // Store screenshot in backend memory (no duplication - smart reference system)
                try {
                    // Get current user and agent context
                    const userId = currentUser?.uid || currentUser?.id || 'guest';
                    const agentId = this.selectedAgentId || 1; // Default to agent 1 if none selected
                    
                    logger.info('[AskService] Storing screenshot in backend memory', {
                        agentId,
                        userId,
                        screenshotContext,
                        width: contextWidth,
                        height: contextHeight
                    });
                    
                    // Step 1: Store FULL visual data in Episodic Memory (single source of truth)
                    const episodicResult = await memoryApiClient.storeEpisodicMemory(agentId, userId, {
                        content: {
                            type: 'visual_memory',
                            screenshot: screenshotBase64, // Full base64 image stored here
                            context: screenshotContext,
                            user_query: userPrompt,
                            metadata: {
                                width: contextWidth,
                                height: contextHeight,
                                format: 'jpeg',
                                persistent: screenshotResult.metadata?.persistent || false,
                                captureTime: new Date().toISOString(),
                                sessionId: sessionId
                            }
                        },
                        context: {
                            userPrompt: userPrompt,
                            screenshotContext: screenshotContext,
                            sessionId: sessionId
                        },
                        importance: 0.8 // High importance for visual memories with user queries
                    });
                    
                    if (episodicResult.success) {
                        // Step 2: Store REFERENCE in Working Memory (no image duplication)
                        await memoryApiClient.storeWorkingMemory(agentId, userId, {
                            type: 'visual_reference',
                            content: {
                                episodic_memory_id: episodicResult.id, // Reference to full data
                                caption_summary: `Screenshot: ${screenshotContext}`,
                                has_screenshot: true,
                                user_query_preview: userPrompt.substring(0, 100), // Brief preview
                                timestamp: new Date().toISOString()
                            },
                            metadata: {
                                width: contextWidth,
                                height: contextHeight,
                                isAttentionSink: true, // Mark as important for quick retrieval
                                sessionId: sessionId,
                                source: 'ask_button_click'
                            }
                        });
                        
                        logger.info('Screenshot stored in memory system', {
                            agentId,
                            userId,
                            episodicId: episodicResult.id,
                            context: screenshotContext
                        });
                    }
                    
                } catch (memoryError) {
                    // Don't fail the main flow if memory storage fails
                    logger.warn('Failed to store screenshot in memory (non-blocking):', {
                        error: memoryError.message,
                        agentId: this.selectedAgentId,
                        userId: currentUser?.uid || 'unknown'
                    });
                }
            }

            const conversationHistory = this._formatConversationForPrompt(conversationHistoryRaw);

            // Use personality manager for system prompt if available
            let systemPrompt;
            if (this.personalityInitialized && this.agentPersonalityManager) {
                // Update personality context based on user prompt
                this.updatePersonalityContext(userPrompt);
                systemPrompt = this.agentPersonalityManager.getSystemPrompt();
                
                // Add conversation history to personality-based prompt
                if (conversationHistory) {
                    systemPrompt += `\n\nConversation History:\n${conversationHistory}`;
                }
            } else {
                // Fallback to default system prompt using new prompt manager (lazy import)
                const { promptManager } = require('../../domains/agents');
                systemPrompt = promptManager.buildSystemPrompt({
                    profile: 'xerus_analysis',
                    customPrompt: conversationHistory,
                    googleSearchEnabled: false
                });
            }

            // Add context from fast context manager
            const contextData = fastContextManager.getRelevantContext(userPrompt, {
                maxItems: 5,
                maxTokens: 2000,
                includeTypes: ['SCREENSHOT', 'USER_MESSAGE', 'AI_RESPONSE', 'TOOL_RESULT']
            });
            
            logger.info('Context data from fast context manager:', {
                hasContextData: !!contextData,
                hasContext: !!(contextData && contextData.context),
                contextLength: contextData?.context?.length || 0
            });

            // Add context to system prompt if available
            let enhancedSystemPrompt = systemPrompt;
            if (contextData && contextData.context && contextData.context.length > 0) {
                const contextString = contextData.context.map(ctx => 
                    `[${ctx.type}] ${ctx.content.substring(0, 200)}...`
                ).join('\n');
                enhancedSystemPrompt += `\n\nRecent Context:\n${contextString}`;
            }

            const userText = screenshotBase64 && screenshotResult.metadata?.persistent 
                ? `User Request: ${userPrompt.trim()}\n\nNote: I'm showing you my selected focus area (${screenshotContext}) which I want you to use for analysis instead of the full screen.`
                : `User Request: ${userPrompt.trim()}`;

            const messages = [
                { role: 'system', content: enhancedSystemPrompt },
                {
                    role: 'user',
                    content: [
                        { 
                            type: 'text', 
                            text: userText
                        },
                    ],
                },
            ];
            

            if (screenshotBase64) {
                messages[1].content.push({
                    type: 'image_url',
                    image_url: { url: `data:image/jpeg;base64,${screenshotBase64}` },
                });
            }
            
            // Check if we should use backend agent execution first (optimized path)
            if (this.selectedAgentId) {
                logger.info('[AskService] Using backend agent execution for agent ID:', this.selectedAgentId);
                try {
                    const { agentsApiClient } = require('../../domains/agents');
                    const agentResponse = await agentsApiClient.executeAgent(this.selectedAgentId, {
                        message: userPrompt,
                        conversationHistory: conversationHistoryRaw || [],
                        context: screenshotBase64 ? {
                            image: screenshotBase64,
                            imageContext: screenshotContext
                        } : {}
                    });
                    
                    logger.debug('[AskService] Agent response received:', { 
                        agentId: this.selectedAgentId,
                        agentResponse: agentResponse ? 'defined' : 'undefined',
                        hasResponse: agentResponse?.response ? 'yes' : 'no',
                        responseType: typeof agentResponse?.response,
                        keys: agentResponse ? Object.keys(agentResponse) : 'no keys',
                        success: agentResponse?.success
                    });
                    
                    // Check if we have a valid response
                    if (agentResponse && agentResponse.success && agentResponse.response) {
                        const askWin = getWindowPool()?.get('ask');
                        
                        logger.debug('[AskService] Window check:', {
                            hasWindowPool: !!getWindowPool(),
                            hasAskWindow: !!askWin,
                            isDestroyed: askWin ? askWin.isDestroyed() : 'no window'
                        });
                        
                        if (askWin && !askWin.isDestroyed()) {
                            // Update internal state to match streaming behavior
                            this.state.isLoading = false;
                            this.state.isStreaming = false;
                            this.state.currentResponse = agentResponse.response;
                            this.state.showTextInput = true;
                            this._broadcastState();
                            
                            logger.info('[AskService] UI updated with agent response - state broadcasted');
                        } else {
                            logger.warn('[AskService] Ask window not available, skipping UI update');
                        }
                        
                        // Save to database regardless of window state
                        await this.askRepository.addAiMessage({ 
                            sessionId, 
                            role: 'assistant', 
                            content: agentResponse.response
                        });
                        
                        logger.info('[AskService] Backend agent execution completed successfully');
                        return { success: true, response: agentResponse.response };
                    } else {
                        logger.error('[AskService] Backend agent execution failed - Invalid response:', {
                            agentId: this.selectedAgentId,
                            success: agentResponse?.success,
                            hasResponse: !!agentResponse?.response,
                            error: agentResponse?.error,
                            agentResponse: agentResponse
                        });
                        throw new Error(`Backend agent execution failed: ${agentResponse?.error || 'Invalid response'}`);
                    }
                } catch (backendError) {
                    logger.error('[AskService] Backend agent execution failed:', {
                        agentId: this.selectedAgentId,
                        error: backendError.message || backendError,
                        stack: backendError.stack
                    });
                    throw backendError; // Re-throw instead of falling back to local AI
                }
            }

            // Only create local LLM if not using backend agent execution
            
            // Determine optimal provider for this request
            selectedProvider = this.determineOptimalProvider(userPrompt, screenshotResult);
            if (selectedProvider) {
                logger.info('Selected optimal provider:', selectedProvider);
                this.state.currentProvider = selectedProvider;
                this._broadcastState();
            }
            
            logger.info('Creating streaming LLM for local execution:', {
                provider: modelInfo.provider,
                model: modelInfo.model,
                hasApiKey: !!modelInfo.apiKey,
                optimizedProvider: selectedProvider || 'default'
            });
            
            
            const streamingLLM = createStreamingLLM(modelInfo.provider, {
                apiKey: modelInfo.apiKey,
                model: modelInfo.model,
                temperature: 0.7,
                maxTokens: 2048,
                usePortkey: false,
                portkeyVirtualKey: undefined,
                // tools: toolDefinitions, // Tool support not yet implemented
            });

            logger.info('Sending message to local LLM:', {
                messageCount: messages.length,
                systemPromptLength: messages[0]?.content?.length,
                userMessageType: messages[1]?.content?.[0]?.type,
                hasImage: messages[1]?.content?.length > 1
            });

            try {
                const response = await streamingLLM.streamChat(messages);
                const askWin = getWindowPool()?.get('ask');

                if (!askWin || askWin.isDestroyed()) {
                    logger.error('Ask window is not available to send stream to.');
                    response.body.getReader().cancel();
                    return { success: false, error: 'Ask window is not available.' };
                }

                const reader = response.body.getReader();
                signal.addEventListener('abort', () => {
                    logger.info('Aborting stream reader. Reason:');
                    reader.cancel(signal.reason).catch(() => { /* Ignore error if already cancelled */ });
                });

                await this._processStream(reader, askWin, sessionId, signal);
                
                // Track successful request performance
                this.trackRequestPerformance(requestId, selectedProvider || modelInfo.provider, Date.now() - startTime, true);
                
                return { success: true };

            } catch (multimodalError) {
                // If multimodal request failed and screenshot included, retry with text only
                if (screenshotBase64 && this._isMultimodalError(multimodalError)) {
                    logger.info('Multimodal request failed, retrying with text-only:');
                    
                    // [Korean comment translated] [Korean comment translated] [Korean comment translated]
                    const textOnlyMessages = [
                        { role: 'system', content: systemPrompt },
                        {
                            role: 'user',
                            content: `User Request: ${userPrompt.trim()}`
                        }
                    ];

                    const fallbackResponse = await streamingLLM.streamChat(textOnlyMessages);
                    const askWin = getWindowPool()?.get('ask');

                    if (!askWin || askWin.isDestroyed()) {
                        logger.error('Ask window is not available for fallback response.');
                        fallbackResponse.body.getReader().cancel();
                        return { success: false, error: 'Ask window is not available.' };
                    }

                    const fallbackReader = fallbackResponse.body.getReader();
                    signal.addEventListener('abort', () => {
                        logger.info('Aborting fallback stream reader. Reason:');
                        fallbackReader.cancel(signal.reason).catch(() => {});
                    });

                    await this._processStream(fallbackReader, askWin, sessionId, signal);
                    
                    // Track successful fallback request performance
                    this.trackRequestPerformance(requestId, selectedProvider || modelInfo.provider, Date.now() - startTime, true);
                    
                    return { success: true };
                } else {
                    // [Korean comment translated] [Korean comment translated] [Korean comment translated] [Korean comment translated] [Korean comment translated] [Korean comment translated] throw
                    throw multimodalError;
                }
            }

        } catch (error) {
            logger.error('Error during message processing:', { 
                error: error.message,
                stack: error.stack,
                name: error.name
            });
            
            // Track failed request performance
            this.trackRequestPerformance(requestId, selectedProvider || 'unknown', Date.now() - startTime, false);
            
            this.state = {
                ...this.state,
                isLoading: false,
                isStreaming: false,
                showTextInput: true,
            };
            this._broadcastState();

            const askWin = getWindowPool()?.get('ask');
            if (askWin && !askWin.isDestroyed()) {
                const streamError = error.message || 'Unknown error occurred';
                global.safeWebContentsSend(askWin.webContents, 'ask-response-stream-error', { error: streamError });
            }

            return { success: false, error: error.message };
        }
    }

    /**
     * 
     * @param {ReadableStreamDefaultReader} reader
     * @param {BrowserWindow} askWin
     * @param {number} sessionId 
     * @param {AbortSignal} signal
     * @returns {Promise<void>}
     * @private
     */
    async _processStream(reader, askWin, sessionId, signal) {
        const decoder = new TextDecoder();
        let fullResponse = '';

        try {
            this.state.isLoading = false;
            this.state.isStreaming = true;
            this._broadcastState();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n').filter(line => line.trim() !== '');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.substring(6);
                        if (data === '[DONE]') {
                            return; 
                        }
                        try {
                            const json = JSON.parse(data);
                            const token = json.choices[0]?.delta?.content || '';
                            if (token) {
                                fullResponse += token;
                                this.state.currentResponse = fullResponse;
                                this._broadcastState();
                            }
                        } catch (error) {
                        }
                    }
                }
            }
        } catch (streamError) {
            if (signal.aborted) {
                logger.info('Stream reading was intentionally cancelled. Reason:');
            } else if (streamError.code === 'EPIPE' || streamError.message.includes('broken pipe')) {
                // Handle EPIPE errors gracefully for stream operations
                logger.warn('[AskService] EPIPE error in stream processing (broken pipe), continuing...', { 
                    error: streamError.message 
                });
                return; // Don't send error to UI for EPIPE errors
            } else {
                logger.error('Error while processing stream:', { streamError });
                if (askWin && !askWin.isDestroyed()) {
                    global.safeWebContentsSend(askWin.webContents, 'ask-response-stream-error', { error: streamError.message });
                }
            }
        } finally {
            this.state.isStreaming = false;
            this.state.showTextInput = true; // Restore text input after streaming completes
            this.state.currentResponse = fullResponse;
            this._broadcastState();
            if (fullResponse) {
                 try {
                    await askRepository.addAiMessage({ sessionId, role: 'assistant', content: fullResponse });
                    logger.info('DB: Saved partial or full assistant response to session  after stream ended.');
                } catch(dbError) {
                    logger.error('DB: Failed to save assistant response after stream ended:', { dbError });
                }
            }
        }
    }

    /**
     * Update personality context based on user request
     * @param {string} userPrompt - User message
     */
    updatePersonalityContext(userPrompt) {
        if (!this.personalityInitialized || !this.agentPersonalityManager) {
            return;
        }
        
        const prompt = userPrompt.toLowerCase();
        
        // Determine context factors
        const contextFactors = {
            taskType: this.detectTaskType(prompt),
            urgency: this.detectUrgency(prompt),
            complexity: this.detectComplexity(prompt),
            userLevel: this.detectUserLevel(prompt),
            userMood: this.detectUserMood(prompt)
        };
        
        // Update context in personality manager
        this.agentPersonalityManager.updateContextFactors(contextFactors);
        
        logger.info('[AskService] Updated personality context:', contextFactors);
    }
    
    /**
     * Detect task type from user prompt
     */
    detectTaskType(prompt) {
        const taskMappings = {
            'technical': ['code', 'function', 'debug', 'error', 'programming', 'api', 'database'],
            'creative': ['design', 'create', 'brainstorm', 'idea', 'creative', 'artistic'],
            'educational': ['learn', 'explain', 'teach', 'understand', 'how to', 'what is'],
            'business': ['meeting', 'report', 'analysis', 'strategy', 'project', 'management'],
            'research': ['research', 'find', 'investigate', 'analyze', 'study', 'compare'],
            'writing': ['write', 'draft', 'compose', 'document', 'content', 'article']
        };
        
        for (const [type, keywords] of Object.entries(taskMappings)) {
            if (keywords.some(keyword => prompt.includes(keyword))) {
                return type;
            }
        }
        
        return 'general';
    }
    
    /**
     * Detect urgency level from user prompt
     */
    detectUrgency(prompt) {
        const urgentWords = ['urgent', 'asap', 'quickly', 'fast', 'immediate', 'now', 'emergency'];
        const hasUrgentWords = urgentWords.some(word => prompt.includes(word));
        
        if (hasUrgentWords || prompt.includes('!')) {
            return 'high';
        }
        
        return 'normal';
    }
    
    /**
     * Detect complexity level from user prompt
     */
    detectComplexity(prompt) {
        const complexWords = ['complex', 'advanced', 'difficult', 'complicated', 'architecture', 'system'];
        const hasComplexWords = complexWords.some(word => prompt.includes(word));
        
        if (hasComplexWords || prompt.length > 200) {
            return 'high';
        } else if (prompt.length > 100) {
            return 'medium';
        }
        
        return 'low';
    }
    
    /**
     * Detect user level from user prompt
     */
    detectUserLevel(prompt) {
        const beginnerWords = ['beginner', 'new', 'learn', 'explain', 'what is', 'how to'];
        const expertWords = ['optimize', 'architecture', 'performance', 'scale', 'enterprise'];
        
        const hasBeginnerWords = beginnerWords.some(word => prompt.includes(word));
        const hasExpertWords = expertWords.some(word => prompt.includes(word));
        
        if (hasBeginnerWords) {
            return 'beginner';
        } else if (hasExpertWords) {
            return 'expert';
        }
        
        return 'intermediate';
    }
    
    /**
     * Detect user mood from user prompt
     */
    detectUserMood(prompt) {
        const frustratedWords = ['frustrated', 'stuck', 'help', 'not working', 'broken', 'error'];
        const positiveWords = ['great', 'awesome', 'good', 'thanks', 'love', 'amazing'];
        
        const hasFrustratedWords = frustratedWords.some(word => prompt.includes(word));
        const hasPositiveWords = positiveWords.some(word => prompt.includes(word));
        
        if (hasFrustratedWords) {
            return 'frustrated';
        } else if (hasPositiveWords) {
            return 'positive';
        }
        
        return 'neutral';
    }

    /**
     * Determine if it is a multimodal related error
     * @private
     */
    _isMultimodalError(error) {
        const errorMessage = error.message?.toLowerCase() || '';
        return (
            errorMessage.includes('vision') ||
            errorMessage.includes('image') ||
            errorMessage.includes('multimodal') ||
            errorMessage.includes('unsupported') ||
            errorMessage.includes('image_url') ||
            errorMessage.includes('400') ||  // Bad Request often for unsupported features
            errorMessage.includes('invalid') ||
            errorMessage.includes('not supported')
        );
    }

    /**
     * Get available agents from backend API for the dropdown
     * @returns {Promise<Array>} Array of agent objects
     */
    async getPersonalities() {
        try {
            logger.info('[AskService] Getting agents from backend API...');
            
            // Use the agents API client from domains
            const { agentsApiClient } = require('../../domains/agents');
            
            const agents = await agentsApiClient.getAgents();
            logger.info('[AskService] Retrieved agents from backend:', agents.length);
            
            // Transform backend agents to frontend format
            return agents.map(agent => ({
                id: agent.id,
                name: agent.name,
                description: agent.description || 'AI assistant agent',
                personalityType: agent.personalityType, // API client already mapped this field
                capabilities: agent.tools || [],
                isEnabled: agent.isActive, // API client already mapped this field
                ttsEnabled: agent.ttsEnabled || false // Include TTS enabled setting
            }));
            
        } catch (error) {
            logger.error('Failed to get agents from backend API:', { 
                error: error.message, 
                stack: error.stack,
                cause: error.cause 
            });
            
            // Fallback to hardcoded personalities if backend fails
            logger.info('[AskService] Falling back to local personalities...');
            try {
                if (!this.personalityInitialized) {
                    await this.initializePersonalityManager();
                }
                
                if (this.agentPersonalityManager) {
                    const personalities = this.agentPersonalityManager.getAvailablePersonalities();
                    return personalities.map(personality => ({
                        id: personality.id,
                        name: personality.name,
                        description: personality.description || 'AI assistant personality',
                        capabilities: personality.capabilities || [],
                        isEnabled: true
                    }));
                }
            } catch (fallbackError) {
                logger.error('Fallback to local personalities also failed:', { fallbackError });
            }
            
            return [];
        }
    }

    /**
     * Set the selected agent for askService
     * @param {string} agentId - The agent ID to select (can be backend agent ID or personality ID)
     */
    async setPersonality(agentId) {
        try {
            logger.info('[AskService] Setting selected agent:', agentId);
            
            // Store the selected agent ID for future requests
            this.selectedAgentId = agentId;
            
            // Try to get agent details from backend first
            try {
                const { agentsApiClient } = require('../../domains/agents');
                const agent = await agentsApiClient.getAgent(agentId);
                
                if (agent) {
                    logger.info('[AskService] Selected backend agent:', agent.name);
                    return { success: true, agent: agent };
                }
            } catch (backendError) {
                logger.warn('[AskService] Could not get agent from backend, trying local personalities:', backendError.message);
            }
            
            // Fallback to local personality manager for hardcoded personalities
            if (!this.personalityInitialized) {
                await this.initializePersonalityManager();
            }
            
            if (this.agentPersonalityManager) {
                await this.agentPersonalityManager.setPersonality(agentId);
                logger.info('[AskService] Successfully set local personality:', agentId);
                return { success: true };
            }
            
            throw new Error('Neither backend agent nor local personality manager available');
            
        } catch (error) {
            logger.error('Failed to set agent/personality:', { error: error.message, agentId });
            return { success: false, error: error.message };
        }
    }

    /**
     * Enhanced methods from provider optimization
     */

    /**
     * Determine optimal AI provider for request
     * @param {string} userPrompt - User message
     * @param {Object} screenshotResult - Screenshot data
     * @returns {string} Selected provider
     */
    determineOptimalProvider(userPrompt, screenshotResult) {
        try {
            const prompt = userPrompt.toLowerCase();
            
            // Determine request type for provider selection
            let requestType = 'conversation';
            
            // Screenshot analysis
            if (screenshotResult.success && (
                prompt.includes('screen') || 
                prompt.includes('image') || 
                prompt.includes('what do you see') ||
                prompt.includes('analyze') ||
                prompt.includes('describe')
            )) {
                requestType = 'screenshot_analysis';
            }
            
            // Code review
            if (prompt.includes('code') || 
                prompt.includes('function') || 
                prompt.includes('error') ||
                prompt.includes('debug') ||
                prompt.includes('review')) {
                requestType = 'code_review';
            }
            
            // Use AI provider manager for optimal selection
            if (this.aiProviderManager && typeof this.aiProviderManager.selectOptimalProvider === 'function') {
                return this.aiProviderManager.selectOptimalProvider({
                    requestType,
                    userMessage: userPrompt,
                    context: screenshotResult
                });
            }
            
            return null; // Use default provider from modelStateService
            
        } catch (error) {
            logger.warn('Provider selection failed, using default:', { error });
            return null;
        }
    }

    /**
     * Track request performance for optimization
     * @param {string} requestId - Request ID
     * @param {string} provider - Provider used
     * @param {number} executionTime - Execution time
     * @param {boolean} success - Whether request succeeded
     */
    trackRequestPerformance(requestId, provider, executionTime, success) {
        try {
            // Add to request history
            this.requestHistory.push({
                requestId,
                provider,
                executionTime,
                success,
                timestamp: Date.now()
            });
            
            // Keep only last 50 requests
            if (this.requestHistory.length > 50) {
                this.requestHistory.shift();
            }
            
            // Log performance metrics
            logger.info('Request completed:', {
                requestId,
                provider: provider || 'default',
                executionTime: `${executionTime}ms`,
                success
            });
            
        } catch (error) {
            logger.warn('Failed to track performance:', { error });
        }
    }

    /**
     * Get provider performance statistics
     * @returns {Object} Performance statistics
     */
    getProviderStatistics() {
        try {
            const stats = {
                totalRequests: this.requestHistory.length,
                successRate: this.requestHistory.filter(r => r.success).length / this.requestHistory.length * 100,
                averageExecutionTime: this.requestHistory.reduce((sum, r) => sum + r.executionTime, 0) / this.requestHistory.length,
                providerBreakdown: {}
            };
            
            // Calculate provider-specific stats
            this.requestHistory.forEach(request => {
                const provider = request.provider || 'default';
                if (!stats.providerBreakdown[provider]) {
                    stats.providerBreakdown[provider] = {
                        requests: 0,
                        successes: 0,
                        totalTime: 0
                    };
                }
                
                stats.providerBreakdown[provider].requests++;
                if (request.success) {
                    stats.providerBreakdown[provider].successes++;
                }
                stats.providerBreakdown[provider].totalTime += request.executionTime;
            });
            
            // Calculate averages and success rates
            Object.keys(stats.providerBreakdown).forEach(provider => {
                const breakdown = stats.providerBreakdown[provider];
                breakdown.successRate = (breakdown.successes / breakdown.requests) * 100;
                breakdown.averageTime = breakdown.totalTime / breakdown.requests;
            });
            
            return stats;
            
        } catch (error) {
            logger.warn('Failed to get provider statistics:', { error });
            return {
                totalRequests: 0,
                successRate: 0,
                averageExecutionTime: 0,
                providerBreakdown: {}
            };
        }
    }

    /**
     * Generate unique request ID
     * @returns {string} Request ID
     */
    generateRequestId() {
        return `ask_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Enhanced message method for IPC compatibility
     * @param {string} userPrompt - User message
     * @param {Array} conversationHistory - Previous conversation
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} Response object
     */
    async sendEnhancedMessage(userPrompt, conversationHistory = [], options = {}) {
        // Use the existing sendMessage method which now has enhanced features
        const result = await this.sendMessage(userPrompt, conversationHistory);
        
        return {
            success: result.success,
            response: result.response || result.error,
            provider: this.state.currentProvider,
            metadata: {
                requestId: this.generateRequestId(),
                contextOptimized: this.state.contextOptimized,
                providerStats: this.getProviderStatistics()
            }
        };
    }

    /**
     * Get service status for IPC
     * @returns {Object} Service status
     */
    getStatus() {
        return {
            state: this.state,
            requestHistory: this.getRequestHistory(),
            providerStats: this.getProviderStatistics(),
            initialized: true
        };
    }

    /**
     * Get request history (already exists but making sure it's accessible)
     * @returns {Array} Request history
     */
    getRequestHistory() {
        return this.requestHistory.slice(-20); // Last 20 requests
    }

    /**
     * Force provider health check for IPC compatibility
     */
    async forceProviderHealthCheck() {
        try {
            if (this.aiProviderManager && typeof this.aiProviderManager.performHealthChecks === 'function') {
                await this.aiProviderManager.performHealthChecks();
                logger.info('Provider health check completed');
            } else {
                logger.warn('AI Provider Manager not available for health check');
            }
        } catch (error) {
            logger.error('Health check failed:', { error });
            throw error;
        }
    }

}

const askService = new AskService();

module.exports = askService;