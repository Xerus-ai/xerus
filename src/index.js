// try {
//     const reloader = require('electron-reloader');
//     reloader(module, {
//     });
// } catch (err) {
// }

require('dotenv').config();

// COMPREHENSIVE error handlers (CRITICAL FIX)
process.on('unhandledRejection', (reason, promise) => {
    console.log('[UNHANDLED-REJECTION] Caught unhandled promise rejection:', reason);
    console.log('[UNHANDLED-REJECTION] Promise:', promise);
    // Don't exit - just log and continue
});

process.on('uncaughtException', (error) => {
    console.log('[UNCAUGHT-EXCEPTION] Caught uncaught exception:', error.message);
    console.log('[UNCAUGHT-EXCEPTION] Stack:', error.stack);
    // Don't exit - just log and continue
    return true;
});

console.log('[STARTUP] ✅ Comprehensive error handlers installed');

if (require('electron-squirrel-startup')) {
    process.exit(0);
}

const { app, BrowserWindow, shell, ipcMain, dialog, desktopCapturer, session } = require('electron');

const { createWindows } = require('./window/windowManager.js');

const listenService = require('./features/listen/listenService');

const { initializeFirebase } = require('./common/services/firebaseClient');
// const databaseInitializer = require('./common/services/databaseInitializer'); // Phase 1 Fix: SQLite removed

const authService = require('./common/services/authService');

const path = require('node:path');

const express = require('express');

const fetch = require('node-fetch');

const { resourcePoolManager } = require('./common/services/resource-pool-manager.js');

const { autoUpdater } = require('electron-updater');

const { EventEmitter } = require('events');

const askService = require('./features/ask/askService');

const settingsService = require('./features/settings/settingsService');

const sessionRepository = require('./common/repositories/session');

const modelStateService = require('./common/services/modelStateService');

const featureBridge = require('./bridge/featureBridge');

const windowBridge = require('./bridge/windowBridge');
// Import context IPC handlers for context management functionality  
// const { ContextIpcHandlers } = require('./bridge/context-ipc-handlers'); // Temporarily disabled due to circular dependency

const { enhancedScreenCapture } = require('./main/enhanced-screen-capture');

const { privacyManager } = require('./main/privacy-manager');

const { configManager } = require('./main/config-manager');
// Dependency injection removed - using direct imports instead

// Global variables
const eventBridge = new EventEmitter();
let WEB_PORT = 3000;
let isShuttingDown = false; // Flag to prevent infinite shutdown loop

//////// after_modelStateService ////////
global.modelStateService = modelStateService;
//////// after_modelStateService ////////

// Import and initialize OllamaService
const ollamaService = require('./common/services/ollamaService');

const ollamaModelRepository = require('./common/repositories/ollamaModel');

const { createLogger } = require('./common/services/logger.js');

const logger = createLogger('Index');

// Safe webContents.send wrapper to handle EPIPE errors
function safeWebContentsSend(webContents, channel, ...args) {
    try {
        if (webContents && !webContents.isDestroyed()) {
            webContents.send(channel, ...args);
        }
    } catch (error) {
        if (error.code === 'EPIPE' || error.message.includes('broken pipe')) {
            logger.warn('[SafeIPC] EPIPE error in webContents.send, ignoring...', { 
                channel,
                error: error.message 
            });
        } else {
            logger.error('[SafeIPC] Error in webContents.send:', { 
                channel,
                error: error.message 
            });
        }
    }
}

// Make safe sender globally available
global.safeWebContentsSend = safeWebContentsSend;

// Global error handling for uncaught exceptions and broken pipes
process.on('uncaughtException', (error) => {
    // Handle EPIPE (Broken pipe) errors gracefully
    if (error.code === 'EPIPE' || error.message.includes('Broken pipe')) {
        logger.warn('[Process] EPIPE error caught (broken pipe/write), continuing...', { 
            error: error.message,
            code: error.code 
        });
        return; // Don't crash the app for broken pipe errors
    }
    
    // Handle other uncaught exceptions
    logger.error('[Process] Uncaught exception:', { 
        error: error.message,
        stack: error.stack,
        code: error.code 
    });
    
    // Attempt graceful shutdown for critical errors
    if (!isShuttingDown) {
        logger.error('[Process] Attempting graceful shutdown due to uncaught exception...');
        app.quit();
    }
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('[Process] Unhandled promise rejection:', { 
        reason: reason?.message || reason,
        stack: reason?.stack
    });
});

// Native deep link handling - cross-platform compatible
let pendingDeepLinkUrl = null;

