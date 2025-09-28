/**
 * Production Initialization Service
 * Handles first-time setup and configuration management for distributed builds
 */

const { app } = require('electron');
const path = require('path');
const fs = require('fs');

class ProductionInitService {
    constructor() {
        this.isProduction = process.env.NODE_ENV === 'production' || app.isPackaged;
        this.configManager = null;
        this.initialized = false;
    }

    /**
     * Initialize production environment
     */
    async initialize() {
        if (this.initialized) return;

        console.log('[START] Initializing Glass Production Environment...');
        console.log('  - Production Mode:', this.isProduction);
        console.log('  - App Version:', app.getVersion());
        console.log('  - Platform:', process.platform);

        try {
            // Load production config manager
            const { ProductionConfigManager } = require('../config/production-config.js');
            this.configManager = new ProductionConfigManager();

            // Check if this is first run
            const isFirstRun = await this.checkFirstRun();
            
            if (isFirstRun) {
                console.log('[LIST] First run detected, initializing default configuration...');
                await this.configManager.initializeFirstRun();
                
                // Set environment variables for this session
                this.setEnvironmentVariables();
                
                console.log('[OK] First run setup completed');
                
                // We'll need to show setup wizard to user
                return { firstRun: true, config: this.configManager.config };
            } else {
                console.log('📁 Loading existing configuration...');
                
                // Set environment variables for this session
                this.setEnvironmentVariables();
                
                console.log('[OK] Configuration loaded successfully');
                return { firstRun: false, config: this.configManager.config };
            }

        } catch (error) {
            console.error('[ERROR] Failed to initialize production environment:', error);
            
            // Fallback to basic local mode
            return await this.initializeFallbackMode();
        } finally {
            this.initialized = true;
        }
    }

    /**
     * Check if this is the first run
     */
    async checkFirstRun() {
        if (!this.configManager) return true;
        
        try {
            const configExists = fs.existsSync(this.configManager.configPath);
            return !configExists;
        } catch (error) {
            console.warn('Could not check first run status:', error);
            return true;
        }
    }

    /**
     * Set environment variables from configuration
     */
    setEnvironmentVariables() {
        if (!this.configManager) return;

        const envVars = this.configManager.getEnvironmentVariables();
        
        console.log('[TOOL] Setting production environment variables...');
        for (const [key, value] of Object.entries(envVars)) {
            if (value) {
                process.env[key] = value;
                // Don't log sensitive values
                if (key.includes('KEY') || key.includes('PASSWORD') || key.includes('SECRET')) {
                    console.log(`  - ${key}: [HIDDEN]`);
                } else {
                    console.log(`  - ${key}: ${value}`);
                }
            }
        }
    }

    /**
     * Initialize fallback mode for basic functionality
     */
    async initializeFallbackMode() {
        console.log('[WARNING] Initializing fallback mode with basic local functionality...');
        
        // Set basic environment for local-only operation
        process.env.NODE_ENV = 'production';
        process.env.GLASS_MODE = 'local';
        process.env.DATABASE_MODE = 'local';
        
        // Create basic local config
        const fallbackConfig = {
            database: { mode: 'local' },
            ai: { provider: 'local' },
            features: {
                rag_enabled: true,
                cloud_sync: false,
                tool_integration: false
            },
            privacy: {
                data_retention_days: 30,
                encrypted_storage: true,
                telemetry_enabled: false
            }
        };

        return { 
            firstRun: true, 
            fallbackMode: true, 
            config: fallbackConfig 
        };
    }

    /**
     * Update configuration
     */
    async updateConfig(updates) {
        if (!this.configManager) {
            throw new Error('Configuration manager not initialized');
        }

        const success = this.configManager.saveConfig(updates);
        if (success) {
            // Update environment variables
            this.setEnvironmentVariables();
        }
        
        return success;
    }

    /**
     * Get current configuration
     */
    getConfig() {
        return this.configManager ? this.configManager.config : null;
    }

    /**
     * Check if feature is available
     */
    isFeatureAvailable(feature) {
        return this.configManager ? this.configManager.isFeatureAvailable(feature) : false;
    }

    /**
     * Get database configuration for backend services
     */
    getDatabaseConfig() {
        return this.configManager ? this.configManager.getDatabaseConfig() : null;
    }

    /**
     * Show setup wizard
     */
    showSetupWizard() {
        // This will be called by the main window to show setup UI
        return {
            url: '/setup',
            config: this.getConfig()
        };
    }

    /**
     * Handle setup completion
     */
    async completeSetup(newConfig) {
        try {
            const success = await this.updateConfig(newConfig);
            
            if (success) {
                console.log('[OK] Setup completed successfully');
                return { success: true };
            } else {
                throw new Error('Failed to save configuration');
            }
        } catch (error) {
            console.error('[ERROR] Setup completion failed:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get user-friendly status
     */
    getStatus() {
        const config = this.getConfig();
        if (!config) return { status: 'not_initialized' };

        const status = {
            status: 'ready',
            database: {
                mode: config.database.mode,
                connected: this.isFeatureAvailable('rag')
            },
            ai: {
                provider: config.ai.provider,
                configured: config.ai.provider === 'local' || !!config.ai.api_key
            },
            features: {
                rag: this.isFeatureAvailable('rag'),
                cloud_sync: this.isFeatureAvailable('cloud_sync'),
                tools: this.isFeatureAvailable('ai_tools')
            }
        };

        return status;
    }
}

// Export singleton instance
const productionInit = new ProductionInitService();

module.exports = {
    ProductionInitService,
    productionInit
};