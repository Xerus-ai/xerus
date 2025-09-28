const { createLogger } = require('../../common/services/renderer-logger.js');

const logger = createLogger('UI.HeaderController');
import './MainHeader.js';
import './ApiKeyHeader.js';
import './PermissionHeader.js';
import './WelcomeHeader.js';
import './OnboardingHeader.js';

class HeaderTransitionManager {
    constructor() {
        this.headerContainer      = document.getElementById('header-container');
        this.currentHeaderType    = null;   // 'welcome' | 'apikey' | 'main' | 'permission' | 'onboarding'
        this.welcomeHeader        = null;
        this.apiKeyHeader         = null;
        this.mainHeader            = null;
        this.permissionHeader      = null;
        this.onboardingHeader      = null;

        /**
         * only one header window is allowed
         * @param {'welcome'|'apikey'|'main'|'permission'|'onboarding'} type
         */
        this.ensureHeader = (type) => {
            logger.info('[HeaderController] ensureHeader: Ensuring header of type:', type);
            if (this.currentHeaderType === type) {
                logger.info('[HeaderController] ensureHeader: Header of type:', type, 'already exists.');
                return;
            }

            this.headerContainer.innerHTML = '';
            
            this.welcomeHeader = null;
            this.apiKeyHeader = null;
            this.mainHeader = null;
            this.permissionHeader = null;
            this.onboardingHeader = null;

            // Create new header element
            if (type === 'welcome') {
                this.welcomeHeader = document.createElement('welcome-header');
                this.welcomeHeader.loginCallback = () => this.handleLoginOption();
                this.welcomeHeader.apiKeyCallback = () => this.handleApiKeyOption();
                this.headerContainer.appendChild(this.welcomeHeader);
                logger.info('[HeaderController] ensureHeader: Header of type:', type, 'created.');
            } else if (type === 'apikey') {
                this.apiKeyHeader = document.createElement('apikey-header');
                this.apiKeyHeader.stateUpdateCallback = (userState) => this.handleStateUpdate(userState);
                this.apiKeyHeader.backCallback = () => this.transitionToWelcomeHeader();
                this.apiKeyHeader.addEventListener('request-resize', e => {
                    this._resizeForApiKey(e.detail.height); 
                });
                this.headerContainer.appendChild(this.apiKeyHeader);
                logger.info('[HeaderController] ensureHeader: Header of type:', type, 'created.');
            } else if (type === 'permission') {
                this.permissionHeader = document.createElement('permission-setup');
                this.permissionHeader.continueCallback = () => this.transitionToMainHeader();
                this.headerContainer.appendChild(this.permissionHeader);
            } else if (type === 'onboarding') {
                this.onboardingHeader = document.createElement('onboarding-header');
                this.onboardingHeader.skipCallback = () => this.transitionToMainHeader();
                this.onboardingHeader.completeCallback = () => this.transitionToMainHeader();
                this.headerContainer.appendChild(this.onboardingHeader);
                logger.info('[HeaderController] ensureHeader: Onboarding header created.');
            } else {
                this.mainHeader = document.createElement('main-header');
                this.headerContainer.appendChild(this.mainHeader);
                this.mainHeader.startSlideInAnimation?.();
            }

            this.currentHeaderType = type;
            this.notifyHeaderState(type === 'permission' ? 'apikey' : type); // Keep permission state as apikey for compatibility
        };

        logger.info('[HeaderController] Manager initialized');

        // WelcomeHeader [Korean comment translated] [Korean comment translated]
        this.handleLoginOption = this.handleLoginOption.bind(this);
        this.handleApiKeyOption = this.handleApiKeyOption.bind(this);

        this._bootstrap();

        if (window.api) {
            window.api.headerController.onUserStateChanged((event, userState) => {
                logger.info('[HeaderController] Received user state change:', userState);
                this.handleStateUpdate(userState);
            });

            window.api.headerController.onAuthFailed((event, { message }) => {
                logger.error('Received auth failure from main process:', { message });
                if (this.apiKeyHeader) {
                    this.apiKeyHeader.errorMessage = 'Authentication failed. Please try again.';
                    this.apiKeyHeader.isLoading = false;
                }
            });
            window.api.headerController.onForceShowApiKeyHeader(async () => {
                logger.info('[HeaderController] Received broadcast to show apikey header. Switching now.');
                // Always show welcome header when user manually requests API key setup
                await this._resizeForWelcome();
                this.ensureHeader('welcome');
            });            
        }
    }