function setupProtocolHandling() {
    // Register xerus:// protocol handler for deep linking
    logger.info('[Protocol] Registering xerus:// custom URL scheme...');
    
    try {
        // Register the protocol
        if (!app.isDefaultProtocolClient('xerus')) {
            const success = app.setAsDefaultProtocolClient('xerus');
            if (success) {
                logger.info('[Protocol] [OK] Successfully registered xerus:// protocol');
            } else {
                logger.warn('[Protocol] [WARNING] Failed to register xerus:// protocol (may already be registered)');
            }
        } else {
            logger.info('[Protocol] [OK] xerus:// protocol already registered');
        }
    } catch (error) {
        logger.error('[Protocol] Error registering protocol:', { error: error.message });
    }

    // Handle second instance (Windows/Linux) - receives protocol URLs via command line
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        logger.info('[Protocol] Second instance detected, command line:', commandLine);
        focusMainWindow();
        
        // Find xerus:// URL in command line arguments
        const protocolUrl = commandLine.find(arg => arg.startsWith('xerus://'));
        if (protocolUrl) {
            logger.info('[Protocol] Found protocol URL in second instance:', protocolUrl);
            handleCustomUrl(protocolUrl);
        }
    });

    // Handle protocol URL on macOS - receives URLs directly
    app.on('open-url', (event, url) => {
        event.preventDefault();
        logger.info('[Protocol] Received protocol URL on macOS:', url);
        
        if (url.startsWith('xerus://')) {
            focusMainWindow();
            handleCustomUrl(url);
        } else {
            logger.warn('[Protocol] Received non-xerus URL, ignoring:', url);
        }
    });
}

function focusMainWindow() {
    const { windowPool } = require('./window/windowManager.js');
    if (windowPool) {
        const header = windowPool.get('header');
        if (header && !header.isDestroyed()) {
            if (header.isMinimized()) header.restore();
            header.focus();
            return true;
        }
    }
    
    // Fallback: focus any available window
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
        const mainWindow = windows[0];
        if (!mainWindow.isDestroyed()) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
            return true;
        }
    }
    
    return false;
}

// Check for protocol URL in startup arguments (Windows/Linux)
const startupProtocolUrl = process.argv.find(arg => arg.startsWith('xerus://'));
if (startupProtocolUrl) {
    logger.info('[Protocol] Found startup protocol URL:', startupProtocolUrl);
    pendingDeepLinkUrl = startupProtocolUrl;
}

// Check for force start flag in development
const forceStart = process.argv.includes('--force-start') || process.env.XERUS_FORCE_START === 'true';

console.log('[STARTUP] 🔒 Requesting single instance lock...');
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    console.log('[STARTUP] ❌ CRITICAL: Single instance lock failed!');
    console.log('[STARTUP] ❌ Another Xerus instance is already running.');

    if (forceStart) {
        console.log('[STARTUP] ⚠️ WARNING: Force start enabled - bypassing single instance lock');
        console.log('[STARTUP] ⚠️ This may cause issues if another instance is actually running');
        logger && logger.warn('[SingleInstance] Force start enabled - bypassing single instance lock');
    } else {
        console.log('[STARTUP] ❌ This instance will now exit.');
        logger && logger.error('[SingleInstance] Failed to acquire single instance lock - another instance is running');

        // Check if we're in development mode and provide helpful guidance
        if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
            console.log('[STARTUP] 💡 TIP: In development, make sure no other npm start processes are running');
            console.log('[STARTUP] 💡 TIP: You can kill all Electron processes with: taskkill /f /im electron.exe');
            console.log('[STARTUP] 💡 TIP: Or use force start: npm start -- --force-start');
            console.log('[STARTUP] 💡 TIP: Or set environment: XERUS_FORCE_START=true npm start');
        }

        app.quit();
        process.exit(1); // Use exit code 1 to indicate error, not normal exit
    }
} else {
    console.log('[STARTUP] ✅ Single instance lock acquired successfully');
}

// setup protocol after single instance lock
setupProtocolHandling();


