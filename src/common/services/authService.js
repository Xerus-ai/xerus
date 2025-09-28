const { onAuthStateChanged, signInWithCustomToken, signOut } = require('firebase/auth');
const { BrowserWindow, shell } = require('electron');
const { getFirebaseAuth } = require('./firebaseClient');
const fetch = require('node-fetch');
const encryptionService = require('./encryptionService');
const migrationService = require('./migrationService');
const sessionRepository = require('../repositories/session');
const providerSettingsRepository = require('../repositories/providerSettings');
const userModelSelectionsRepository = require('../repositories/userModelSelections');
const { createLogger } = require('./logger.js');
const { resourcePoolManager } = require('./resource-pool-manager.js');

const logger = createLogger('AuthService');


class AuthService {
    constructor() {
        this.currentUserId = 'default_user';
        this.currentUserMode = 'local'; // 'local' or 'firebase'
        this.currentUser = null;
        this.isInitialized = false;
        this.authPollingInterval = null;
        this.isFirebaseClientReady = false; // Track Firebase client readiness

        // This ensures the key is ready before any login/logout state change.
        encryptionService.initializeKey(this.currentUserId);
        this.initializationPromise = null;

        sessionRepository.setAuthService(this);
        providerSettingsRepository.setAuthService(this);
        userModelSelectionsRepository.setAuthService(this);
    }

    initialize() {
        if (this.isInitialized) return this.initializationPromise;

        this.initializationPromise = new Promise((resolve) => {
            const auth = getFirebaseAuth();
            let resolved = false;
            
            // Add timeout to prevent infinite hang when Firebase is inaccessible
            const timeoutId = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    logger.warn('[AuthService] Firebase initialization timeout - continuing in local mode');
                    
                    // Set up local/guest mode
                    this.currentUser = null;
                    this.currentUserId = 'default_user';
                    this.currentUserMode = 'local';
                    this.isFirebaseClientReady = false;
                    
                    // Initialize encryption for local user
                    encryptionService.initializeKey(this.currentUserId).then(() => {
                        this.broadcastUserState();
                        this.isInitialized = true;
                        logger.info('[AuthService] Initialized in local mode after timeout.');
                        resolve();
                    }).catch((error) => {
                        logger.error('[AuthService] Error initializing encryption in timeout fallback:', { error });
                        this.isInitialized = true;
                        resolve();
                    });
                }
            }, 10000); // 10 second timeout
            
