/**
 * XERUS PRIVACY MANAGER
 * Comprehensive privacy and security management for Xerus AI Assistant
 * 
 * Features:
 * - Content protection toggle
 * - Privacy indicators
 * - Screen capture permissions
 * - Secure storage
 * - Microphone privacy controls
 * - Privacy settings management
 */

const { BrowserWindow, ipcMain, systemPreferences, nativeTheme } = require('electron');
const { platformManager } = require('./platform-manager');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const { createLogger } = require('../common/services/logger.js');

const logger = createLogger('Main.Privacy-manager');

class PrivacyManager {
    constructor() {
        this.settings = {
            contentProtection: false,
            microphoneEnabled: true,
            screenCaptureEnabled: true,
            secureStorage: true,
            privacyMode: 'normal', // 'normal', 'enhanced', 'paranoid'
            dataRetention: 7, // days
            encryptionEnabled: true,
            biometricAuth: false
        };
        
        this.permissions = {
            screenRecording: false,
            microphone: false,
            camera: false,
            accessibility: false
        };
        
        this.privacyIndicators = new Map();
        this.ipcHandlersRegistered = false;
        this.setupIPC();
        this.initializePrivacySettings();
    }

    /**
     * Setup IPC communication for privacy controls
     */
    setupIPC() {
        // Check if handlers are already registered to prevent duplicates
        if (this.ipcHandlersRegistered) {
            logger.info('[PrivacyManager] IPC handlers already registered, skipping');
            return;
        }

        // Privacy settings
        ipcMain.handle('get-privacy-settings', () => {
            return this.getPrivacySettings();
        });

        ipcMain.handle('update-privacy-settings', (event, settings) => {
            return this.updatePrivacySettings(settings);
        });

        // Content protection
        ipcMain.handle('toggle-content-protection', (event, enabled) => {
            return this.toggleContentProtection(enabled);
        });

        // Microphone controls
        ipcMain.handle('toggle-microphone', (event, enabled) => {
            return this.toggleMicrophone(enabled);
        });

        ipcMain.handle('get-microphone-status', () => {
            return this.getMicrophoneStatus();
        });

        // Permission management
        ipcMain.handle('check-permissions', () => {
            return this.checkPermissions();
        });

        ipcMain.handle('request-permissions', (event, permissions) => {
            return this.requestPermissions(permissions);
        });

        // Privacy indicators
        ipcMain.handle('show-privacy-indicator', (event, type, message) => {
            return this.showPrivacyIndicator(type, message);
        });

        ipcMain.handle('hide-privacy-indicator', (event, type) => {
            return this.hidePrivacyIndicator(type);
        });

        // Secure storage
        ipcMain.handle('secure-store', (event, key, data) => {
            return this.secureStore(key, data);
        });

        ipcMain.handle('secure-retrieve', (event, key) => {
            return this.secureRetrieve(key);
        });

        ipcMain.handle('secure-delete', (event, key) => {
            return this.secureDelete(key);
        });

        // Privacy mode
        ipcMain.handle('set-privacy-mode', (event, mode) => {
            return this.setPrivacyMode(mode);
        });

        ipcMain.handle('get-privacy-status', () => {
            return this.getPrivacyStatus();
        });

        this.ipcHandlersRegistered = true;
        logger.info('[PrivacyManager] IPC handlers registered');
    }

    /**
     * Initialize privacy settings
     */
    async initializePrivacySettings() {
        try {
            // Load saved settings
            const settingsLoaded = await this.loadPrivacySettings();
            
            // If no settings were loaded, save the default settings
            if (!settingsLoaded) {
                await this.savePrivacySettings();
                logger.info('[PrivacyManager] Default privacy settings saved');
            }
            
            // Check system permissions
            await this.checkSystemPermissions();
            
            // Apply initial privacy settings
            await this.applyPrivacySettings();
            
            logger.info('[PrivacyManager] Privacy settings initialized');
        } catch (error) {
            logger.error('Failed to initialize privacy settings:', { error });
        }
    }

    /**
     * Load privacy settings from secure storage
     */
    async loadPrivacySettings() {
        try {
            const savedSettings = await this.secureRetrieve('privacy-settings');
            if (savedSettings) {
                this.settings = { ...this.settings, ...savedSettings };
                return true; // Settings were loaded successfully
            }
            return false; // No settings found
        } catch (error) {
            logger.warn('Could not load privacy settings:', { error });
            return false; // Failed to load settings
        }
    }

    /**
     * Save privacy settings to secure storage
     */
    async savePrivacySettings() {
        try {
            await this.secureStore('privacy-settings', this.settings);
        } catch (error) {
            logger.error('Failed to save privacy settings:', { error });
        }
    }