app.whenReady().then(async () => {

    // Setup native loopback audio capture for Windows
    session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
        desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
            // Grant access to the first screen found with loopback audio
            callback({ video: sources[0], audio: 'loopback' });
        }).catch((error) => {
            logger.error('Error occurred', { error  });
            callback({});
        });
    });

    // Initialize configuration manager
    logger.info('[Index] Configuration Manager initialized');
    logger.info('[Index] Configuration summary:', configManager.getSummary());

    // Dependency injection removed - services use direct imports
    logger.info('[Index] Services use direct imports (DI container removed)');

    // Initialize core services
    initializeFirebase();
    
    try {
        // Phase 1 Fix: Temporarily disable SQLite database initialization
        // This prevents SQLite module errors while we migrate to unified Neon database
        // await databaseInitializer.initialize();
        logger.info('>>> [index.js] SQLite database initialization disabled (Phase 1 Fix)');
        
        // Clean up zombie sessions from previous runs first - MOVED TO authService
        // sessionRepository.endAllActiveSessions();

        logger.info('[Index] DEBUG: About to initialize authService...');
        try {
            await authService.initialize();
            logger.info('[Index] DEBUG: authService.initialize() completed');
        } catch (error) {
            logger.error('[Index] ERROR: authService.initialize() failed:', error.message);
            logger.info('[Index] Continuing with limited functionality...');
        }

        //////// after_modelStateService ////////
        logger.info('[Index] DEBUG: About to initialize modelStateService...');
        await modelStateService.initialize();
        logger.info('[Index] DEBUG: modelStateService.initialize() completed');
        //////// after_modelStateService ////////

        logger.info('[Index] DEBUG: About to initialize featureBridge and windowBridge...');
        featureBridge.initialize();  // [Korean comment translated]: featureBridge Initialize
        windowBridge.initialize();
        // Initialize context IPC handlers for context management functionality
        // const contextIpcHandlers = new ContextIpcHandlers(); // Temporarily disabled due to circular dependency
        setupWebDataHandlers();
        logger.info('[Index] DEBUG: featureBridge, windowBridge, and setupWebDataHandlers completed');
        
        // Initialize listen service and IPC handlers
        logger.info('[Index] DEBUG: About to initialize listenService...');
        listenService.initialize();
        logger.info('[Index] Listen service initialized');

        // >>> [index.js] Ollama model database initialization disabled (Phase 1 Fix - SQLite removed)
        logger.info('[Index] DEBUG: Ollama model initialization skipped - using backend API endpoints');

        // Auto warm-up selected Ollama model in background (non-blocking)
        setTimeout(async () => {
            try {
                logger.info('[index.js] Starting background Ollama model warm-up...');
                await ollamaService.autoWarmUpSelectedModel();
            } catch (error) {
                logger.info('[index.js] Background warm-up failed (non-critical):', error.message);
            }
        }, 2000); // Wait 2 seconds after app start

        // Start web server and create windows ONLY after all initializations are successful
        WEB_PORT = await startWebStack();
        logger.info('Web front-end listening on', WEB_PORT);
        
        createWindows();

    } catch (err) {
        logger.error('>>> [index.js] Database initialization failed - some features may not work', { 
            error: err.message, 
            stack: err.stack,
            name: err.name 
        });
        dialog.showErrorBox(
            'Initialization Error',
            `Failed to initialize the application: ${err.message}`
        );
    }

    // Auto-updater will be initialized after user authentication
    // Start periodic check for authenticated user to initialize auto-updater
    const autoUpdaterRetryInterval = setInterval(() => {
        const currentUser = authService.getCurrentUser();
        if (currentUser && currentUser.isLoggedIn && !autoUpdaterInitialized) {
            logger.info('[AutoUpdater] User authenticated, initializing auto-updater...');
            initAutoUpdaterOnAuth();
            clearInterval(autoUpdaterRetryInterval);
        }
    }, 2000); // Check every 2 seconds
    
    // Stop trying after 60 seconds to avoid infinite polling
    setTimeout(() => {
        clearInterval(autoUpdaterRetryInterval);
        if (!autoUpdaterInitialized) {
            logger.info('[AutoUpdater] Timeout reached, skipping auto-updater initialization');
        }
    }, 60000);

    // Process any pending protocol URL from startup
    if (pendingDeepLinkUrl) {
        logger.info('[Protocol] Processing pending startup protocol URL:', pendingDeepLinkUrl);
        handleCustomUrl(pendingDeepLinkUrl);
        pendingDeepLinkUrl = null;
    }
});

