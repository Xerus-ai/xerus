// src/preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Platform information for renderer processes
  platform: {
    isLinux: process.platform === 'linux',
    isMacOS: process.platform === 'darwin',
    isWindows: process.platform === 'win32',
    platform: process.platform
  },
  
  // Generic IPC methods for overlay windows
  send: (channel, data) => ipcRenderer.send(channel, data),
  invoke: (channel, data) => ipcRenderer.invoke(channel, data),
  on: (channel, callback) => ipcRenderer.on(channel, callback),
  
  // Common utilities used across multiple components
  common: {
    // User & Auth
    getCurrentUser: () => ipcRenderer.invoke('get-current-user'),
    startFirebaseAuth: () => ipcRenderer.invoke('start-firebase-auth'),
    firebaseLogout: () => ipcRenderer.invoke('firebase-logout'),
    sendFirebaseAuthSuccess: async (authData) => {
      try {
        const result = await ipcRenderer.invoke('firebase-auth-success', authData);
        return result;
      } catch (error) {
        console.error('[FIRE] Firebase auth failed:', error);
        throw error;
      }
    },
    testFirebaseAuthSync: async () => {
      console.log('[TEST] Testing Firebase auth sync...');
      try {
        const result = await ipcRenderer.invoke('firebase-auth-success', {
          uid: 'test-uid-123',
          displayName: 'Test User',
          email: 'test@example.com',
          idToken: 'test-token-for-debugging'
        });
        console.log('[TEST] Test result:', result);
        return result;
      } catch (error) {
        console.error('[TEST] Test failed:', error);
        throw error;
      }
    },
    
    // 3-Component Sync Service
    performFullSync: () => ipcRenderer.invoke('sync:perform-full-sync'),
    syncAgent: (agentId) => ipcRenderer.invoke('sync:sync-agent', agentId),
    checkBackendConnectivity: () => ipcRenderer.invoke('sync:check-backend-connectivity'),
    getSyncStatus: () => ipcRenderer.invoke('sync:get-status'),
    startAutoSync: () => ipcRenderer.invoke('sync:start-auto-sync'),
    stopAutoSync: () => ipcRenderer.invoke('sync:stop-auto-sync'),
    
    // App Control
      quitApplication: () => ipcRenderer.invoke('quit-application'),
      openExternal: (url) => ipcRenderer.invoke('open-external', url),
      getPlatformInfo: () => ipcRenderer.invoke('get-platform-info'),
      getWebUrl: () => ipcRenderer.invoke('get-web-url'),

    // User state listener (used by multiple components)
      onUserStateChanged: (callback) => ipcRenderer.on('user-state-changed', callback),
      removeOnUserStateChanged: (callback) => ipcRenderer.removeListener('user-state-changed', callback),
      
    // Area selection & screen capture
      startAreaSelection: () => ipcRenderer.invoke('start-area-selection'),
      cancelAreaSelection: () => ipcRenderer.invoke('cancel-area-selection'),
      captureSelectedArea: () => ipcRenderer.invoke('capture-selected-area'),
      captureFullScreen: () => ipcRenderer.invoke('capture-full-screen'),
      toggleContentProtection: (enabled) => ipcRenderer.invoke('toggle-content-protection', enabled),
      onAreaSelected: (callback) => ipcRenderer.on('area-selected', callback),
      onSelectionCancelled: (callback) => ipcRenderer.on('selection-cancelled', callback),
      
      // Persistent area management
      capturePersistentArea: () => ipcRenderer.invoke('capture-persistent-area'),
      clearPersistentArea: () => ipcRenderer.invoke('clear-persistent-area'),
      getPersistentAreaStatus: () => ipcRenderer.invoke('get-persistent-area-status'),
      onPersistentAreaSet: (callback) => ipcRenderer.on('persistent-area-set', callback),
      onPersistentAreaCleared: (callback) => ipcRenderer.on('persistent-area-cleared', callback),
      removeOnPersistentAreaSet: (callback) => ipcRenderer.removeListener('persistent-area-set', callback),
      removeOnPersistentAreaCleared: (callback) => ipcRenderer.removeListener('persistent-area-cleared', callback),
      
      // Theme events
      onThemeChanged: (callback) => ipcRenderer.on('theme-changed', callback),
      removeOnThemeChanged: (callback) => ipcRenderer.removeListener('theme-changed', callback),
      onThemeInitialize: (callback) => ipcRenderer.on('theme-initialize', callback),
      removeOnThemeInitialize: (callback) => ipcRenderer.removeListener('theme-initialize', callback),
      
      // Window opacity events
      onWindowOpacityChanged: (callback) => ipcRenderer.on('window-opacity-changed', callback),
      removeOnWindowOpacityChanged: (callback) => ipcRenderer.removeListener('window-opacity-changed', callback),
      
      // Theme management
      getCurrentTheme: () => ipcRenderer.invoke('get-current-theme'),
      setTheme: (theme) => ipcRenderer.invoke('set-theme', theme),
      toggleTheme: () => ipcRenderer.invoke('toggle-theme'),
      onThemeChanged: (callback) => ipcRenderer.on('theme-changed', callback),
      onThemeInitialize: (callback) => ipcRenderer.on('theme-initialize', callback),
      removeOnThemeChanged: (callback) => ipcRenderer.removeListener('theme-changed', callback),
      removeOnThemeInitialize: (callback) => ipcRenderer.removeListener('theme-initialize', callback),
  },

  // UI Component specific namespaces
  // src/ui/app/ApiKeyHeader.js
  apiKeyHeader: {
    // Model & Provider Management
    getProviderConfig: () => ipcRenderer.invoke('model:get-provider-config'),
    getOllamaStatus: () => ipcRenderer.invoke('ollama:get-status'),
    getModelSuggestions: () => ipcRenderer.invoke('ollama:get-model-suggestions'),
    ensureOllamaReady: () => ipcRenderer.invoke('ollama:ensure-ready'),
    installOllama: () => ipcRenderer.invoke('ollama:install'),
    startOllamaService: () => ipcRenderer.invoke('ollama:start-service'),
    pullOllamaModel: (modelName) => ipcRenderer.invoke('ollama:pull-model', modelName),
    downloadWhisperModel: (modelId) => ipcRenderer.invoke('whisper:download-model', modelId),
    validateKey: (data) => ipcRenderer.invoke('model:validate-key', data),
    setSelectedModel: (data) => ipcRenderer.invoke('model:set-selected-model', data),
    areProvidersConfigured: () => ipcRenderer.invoke('model:are-providers-configured'),
    hasConfiguredProviders: () => ipcRenderer.invoke('model:has-configured-providers'),
    
    // Window Management
    getHeaderPosition: () => ipcRenderer.invoke('get-header-position'),
    moveHeaderTo: (x, y) => ipcRenderer.invoke('move-header-to', x, y),
    
    // Listeners
    onOllamaInstallProgress: (callback) => ipcRenderer.on('ollama:install-progress', callback),
    removeOnOllamaInstallProgress: (callback) => ipcRenderer.removeListener('ollama:install-progress', callback),
    onceOllamaInstallComplete: (callback) => ipcRenderer.once('ollama:install-complete', callback),
    removeOnceOllamaInstallComplete: (callback) => ipcRenderer.removeListener('ollama:install-complete', callback),
    onOllamaPullProgress: (callback) => ipcRenderer.on('ollama:pull-progress', callback),
    removeOnOllamaPullProgress: (callback) => ipcRenderer.removeListener('ollama:pull-progress', callback),
    onWhisperDownloadProgress: (callback) => ipcRenderer.on('whisper:download-progress', callback),
    removeOnWhisperDownloadProgress: (callback) => ipcRenderer.removeListener('whisper:download-progress', callback),

    // Remove all listeners (for cleanup)
    removeAllListeners: () => {
      ipcRenderer.removeAllListeners('whisper:download-progress');
      ipcRenderer.removeAllListeners('ollama:install-progress');
      ipcRenderer.removeAllListeners('ollama:pull-progress');
      ipcRenderer.removeAllListeners('ollama:install-complete');
    }
  },

  // src/ui/app/HeaderController.js
  headerController: {
    // State Management
    sendHeaderStateChanged: (state) => ipcRenderer.send('header-state-changed', state),
    
    // Window Management
    resizeHeaderWindow: (dimensions) => ipcRenderer.invoke('resize-header-window', dimensions),
    
    // Permissions
    checkSystemPermissions: () => ipcRenderer.invoke('check-system-permissions'),
    checkPermissionsCompleted: () => ipcRenderer.invoke('check-permissions-completed'),
    
    // Listeners
    onUserStateChanged: (callback) => ipcRenderer.on('user-state-changed', callback),
    removeOnUserStateChanged: (callback) => ipcRenderer.removeListener('user-state-changed', callback),
    onAuthFailed: (callback) => ipcRenderer.on('auth-failed', callback),
    removeOnAuthFailed: (callback) => ipcRenderer.removeListener('auth-failed', callback),
    onForceShowApiKeyHeader: (callback) => ipcRenderer.on('force-show-apikey-header', callback),
    removeOnForceShowApiKeyHeader: (callback) => ipcRenderer.removeListener('force-show-apikey-header', callback)
  },

  // src/ui/app/MainHeader.js
  mainHeader: {
    // Window Management
    getHeaderPosition: () => ipcRenderer.invoke('get-header-position'),
    moveHeaderTo: (x, y) => ipcRenderer.invoke('move-header-to', x, y),
    sendHeaderAnimationFinished: (state) => ipcRenderer.send('header-animation-finished', state),

    // Settings Window Management
    cancelHideSettingsWindow: () => ipcRenderer.send('cancel-hide-settings-window'),
    showSettingsWindow: () => ipcRenderer.send('show-settings-window'),
    hideSettingsWindow: () => ipcRenderer.send('hide-settings-window'),
    
    // Agent Selector Window Management
    showAgentSelectorWindow: () => ipcRenderer.send('show-agent-selector-window'),
    hideAgentSelectorWindow: () => ipcRenderer.send('hide-agent-selector-window'),
    cancelHideAgentSelectorWindow: () => ipcRenderer.send('cancel-hide-agent-selector-window'),
    
    // Generic invoke (for dynamic channel names)
    // invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
    sendListenButtonClick: (listenButtonText) => ipcRenderer.invoke('listen:changeSession', listenButtonText),
    sendAskButtonClick: () => ipcRenderer.invoke('ask:toggleAskButton'),
    sendToggleAllWindowsVisibility: () => ipcRenderer.invoke('shortcut:toggleAllWindowsVisibility'),
    
    // Agent Mode Communication
    setAgentMode: (agentModeActive) => ipcRenderer.invoke('listen:set-agent-mode', agentModeActive),
    
    // Listeners
    onListenChangeSessionResult: (callback) => ipcRenderer.on('listen:changeSessionResult', callback),
    removeOnListenChangeSessionResult: (callback) => ipcRenderer.removeListener('listen:changeSessionResult', callback),
    onShortcutsUpdated: (callback) => ipcRenderer.on('shortcuts-updated', callback),
    removeOnShortcutsUpdated: (callback) => ipcRenderer.removeListener('shortcuts-updated', callback)
  },

  // src/ui/app/PermissionHeader.js
  permissionHeader: {
    // Permission Management
    checkSystemPermissions: () => ipcRenderer.invoke('check-system-permissions'),
    requestMicrophonePermission: () => ipcRenderer.invoke('request-microphone-permission'),
    openSystemPreferences: (preference) => ipcRenderer.invoke('open-system-preferences', preference),
    markPermissionsCompleted: () => ipcRenderer.invoke('mark-permissions-completed')
  },

  // src/ui/app/XerusApp.js
  xerusApp: {
    // Listeners
    onClickThroughToggled: (callback) => ipcRenderer.on('click-through-toggled', callback),
    removeOnClickThroughToggled: (callback) => ipcRenderer.removeListener('click-through-toggled', callback),
    removeAllClickThroughListeners: () => ipcRenderer.removeAllListeners('click-through-toggled')
  },

  // src/ui/ask/AskView.js
  askView: {
    // Window Management
    closeAskWindow: () => ipcRenderer.invoke('ask:closeAskWindow'),
    adjustWindowHeight: (height) => ipcRenderer.invoke('adjust-window-height', height),
    
    // Message Handling
    sendMessage: (text) => ipcRenderer.invoke('ask:sendQuestionFromAsk', text),
    
    
    // Personality Management
    getPersonalities: () => ipcRenderer.invoke('ask:getPersonalities'),
    setPersonality: (personalityId) => ipcRenderer.invoke('ask:setPersonality', personalityId),
    getPersonalityRecommendations: (taskType, userLevel) => ipcRenderer.invoke('ask:getPersonalityRecommendations', taskType, userLevel),
    toggleAdaptivePersonality: (enabled) => ipcRenderer.invoke('ask:toggleAdaptivePersonality', enabled),
    
    // Tutorial Management
    tutorialNext: () => ipcRenderer.invoke('ask:tutorialNext'),
    tutorialSkip: () => ipcRenderer.invoke('ask:tutorialSkip'),
    startTutorial: (tutorialId) => ipcRenderer.invoke('ask:startTutorial', tutorialId),

    // Listeners
    onAskStateUpdate: (callback) => ipcRenderer.on('ask:stateUpdate', callback),
    removeOnAskStateUpdate: (callback) => ipcRenderer.removeListener('ask:stateUpdate', callback),

    onAskStreamError: (callback) => ipcRenderer.on('ask-response-stream-error', callback),
    removeOnAskStreamError: (callback) => ipcRenderer.removeListener('ask-response-stream-error', callback),

    // Listeners
    onShowTextInput: (callback) => ipcRenderer.on('ask:showTextInput', callback),
    removeOnShowTextInput: (callback) => ipcRenderer.removeListener('ask:showTextInput', callback),
    
    onScrollResponseUp: (callback) => ipcRenderer.on('aks:scrollResponseUp', callback),
    removeOnScrollResponseUp: (callback) => ipcRenderer.removeListener('aks:scrollResponseUp', callback),
    onScrollResponseDown: (callback) => ipcRenderer.on('aks:scrollResponseDown', callback),
    removeOnScrollResponseDown: (callback) => ipcRenderer.removeListener('aks:scrollResponseDown', callback),
    
    // Tutorial Events
    onTutorialEvent: (callback) => ipcRenderer.on('ask:tutorialEvent', callback),
    removeOnTutorialEvent: (callback) => ipcRenderer.removeListener('ask:tutorialEvent', callback)
  },

  // src/ui/listen/ListenView.js
  listenView: {
    // Window Management
    adjustWindowHeight: (height) => ipcRenderer.invoke('adjust-window-height', height),
    
    // Debug/Testing
    forceAnalysis: () => ipcRenderer.invoke('listen:force-analysis'),
    
    // Listeners
    onSessionStateChanged: (callback) => ipcRenderer.on('session-state-changed', callback),
    removeOnSessionStateChanged: (callback) => ipcRenderer.removeListener('session-state-changed', callback)
  },

  // src/ui/listen/stt/SttView.js
  sttView: {
    // Listeners
    onSttUpdate: (callback) => ipcRenderer.on('stt-update', callback),
    removeOnSttUpdate: (callback) => ipcRenderer.removeListener('stt-update', callback)
  },

  // src/ui/listen/summary/SummaryView.js
  summaryView: {
    // Message Handling
    sendQuestionFromSummary: (text) => ipcRenderer.invoke('ask:sendQuestionFromSummary', text),
    
    // Listeners
    onSummaryUpdate: (callback) => ipcRenderer.on('summary-update', callback),
    removeOnSummaryUpdate: (callback) => ipcRenderer.removeListener('summary-update', callback),
    removeAllSummaryUpdateListeners: () => ipcRenderer.removeAllListeners('summary-update')
  },

  // src/ui/settings/SettingsView.js
  settingsView: {
    // User & Auth
    getCurrentUser: () => ipcRenderer.invoke('get-current-user'),
    openPersonalizePage: () => ipcRenderer.invoke('open-personalize-page'),
    firebaseLogout: () => ipcRenderer.invoke('firebase-logout'),
    startFirebaseAuth: () => ipcRenderer.invoke('start-firebase-auth'),

    // Model & Provider Management
    getModelSettings: () => ipcRenderer.invoke('settings:get-model-settings'), // Facade call
    getProviderConfig: () => ipcRenderer.invoke('model:get-provider-config'),
    getAllKeys: () => ipcRenderer.invoke('model:get-all-keys'),
    getAvailableModels: (type) => ipcRenderer.invoke('model:get-available-models', type),
    getSelectedModels: () => ipcRenderer.invoke('model:get-selected-models'),
    validateKey: (data) => ipcRenderer.invoke('model:validate-key', data),
    saveApiKey: (key) => ipcRenderer.invoke('model:save-api-key', key),
    removeApiKey: (provider) => ipcRenderer.invoke('model:remove-api-key', provider),
    setSelectedModel: (data) => ipcRenderer.invoke('model:set-selected-model', data),
    
    // Ollama Management
    getOllamaStatus: () => ipcRenderer.invoke('ollama:get-status'),
    ensureOllamaReady: () => ipcRenderer.invoke('ollama:ensure-ready'),
    shutdownOllama: (graceful) => ipcRenderer.invoke('ollama:shutdown', graceful),
    
    // Whisper Management
    getWhisperInstalledModels: () => ipcRenderer.invoke('whisper:get-installed-models'),
    downloadWhisperModel: (modelId) => ipcRenderer.invoke('whisper:download-model', modelId),
    
    // Settings Management
    getPresets: () => ipcRenderer.invoke('settings:getPresets'),
    getAutoUpdate: () => ipcRenderer.invoke('settings:get-auto-update'),
    setAutoUpdate: (isEnabled) => ipcRenderer.invoke('settings:set-auto-update', isEnabled),
    getContentProtectionStatus: () => ipcRenderer.invoke('get-content-protection-status'),
    toggleContentProtection: () => ipcRenderer.invoke('toggle-content-protection'),
    getCurrentShortcuts: () => ipcRenderer.invoke('settings:getCurrentShortcuts'),
    openShortcutSettingsWindow: () => ipcRenderer.invoke('shortcut:openShortcutSettingsWindow'),
    
    // Window Management
    moveWindowStep: (direction) => ipcRenderer.invoke('move-window-step', direction),
    cancelHideSettingsWindow: () => ipcRenderer.send('cancel-hide-settings-window'),
    hideSettingsWindow: () => ipcRenderer.send('hide-settings-window'),
    setWindowOpacity: (opacity) => ipcRenderer.invoke('set-window-opacity', opacity),
    toggleClickThrough: () => ipcRenderer.invoke('toggle-click-through'),
    getClickThroughStatus: () => ipcRenderer.invoke('get-click-through-status'),
    
    // App Control
    quitApplication: () => ipcRenderer.invoke('quit-application'),
    
    // Progress Tracking
    pullOllamaModel: (modelName) => ipcRenderer.invoke('ollama:pull-model', modelName),
    
    // Listeners
    onUserStateChanged: (callback) => ipcRenderer.on('user-state-changed', callback),
    removeOnUserStateChanged: (callback) => ipcRenderer.removeListener('user-state-changed', callback),
    onSettingsUpdated: (callback) => ipcRenderer.on('settings-updated', callback),
    removeOnSettingsUpdated: (callback) => ipcRenderer.removeListener('settings-updated', callback),
    onPresetsUpdated: (callback) => ipcRenderer.on('presets-updated', callback),
    removeOnPresetsUpdated: (callback) => ipcRenderer.removeListener('presets-updated', callback),
    onShortcutsUpdated: (callback) => ipcRenderer.on('shortcuts-updated', callback),
    removeOnShortcutsUpdated: (callback) => ipcRenderer.removeListener('shortcuts-updated', callback),
    onWhisperDownloadProgress: (callback) => ipcRenderer.on('whisper:download-progress', callback),
    removeOnWhisperDownloadProgress: (callback) => ipcRenderer.removeListener('whisper:download-progress', callback),
    onOllamaPullProgress: (callback) => ipcRenderer.on('ollama:pull-progress', callback),
    removeOnOllamaPullProgress: (callback) => ipcRenderer.removeListener('ollama:pull-progress', callback),
    onClickThroughChanged: (callback) => ipcRenderer.on('click-through-changed', callback),
    removeOnClickThroughChanged: (callback) => ipcRenderer.removeListener('click-through-changed', callback)
  },

  // src/ui/settings/ShortCutSettingsView.js
  shortcutSettingsView: {
    // Shortcut Management
    saveShortcuts: (shortcuts) => ipcRenderer.invoke('shortcut:saveShortcuts', shortcuts),
    getDefaultShortcuts: () => ipcRenderer.invoke('shortcut:getDefaultShortcuts'),
    closeShortcutSettingsWindow: () => ipcRenderer.invoke('shortcut:closeShortcutSettingsWindow'),
    
    // Listeners
    onLoadShortcuts: (callback) => ipcRenderer.on('shortcut:loadShortcuts', callback),
    removeOnLoadShortcuts: (callback) => ipcRenderer.removeListener('shortcut:loadShortcuts', callback)
  },

  // src/ui/app/content.html inline scripts
  content: {
    // Listeners
    onSettingsWindowHideAnimation: (callback) => ipcRenderer.on('settings-window-hide-animation', callback),
    removeOnSettingsWindowHideAnimation: (callback) => ipcRenderer.removeListener('settings-window-hide-animation', callback),    
  },

  // src/ui/listen/audioCore/listenCapture.js
  listenCapture: {
    // Audio Management
    sendMicAudioContent: (data) => ipcRenderer.invoke('listen:sendMicAudio', data),
    sendSystemAudioContent: (data) => ipcRenderer.invoke('listen:sendSystemAudio', data),
    startMacosSystemAudio: () => ipcRenderer.invoke('listen:startMacosSystemAudio'),
    stopMacosSystemAudio: () => ipcRenderer.invoke('listen:stopMacosSystemAudio'),
    
    // Speaker Control for Hardware Acoustic Coupling Prevention
    muteSpeakers: () => ipcRenderer.invoke('listen:muteSpeakers'),
    unmuteSpeakers: (originalVolume) => ipcRenderer.invoke('listen:unmuteSpeakers', originalVolume),
    
    // Session Management
    isSessionActive: () => ipcRenderer.invoke('is-session-active'),
    
    // Listeners
    onSystemAudioData: (callback) => ipcRenderer.on('system-audio-data', callback),
    removeOnSystemAudioData: (callback) => ipcRenderer.removeListener('system-audio-data', callback)
  },

  // src/ui/listen/audioCore/renderer.js
  renderer: {
    // Listeners
    onChangeListenCaptureState: (callback) => ipcRenderer.on('change-listen-capture-state', callback),
    removeOnChangeListenCaptureState: (callback) => ipcRenderer.removeListener('change-listen-capture-state', callback)
  },

  // Platform Glass System - Cross-platform glass UI support
  liquidGlass: {
    // Liquid Glass Management (macOS native)
    addView: () => ipcRenderer.invoke('liquid-glass:add-view'),
    removeView: (viewId) => ipcRenderer.invoke('liquid-glass:remove-view', viewId),
    setVariant: (viewId, variant) => ipcRenderer.invoke('liquid-glass:set-variant', viewId, variant),
    setScrim: (viewId, scrim) => ipcRenderer.invoke('liquid-glass:set-scrim', viewId, scrim),
    setSubdued: (viewId, subdued) => ipcRenderer.invoke('liquid-glass:set-subdued', viewId, subdued),
    
    // Platform Detection
    getPlatformInfo: () => ipcRenderer.invoke('get-platform-info')
  }
});