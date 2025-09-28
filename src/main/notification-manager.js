/**
 * XERUS NOTIFICATION MANAGER
 * Cross-platform notification system for Xerus
 * 
 * Handles:
 * - System notifications (Windows/macOS)
 * - STT completion notifications
 * - Conversation updates
 * - Error notifications
 * - Session state changes
 */

const { platformManager } = require('./platform-manager');
const { app, BrowserWindow } = require('electron');
const { createLogger } = require('../common/services/logger.js');

const logger = createLogger('Main.Notification-manager');

class NotificationManager {
    constructor() {
        this.enabled = true;
        this.notifications = new Map();
        this.settings = {
            showSTTComplete: true,
            showConversationUpdates: true,
            showErrors: true,
            showSessionChanges: true,
            sound: true,
            duration: 5000
        };
        
        this.initialize();
    }

    /**
     * Get notification capabilities
     */
    getCapabilities() {
        return {
            enabled: this.enabled,
            systemNotifications: platformManager.capabilities.systemNotifications,
            sound: this.settings.sound,
            duration: this.settings.duration,
            platform: platformManager.capabilities.platform
        };
    }

    /**
     * Initialize notification system
     */
    initialize() {
        logger.info('[NotificationManager] Initializing notification system');
        
        // Check if notifications are supported
        if (!platformManager.capabilities.systemNotifications) {
            logger.warn('System notifications not supported');
            this.enabled = false;
            return;
        }

        // Set up notification permissions
        this.requestPermissions();
        
        logger.info('[NotificationManager] Notification system initialized');
    }

    /**
     * Request notification permissions
     */
    async requestPermissions() {
        try {
            // On Windows, notifications are usually allowed by default
            if (process.platform === 'win32') {
                logger.info('[NotificationManager] Windows notifications enabled');
                return true;
            }
            
            // On macOS, we may need to request permissions
            if (process.platform === 'darwin') {
                logger.info('[NotificationManager] macOS notifications enabled');
                return true;
            }
            
            return false;
        } catch (error) {
            logger.error('Error requesting permissions:', { error });
            return false;
        }
    }

    /**
     * Show STT completion notification
     */
    showSTTComplete(speaker, text, options = {}) {
        if (!this.enabled || !this.settings.showSTTComplete) return;

        const title = `Speech Transcribed - ${speaker}`;
        const body = text.length > 100 ? text.substring(0, 100) + '...' : text;
        
        const notificationOptions = {
            ...options,
            onClick: () => {
                this.focusMainWindow();
            },
            sound: this.settings.sound,
            tag: 'stt-complete'
        };

        return this.showNotification(title, body, notificationOptions);
    }

    /**
     * Show conversation update notification
     */
    showConversationUpdate(message, options = {}) {
        if (!this.enabled || !this.settings.showConversationUpdates) return;

        const title = 'Conversation Updated';
        const body = message;
        
        const notificationOptions = {
            ...options,
            onClick: () => {
                this.focusMainWindow();
            },
            sound: this.settings.sound,
            tag: 'conversation-update'
        };

        return this.showNotification(title, body, notificationOptions);
    }

    /**
     * Show error notification
     */
    showError(error, options = {}) {
        if (!this.enabled || !this.settings.showErrors) return;

        const title = 'Xerus Error';
        const body = typeof error === 'string' ? error : error.message || 'An error occurred';
        
        const notificationOptions = {
            ...options,
            urgency: 'critical',
            onClick: () => {
                this.focusMainWindow();
            },
            sound: this.settings.sound,
            tag: 'error'
        };

        return this.showNotification(title, body, notificationOptions);
    }

    /**
     * Show session state change notification
     */
    showSessionChange(state, options = {}) {
        if (!this.enabled || !this.settings.showSessionChanges) return;

        const messages = {
            'started': 'Session started - Ready to listen',
            'stopped': 'Session stopped',
            'paused': 'Session paused',
            'resumed': 'Session resumed',
            'error': 'Session error occurred'
        };

        const title = 'Session Status';
        const body = messages[state] || `Session ${state}`;
        
        const notificationOptions = {
            ...options,
            onClick: () => {
                this.focusMainWindow();
            },
            sound: this.settings.sound,
            tag: 'session-change'
        };

        return this.showNotification(title, body, notificationOptions);
    }

    /**
     * Show custom notification
     */
    showNotification(title, body, options = {}) {
        if (!this.enabled) return false;

        try {
            // Use platform-specific notification method
            const result = platformManager.showNotification(title, body, options);
            
            if (result) {
                // Store notification reference
                const notificationId = options.tag || `notification-${Date.now()}`;
                this.notifications.set(notificationId, {
                    title,
                    body,
                    timestamp: Date.now(),
                    ...options
                });

                // Auto-clean up after duration
                if (this.settings.duration > 0) {
                    setTimeout(() => {
                        this.notifications.delete(notificationId);
                    }, this.settings.duration);
                }
            }
            
            return result;
        } catch (error) {
            logger.error('Error showing notification:', { error });
            return false;
        }
    }

    /**
     * Show Windows-specific toast notification
     */
    showWindowsToast(title, body, options = {}) {
        if (process.platform !== 'win32') {
            return this.showNotification(title, body, options);
        }

        return platformManager.showWindowsToast(title, body, options);
    }

    /**
     * Show macOS-specific notification
     */
    showMacOSNotification(title, body, options = {}) {
        if (process.platform !== 'darwin') {
            return this.showNotification(title, body, options);
        }

        return platformManager.showMacOSNotification(title, body, options);
    }

    /**
     * Focus main window when notification is clicked
     */
    focusMainWindow() {
        const windows = BrowserWindow.getAllWindows();
        const mainWindow = windows.find(win => win.webContents.getURL().includes('header'));
        
        if (mainWindow) {
            if (mainWindow.isMinimized()) {
                mainWindow.restore();
            }
            mainWindow.focus();
            mainWindow.show();
        }
    }

    /**
     * Update notification settings
     */
    updateSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        logger.info('[NotificationManager] Settings updated:', this.settings);
    }

    /**
     * Enable/disable notifications
     */
    setEnabled(enabled) {
        this.enabled = enabled;
        logger.info('Notifications');
    }

    /**
     * Clear all notifications
     */
    clearAll() {
        this.notifications.clear();
        logger.info('[NotificationManager] All notifications cleared');
    }

    /**
     * Get notification history
     */
    getHistory() {
        return Array.from(this.notifications.values());
    }

    /**
     * Get notification settings
     */
    getSettings() {
        return { ...this.settings };
    }

    /**
     * Check if notifications are supported
     */
    isSupported() {
        return this.enabled && platformManager.capabilities.systemNotifications;
    }
}

// Export singleton instance
const notificationManager = new NotificationManager();

module.exports = {
    notificationManager,
    NotificationManager
};