app.on('before-quit', async (event) => {
    // Prevent infinite loop by checking if shutdown is already in progress
    if (isShuttingDown) {
        logger.info('[Shutdown] [LOADING] Shutdown already in progress, allowing quit...');
        return;
    }
    
    logger.info('[Shutdown] App is about to quit. Starting graceful shutdown...');
    
    // Set shutdown flag to prevent infinite loop
    isShuttingDown = true;
    
    // Prevent immediate quit to allow graceful shutdown
    event.preventDefault();
    
    try {
        // 1. Stop audio capture first (immediate)
        await listenService.closeSession();
        logger.info('[Shutdown] Audio capture stopped');
        
        // 2. End all active sessions (database operations) - with error handling
        try {
            await sessionRepository.endAllActiveSessions();
            logger.info('[Shutdown] Active sessions ended');
        } catch (dbError) {
            logger.warn('Could not end active sessions (database may be closed):', { error: dbError.message });
        }
        
        // 3. Shutdown Ollama service (potentially time-consuming)
        logger.info('[Shutdown] shutting down Ollama service...');
        const ollamaShutdownSuccess = await Promise.race([
            ollamaService.shutdown(false), // Graceful shutdown
            new Promise(resolve => setTimeout(() => resolve(false), 8000)) // 8s timeout
        ]);
        
        if (ollamaShutdownSuccess) {
            logger.info('[Shutdown] Ollama service shut down gracefully');
        } else {
            logger.info('[Shutdown] Ollama shutdown timeout, forcing...');
            // Force shutdown if graceful failed
            try {
                await ollamaService.shutdown(true);
            } catch (forceShutdownError) {
                logger.warn('Force shutdown also failed:', { error: forceShutdownError.message });
            }
        }
        
        // 4. Close database connections (final cleanup) - SQLite removed
        logger.info('[Shutdown] SQLite database close skipped (migrated to Neon)');
        
        logger.info('[Shutdown] Graceful shutdown completed successfully');
        
    } catch (error) {
        logger.error('Error during graceful shutdown:', { error });
        // Continue with shutdown even if there were errors
    } finally {
        // Actually quit the app now
        logger.info('[Shutdown] Exiting application...');
        app.exit(0); // Use app.exit() instead of app.quit() to force quit
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindows();
    }
});