    /**
     * Check system permissions
     */
    async checkSystemPermissions() {
        if (platformManager.platform === 'darwin') {
            // macOS permission checks
            this.permissions.screenRecording = await this.checkMacOSScreenRecordingPermission();
            this.permissions.microphone = await this.checkMacOSMicrophonePermission();
            this.permissions.accessibility = await this.checkMacOSAccessibilityPermission();
        } else if (platformManager.platform === 'win32') {
            // Windows permission checks (simplified)
            this.permissions.screenRecording = true;
            this.permissions.microphone = true;
        }
    }

    /**
     * Check macOS screen recording permission
     */
    async checkMacOSScreenRecordingPermission() {
        try {
            const status = systemPreferences.getMediaAccessStatus('screen');
            return status === 'granted';
        } catch (error) {
            logger.warn('Could not check screen recording permission:', { error });
            return false;
        }
    }

    /**
     * Check macOS microphone permission
     */
    async checkMacOSMicrophonePermission() {
        try {
            const status = systemPreferences.getMediaAccessStatus('microphone');
            return status === 'granted';
        } catch (error) {
            logger.warn('Could not check microphone permission:', { error });
            return false;
        }
    }

    /**
     * Check macOS accessibility permission
     */
    async checkMacOSAccessibilityPermission() {
        try {
            return systemPreferences.isTrustedAccessibilityClient(false);
        } catch (error) {
            logger.warn('Could not check accessibility permission:', { error });
            return false;
        }
    }

    /**
     * Request system permissions
     */
    async requestPermissions(requestedPermissions) {
        const results = {};
        
        for (const permission of requestedPermissions) {
            try {
                switch (permission) {
                    case 'screen':
                        if (platformManager.platform === 'darwin') {
                            results[permission] = await systemPreferences.askForMediaAccess('screen');
                        } else {
                            results[permission] = true;
                        }
                        break;
                    case 'microphone':
                        if (platformManager.platform === 'darwin') {
                            results[permission] = await systemPreferences.askForMediaAccess('microphone');
                        } else {
                            results[permission] = true;
                        }
                        break;
                    case 'accessibility':
                        if (platformManager.platform === 'darwin') {
                            results[permission] = systemPreferences.isTrustedAccessibilityClient(true);
                        } else {
                            results[permission] = true;
                        }
                        break;
                    default:
                        results[permission] = false;
                }
            } catch (error) {
                logger.error('Failed to request permission:', { error });
                results[permission] = false;
            }
        }
        
        // Update permissions state
        await this.checkSystemPermissions();
        
        return results;
    }

    /**
     * Toggle content protection
     */
    toggleContentProtection(enabled) {
        this.settings.contentProtection = enabled;
        
        // Apply to all windows
        BrowserWindow.getAllWindows().forEach(window => {
            if (window.webContents) {
                window.setContentProtection(enabled);
            }
        });
        
        // Show privacy indicator
        if (enabled) {
            this.showPrivacyIndicator('shield', 'Content protection enabled');
        } else {
            this.hidePrivacyIndicator('shield');
        }
        
        // Save settings
        this.savePrivacySettings();
        
        logger.info('Content protection:');
        return { success: true, contentProtection: enabled };
    }

    /**
     * Toggle microphone
     */
    toggleMicrophone(enabled) {
        this.settings.microphoneEnabled = enabled;
        
        // Show privacy indicator
        if (enabled) {
            this.showPrivacyIndicator('microphone', 'Microphone enabled');
        } else {
            this.showPrivacyIndicator('microphone-off', 'Microphone disabled');
        }
        
        // Save settings
        this.savePrivacySettings();
        
        // Notify all windows
        BrowserWindow.getAllWindows().forEach(window => {
            if (window.webContents) {
                window.webContents.send('microphone-status-changed', enabled);
            }
        });
        
        logger.info('Microphone:');
        return { success: true, microphoneEnabled: enabled };
    }

    /**
     * Get microphone status
     */
    getMicrophoneStatus() {
        return {
            enabled: this.settings.microphoneEnabled,
            hasPermission: this.permissions.microphone,
            isRecording: false // Would be updated by audio capture service
        };
    }

    /**
     * Set privacy mode
     */
    async setPrivacyMode(mode) {
        const validModes = ['normal', 'enhanced', 'paranoid'];
        if (!validModes.includes(mode)) {
            throw new Error('Invalid privacy mode');
        }
        
        this.settings.privacyMode = mode;
        
        // Apply mode-specific settings
        switch (mode) {
            case 'normal':
                this.settings.contentProtection = false;
                this.settings.dataRetention = 7;
                this.settings.encryptionEnabled = true;
                break;
            case 'enhanced':
                this.settings.contentProtection = true;
                this.settings.dataRetention = 3;
                this.settings.encryptionEnabled = true;
                break;
            case 'paranoid':
                this.settings.contentProtection = true;
                this.settings.dataRetention = 1;
                this.settings.encryptionEnabled = true;
                this.settings.biometricAuth = true;
                break;
        }
        
        await this.applyPrivacySettings();
        await this.savePrivacySettings();
        
        this.showPrivacyIndicator('privacy-mode', `Privacy mode: ${mode}`);
        
        return { success: true, privacyMode: mode };
    }

