/**
 * XERUS CONFIGURATION MANAGER
 * Centralized configuration management for enhanced features
 * 
 * Features:
 * - Environment variable management
 * - Configuration validation
 * - Default value handling
 * - Type conversion
 * - Configuration hot-reloading
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { createLogger } = require('../common/services/logger.js');

const logger = createLogger('Main.Config-manager');

class ConfigManager {
    constructor() {
        this.config = new Map();
        this.defaults = new Map();
        this.validators = new Map();
        this.listeners = new Map();
        
        this.setupDefaults();
        this.loadConfiguration();
    }

    /**
     * Setup default configuration values
     */
    setupDefaults() {
        // AI Provider Configuration
        this.setDefault('OPENAI_MODEL', 'gpt-4-turbo-preview');
        this.setDefault('OPENAI_MAX_TOKENS', 4000);
        this.setDefault('GEMINI_MODEL', 'gemini-pro');
        this.setDefault('GEMINI_MAX_TOKENS', 4000);
        this.setDefault('ANTHROPIC_MODEL', 'claude-3-sonnet-20240229');
        this.setDefault('ANTHROPIC_MAX_TOKENS', 4000);

        // Tool Integration
        this.setDefault('FIRECRAWL_BASE_URL', 'https://api.firecrawl.dev');
        this.setDefault('TRAVILY_BASE_URL', 'https://api.tavily.com');

        // Privacy & Security
        this.setDefault('PRIVACY_MODE', 'normal');
        this.setDefault('CONTENT_PROTECTION', false);
        this.setDefault('MICROPHONE_ENABLED', true);
        this.setDefault('SECURE_STORAGE', true);
        this.setDefault('ENCRYPTION_ENABLED', true);

        // Capture Settings
        this.setDefault('DEFAULT_CAPTURE_FORMAT', 'png');
        this.setDefault('DEFAULT_CAPTURE_QUALITY', 90);
        this.setDefault('AUTO_SAVE_CAPTURES', true);
        this.setDefault('CAPTURE_HISTORY_LIMIT', 100);
        this.setDefault('CAPTURE_SAVE_LOCATION', 'Pictures/Xerus');

        // Development
        this.setDefault('NODE_ENV', 'development');
        this.setDefault('DEBUG_MODE', false);
        this.setDefault('ELECTRON_ENABLE_LOGGING', true);
        this.setDefault('OPEN_DEV_TOOLS', false);

        // Performance
        this.setDefault('CONTEXT_WINDOW_SIZE', 8000);
        this.setDefault('MEMORY_LIMIT', 200);
        this.setDefault('CPU_LIMIT', 10);

        // Web Dashboard
        this.setDefault('WEB_PORT', 3000);
        this.setDefault('WEB_HOST', 'localhost');
        this.setDefault('WEB_SSL', false);

        // Platform Specific
        this.setDefault('MACOS_LIQUID_GLASS', true);
        this.setDefault('MACOS_SCREEN_CAPTURE', 'native');
        this.setDefault('MACOS_AUDIO_CAPTURE', 'native');
        this.setDefault('WINDOWS_SCREEN_CAPTURE', 'electron');
        this.setDefault('WINDOWS_AUDIO_CAPTURE', 'electron');
        this.setDefault('WINDOWS_GLASS_EFFECTS', false);

        // Advanced Features
        this.setDefault('FAST_CONTEXT_ENABLED', true);
        this.setDefault('CONTEXT_COMPRESSION', true);
        this.setDefault('CONTEXT_RELEVANCE_THRESHOLD', 0.7);

        // Tool Integration
        this.setDefault('TOOL_EXECUTION_TIMEOUT', 30000);
        this.setDefault('MAX_CONCURRENT_TOOLS', 3);

        // MCP Server Configuration
        this.setDefault('MCP_SEQUENTIAL_ENABLED', true);
        this.setDefault('MCP_CONTEXT7_ENABLED', true);
        this.setDefault('MCP_MAGIC_ENABLED', true);
        this.setDefault('MCP_PLAYWRIGHT_ENABLED', true);

        // Monitoring & Logging
        this.setDefault('TELEMETRY_ENABLED', false);
        this.setDefault('ANALYTICS_ENABLED', false);
        this.setDefault('CRASH_REPORTING', true);
        this.setDefault('LOG_LEVEL', 'info');
        this.setDefault('LOG_TO_FILE', true);
        this.setDefault('LOG_MAX_SIZE', '10MB');
        this.setDefault('LOG_MAX_FILES', 5);

        // Auto Update
        this.setDefault('AUTO_UPDATE_ENABLED', true);
        this.setDefault('UPDATE_CHECK_INTERVAL', 24);
        this.setDefault('PRERELEASE_UPDATES', false);
    }

    /**
     * Set default value for a configuration key
     */
    setDefault(key, value) {
        this.defaults.set(key, value);
    }

    /**
     * Set validator for a configuration key
     */
    setValidator(key, validator) {
        this.validators.set(key, validator);
    }

    /**
     * Load configuration from environment and files
     */
    loadConfiguration() {
        try {
            // Load from environment variables
            this.loadFromEnvironment();
            
            // Load from .env file if exists
            this.loadFromEnvFile();
            
            // Load from user preferences
            this.loadFromUserPreferences();
            
            logger.info('[ConfigManager] Configuration loaded successfully');
        } catch (error) {
            logger.error('Failed to load configuration:', { error });
        }
    }

    /**
     * Load configuration from environment variables
     */
    loadFromEnvironment() {
        for (const [key, value] of Object.entries(process.env)) {
            if (this.defaults.has(key)) {
                this.set(key, value);
            }
        }
    }

    /**
     * Load configuration from .env file
     */
    loadFromEnvFile() {
        const envPath = path.join(app.getAppPath(), '.env');
        
        if (fs.existsSync(envPath)) {
            try {
                const envContent = fs.readFileSync(envPath, 'utf8');
                this.parseEnvContent(envContent);
            } catch (error) {
                logger.warn('Could not load .env file:', { error });
            }
        }
    }

    /**
     * Parse .env file content
     */
    parseEnvContent(content) {
        const lines = content.split('\n');
        
        for (const line of lines) {
            const trimmed = line.trim();
            
            // Skip comments and empty lines
            if (trimmed.startsWith('#') || trimmed === '') {
                continue;
            }
            
            // Parse key=value pairs
            const equalIndex = trimmed.indexOf('=');
            if (equalIndex > 0) {
                const key = trimmed.substring(0, equalIndex).trim();
                const value = trimmed.substring(equalIndex + 1).trim();
                
                if (this.defaults.has(key)) {
                    this.set(key, value);
                }
            }
        }
    }

    /**
     * Load configuration from user preferences
     */
    loadFromUserPreferences() {
        try {
            const userDataPath = app.getPath('userData');
            const configPath = path.join(userDataPath, 'config.json');
            
            if (fs.existsSync(configPath)) {
                const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                
                for (const [key, value] of Object.entries(configData)) {
                    if (this.defaults.has(key)) {
                        this.set(key, value);
                    }
                }
            }
        } catch (error) {
            logger.warn('Could not load user preferences:', { error });
        }
    }

    /**
     * Save configuration to user preferences
     */
    async saveToUserPreferences() {
        try {
            const userDataPath = app.getPath('userData');
            const configPath = path.join(userDataPath, 'config.json');
            
            // Create directory if it doesn't exist
            await fs.promises.mkdir(userDataPath, { recursive: true });
            
            // Convert Map to Object for JSON serialization
            const configObject = Object.fromEntries(this.config);
            
            // Save to file
            await fs.promises.writeFile(configPath, JSON.stringify(configObject, null, 2));
            
            logger.info('[ConfigManager] Configuration saved to user preferences');
        } catch (error) {
            logger.error('Failed to save user preferences:', { error });
        }
    }

    /**
     * Set configuration value
     */
    set(key, value) {
        // Convert string values to appropriate types
        const convertedValue = this.convertValue(key, value);
        
        // Validate value if validator exists
        if (this.validators.has(key)) {
            const validator = this.validators.get(key);
            if (!validator(convertedValue)) {
                throw new Error(`Invalid value for ${key}: ${convertedValue}`);
            }
        }
        
        // Set value
        this.config.set(key, convertedValue);
        
        // Notify listeners
        this.notifyListeners(key, convertedValue);
    }

    /**
     * Get configuration value
     */
    get(key) {
        if (this.config.has(key)) {
            return this.config.get(key);
        }
        
        if (this.defaults.has(key)) {
            return this.defaults.get(key);
        }
        
        return undefined;
    }

    /**
     * Get configuration value with type checking
     */
    getString(key) {
        const value = this.get(key);
        return typeof value === 'string' ? value : String(value);
    }

    getNumber(key) {
        const value = this.get(key);
        return typeof value === 'number' ? value : Number(value);
    }

    getBoolean(key) {
        const value = this.get(key);
        return typeof value === 'boolean' ? value : Boolean(value);
    }

    getArray(key) {
        const value = this.get(key);
        return Array.isArray(value) ? value : [];
    }

    getObject(key) {
        const value = this.get(key);
        return typeof value === 'object' && value !== null ? value : {};
    }

    /**
     * Convert string value to appropriate type
     */
    convertValue(key, value) {
        if (typeof value !== 'string') {
            return value;
        }
        
        // Boolean conversion
        if (value.toLowerCase() === 'true') return true;
        if (value.toLowerCase() === 'false') return false;
        
        // Number conversion
        if (!isNaN(value) && !isNaN(parseFloat(value))) {
            return parseFloat(value);
        }
        
        // JSON conversion
        if (value.startsWith('{') || value.startsWith('[')) {
            try {
                return JSON.parse(value);
            } catch (error) {
                // Keep as string if JSON parsing fails
            }
        }
        
        return value;
    }

    /**
     * Check if configuration key exists
     */
    has(key) {
        return this.config.has(key) || this.defaults.has(key);
    }

    /**
     * Get all configuration keys
     */
    keys() {
        const allKeys = new Set();
        
        for (const key of this.defaults.keys()) {
            allKeys.add(key);
        }
        
        for (const key of this.config.keys()) {
            allKeys.add(key);
        }
        
        return Array.from(allKeys);
    }

    /**
     * Get all configuration values
     */
    getAll() {
        const result = {};
        
        for (const key of this.keys()) {
            result[key] = this.get(key);
        }
        
        return result;
    }

    /**
     * Add configuration change listener
     */
    addListener(key, listener) {
        if (!this.listeners.has(key)) {
            this.listeners.set(key, []);
        }
        
        this.listeners.get(key).push(listener);
    }

    /**
     * Remove configuration change listener
     */
    removeListener(key, listener) {
        if (this.listeners.has(key)) {
            const listeners = this.listeners.get(key);
            const index = listeners.indexOf(listener);
            
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }

    /**
     * Notify listeners of configuration changes
     */
    notifyListeners(key, value) {
        if (this.listeners.has(key)) {
            const listeners = this.listeners.get(key);
            
            for (const listener of listeners) {
                try {
                    listener(key, value);
                } catch (error) {
                    logger.error('Listener error:', { error });
                }
            }
        }
    }

    /**
     * Validate configuration
     */
    validate() {
        const errors = [];
        
        for (const [key, validator] of this.validators) {
            const value = this.get(key);
            
            if (!validator(value)) {
                errors.push(`Invalid value for ${key}: ${value}`);
            }
        }
        
        return errors;
    }

    /**
     * Reset configuration to defaults
     */
    reset() {
        this.config.clear();
        logger.info('[ConfigManager] Configuration reset to defaults');
    }

    /**
     * Get configuration for a specific feature
     */
    getFeatureConfig(feature) {
        const result = {};
        const prefix = feature.toUpperCase() + '_';
        
        for (const key of this.keys()) {
            if (key.startsWith(prefix)) {
                const featureKey = key.substring(prefix.length);
                result[featureKey] = this.get(key);
            }
        }
        
        return result;
    }

    /**
     * Get platform-specific configuration
     */
    getPlatformConfig() {
        const platform = process.platform;
        const result = {};
        
        if (platform === 'darwin') {
            result.liquidGlass = this.getBoolean('MACOS_LIQUID_GLASS');
            result.screenCapture = this.getString('MACOS_SCREEN_CAPTURE');
            result.audioCapture = this.getString('MACOS_AUDIO_CAPTURE');
        } else if (platform === 'win32') {
            result.screenCapture = this.getString('WINDOWS_SCREEN_CAPTURE');
            result.audioCapture = this.getString('WINDOWS_AUDIO_CAPTURE');
            result.glassEffects = this.getBoolean('WINDOWS_GLASS_EFFECTS');
        }
        
        return result;
    }

    /**
     * Get MCP server configuration
     */
    getMCPConfig() {
        return {
            sequential: this.getBoolean('MCP_SEQUENTIAL_ENABLED'),
            context7: this.getBoolean('MCP_CONTEXT7_ENABLED'),
            magic: this.getBoolean('MCP_MAGIC_ENABLED'),
            playwright: this.getBoolean('MCP_PLAYWRIGHT_ENABLED')
        };
    }

    /**
     * Get performance configuration
     */
    getPerformanceConfig() {
        return {
            contextWindowSize: this.getNumber('CONTEXT_WINDOW_SIZE'),
            memoryLimit: this.getNumber('MEMORY_LIMIT'),
            cpuLimit: this.getNumber('CPU_LIMIT'),
            fastContextEnabled: this.getBoolean('FAST_CONTEXT_ENABLED'),
            contextCompression: this.getBoolean('CONTEXT_COMPRESSION'),
            contextRelevanceThreshold: this.getNumber('CONTEXT_RELEVANCE_THRESHOLD')
        };
    }

    /**
     * Get configuration summary for logging
     */
    getSummary() {
        const summary = {
            environment: this.getString('NODE_ENV'),
            platform: process.platform,
            privacyMode: this.getString('PRIVACY_MODE'),
            captureFormat: this.getString('DEFAULT_CAPTURE_FORMAT'),
            contextWindowSize: this.getNumber('CONTEXT_WINDOW_SIZE'),
            mcpServers: this.getMCPConfig(),
            performance: this.getPerformanceConfig()
        };
        
        return summary;
    }
}

// Export singleton instance
const configManager = new ConfigManager();

module.exports = {
    configManager,
    ConfigManager
};