function setupWebDataHandlers() {
    const sessionRepository = require('./common/repositories/session');
    const sttRepository = require('./features/listen/stt/repositories');
    const summaryRepository = require('./features/listen/summary/repositories');
    const askRepository = require('./features/ask/repositories');
    const userRepository = require('./common/repositories/user');
    const presetRepository = require('./common/repositories/preset');

    const handleRequest = async (channel, responseChannel, payload) => {
        let result;
        // const currentUserId = authService.getCurrentUserId(); // No longer needed here
        try {
            switch (channel) {
                // SESSION
                case 'get-sessions':
                    // Adapter injects UID
                    result = await sessionRepository.getAllByUserId();
                    break;
                case 'get-session-details':
                    const session = await sessionRepository.getById(payload);
                    if (!session) {
                        result = null;
                        break;
                    }
                    const [transcripts, ai_messages, summary] = await Promise.all([
                        sttRepository.getAllTranscriptsBySessionId(payload),
                        askRepository.getAllAiMessagesBySessionId(payload),
                        summaryRepository.getSummaryBySessionId(payload)
                    ]);
                    result = { session, transcripts, ai_messages, summary };
                    break;
                case 'delete-session':
                    result = await sessionRepository.deleteWithRelatedData(payload);
                    break;
                case 'create-session':
                    // Adapter injects UID
                    const id = await sessionRepository.create('ask');
                    if (payload && payload.title) {
                        await sessionRepository.updateTitle(id, payload.title);
                    }
                    result = { id };
                    break;
                
                // USER
                case 'get-user-profile':
                    // Adapter injects UID
                    result = await userRepository.getById();
                    break;
                case 'update-user-profile':
                     // Adapter injects UID
                    result = await userRepository.update(payload);
                    break;
                case 'find-or-create-user':
                    result = await userRepository.findOrCreate(payload);
                    break;
                case 'save-api-key':
                    // Use ModelStateService as the single source of truth for API key management
                    result = await modelStateService.setApiKey(payload.provider, payload.apiKey);
                    break;
                case 'check-api-key-status':
                    // Use ModelStateService to check API key status
                    const hasApiKey = await modelStateService.hasValidApiKey();
                    result = { hasApiKey };
                    break;
                case 'get-all-api-key-status':
                    // Get status for all API key providers
                    result = {
                        openai: await modelStateService.hasValidApiKey('openai'),
                        gemini: await modelStateService.hasValidApiKey('gemini'),
                        anthropic: await modelStateService.hasValidApiKey('anthropic'),
                        ollama: await modelStateService.hasValidApiKey('ollama'),
                        whisper: await modelStateService.hasValidApiKey('whisper')
                    };
                    break;
                case 'get-all-api-keys':
                    // Get all API keys (masked for security)
                    result = {
                        openai: await modelStateService.getApiKey('openai') ? '••••••••' : null,
                        gemini: await modelStateService.getApiKey('gemini') ? '••••••••' : null,
                        anthropic: await modelStateService.getApiKey('anthropic') ? '••••••••' : null,
                        ollama: await modelStateService.getApiKey('ollama') ? '••••••••' : null,
                        whisper: await modelStateService.getApiKey('whisper') ? '••••••••' : null
                    };
                    break;
                case 'remove-api-key':
                    // Remove specific API key
                    result = await modelStateService.handleRemoveApiKey(payload.provider);
                    break;
                case 'delete-account':
                    // Adapter injects UID
                    result = await userRepository.deleteById();
                    break;

                // PRESET
                case 'get-presets':
                    // Adapter injects UID
                    result = await presetRepository.getPresets();
                    break;
                case 'create-preset':
                    // Adapter injects UID
                    result = await presetRepository.create(payload);
                    settingsService.notifyPresetUpdate('created', result.id, payload.title);
                    break;
                case 'update-preset':
                    // Adapter injects UID
                    result = await presetRepository.update(payload.id, payload.data);
                    settingsService.notifyPresetUpdate('updated', payload.id, payload.data.title);
                    break;
                case 'delete-preset':
                    // Adapter injects UID
                    result = await presetRepository.delete(payload);
                    settingsService.notifyPresetUpdate('deleted', payload);
                    break;
                
                // BATCH
                case 'get-batch-data':
                    const includes = payload ? payload.split(',').map(item => item.trim()) : ['profile', 'presets', 'sessions'];
                    const promises = {};
            
                    if (includes.includes('profile')) {
                        // Adapter injects UID
                        promises.profile = userRepository.getById();
                    }
                    if (includes.includes('presets')) {
                        // Adapter injects UID
                        promises.presets = presetRepository.getPresets();
                    }
                    if (includes.includes('sessions')) {
                        // Adapter injects UID
                        promises.sessions = sessionRepository.getAllByUserId();
                    }
                    
                    const batchResult = {};
                    const promiseResults = await Promise.all(Object.values(promises));
                    Object.keys(promises).forEach((key, index) => {
                        batchResult[key] = promiseResults[index];
                    });

                    result = batchResult;
                    break;

                default:
                    throw new Error(`Unknown web data channel: ${channel}`);
            }
            eventBridge.emit(responseChannel, { success: true, data: result });
        } catch (error) {
            logger.error('Error occurred', { error: `Error handling web data request for ${channel}:`, error });
            eventBridge.emit(responseChannel, { success: false, error: error.message });
        }
    };
    
    eventBridge.on('web-data-request', handleRequest);
}

async function handleCustomUrl(url) {
    try {
        logger.info('[Custom URL] Processing URL:', url);
        
        // Validate and clean URL
        if (!url || typeof url !== 'string' || !url.startsWith('xerus://')) {
            logger.error('Invalid URL format:', { url });
            return;
        }
        
        // Clean up URL by removing problematic characters
        const cleanUrl = url.replace(/[\\₩]/g, '');
        
        // Additional validation
        if (cleanUrl !== url) {
            logger.info('[Custom URL] Cleaned URL from:', url, 'to:', cleanUrl);
            url = cleanUrl;
        }
        
        const urlObj = new URL(url);
        const action = urlObj.hostname;
        const params = Object.fromEntries(urlObj.searchParams);
        
        logger.info('[Custom URL] Action:', action, 'Params:', params);

        switch (action) {
            case 'login':
            case 'auth-success':
                await handleFirebaseAuthCallback(params);
                break;
            case 'local-mode':
                handleLocalModeFromUrl();
                break;
            case 'personalize':
                handlePersonalizeFromUrl(params);
                break;
            default:
                const { windowPool } = require('./window/windowManager.js');
                const header = windowPool.get('header');
                if (header) {
                    if (header.isMinimized()) header.restore();
                    header.focus();
                    
                    const targetUrl = `http://localhost:${WEB_PORT}/${action}`;
                    logger.info('Navigating webview to:');
                    header.webContents.loadURL(targetUrl);
                }
        }

    } catch (error) {
        logger.error('Error parsing URL:', { error });
    }
}

