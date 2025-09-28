/**
 * Theme Mixin for LitElement Components
 * Provides automatic theme management and synchronization across all components
 */

import { css } from '../assets/lit-core-2.7.4.min.js';

/**
 * Theme mixin that can be applied to any LitElement component
 * @param {Class} SuperClass - The LitElement class to extend
 * @returns {Class} Enhanced class with theme management
 */
export const ThemeMixin = (SuperClass) => class extends SuperClass {
    static properties = {
        ...SuperClass.properties,
        currentTheme: { type: String, state: true }
    };

    constructor() {
        super();
        this.currentTheme = 'light'; // Default theme
        this._themeChangeListener = null;
        this._themeInitializeListener = null;
    }

    connectedCallback() {
        super.connectedCallback();
        this.setupThemeListeners();
        this.loadInitialTheme();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.cleanupThemeListeners();
    }

    /**
     * Set up theme change listeners
     */
    setupThemeListeners() {
        if (!window.api || !window.api.common) {
            console.warn('[ThemeMixin] Theme API not available');
            return;
        }

        // Listen for theme changes
        this._themeChangeListener = (event, data) => {
            console.log(`[ThemeMixin] Theme change received in ${this.constructor.name}:`, data);
            this.handleThemeChange(data.theme);
        };

        // Listen for theme initialization
        this._themeInitializeListener = (event, data) => {
            console.log(`[ThemeMixin] Theme initialize received in ${this.constructor.name}:`, data);
            this.handleThemeChange(data.theme);
        };

        window.api.common.onThemeChanged(this._themeChangeListener);
        window.api.common.onThemeInitialize(this._themeInitializeListener);
    }

    /**
     * Clean up theme listeners
     */
    cleanupThemeListeners() {
        if (window.api && window.api.common) {
            if (this._themeChangeListener) {
                window.api.common.removeOnThemeChanged(this._themeChangeListener);
                this._themeChangeListener = null;
            }
            if (this._themeInitializeListener) {
                window.api.common.removeOnThemeInitialize(this._themeInitializeListener);
                this._themeInitializeListener = null;
            }
        }
    }

    /**
     * Load initial theme from localStorage and API
     */
    async loadInitialTheme() {
        try {
            // Try to get theme from localStorage first
            const savedTheme = localStorage.getItem('xerus:theme');
            if (savedTheme && ['light', 'dark'].includes(savedTheme)) {
                this.handleThemeChange(savedTheme);
            }

            // Also get current theme from backend for consistency
            if (window.api && window.api.common) {
                const currentTheme = await window.api.common.getCurrentTheme();
                if (currentTheme && currentTheme !== savedTheme) {
                    this.handleThemeChange(currentTheme);
                }
            }
        } catch (error) {
            console.warn(`[ThemeMixin] Failed to load initial theme in ${this.constructor.name}:`, error);
            // Fallback to light theme
            this.handleThemeChange('light');
        }
    }

    /**
     * Handle theme change and apply to component
     * @param {string} theme - New theme name
     */
    handleThemeChange(theme) {
        if (!['light', 'dark'].includes(theme)) {
            console.warn(`[ThemeMixin] Invalid theme provided to ${this.constructor.name}:`, theme);
            return;
        }

        const previousTheme = this.currentTheme;
        this.currentTheme = theme;

        // Apply theme to document root (for CSS variables)
        document.documentElement.classList.remove('light', 'dark');
        document.documentElement.classList.add(theme);

        // Update localStorage
        localStorage.setItem('xerus:theme', theme);

        // Call component-specific theme handler if it exists
        if (typeof this.onThemeChanged === 'function') {
            this.onThemeChanged(theme, previousTheme);
        }

        console.log(`[ThemeMixin] Theme applied to ${this.constructor.name}: ${previousTheme} → ${theme}`);

        // Trigger re-render
        this.requestUpdate();
    }

    /**
     * Get current theme
     * @returns {string} Current theme name
     */
    getTheme() {
        return this.currentTheme;
    }

    /**
     * Set theme programmatically
     * @param {string} theme - Theme to set ('light' or 'dark')
     */
    async setTheme(theme) {
        if (!window.api || !window.api.common) {
            console.warn(`[ThemeMixin] Cannot set theme in ${this.constructor.name}: API not available`);
            return { success: false, error: 'API not available' };
        }

        try {
            const result = await window.api.common.setTheme(theme);
            console.log(`[ThemeMixin] Theme set from ${this.constructor.name}:`, result);
            return result;
        } catch (error) {
            console.error(`[ThemeMixin] Failed to set theme in ${this.constructor.name}:`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Toggle between light and dark themes
     */
    async toggleTheme() {
        if (!window.api || !window.api.common) {
            console.warn(`[ThemeMixin] Cannot toggle theme in ${this.constructor.name}: API not available`);
            return { success: false, error: 'API not available' };
        }

        try {
            const result = await window.api.common.toggleTheme();
            console.log(`[ThemeMixin] Theme toggled from ${this.constructor.name}:`, result);
            return result;
        } catch (error) {
            console.error(`[ThemeMixin] Failed to toggle theme in ${this.constructor.name}:`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get theme-aware CSS for components
     * This method can be overridden by components to provide theme-specific styles
     */
    static getThemeStyles() {
        return css`
            /* Base theme styles - components can override this */
            :host {
                color: var(--text-primary, #1f2937);
                background: var(--background-primary, #ffffff);
                transition: color 0.2s ease, background-color 0.2s ease;
            }

            /* Theme-specific adjustments */
            :host-context(html.dark) {
                color: var(--text-primary, #f9fafb);
                background: var(--background-primary, #1f2937);
            }

            :host-context(html.light) {
                color: var(--text-primary, #1f2937);
                background: var(--background-primary, #ffffff);
            }
        `;
    }
};

/**
 * Standalone theme utility functions
 */
export const ThemeUtils = {
    /**
     * Get current theme from various sources
     * @returns {string} Current theme name
     */
    getCurrentTheme() {
        // Priority: document class > localStorage > default
        if (document.documentElement.classList.contains('dark')) {
            return 'dark';
        } else if (document.documentElement.classList.contains('light')) {
            return 'light';
        }
        
        const saved = localStorage.getItem('xerus:theme');
        return saved && ['light', 'dark'].includes(saved) ? saved : 'light';
    },

    /**
     * Check if dark theme is active
     * @returns {boolean} True if dark theme is active
     */
    isDarkTheme() {
        return this.getCurrentTheme() === 'dark';
    },

    /**
     * Check if light theme is active
     * @returns {boolean} True if light theme is active
     */
    isLightTheme() {
        return this.getCurrentTheme() === 'light';
    },

    /**
     * Apply theme to document without API call
     * @param {string} theme - Theme to apply
     */
    applyThemeToDocument(theme) {
        if (!['light', 'dark'].includes(theme)) {
            console.warn('[ThemeUtils] Invalid theme provided:', theme);
            return;
        }

        document.documentElement.classList.remove('light', 'dark');
        document.documentElement.classList.add(theme);
        localStorage.setItem('xerus:theme', theme);
    }
};