    notifyHeaderState(stateOverride) {
        const state = stateOverride || this.currentHeaderType || 'apikey';
        if (window.api) {
            window.api.headerController.sendHeaderStateChanged(state);
        }
    }

    async _bootstrap() {
        // The initial state will be sent by the main process via 'user-state-changed'
        // We just need to request it.
        if (window.api) {
            const userState = await window.api.common.getCurrentUser();
            logger.info('[HeaderController] Bootstrapping with initial user state:', userState);
            this.handleStateUpdate(userState);
        } else {
            // Fallback for non-electron environment (testing/web)
            this.ensureHeader('welcome');
        }
    }


    //////// after_modelStateService ////////
    async handleStateUpdate(userState) {
        const { isLoggedIn } = userState;
        
        logger.info('[HeaderController] handleStateUpdate: Proceeding to main interface, isLoggedIn:', isLoggedIn);
        
        // Check if onboarding should be shown first (but skip for authenticated users)
        const shouldShowOnb = this.shouldShowOnboarding();
        logger.info('[HeaderController] shouldShowOnboarding returned:', shouldShowOnb);
        
        if (shouldShowOnb && !isLoggedIn) {
            logger.info('[HeaderController] Onboarding needed - showing onboarding header');
            this.transitionToOnboardingHeader();
            return;
        } else if (shouldShowOnb && isLoggedIn) {
            logger.info('[HeaderController] Skipping onboarding for authenticated user');
        }
        
        logger.info('[HeaderController] Skipping onboarding - proceeding to main flow');
        
        if (isLoggedIn) {
            const permissionResult = await this.checkPermissions();
            if (permissionResult.success) {
                this.transitionToMainHeader();
            } else {
                this.transitionToPermissionHeader();
            }
        } else {
            // Go directly to main header even without login - no API key barriers
            this.transitionToMainHeader();
        }
    }

    // WelcomeHeader [Korean comment translated] [Korean comment translated]
    async handleLoginOption() {
        logger.info('[HeaderController] Login option selected');
        if (window.api) {
            await window.api.common.startFirebaseAuth();
        }
    }

    async handleApiKeyOption() {
        logger.info('[HeaderController] API key option selected');
        await this._resizeForApiKey(400);
        this.ensureHeader('apikey');
        // Set back callback for ApiKeyHeader
        if (this.apiKeyHeader) {
            this.apiKeyHeader.backCallback = () => this.transitionToWelcomeHeader();
        }
    }

    async transitionToWelcomeHeader() {
        if (this.currentHeaderType === 'welcome') {
            return this._resizeForWelcome();
        }

        await this._resizeForWelcome();
        this.ensureHeader('welcome');
    }
    //////// after_modelStateService ////////

    async transitionToPermissionHeader() {
        // Prevent duplicate transitions
        if (this.currentHeaderType === 'permission') {
            logger.info('[HeaderController] Already showing permission setup, skipping transition');
            return;
        }

        // Check if permissions were previously completed
        if (window.api) {
            try {
                const permissionsCompleted = await window.api.headerController.checkPermissionsCompleted();
                if (permissionsCompleted) {
                    logger.info('[HeaderController] Permissions were previously completed, checking current status...');
                    
                    // Double check current permission status
                    const permissionResult = await this.checkPermissions();
                    if (permissionResult.success) {
                        // Skip permission setup if already granted
                        this.transitionToMainHeader();
                        return;
                    }
                    
                    logger.info('[HeaderController] Permissions were revoked, showing setup again');
                }
            } catch (error) {
                logger.error('Error checking permissions completed status:', { error });
            }
        }

        await this._resizeForPermissionHeader();
        this.ensureHeader('permission');
    }

