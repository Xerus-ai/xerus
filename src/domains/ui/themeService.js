/**
 * Centralized Theme Management Service
 * Handles theme state across all Electron windows with IPC communication
 */

const { createLogger } = require('../../common/services/logger.js');
const internalBridge = require('../../bridge/internalBridge');

const logger = createLogger('ThemeService');

class ThemeService {
    constructor() {
        this.currentTheme = 'light'; // default theme
        this.themeChangeListeners = new Set();
        this.windowPool = null; // Will be injected by windowManager
        
        // Load saved theme on startup
        this.loadSavedTheme();
        
        logger.info('[ThemeService] Initialized with theme:', this.currentTheme);
    }

    /**
     * Set the window pool reference for cross-window updates
     * @param {Map} windowPool - Reference to windowManager's window pool
     */
    setWindowPool(windowPool) {
        this.windowPool = windowPool;
    }

    /**
     * Load theme from persistent storage
     */
    async loadSavedTheme() {
        try {
            // In a real implementation, this would load from user preferences database
            // For now, we'll use a simple approach that can be enhanced
            this.currentTheme = 'light'; // Default fallback
            logger.info('[ThemeService] Loaded saved theme:', this.currentTheme);
        } catch (error) {
            logger.error('[ThemeService] Failed to load saved theme:', error);
            this.currentTheme = 'light'; // Fallback to light theme
        }
    }

    /**
     * Save theme to persistent storage
     * @param {string} theme - Theme name ('light' or 'dark')
     */
    async saveTheme(theme) {
        try {
            // In a real implementation, save to user preferences database
            // For now, we rely on localStorage in the renderer process
            logger.info('[ThemeService] Theme saved:', theme);
        } catch (error) {
            logger.error('[ThemeService] Failed to save theme:', error);
        }
    }

    /**
     * Get current theme
     * @returns {string} Current theme name
     */
    getCurrentTheme() {
        return this.currentTheme;
    }

    /**
     * Set theme and propagate to all windows
     * @param {string} theme - Theme name ('light' or 'dark')
     */
    async setTheme(theme) {
        if (!['light', 'dark'].includes(theme)) {
            logger.warn('[ThemeService] Invalid theme provided:', theme);
            return { success: false, error: 'Invalid theme. Must be "light" or "dark"' };
        }

        if (this.currentTheme === theme) {
            logger.debug('[ThemeService] Theme already set to:', theme);
            return { success: true, theme: this.currentTheme };
        }

        const previousTheme = this.currentTheme;
        this.currentTheme = theme;

        logger.info(`[ThemeService] Theme changed from ${previousTheme} to ${theme}`);

        // Save theme persistently
        await this.saveTheme(theme);

        // Propagate theme change to all windows
        this.propagateThemeChange(theme);

        // Notify listeners
        this.notifyThemeChange(theme, previousTheme);

        return { success: true, theme, previousTheme };
    }

    /**
     * Toggle between light and dark themes
     */
    async toggleTheme() {
        const newTheme = this.currentTheme === 'light' ? 'dark' : 'light';
        return await this.setTheme(newTheme);
    }

    /**
     * Propagate theme change to all active windows
     * @param {string} theme - New theme name
     */
    propagateThemeChange(theme) {
        if (!this.windowPool) {
            logger.warn('[ThemeService] Window pool not available for theme propagation');
            return;
        }

        // Send theme change event to all windows
        for (const [windowName, window] of this.windowPool.entries()) {
            if (window && !window.isDestroyed()) {
                try {
                    window.webContents.send('theme-changed', { 
                        theme, 
                        timestamp: Date.now(),
                        source: 'themeService' 
                    });
                    logger.debug(`[ThemeService] Theme change sent to window: ${windowName}`);
                } catch (error) {
                    logger.error(`[ThemeService] Failed to send theme change to ${windowName}:`, error);
                }
            }
        }

        // Also emit via internal bridge for any services that need to react
        internalBridge.emit('theme:changed', { theme, timestamp: Date.now() });
        
        logger.info(`[ThemeService] Theme propagated to ${this.windowPool.size} windows`);
    }

    /**
     * Register a theme change listener
     * @param {Function} listener - Callback function (theme, previousTheme) => void
     */
    addThemeChangeListener(listener) {
        this.themeChangeListeners.add(listener);
        logger.debug('[ThemeService] Theme change listener registered');
    }

    /**
     * Remove a theme change listener
     * @param {Function} listener - Previously registered listener function
     */
    removeThemeChangeListener(listener) {
        this.themeChangeListeners.delete(listener);
        logger.debug('[ThemeService] Theme change listener removed');
    }

    /**
     * Notify all registered listeners of theme change
     * @param {string} theme - New theme
     * @param {string} previousTheme - Previous theme
     */
    notifyThemeChange(theme, previousTheme) {
        for (const listener of this.themeChangeListeners) {
            try {
                listener(theme, previousTheme);
            } catch (error) {
                logger.error('[ThemeService] Error in theme change listener:', error);
            }
        }
    }

    /**
     * Apply theme to a newly created window
     * @param {BrowserWindow} window - Electron window instance
     * @param {string} windowName - Name of the window
     */
    applyThemeToWindow(window, windowName) {
        if (!window || window.isDestroyed()) {
            logger.warn('[ThemeService] Cannot apply theme to invalid window:', windowName);
            return;
        }

        try {
            // Send current theme to the new window
            window.webContents.send('theme-initialize', { 
                theme: this.currentTheme, 
                timestamp: Date.now(),
                source: 'themeService',
                windowName 
            });
            logger.debug(`[ThemeService] Theme applied to new window: ${windowName}`);
        } catch (error) {
            logger.error(`[ThemeService] Failed to apply theme to ${windowName}:`, error);
        }
    }

    /**
     * Get theme info for debugging
     */
    getThemeInfo() {
        return {
            currentTheme: this.currentTheme,
            listenerCount: this.themeChangeListeners.size,
            windowPoolSize: this.windowPool ? this.windowPool.size : 0,
            timestamp: Date.now()
        };
    }
}

// Create singleton instance
const themeService = new ThemeService();

module.exports = {
    themeService,
    ThemeService
};