async function handleFirebaseAuthCallback(params) {
    const userRepository = require('./common/repositories/user');
    const { token: idToken } = params;

    if (!idToken) {
        logger.error('Firebase auth callback is missing ID token.');
        // No need to send IPC, the UI won't transition without a successful auth state change.
        return;
    }

    logger.info('[Auth] Received ID token from deep link, exchanging for custom token...');

    try {
        const functionUrl = 'https://us-west1-xerus-d067d.cloudfunctions.net/xerusAuthCallback';
        // Use ResourcePoolManager to prevent EPIPE errors
        logger.debug('[Auth] Making Firebase auth callback request via ResourcePoolManager');
        const response = await resourcePoolManager.queuedFetch(functionUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: idToken })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Failed to exchange token.');
        }

        const { customToken, user } = data;
        logger.info('[Auth] Successfully received custom token for user:', user.uid);

        const firebaseUser = {
            uid: user.uid,
            email: user.email || 'no-email@example.com',
            displayName: user.name || 'User',
            photoURL: user.picture
        };

        // 1. Sync user data to local DB
        userRepository.findOrCreate(firebaseUser);
        logger.info('[Auth] User data synced with local DB.');

        // 2. Sign in using the authService in the main process
        await authService.signInWithCustomToken(customToken);
        logger.info('[Auth] Main process sign-in initiated. Waiting for onAuthStateChanged...');

        // 3. Focus the app window
        const { windowPool } = require('./window/windowManager.js');
        const header = windowPool.get('header');
        if (header) {
            if (header.isMinimized()) header.restore();
            header.focus();
        } else {
            logger.error('Header window not found after auth callback.');
        }
        
    } catch (error) {
        logger.error('Error during custom token exchange or sign-in:', { error });
        // The UI will not change, and the user can try again.
        // Optionally, send a generic error event to the renderer.
        const { windowPool } = require('./window/windowManager.js');
        const header = windowPool.get('header');
        if (header) {
            safeWebContentsSend(header.webContents, 'auth-failed', { message: error.message });
        }
    }
}

function handlePersonalizeFromUrl(params) {
    logger.info('[Custom URL] Personalize params:', params);
    
    const { windowPool } = require('./window/windowManager.js');
    const header = windowPool.get('header');
    
    if (header) {
        if (header.isMinimized()) header.restore();
        header.focus();
        
        const personalizeUrl = `http://localhost:${WEB_PORT}/settings`;
        logger.info('Navigating to personalize page:');
        header.webContents.loadURL(personalizeUrl);
        
        BrowserWindow.getAllWindows().forEach(win => {
            safeWebContentsSend(win.webContents, 'enter-personalize-mode', {
                message: 'Personalization mode activated',
                params: params
            });
        });
    } else {
        logger.error('Header window not found for personalize');
    }
}

function handleLocalModeFromUrl() {
    logger.info('[Custom URL] Local mode activation requested via protocol');
    
    const { windowPool } = require('./window/windowManager.js');
    const header = windowPool.get('header');
    
    if (header) {
        if (header.isMinimized()) header.restore();
        header.focus();
        
        logger.info('[Custom URL] Focusing main window for local mode');
        
        // Send event to renderer to confirm local mode activation
        BrowserWindow.getAllWindows().forEach(win => {
            safeWebContentsSend(win.webContents, 'local-mode-activated', {
                message: 'Local mode activated via deep link'
            });
        });
    } else {
        logger.error('Header window not found for local mode activation');
    }
}