    async transitionToMainHeader(animate = true) {
        if (this.currentHeaderType === 'main') {
            return this._resizeForMain();
        }

        await this._resizeForMain();
        this.ensureHeader('main');
    }

    async transitionToOnboardingHeader() {
        if (this.currentHeaderType === 'onboarding') {
            return this._resizeForOnboarding();
        }

        await this._resizeForOnboarding();
        this.ensureHeader('onboarding');
    }

    async _resizeForMain() {
        if (!window.api) return;
        logger.info('[HeaderController] _resizeForMain: Resizing window to 580x60');
        return window.api.headerController.resizeHeaderWindow({ width: 580, height: 60 }).catch(() => {});
    }

    async _resizeForApiKey(height = 370) {
        if (!window.api) return;
        logger.info('_resizeForApiKey: Resizing window to 456x');
        return window.api.headerController.resizeHeaderWindow({ width: 456, height: height }).catch(() => {});
    }

    async _resizeForPermissionHeader() {
        if (!window.api) return;
        return window.api.headerController.resizeHeaderWindow({ width: 285, height: 220 })
            .catch(() => {});
    }

    async _resizeForWelcome() {
        if (!window.api) return;
        logger.info('[HeaderController] _resizeForWelcome: Resizing window to 456x370');
        return window.api.headerController.resizeHeaderWindow({ width: 456, height: 364 })
            .catch(() => {});
    }

    async _resizeForOnboarding() {
        if (!window.api) return;
        logger.info('[HeaderController] _resizeForOnboarding: Resizing window for onboarding');
        return window.api.headerController.resizeHeaderWindow({ width: 480, height: 420 })
            .catch(() => {});
    }

    shouldShowOnboarding() {
        logger.info('[HeaderController] Checking if onboarding should be shown');
        
        const forceOnboarding = localStorage.getItem('forceOnboarding');
        const onboardingCompleted = localStorage.getItem('onboardingCompleted');
        const lastOnboardingDate = localStorage.getItem('lastOnboardingDate');
        
        logger.info('[HeaderController] Onboarding localStorage:', {
            forceOnboarding,
            onboardingCompleted,
            lastOnboardingDate
        });
        
        // Check for dev environment flag
        if (forceOnboarding === 'true') {
            logger.info('[HeaderController] [OK] ONBOARDING NEEDED - forceOnboarding is true');
            return true;
        }

        // Check if onboarding was never completed
        if (!onboardingCompleted) {
            logger.info('[HeaderController] [OK] ONBOARDING NEEDED - never completed');
            return true;
        }

        // Check if 15 days have passed since last onboarding
        if (lastOnboardingDate) {
            const daysSinceLastOnboarding = (Date.now() - new Date(lastOnboardingDate).getTime()) / (1000 * 60 * 60 * 24);
            if (daysSinceLastOnboarding > 15) {
                logger.info('[HeaderController] [OK] ONBOARDING NEEDED - 15+ days since last onboarding');
                return true;
            }
        }

        logger.info('[HeaderController] [ERROR] ONBOARDING NOT NEEDED');
        return false;
    }

    async checkPermissions() {
        if (!window.api) {
            return { success: true };
        }
        
        try {
            const permissions = await window.api.headerController.checkSystemPermissions();
            logger.info('[HeaderController] Current permissions:', permissions);
            
            if (!permissions.needsSetup) {
                return { success: true };
            }

            let errorMessage = '';
            if (!permissions.microphone && !permissions.screen) {
                errorMessage = 'Microphone and screen recording access required';
            }
            
            return { 
                success: false, 
                error: errorMessage
            };
        } catch (error) {
            logger.error('Error checking permissions:', { error });
            return { 
                success: false, 
                error: 'Failed to check permissions' 
            };
        }
    }
}

window.addEventListener('DOMContentLoaded', () => {
    new HeaderTransitionManager();
});