    /**
     * Apply privacy settings
     */
    async applyPrivacySettings() {
        // Apply content protection
        if (this.settings.contentProtection) {
            this.toggleContentProtection(true);
        }
        
        // Apply other settings as needed
        logger.info('[PrivacyManager] Privacy settings applied');
    }

    /**
     * Show privacy indicator
     */
    showPrivacyIndicator(type, message) {
        const indicator = {
            type,
            message,
            timestamp: Date.now()
        };
        
        this.privacyIndicators.set(type, indicator);
        
        // Send to all windows
        BrowserWindow.getAllWindows().forEach(window => {
            if (window.webContents) {
                window.webContents.send('show-privacy-indicator', indicator);
            }
        });
        
        return { success: true };
    }

    /**
     * Hide privacy indicator
     */
    hidePrivacyIndicator(type) {
        this.privacyIndicators.delete(type);
        
        // Send to all windows
        BrowserWindow.getAllWindows().forEach(window => {
            if (window.webContents) {
                window.webContents.send('hide-privacy-indicator', type);
            }
        });
        
        return { success: true };
    }

    /**
     * Secure storage implementation
     */
    async secureStore(key, data) {
        if (!this.settings.encryptionEnabled) {
            return { success: false, error: 'Encryption disabled' };
        }
        
        try {
            const encrypted = this.encrypt(JSON.stringify(data));
            const storePath = path.join(require('os').homedir(), '.xerus', 'secure');
            await fs.mkdir(storePath, { recursive: true });
            
            const filePath = path.join(storePath, `${key}.enc`);
            await fs.writeFile(filePath, encrypted);
            
            return { success: true };
        } catch (error) {
            logger.error('Secure store failed:', { error });
            return { success: false, error: error.message };
        }
    }

    /**
     * Secure retrieval implementation
     */
    async secureRetrieve(key) {
        if (!this.settings.encryptionEnabled) {
            return null;
        }
        
        try {
            const storePath = path.join(require('os').homedir(), '.xerus', 'secure');
            const filePath = path.join(storePath, `${key}.enc`);
            
            const encrypted = await fs.readFile(filePath, 'utf8');
            const decrypted = this.decrypt(encrypted);
            
            return JSON.parse(decrypted);
        } catch (error) {
            logger.warn('Secure retrieve failed:', { error });
            return null;
        }
    }

    /**
     * Secure deletion implementation
     */
    async secureDelete(key) {
        try {
            const storePath = path.join(require('os').homedir(), '.xerus', 'secure');
            const filePath = path.join(storePath, `${key}.enc`);
            
            await fs.unlink(filePath);
            return { success: true };
        } catch (error) {
            logger.warn('Secure delete failed:', { error });
            return { success: false, error: error.message };
        }
    }

    /**
     * Encrypt data
     */
    encrypt(text) {
        const algorithm = 'aes-256-gcm';
        const key = crypto.scryptSync('xerus-privacy-key', 'salt', 32);
        const iv = crypto.randomBytes(16);
        
        const cipher = crypto.createCipheriv(algorithm, key, iv);
        cipher.setAAD(Buffer.from('xerus-privacy', 'utf8'));
        
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        const tag = cipher.getAuthTag();
        
        return iv.toString('hex') + ':' + tag.toString('hex') + ':' + encrypted;
    }

    /**
     * Decrypt data
     */
    decrypt(encryptedData) {
        const algorithm = 'aes-256-gcm';
        const key = crypto.scryptSync('xerus-privacy-key', 'salt', 32);
        
        const parts = encryptedData.split(':');
        const iv = Buffer.from(parts[0], 'hex');
        const tag = Buffer.from(parts[1], 'hex');
        const encrypted = parts[2];
        
        const decipher = crypto.createDecipheriv(algorithm, key, iv);
        decipher.setAAD(Buffer.from('xerus-privacy', 'utf8'));
        decipher.setAuthTag(tag);
        
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    }

    /**
     * Get privacy settings
     */
    getPrivacySettings() {
        return {
            settings: this.settings,
            permissions: this.permissions,
            indicators: Array.from(this.privacyIndicators.values())
        };
    }

    /**
     * Update privacy settings
     */
    async updatePrivacySettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        await this.applyPrivacySettings();
        await this.savePrivacySettings();
        
        return { success: true, settings: this.settings };
    }

    /**
     * Check permissions
     */
    async checkPermissions() {
        await this.checkSystemPermissions();
        return this.permissions;
    }

    /**
     * Get privacy status
     */
    getPrivacyStatus() {
        return {
            settings: this.settings,
            permissions: this.permissions,
            indicators: Array.from(this.privacyIndicators.values()),
            platform: platformManager.platform,
            capabilities: platformManager.capabilities
        };
    }
}

// Export singleton instance
const privacyManager = new PrivacyManager();

module.exports = {
    privacyManager,
    PrivacyManager
};