/**
 * Production Configuration Manager
 * Handles configuration for distributed EXE builds
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

class ProductionConfigManager {
    constructor() {
        this.configPath = this.getConfigPath();
        this.config = this.loadConfig();
    }

    /**
     * Get platform-specific config directory
     */
    getConfigPath() {
        const appName = 'Glass';
        let configDir;

        switch (process.platform) {
            case 'win32':
                configDir = path.join(os.homedir(), 'AppData', 'Roaming', appName);
                break;
            case 'darwin':
                configDir = path.join(os.homedir(), 'Library', 'Application Support', appName);
                break;
            default:
                configDir = path.join(os.homedir(), '.config', appName);
        }

        // Ensure directory exists
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }

        return path.join(configDir, 'config.json');
    }

    /**
     * Load configuration with fallbacks
     */
    loadConfig() {
        const defaultConfig = {
            // Database Configuration
            database: {
                mode: 'local', // 'local', 'cloud', 'hybrid'
                local_path: path.join(path.dirname(this.configPath), 'knowledge.db'),
                neon_connection: null, // User can optionally provide their own
                neon_project_id: null
            },
            
            // AI Provider Configuration
            ai: {
                provider: 'local', // 'openai', 'gemini', 'anthropic', 'local'
                openai_key: null,
                gemini_key: null,
                anthropic_key: null,
                local_model_path: null
            },
            
            // Features Configuration
            features: {
                rag_enabled: true,
                voice_commands: true,
                screen_capture: true,
                tool_integration: false, // Requires API keys
                cloud_sync: false // Requires database connection
            },
            
            // Privacy Settings
            privacy: {
                data_retention_days: 30,
                auto_delete_captures: true,
                encrypted_storage: true,
                telemetry_enabled: false
            }
        };

        try {
            if (fs.existsSync(this.configPath)) {
                const userConfig = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
                return { ...defaultConfig, ...userConfig };
            }
        } catch (error) {
            console.warn('Failed to load user config, using defaults:', error.message);
        }

        return defaultConfig;
    }

    /**
     * Save configuration
     */
    saveConfig(updates) {
        this.config = { ...this.config, ...updates };
        try {
            fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
            return true;
        } catch (error) {
            console.error('Failed to save config:', error);
            return false;
        }
    }

    /**
     * Get database configuration for current mode - DEPRECATED
     * SQLite functionality has been removed. Use backend API endpoints instead.
     */
    getDatabaseConfig() {
        throw new Error('SQLite functionality has been removed. Use backend API endpoints instead.');
    }

    /**
     * Check if feature is available with current configuration
     */
    isFeatureAvailable(feature) {
        switch (feature) {
            case 'rag':
                return this.config.features.rag_enabled;
            
            case 'cloud_sync':
                return this.config.features.cloud_sync && 
                       this.config.database.mode === 'cloud';
            
            case 'ai_tools':
                return this.config.features.tool_integration &&
                       this.hasValidApiKey();
            
            default:
                return this.config.features[feature] || false;
        }
    }

    /**
     * Check if user has provided valid API keys
     */
    hasValidApiKey() {
        const { ai } = this.config;
        return !!(ai.openai_key || ai.gemini_key || ai.anthropic_key || ai.local_model_path);
    }

    /**
     * Get environment variables for production
     */
    getEnvironmentVariables() {
        const dbConfig = this.getDatabaseConfig();
        const env = {
            NODE_ENV: 'production',
            GLASS_CONFIG_PATH: this.configPath
        };

        // Database environment variables
        if (dbConfig.type === 'postgresql') {
            env.NEON_CONNECTION_STRING = dbConfig.connectionString;
            env.NEON_PROJECT_ID = dbConfig.projectId;
        } else {
            env.SQLITE_PATH = dbConfig.path;
        }

        // AI provider configuration
        const { ai } = this.config;
        if (ai.openai_key) env.OPENAI_API_KEY = ai.openai_key;
        if (ai.gemini_key) env.GEMINI_API_KEY = ai.gemini_key;
        if (ai.anthropic_key) env.ANTHROPIC_API_KEY = ai.anthropic_key;

        return env;
    }

    /**
     * Initialize for first run - DEPRECATED
     * SQLite functionality has been removed. Use backend API endpoints instead.
     */
    async initializeFirstRun() {
        throw new Error('SQLite functionality has been removed. Use backend API endpoints instead.');
    }

    /**
     * Create local SQLite database - DEPRECATED
     * SQLite functionality has been removed. Use backend API endpoints instead.
     */
    async createLocalDatabase() {
        throw new Error('SQLite functionality has been removed. Use backend API endpoints instead.');
    }
}

module.exports = { ProductionConfigManager };