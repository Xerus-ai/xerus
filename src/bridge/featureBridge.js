// src/bridge/featureBridge.js
const { ipcMain, app } = require('electron');
const settingsService = require('../features/settings/settingsService');
const authService = require('../common/services/authService');
const whisperService = require('../common/services/whisperService');
const ollamaService = require('../common/services/ollamaService');
const modelStateService = require('../common/services/modelStateService');
const shortcutsService = require('../features/shortcuts/shortcutsService');
const presetRepository = require('../common/repositories/preset');

const askService = require('../features/ask/askService');
const listenService = require('../features/listen/listenService');
const permissionService = require('../common/services/permissionService');
const { createLogger } = require('../common/services/logger.js');

// Memory API Client for backend memory operations
const MemoryApiClient = require('../domains/conversation/memory-api-client');

const logger = createLogger('FeatureBridge');

module.exports = {
  // Renderer[Korean comment translated] Request[Korean comment translated] [Korean comment translated] [Korean comment translated] [Korean comment translated]
  initialize() {
    // Settings Service
    ipcMain.handle('settings:getPresets', async () => await settingsService.getPresets());
    ipcMain.handle('settings:get-auto-update', async () => await settingsService.getAutoUpdateSetting());
    ipcMain.handle('settings:set-auto-update', async (event, isEnabled) => await settingsService.setAutoUpdateSetting(isEnabled));  
    ipcMain.handle('settings:get-model-settings', async () => await settingsService.getModelSettings());
    ipcMain.handle('settings:validate-and-save-key', async (e, { provider, key }) => await settingsService.validateAndSaveKey(provider, key));
    ipcMain.handle('settings:clear-api-key', async (e, { provider }) => await settingsService.clearApiKey(provider));
    ipcMain.handle('settings:set-selected-model', async (e, { type, modelId }) => await settingsService.setSelectedModel(type, modelId));    

    ipcMain.handle('settings:get-ollama-status', async () => await settingsService.getOllamaStatus());
    ipcMain.handle('settings:ensure-ollama-ready', async () => await settingsService.ensureOllamaReady());
    ipcMain.handle('settings:shutdown-ollama', async () => await settingsService.shutdownOllama());

    // Shortcuts
    ipcMain.handle('settings:getCurrentShortcuts', async () => await shortcutsService.loadKeybinds());
    ipcMain.handle('shortcut:getDefaultShortcuts', async () => await shortcutsService.handleRestoreDefaults());
    ipcMain.handle('shortcut:closeShortcutSettingsWindow', async () => await shortcutsService.closeShortcutSettingsWindow());
    ipcMain.handle('shortcut:openShortcutSettingsWindow', async () => await shortcutsService.openShortcutSettingsWindow());
    ipcMain.handle('shortcut:saveShortcuts', async (event, newKeybinds) => await shortcutsService.handleSaveShortcuts(newKeybinds));
    ipcMain.handle('shortcut:toggleAllWindowsVisibility', async () => await shortcutsService.toggleAllWindowsVisibility());

    // Permissions
    ipcMain.handle('check-system-permissions', async () => await permissionService.checkSystemPermissions());
    ipcMain.handle('request-microphone-permission', async () => await permissionService.requestMicrophonePermission());
    ipcMain.handle('open-system-preferences', async (event, section) => await permissionService.openSystemPreferences(section));
    ipcMain.handle('mark-permissions-completed', async () => await permissionService.markPermissionsAsCompleted());
    ipcMain.handle('check-permissions-completed', async () => await permissionService.checkPermissionsCompleted());

    // User/Auth
    ipcMain.handle('get-current-user', () => authService.getCurrentUser());
    ipcMain.handle('start-firebase-auth', async () => await authService.startFirebaseAuthFlow());
    ipcMain.handle('firebase-logout', async () => await authService.signOut());
    
    // Handle Firebase auth success from web UI
    ipcMain.handle('firebase-auth-success', async (event, { uid, displayName, email, idToken }) => {
      logger.info('[FeatureBridge] Received firebase-auth-success:', { uid, email, displayName });
      logger.info('[FeatureBridge] ID Token length:', idToken ? idToken.length : 'null');
      try {
        await authService.signInWithCustomToken(idToken);
        logger.info('[FeatureBridge] Successfully signed in with Firebase token - broadcasting user state');
        
        // Force broadcast user state to ensure UI updates
        setTimeout(() => {
          authService.broadcastUserState();
          logger.info('[FeatureBridge] User state broadcast completed');
        }, 1000);
        
        return { success: true, message: 'Authentication successful' };
        
      } catch (error) {
        logger.error('[FeatureBridge] Failed to sign in with Firebase token:', error);
        logger.error('[FeatureBridge] Error details:', { message: error.message, code: error.code });
        return { success: false, error: error.message };
      }
    });

    // 3-Component Sync Service
    const { syncService } = require('../services/sync-service');
    ipcMain.handle('sync:perform-full-sync', async () => await syncService.performFullSync());
    ipcMain.handle('sync:sync-agent', async (event, agentId) => await syncService.syncAgent(agentId));
    ipcMain.handle('sync:check-backend-connectivity', async () => await syncService.checkBackendConnectivity());
    ipcMain.handle('sync:get-status', async () => syncService.getStatus());
    ipcMain.handle('sync:start-auto-sync', async () => {
      syncService.updateConfig({ autoSyncEnabled: true });
      syncService.startAutoSync();
      return { success: true };
    });
    ipcMain.handle('sync:stop-auto-sync', async () => {
      syncService.updateConfig({ autoSyncEnabled: false });
      syncService.stopAutoSync();
      return { success: true };
    });

    // App
    ipcMain.handle('quit-application', () => app.quit());

    // Whisper
    ipcMain.handle('whisper:download-model', async (event, modelId) => await whisperService.handleDownloadModel(modelId));
    ipcMain.handle('whisper:get-installed-models', async () => await whisperService.handleGetInstalledModels());
       
    // General
    ipcMain.handle('get-preset-templates', () => presetRepository.getPresetTemplates());
    ipcMain.handle('get-web-url', () => process.env.XERUS_WEB_URL || 'http://localhost:3000');

    // Ollama
    ipcMain.handle('ollama:get-status', async () => await ollamaService.handleGetStatus());
    ipcMain.handle('ollama:install', async () => await ollamaService.handleInstall());
    ipcMain.handle('ollama:start-service', async () => await ollamaService.handleStartService());
    ipcMain.handle('ollama:ensure-ready', async () => await ollamaService.handleEnsureReady());
    ipcMain.handle('ollama:get-models', async () => await ollamaService.handleGetModels());
    ipcMain.handle('ollama:get-model-suggestions', async () => await ollamaService.handleGetModelSuggestions());
    ipcMain.handle('ollama:pull-model', async (event, modelName) => await ollamaService.handlePullModel(modelName));
    ipcMain.handle('ollama:is-model-installed', async (event, modelName) => await ollamaService.handleIsModelInstalled(modelName));
    ipcMain.handle('ollama:warm-up-model', async (event, modelName) => await ollamaService.handleWarmUpModel(modelName));
    ipcMain.handle('ollama:auto-warm-up', async () => await ollamaService.handleAutoWarmUp());
    ipcMain.handle('ollama:get-warm-up-status', async () => await ollamaService.handleGetWarmUpStatus());
    ipcMain.handle('ollama:shutdown', async (event, force = false) => await ollamaService.handleShutdown(force));

    // Ask - Core handlers
    ipcMain.handle('ask:sendQuestionFromAsk', async (event, userPrompt) => await askService.sendMessage(userPrompt));
    ipcMain.handle('ask:sendQuestionFromSummary', async (event, userPrompt) => await askService.sendMessage(userPrompt));
    ipcMain.handle('ask:toggleAskButton', async () => await askService.toggleAskButton());
    ipcMain.handle('ask:closeAskWindow',  async () => await askService.closeAskWindow());
    
    
    // Ask - Tutorial handlers (delegated to askService)
    ipcMain.handle('ask:startTutorial', async (event, tutorialId) => {
        return await askService.handleStartTutorial(tutorialId);
    });
    ipcMain.handle('ask:tutorialNext', async () => {
        return await askService.handleTutorialNext();
    });
    ipcMain.handle('ask:tutorialSkip', async () => {
        return await askService.handleTutorialSkip();
    });
    
    // Ask - Personality handlers (delegated to askService)
    ipcMain.handle('ask:getPersonalities', async () => {
        return await askService.getPersonalities();
    });
    ipcMain.handle('ask:setPersonality', async (event, personalityId) => {
        return await askService.setPersonality(personalityId);
    });
    ipcMain.handle('ask:getPersonalityRecommendations', async (event, taskType, userLevel) => {
        return await askService.handleGetPersonalityRecommendations(taskType, userLevel);
    });
    ipcMain.handle('ask:toggleAdaptivePersonality', async (event, enabled) => {
        return await askService.handleToggleAdaptivePersonality(enabled);
    });
    
    // Listen
    ipcMain.handle('listen:sendMicAudio', async (event, { data, mimeType }) => await listenService.handleSendMicAudioContent(data, mimeType));
    
    // Agent Mode Tracking
    ipcMain.handle('listen:set-agent-mode', (event, agentModeActive) => {
        listenService.agentModeActive = agentModeActive;
        logger.info(`[FeatureBridge] Agent mode updated: ${agentModeActive}`);
        return { success: true };
    });
    
    // Desktop Sources for system audio capture
    ipcMain.handle('get-desktop-sources', async (event, options = {}) => {
        const { desktopCapturer } = require('electron');
        try {
            const sources = await desktopCapturer.getSources({
                types: options.types || ['screen'],
                thumbnailSize: options.thumbnailSize || { width: 150, height: 150 },
                fetchWindowIcons: options.fetchWindowIcons || false
            });
            return sources;
        } catch (error) {
            logger.error('[FeatureBridge] Failed to get desktop sources:', error);
            return [];
        }
    });
    ipcMain.handle('listen:sendSystemAudio', async (event, { data, mimeType }) => {
        // Check if STT sessions are ready before processing audio
        if (!listenService.sttService.isSessionActive()) {
            return { success: false, error: 'STT session not active yet' };
        }
        
        const result = await listenService.sttService.sendSystemAudioContent(data, mimeType);
        if(result.success) {
            listenService.sendToRenderer('system-audio-data', { data });
        }
        return result;
    });
    ipcMain.handle('listen:startMacosSystemAudio', async () => await listenService.handleStartMacosAudio());
    ipcMain.handle('listen:stopMacosSystemAudio', async () => await listenService.handleStopMacosAudio());
    
    // Speaker Control for Hardware Acoustic Coupling Prevention
    ipcMain.handle('listen:muteSpeakers', async () => await listenService.handleMuteSpeakers());
    ipcMain.handle('listen:unmuteSpeakers', async (event, originalVolume) => await listenService.handleUnmuteSpeakers(originalVolume));
    ipcMain.handle('update-google-search-setting', async (event, enabled) => await listenService.handleUpdateGoogleSearchSetting(enabled));
    ipcMain.handle('is-session-active', async (event) => listenService.isSessionActive());
    ipcMain.handle('listen:changeSession', async (event, listenButtonText) => {
      logger.info('[FeatureBridge] listen:changeSession from mainheader', listenButtonText);
      try {
        await listenService.handleListenRequest(listenButtonText);
        return { success: true };
      } catch (error) {
        logger.error('listen:changeSession failed', { message: error.message });
        return { success: false, error: error.message };
      }
    });

    // ModelStateService
    ipcMain.handle('model:validate-key', async (e, { provider, key }) => await modelStateService.handleValidateKey(provider, key));
    ipcMain.handle('model:get-all-keys', () => modelStateService.getAllApiKeys());
    ipcMain.handle('model:set-api-key', async (e, { provider, key }) => await modelStateService.setApiKey(provider, key));
    ipcMain.handle('model:remove-api-key', async (e, provider) => await modelStateService.handleRemoveApiKey(provider));
    ipcMain.handle('model:get-selected-models', () => modelStateService.getSelectedModels());
    ipcMain.handle('model:set-selected-model', async (e, { type, modelId }) => await modelStateService.handleSetSelectedModel(type, modelId));
    ipcMain.handle('model:get-available-models', (e, { type }) => modelStateService.getAvailableModels(type));
    ipcMain.handle('model:are-providers-configured', () => modelStateService.areProvidersConfigured());
    ipcMain.handle('model:has-configured-providers', () => modelStateService.hasConfiguredProviders());
    ipcMain.handle('model:get-provider-config', () => modelStateService.getProviderConfig());

    // =============================================================================
    // MEMORY SYSTEM HANDLERS
    // =============================================================================
    
    // Initialize memory API client
    const memoryApiClient = new MemoryApiClient();
    
    // Set auth context if available
    const currentUser = authService.getCurrentUser();
    if (currentUser) {
        memoryApiClient.setAuthContext({
            userId: currentUser.uid || currentUser.id,
            token: currentUser.accessToken,
            isGuest: currentUser.isGuest || false,
            permissions: currentUser.permissions || []
        });
    }
    
    // Memory - Working Memory (References only, no image duplication)
    ipcMain.handle('memory:store-working', async (event, data) => {
        try {
            // Map "default" agent ID to actual agent ID 1 (Assistant)
            let agentId = data.agentId;
            if (agentId === 'default') {
                agentId = 1; // Default to Assistant agent
            }
            
            logger.info('[FeatureBridge] Storing working memory reference', {
                originalAgentId: data.agentId,
                mappedAgentId: agentId,
                userId: data.userId,
                type: data.content?.type
            });
            
            const result = await memoryApiClient.storeWorkingMemory(
                agentId,
                data.userId,
                data.content || data
            );
            
            return { success: true, data: result };
            
        } catch (error) {
            logger.error('[FeatureBridge] Failed to store working memory:', { error });
            return { success: false, error: error.message };
        }
    });
    
    // Memory - Episodic Memory (Full visual data storage)
    ipcMain.handle('memory:store-episodic', async (event, data) => {
        try {
            // Map "default" agent ID to actual agent ID 1 (Assistant)
            let agentId = data.agentId;
            if (agentId === 'default') {
                agentId = 1; // Default to Assistant agent
            }
            
            logger.info('[FeatureBridge] Storing episodic memory', {
                originalAgentId: data.agentId,
                mappedAgentId: agentId,
                userId: data.userId,
                type: data.content?.type,
                hasScreenshot: !!data.content?.screenshot
            });
            
            const result = await memoryApiClient.storeEpisodicMemory(
                agentId,
                data.userId,
                data
            );
            
            return { success: true, data: result };
            
        } catch (error) {
            logger.error('[FeatureBridge] Failed to store episodic memory:', { error });
            return { success: false, error: error.message };
        }
    });
    
    // Memory - Semantic Memory (Knowledge storage)
    ipcMain.handle('memory:store-semantic', async (event, data) => {
        try {
            // Map "default" agent ID to actual agent ID 1 (Assistant)
            let agentId = data.agentId;
            if (agentId === 'default') {
                agentId = 1; // Default to Assistant agent
            }
            
            logger.info('[FeatureBridge] Storing semantic memory', {
                originalAgentId: data.agentId,
                mappedAgentId: agentId,
                userId: data.userId,
                title: data.title
            });
            
            const result = await memoryApiClient.storeSemanticMemory(
                agentId,
                data.userId,
                data
            );
            
            return { success: true, data: result };
            
        } catch (error) {
            logger.error('[FeatureBridge] Failed to store semantic memory:', { error });
            return { success: false, error: error.message };
        }
    });
    
    // Memory - Procedural Memory (Behavior patterns)
    ipcMain.handle('memory:store-procedural', async (event, data) => {
        try {
            // Map "default" agent ID to actual agent ID 1 (Assistant)
            let agentId = data.agentId;
            if (agentId === 'default') {
                agentId = 1; // Default to Assistant agent
            }
            
            logger.info('[FeatureBridge] Storing procedural memory', {
                originalAgentId: data.agentId,
                mappedAgentId: agentId,
                userId: data.userId,
                pattern: typeof data.pattern === 'string' ? data.pattern : 'object'
            });
            
            const result = await memoryApiClient.storeProceduralMemory(
                agentId,
                data.userId,
                data
            );
            
            return { success: true, data: result };
            
        } catch (error) {
            logger.error('[FeatureBridge] Failed to store procedural memory:', { error });
            return { success: false, error: error.message };
        }
    });
    
    // Memory - Get Memory Statistics
    ipcMain.handle('memory:get-stats', async (event, data) => {
        try {
            // Map "default" agent ID to actual agent ID 1 (Assistant)
            let agentId = data.agentId;
            if (agentId === 'default') {
                agentId = 1; // Default to Assistant agent
            }
            
            logger.info('[FeatureBridge] Getting memory stats', {
                originalAgentId: data.agentId,
                mappedAgentId: agentId,
                userId: data.userId
            });
            
            const stats = await memoryApiClient.getMemoryStats(agentId, data.userId);
            
            return { success: true, data: stats };
            
        } catch (error) {
            logger.error('[FeatureBridge] Failed to get memory stats:', { error });
            return { success: false, error: error.message };
        }
    });
    
    // Memory - Health Check
    ipcMain.handle('memory:health-check', async (event) => {
        try {
            const health = await memoryApiClient.checkMemoryHealth();
            return { success: true, data: health };
            
        } catch (error) {
            logger.error('[FeatureBridge] Memory health check failed:', { error });
            return { success: false, error: error.message };
        }
    });
    
    // Memory - Update Auth Context (when user logs in/out)
    ipcMain.handle('memory:update-auth', async (event, authContext) => {
        try {
            memoryApiClient.setAuthContext(authContext);
            logger.info('[FeatureBridge] Memory client auth context updated');
            return { success: true };
            
        } catch (error) {
            logger.error('[FeatureBridge] Failed to update memory auth context:', { error });
            return { success: false, error: error.message };
        }
    });

    logger.info('[FeatureBridge] Initialized with all feature handlers including memory system.');
  },

  // Renderer[Korean comment translated] Status[Korean comment translated] [Korean comment translated]
  sendAskProgress(win, progress) {
    win.webContents.send('feature:ask:progress', progress);
  },
};