async function startWebStack() {
  logger.info('NODE_ENV =', process.env.NODE_ENV); 
  const isDev = !app.isPackaged;

  const getAvailablePort = () => {
    return new Promise((resolve, reject) => {
      const server = require('net').createServer();
      server.listen(0, (err) => {
        if (err) reject(err);
        const port = server.address().port;
        server.close(() => resolve(port));
      });
    });
  };

  // Use consistent ports for API and frontend to avoid conflicts
  const apiPort = process.env.BACKEND_PORT || 5001;
  const frontendPort = await getAvailablePort();

  logger.info(`[TOOL] Allocated ports: API=${apiPort}, Frontend=${frontendPort}`);

  // Set environment variables for inter-service communication
  process.env.xerus_API_URL = `http://localhost:${apiPort}`;
  process.env.XERUS_WEB_URL = `http://localhost:${frontendPort}`;

  logger.info(`🌍 Environment variables set:`, {
    xerus_API_URL: process.env.xerus_API_URL,
    XERUS_WEB_URL: process.env.XERUS_WEB_URL
  });

  // Backend is now running as standalone service on localhost:5001
  // No need to embed backend within Electron process

  const staticDir = app.isPackaged
    ? path.join(process.resourcesPath, 'out')
    : path.resolve(__dirname, '..', 'xerus_web', 'out');

  const fs = require('fs');

  if (!fs.existsSync(staticDir)) {
    logger.error(`============================================================`);
    logger.error('Frontend build directory not found!');
    logger.error(`Path: ${staticDir}`);
    logger.error(`Please run 'npm run build' inside the 'xerus_web' directory first.`);
    logger.error(`============================================================`);
    app.quit();
    return;
  }

  const runtimeConfig = {
    API_URL: `http://localhost:${apiPort}/api/v1`,
    WEB_URL: `http://localhost:${frontendPort}`,
    timestamp: Date.now(),
    // Firebase environment variables for web app
    NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
  };
  
  // [Korean comment translated] [Korean comment translated] [Korean comment translated] [Korean comment translated] [Korean comment translated] Settings File [Korean comment translated]
  const tempDir = app.getPath('temp');
  const configPath = path.join(tempDir, 'runtime-config.json');
  fs.writeFileSync(configPath, JSON.stringify(runtimeConfig, null, 2));
  logger.info(`[TEXT] Runtime config created in temp location: ${configPath}`);

  const frontSrv = express();
  
  // Enable JSON body parsing for auth endpoints
  frontSrv.use(express.json());
  
  // [Korean comment translated] /runtime-config.json[Korean comment translated] Request[Korean comment translated] [Korean comment translated] [Korean comment translated] File[Korean comment translated] [Korean comment translated]
  frontSrv.get('/runtime-config.json', (req, res) => {
    res.sendFile(configPath);
  });

  // Handle authentication callback from browser
  frontSrv.post('/electron-auth-callback', async (req, res) => {
    try {
      const authData = req.body;
      logger.info('[Auth HTTP] [TARGET] Received authentication data from browser:', {
        uid: authData.uid,
        email: authData.email,
        hasToken: !!authData.idToken,
        timestamp: authData.timestamp
      });

      if (!authData.idToken) {
        logger.error('[Auth HTTP] [ERROR] Missing ID token in request');
        return res.status(400).json({ error: 'Missing ID token' });
      }

      logger.info('[Auth HTTP] [LOADING] Processing ID token authentication directly');
      
      const userRepository = require('./common/repositories/user');
      
      // Create user object from auth data
      const firebaseUser = {
        uid: authData.uid,
        email: authData.email || 'no-email@example.com',
        displayName: authData.displayName || 'User',
        photoURL: null
      };

      // 1. Sync user data to local DB
      await userRepository.findOrCreate(firebaseUser);
      logger.info('[Auth HTTP] User data synced with local DB.');

      // 2. Use the new ID token authentication method
      await authService.handleIdTokenAuthentication(authData);
      logger.info('[Auth HTTP] [OK] Successfully processed ID token authentication via HTTP');
      
      // Force broadcast user state to ensure UI updates immediately
      logger.info('[Auth HTTP] [SIGNAL] Broadcasting user state to all windows...');
      setTimeout(() => {
        authService.broadcastUserState();
        logger.info('[Auth HTTP] [AUDIO] User state broadcast completed');
        
        // Initialize auto-updater now that user is authenticated
        initAutoUpdaterOnAuth();
      }, 500);
      
      res.json({ success: true, message: 'Authentication processed successfully' });
    } catch (error) {
      logger.error('[Auth HTTP] [ERROR] Error processing authentication:', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // Handle local mode confirmation from browser
  frontSrv.post('/electron-local-mode', (req, res) => {
    try {
      logger.info('[Local Mode HTTP] Local mode confirmation received from browser');
      
      // Local mode is already the default state, just acknowledge
      res.json({ success: true, message: 'Local mode confirmed' });
      
      // Focus the main window
      focusMainWindow();
    } catch (error) {
      logger.error('[Local Mode HTTP] Error processing local mode:', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  frontSrv.use((req, res, next) => {
    if (req.path.indexOf('.') === -1 && req.path !== '/') {
      const htmlPath = path.join(staticDir, req.path + '.html');
      if (fs.existsSync(htmlPath)) {
        return res.sendFile(htmlPath);
      }
    }
    next();
  });
  
  frontSrv.use(express.static(staticDir));
  
  const frontendServer = await new Promise((resolve, reject) => {
    const server = frontSrv.listen(frontendPort, '127.0.0.1', () => resolve(server));
    server.on('error', (error) => {
      // Handle EPIPE errors gracefully for frontend server
      if (error.code === 'EPIPE') {
        logger.warn('[Frontend Server] EPIPE error (broken pipe/write), continuing...', { error: error.message });
        return;
      }
      reject(error);
    });
    app.once('before-quit', () => server.close());
  });

  logger.info(`[OK] Frontend server started on http://localhost:${frontendPort}`);

  // Check if external backend service is running
  try {
    // Use ResourcePoolManager to prevent EPIPE errors during health check
    logger.debug('[Index] Making backend health check request via ResourcePoolManager'); 
    const response = await resourcePoolManager.queuedFetch(`http://localhost:${apiPort}/health`);
    if (response.ok) {
      logger.info(`[OK] External backend service detected on http://localhost:${apiPort}`);
    } else {
      logger.warn(`[WARNING] Backend service health check failed - status: ${response.status}`);
    }
  } catch (error) {
    logger.warn(`[WARNING] Cannot connect to external backend service on port ${apiPort}`);
    logger.warn(`   Make sure to start the backend service: cd backend && npm start`);
  }
  
  logger.info(`[START] Electron services ready:`);
  logger.info(`   Frontend: http://localhost:${frontendPort}`);
  logger.info(`   Expected Backend: http://localhost:${apiPort} (external service)`);

  return frontendPort;
}

// Auto-update initialization (called after user authentication)
let autoUpdaterInitialized = false;

async function initAutoUpdaterOnAuth() {
    // Only initialize once and only when user is authenticated
    if (autoUpdaterInitialized) {
        return;
    }
    
    const currentUser = authService.getCurrentUser();
    if (!currentUser || !currentUser.isLoggedIn) {
        logger.info('[AutoUpdater] Skipped - user not authenticated');
        return;
    }

    try {
        const autoUpdateEnabled = await settingsService.getAutoUpdateSetting();
        if (!autoUpdateEnabled) {
            logger.info('[AutoUpdater] Skipped because auto-updates are disabled in settings');
            autoUpdaterInitialized = true; // Mark as initialized even if disabled
            return;
        }
        
        // Skip auto-updater in development mode
        if (!app.isPackaged) {
            logger.info('[AutoUpdater] Skipped in development (app is not packaged)');
            autoUpdaterInitialized = true; // Mark as initialized even if skipped
            return;
        }

        autoUpdater.setFeedURL({
            provider: 'github',
            owner: 'xerus',
            repo: 'xerus-assistant',
        });

        // Immediately check for updates & notify
        autoUpdater.checkForUpdatesAndNotify()
            .catch(err => {
                logger.error('Error checking for updates:', { err });
            });

        autoUpdater.on('checking-for-update', () => {
            logger.info('[AutoUpdater] Checking for updates…');
        });

        autoUpdater.on('update-available', (info) => {
            logger.info('[AutoUpdater] Update available:', info.version);
        });

        autoUpdater.on('update-not-available', () => {
            logger.info('[AutoUpdater] Application is up-to-date');
        });

        autoUpdater.on('error', (err) => {
            logger.error('Error while updating:', { err });
        });

        autoUpdater.on('update-downloaded', (info) => {
            logger.info('Update downloaded:');

            const dialogOpts = {
                type: 'info',
                buttons: ['Install now', 'Install on next launch'],
                title: 'Update Available',
                message: 'A new version of Glass is ready to be installed.',
                defaultId: 0,
                cancelId: 1
            };

            dialog.showMessageBox(dialogOpts).then((returnValue) => {
                // returnValue.response 0 is for 'Install Now'
                if (returnValue.response === 0) {
                    autoUpdater.quitAndInstall();
                }
            });
        });
        
        autoUpdaterInitialized = true;
        logger.info('[AutoUpdater] [OK] Auto-updater initialized successfully');
    } catch (e) {
        logger.error('[AutoUpdater] [ERROR] Failed to initialize:', { e });
    }
}

// Multi-provider API key management for web dashboard
ipcMain.handle('get-all-api-key-status', async (event, { userId }) => {
  try {
    // Returns { openai: true, gemini: false, ... }
    return await modelStateService.getAllApiKeyStatus(userId);
  } catch (err) {
    return { error: err.message };
  }
});
ipcMain.handle('get-all-api-keys', async (event, { userId }) => {
  try {
    return await modelStateService.getAllApiKeys(userId);
  } catch (err) {
    return { error: err.message };
  }
});
ipcMain.handle('remove-api-key', async (event, { userId, provider }) => {
  try {
    await modelStateService.removeApiKey(provider, userId);
    return { success: true };
  } catch (err) {
    return { error: err.message };
  }
});

