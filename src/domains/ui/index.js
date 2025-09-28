/**
 * UI Domain - Main Export
 * User Interface and Theme Management Domain
 * 
 * This domain handles:
 * - Theme management and persistence
 * - UI state coordination across windows
 * - Cross-window UI consistency
 * - User interface preferences
 */

const { themeService, ThemeService } = require('./themeService.js');

/**
 * UI Domain
 */
class UIDomain {
    constructor() {
        this.themeService = themeService;
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;
        this.initialized = true;
    }

    getStatus() {
        return {
            initialized: this.initialized,
            themeService: !!this.themeService
        };
    }

    async shutdown() {
        this.initialized = false;
    }
}

const uiDomain = new UIDomain();

module.exports = {
    uiDomain,
    UIDomain,
    
    // Re-export individual services
    themeService,
    ThemeService
};