            onAuthStateChanged(auth, async (user) => {
                if (resolved) return; // Already resolved due to timeout
                
                const previousUser = this.currentUser;

                if (user) {
                    // User signed IN
                    logger.info('Firebase user signed in:', { uid: user.uid });
                    this.currentUser = user;
                    this.currentUserId = user.uid;
                    this.currentUserMode = 'firebase';
                    this.isFirebaseClientReady = true; // Mark Firebase client as ready

                    // Clean up any zombie sessions from a previous run for this user.
                    await sessionRepository.endAllActiveSessions();

                    // ** Initialize encryption key for the logged-in user **
                    await encryptionService.initializeKey(user.uid);

                    // ** Check for and run data migration for the user **
                    // No 'await' here, so it runs in the background without blocking startup.
                    migrationService.checkAndRunMigration(user);

                } else {
                    // User signed OUT
                    logger.info('No Firebase user.');
                    this.currentUser = null;
                    this.currentUserId = 'default_user';
                    this.currentUserMode = 'local';
                    this.isFirebaseClientReady = false; // Reset Firebase client readiness

                    // End active sessions for the local/default user as well.
                    await sessionRepository.endAllActiveSessions();

                    // ** Initialize encryption key for the default/local user **
                    await encryptionService.initializeKey(this.currentUserId);
                }
                this.broadcastUserState();
                
                if (!this.isInitialized) {
                    resolved = true;
                    clearTimeout(timeoutId);
                    this.isInitialized = true;
                    logger.info('[AuthService] Initialized and resolved initialization promise.');
                    resolve();
                }
            });
        });

        return this.initializationPromise;
    }

    async startFirebaseAuthFlow() {
        try {
            const webUrl = process.env.XERUS_WEB_URL || 'http://localhost:3000';
            const authUrl = `${webUrl}/login?mode=electron`;
            logger.info('Opening Firebase auth URL in browser with Electron mode:', authUrl);
            await shell.openExternal(authUrl);
            logger.info('[Auth] Opened auth URL - waiting for HTTP callback or localStorage fallback');
            
            // Start localStorage polling as fallback (in case HTTP callback fails)
            this.startAuthPolling(webUrl);
            
            return { success: true };
        } catch (error) {
            logger.error('Failed to open Firebase auth URL:', { error });
            return { success: false, error: error.message };
        }
    }

    startAuthPolling(webUrl) {
        if (this.authPollingInterval) {
            clearInterval(this.authPollingInterval);
        }

        logger.info('[Auth] Starting localStorage polling as fallback...');
        let pollAttempts = 0;
        const maxAttempts = 60; // Poll for 5 minutes (60 * 5s intervals)

        const pollForAuth = async () => {
            pollAttempts++;
            
            if (pollAttempts > maxAttempts) {
                logger.info('[Auth] Polling timeout - stopping auth polling');
                clearInterval(this.authPollingInterval);
                this.authPollingInterval = null;
                return;
            }

            try {
                // Use a hidden BrowserWindow to check localStorage
                const { BrowserWindow } = require('electron');
                const tempWindow = new BrowserWindow({
                    show: false,
                    webPreferences: {
                        nodeIntegration: false,
                        contextIsolation: true
                    }
                });

                await tempWindow.loadURL(webUrl);
                
                const authResult = await tempWindow.webContents.executeJavaScript(`
                    localStorage.getItem('electron_auth_result')
                `);

                tempWindow.destroy();

                if (authResult) {
                    logger.info('[Auth] Found authentication result in localStorage fallback!');
                    clearInterval(this.authPollingInterval);
                    this.authPollingInterval = null;

                    const authData = JSON.parse(authResult);
                    
                    // Clear the localStorage item
                    const clearWindow = new BrowserWindow({
                        show: false,
                        webPreferences: {
                            nodeIntegration: false,
                            contextIsolation: true
                        }
                    });
                    await clearWindow.loadURL(webUrl);
                    await clearWindow.webContents.executeJavaScript(`
                        localStorage.removeItem('electron_auth_result')
                    `);
                    clearWindow.destroy();

                    // Process the authentication - handle ID token directly
                    await this.handleIdTokenAuthentication(authData);
                    logger.info('[Auth] Successfully processed authentication from localStorage fallback');
                }
            } catch (error) {
                logger.error('[Auth] Error during polling:', { error: error.message });
            }
        };

        // Check immediately first, then start interval
        pollForAuth();
        this.authPollingInterval = setInterval(pollForAuth, 5000); // Poll every 5 seconds
    }


    async signInWithCustomToken(token) {
        const auth = getFirebaseAuth();
        try {
            const userCredential = await signInWithCustomToken(auth, token);
            logger.info('Successfully signed in with custom token for user:', { uid: userCredential.user.uid });
            // onAuthStateChanged will handle the state update and broadcast
        } catch (error) {
            logger.error('Error signing in with custom token:', { error });
            throw error; // Re-throw to be handled by the caller
        }
    }

    async handleIdTokenAuthentication(authData) {
        try {
            logger.info('[Auth] [TARGET] Starting ID token authentication for:', { uid: authData.uid, email: authData.email });
            
            // Set user state and mark ready for the repositories to use
            // The repositories will handle the Firebase client authentication internally
            logger.info('[Auth] [TEXT] Step 1: Setting authenticated user state');
            this.currentUser = {
                uid: authData.uid,
                email: authData.email,
                displayName: authData.displayName,
                photoURL: null,
            };
            this.currentUserId = authData.uid;
            this.currentUserMode = 'firebase';
            this.isFirebaseClientReady = true; // This tells repositories the user is authenticated
            
            logger.info('[Auth] [SECURE] Step 2: Initializing encryption key');
            await encryptionService.initializeKey(this.currentUserId);
            logger.info('[Auth] [OK] Encryption key initialized successfully');
            
            logger.info('[Auth] [CLEAN] Step 3: Cleaning up zombie sessions');
            try {
                await sessionRepository.endAllActiveSessions();
                logger.info('[Auth] [OK] Sessions cleaned up successfully');
            } catch (sessionError) {
                logger.warn('[Auth] [WARNING] Session cleanup failed (non-critical):', { error: sessionError.message });
            }
            
            logger.info('[Auth] 🛑 Step 4: Stopping any active polling');
            if (this.authPollingInterval) {
                clearInterval(this.authPollingInterval);
                this.authPollingInterval = null;
                logger.info('[Auth] [OK] Auth polling stopped');
            }
            
            logger.info('[Auth] [SIGNAL] Step 5: Broadcasting user state');
            this.broadcastUserState();
            logger.info('[Auth] [OK] User state broadcast completed');
            
            logger.info('[Auth] 🎉 ID token authentication completed successfully');
            
        } catch (error) {
            logger.error('[Auth] [ERROR] Error in ID token authentication:', { error: error.message });
            throw error;
        }
    }

    async signOut() {
        const auth = getFirebaseAuth();
        try {
            // Clear any ongoing auth polling
            if (this.authPollingInterval) {
                clearInterval(this.authPollingInterval);
                this.authPollingInterval = null;
                logger.info('[AuthService] Cleared auth polling interval on sign out');
            }

            // End all active sessions for the current user BEFORE signing out.
            await sessionRepository.endAllActiveSessions();

            await signOut(auth);
            logger.info('[AuthService] User sign-out initiated successfully.');
            // onAuthStateChanged will handle the state update and broadcast,
            // which will also re-evaluate the API key status.
        } catch (error) {
            logger.error('Error signing out:', { error });
        }
    }
    
    broadcastUserState() {
        const userState = this.getCurrentUser();
        logger.info('[AuthService] Broadcasting user state change:', userState);
        BrowserWindow.getAllWindows().forEach(win => {
            if (win && !win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
                win.webContents.send('user-state-changed', userState);
            }
        });

        // NOTE: Removed automatic domain auth refresh to prevent memory issues
        // Auth will be initialized lazily when API calls are made
    }


    getCurrentUserId() {
        return this.currentUserId;
    }

    getCurrentUser() {
        const isLoggedIn = !!(this.currentUserMode === 'firebase' && this.currentUser);

        if (isLoggedIn) {
            return {
                uid: this.currentUser.uid,
                email: this.currentUser.email,
                displayName: this.currentUser.displayName,
                mode: 'firebase',
                isLoggedIn: true,
                //////// before_modelStateService ////////
                // hasApiKey: this.hasApiKey // Always true for firebase users, but good practice
                //////// before_modelStateService ////////
            };
        }
        return {
            uid: this.currentUserId, // returns 'default_user'
            email: 'contact@xerus.ai',
            displayName: 'Default User',
            mode: 'local',
            isLoggedIn: false,
            //////// before_modelStateService ////////
            // hasApiKey: this.hasApiKey
            //////// before_modelStateService ////////
        };
    }

    isFirebaseReady() {
        return this.isFirebaseClientReady;
    }
}

const authService = new AuthService();
module.exports = authService; 