/**
 * XERUS ENHANCED SCREEN CAPTURE
 * Advanced screen capture with area selection, privacy controls, and glass effects
 * 
 * Features:
 * - Click-and-drag area selection
 * - Privacy protection toggle
 * - Glass effect highlighting
 * - Multi-monitor support
 * - High-DPI support
 */

const { BrowserWindow, screen, desktopCapturer, ipcMain } = require('electron');
const { platformManager } = require('./platform-manager');
const path = require('path');
const os = require('os');
const fs = require('fs').promises;
const { createLogger } = require('../common/services/logger');

const logger = createLogger('EnhancedScreenCapture');

class EnhancedScreenCapture {
    constructor() {
        this.isSelecting = false;
        this.selectionWindow = null;
        this.selectedArea = null;
        this.contentProtection = false;
        this.screenCaptureService = platformManager.getScreenCaptureService();
        this.ipcHandlersRegistered = false;
        
        this.setupIPC();
    }

    /**
     * Setup IPC communication for area selection
     */
    setupIPC() {
        // Check if handlers are already registered to prevent duplicates
        if (this.ipcHandlersRegistered) {
            logger.debug('IPC handlers already registered, skipping');
            return;
        }

        // Start area selection
        ipcMain.handle('start-area-selection', async () => {
            return await this.startAreaSelection();
        });

        // Cancel area selection
        ipcMain.handle('cancel-area-selection', () => {
            this.cancelAreaSelection();
        });

        // Get selected area
        ipcMain.handle('get-selected-area', () => {
            return this.selectedArea;
        });

        // Note: toggle-content-protection is handled by privacy-manager.js

        // Capture selected area
        ipcMain.handle('capture-selected-area', async (event, options = {}) => {
            return await this.captureSelectedArea(options);
        });

        // Capture full screen
        ipcMain.handle('capture-full-screen', async (event, options = {}) => {
            return await this.captureFullScreen(options);
        });

        // Get available displays
        ipcMain.handle('get-displays', () => {
            return screen.getAllDisplays();
        });

        // Capture persistent area for Ask queries
        ipcMain.handle('capture-persistent-area', async () => {
            return await this.capturePersistentArea();
        });

        // Clear persistent area selection
        ipcMain.handle('clear-persistent-area', () => {
            return this.clearPersistentArea();
        });

        // Get persistent area status
        ipcMain.handle('get-persistent-area-status', () => {
            return {
                hasPersistentArea: !!(this.selectedArea && this.selectedArea.persistent),
                selectedArea: this.selectedArea && this.selectedArea.persistent ? this.selectedArea : null
            };
        });

        this.ipcHandlersRegistered = true;
        logger.info('IPC handlers registered');
    }

    /**
     * Start area selection overlay
     */
    async startAreaSelection() {
        if (this.isSelecting) {
            logger.warn('Area selection already in progress');
            return { success: false, error: 'Selection already in progress' };
        }

        try {
            this.isSelecting = true;
            this.selectedArea = null;

            // Get all displays for multi-monitor support
            const displays = screen.getAllDisplays();
            logger.debug('Found displays', { displayCount: displays.length });

            // Create selection overlay for each display
            const overlayPromises = displays.map(display => this.createSelectionOverlay(display));
            const overlays = await Promise.all(overlayPromises);

            // Store overlay windows for cleanup
            this.selectionOverlays = overlays.filter(overlay => overlay !== null);

            return { 
                success: true, 
                message: 'Area selection started',
                displays: displays.length
            };
        } catch (error) {
            logger.error('Failed to start area selection', { error: error.message });
            this.isSelecting = false;
            return { success: false, error: error.message };
        }
    }

    /**
     * Create selection overlay for a specific display
     */
    async createSelectionOverlay(display) {
        try {
            const windowOptions = {
                ...platformManager.getWindowOptions(),
                x: display.bounds.x,
                y: display.bounds.y,
                width: display.bounds.width,
                height: display.bounds.height,
                resizable: false,
                movable: false,
                minimizable: false,
                maximizable: false,
                closable: false,
                alwaysOnTop: true,
                skipTaskbar: true,
                hasShadow: false,
                transparent: true,
                frame: false,
                show: false,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    preload: path.join(__dirname, '..', 'preload.js')
                }
            };

            const overlay = new BrowserWindow(windowOptions);

            // Load the area selection overlay HTML
            const overlayPath = path.join(__dirname, '..', 'ui', 'area-selection', 'overlay.html');
            await overlay.loadFile(overlayPath);

            // Send display info to overlay
            overlay.webContents.send('display-info', {
                display: display,
                bounds: display.bounds,
                scaleFactor: display.scaleFactor
            });

            // Handle area selection events
            overlay.webContents.on('ipc-message', (event, channel, data) => {
                if (channel === 'area-selected') {
                    this.handleAreaSelected(data, display);
                } else if (channel === 'selection-cancelled') {
                    this.cancelAreaSelection();
                }
            });

            // Show overlay
            overlay.show();
            overlay.setAlwaysOnTop(true, 'screen-saver');

            logger.debug('Created selection overlay', { displayId: display.id });
            return overlay;
        } catch (error) {
            logger.error('Failed to create selection overlay', { error: error.message });
            return null;
        }
    }

    /**
     * Handle area selection completion
     */
    async handleAreaSelected(selectionData, display) {
        // Convert selection coordinates to absolute screen coordinates
        const absoluteArea = {
            x: display.bounds.x + selectionData.x,
            y: display.bounds.y + selectionData.y,
            width: selectionData.width,
            height: selectionData.height,
            display: display,
            persistent: true, // Mark as persistent for future Ask queries
            timestamp: Date.now()
        };

        this.selectedArea = absoluteArea;
        this.isSelecting = false;

        // Close all selection overlays
        this.closeSelectionOverlays();

        logger.info('[EnhancedScreenCapture] Persistent area selected:', {
            area: absoluteArea,
            displayBounds: display.bounds,
            originalSelection: { x: selectionData.x, y: selectionData.y, width: selectionData.width, height: selectionData.height }
        });

        // Just store the area as persistent - don't automatically open Ask window
        // The Ask service will use this persistent area when manually triggered

        // Notify main process about persistent area selection
        this.notifyAreaSelected(absoluteArea);
        this.notifyPersistentAreaSet(absoluteArea);
    }

    /**
     * Cancel area selection
     */
    cancelAreaSelection() {
        this.isSelecting = false;
        this.selectedArea = null;
        this.closeSelectionOverlays();
        logger.info('[EnhancedScreenCapture] Area selection cancelled');
    }

    /**
     * Close all selection overlays
     */
    closeSelectionOverlays() {
        if (this.selectionOverlays) {
            this.selectionOverlays.forEach(overlay => {
                if (overlay && !overlay.isDestroyed()) {
                    overlay.close();
                }
            });
            this.selectionOverlays = [];
        }
    }

    /**
     * Send captured area to AI (Ask window)
     */
    async sendCaptureToAI(captureResult, area, isInitialSelection = false) {
        try {
            // Get the window manager to open Ask window
            const { windowPool } = require('../window/windowManager');
            
            // Ensure Ask window is open
            let askWindow = windowPool.get('ask');
            if (!askWindow) {
                // Create Ask window if it doesn't exist
                const { createWindow } = require('../window/windowManager');
                askWindow = await createWindow('ask');
            }

            // Wait for window to be ready
            if (askWindow && !askWindow.isDestroyed()) {
                // Send the captured image and context to Ask window
                const contextMessage = {
                    type: 'screen-capture',
                    imageData: captureResult.base64 || captureResult.data, // Fix: use correct field name
                    area: {
                        x: area.x,
                        y: area.y,
                        width: area.width,
                        height: area.height
                    },
                    metadata: captureResult.metadata,
                    persistent: area.persistent || false,
                    isInitialSelection: isInitialSelection,
                    prompt: isInitialSelection 
                        ? `I've selected this area of the screen (${area.width}x${area.height} pixels) as my focus area. This area will now be used for all future Ask queries. What can you see in this image?`
                        : `I've captured this area of the screen (${area.width}x${area.height} pixels). What can you see in this image?`
                };

                // Send to Ask window
                askWindow.webContents.send('screen-capture-context', contextMessage);
                
                // Show and focus the Ask window
                askWindow.show();
                askWindow.focus();
                
                logger.info('[EnhancedScreenCapture] Screen capture sent to Ask window', { isInitialSelection, persistent: area.persistent });
            } else {
                logger.error('[EnhancedScreenCapture] Ask window not available');
            }
        } catch (error) {
            logger.error('[EnhancedScreenCapture] Failed to send capture to AI:', error);
        }
    }

    /**
     * Notify main process about area selection
     */
    notifyAreaSelected(area) {
        // Send to all renderer processes
        BrowserWindow.getAllWindows().forEach(window => {
            if (window.webContents) {
                window.webContents.send('area-selected', area);
            }
        });
    }

    /**
     * Toggle content protection
     */
    toggleContentProtection(enabled) {
        this.contentProtection = enabled;
        
        // Apply content protection to all windows
        BrowserWindow.getAllWindows().forEach(window => {
            if (window.webContents) {
                window.setContentProtection(enabled);
            }
        });

        logger.info('Content protection:');
        return { success: true, contentProtection: this.contentProtection };
    }

    /**
     * Capture selected area
     */
    async captureSelectedArea(options = {}) {
        if (!this.selectedArea) {
            return { success: false, error: 'No area selected' };
        }

        try {
            // Use platform-specific capture method
            const captureResult = await this.screenCaptureService.captureArea(this.selectedArea, options);
            
            if (captureResult.success) {
                logger.info('[EnhancedScreenCapture] Selected area captured successfully');
                
                // Add area selection metadata
                captureResult.metadata = {
                    ...captureResult.metadata,
                    captureType: 'area',
                    selectedArea: this.selectedArea,
                    contentProtection: this.contentProtection
                };
            }

            return captureResult;
        } catch (error) {
            logger.error('Failed to capture selected area:', { error });
            return { success: false, error: error.message };
        }
    }

    /**
     * Capture full screen
     */
    async captureFullScreen(options = {}) {
        try {
            const captureResult = await this.screenCaptureService.captureScreen(options);
            
            if (captureResult.success) {
                logger.info('[EnhancedScreenCapture] Full screen captured successfully');
                
                // Add metadata
                captureResult.metadata = {
                    ...captureResult.metadata,
                    captureType: 'fullscreen',
                    contentProtection: this.contentProtection
                };
            }

            return captureResult;
        } catch (error) {
            logger.error('Failed to capture full screen:', { error });
            return { success: false, error: error.message };
        }
    }

    /**
     * Get capture history
     */
    getCaptureHistory() {
        // This would be implemented with a proper storage system
        return [];
    }

    /**
     * Clear selected area
     */
    clearSelection() {
        this.selectedArea = null;
        logger.info('[EnhancedScreenCapture] Selection cleared');
    }

    /**
     * Notify main process about persistent area being set
     */
    notifyPersistentAreaSet(area) {
        // Send to all renderer processes
        BrowserWindow.getAllWindows().forEach(window => {
            if (window.webContents) {
                window.webContents.send('persistent-area-set', {
                    area: area,
                    timestamp: Date.now()
                });
            }
        });
        logger.info('[EnhancedScreenCapture] Persistent area notification sent');
    }

    /**
     * Capture current selected area for persistent use
     */
    async capturePersistentArea() {
        logger.info('[EnhancedScreenCapture] capturePersistentArea called', {
            hasSelectedArea: !!this.selectedArea,
            selectedAreaPersistent: this.selectedArea?.persistent,
            selectedAreaDetails: this.selectedArea
        });

        if (!this.selectedArea || !this.selectedArea.persistent) {
            logger.warn('[EnhancedScreenCapture] No persistent area selected', {
                hasSelectedArea: !!this.selectedArea,
                isPersistent: this.selectedArea?.persistent
            });
            return { success: false, error: 'No persistent area selected' };
        }

        try {
            logger.info('[EnhancedScreenCapture] Attempting to capture selected area for persistent area');
            const captureResult = await this.captureSelectedArea();
            if (captureResult.success) {
                logger.info('[EnhancedScreenCapture] Persistent area captured for Ask query', {
                    hasData: !!captureResult.data,
                    hasBase64: !!captureResult.base64,
                    dataLength: captureResult.data?.length,
                    base64Length: captureResult.base64?.length,
                    width: captureResult.width,
                    height: captureResult.height
                });
                
                const imageData = captureResult.base64 || captureResult.data;
                return {
                    success: true,
                    base64: imageData, // Ensure consistent field naming
                    data: imageData,   // Keep both for compatibility
                    width: captureResult.width,
                    height: captureResult.height,
                    metadata: {
                        ...captureResult.metadata,
                        persistent: true,
                        area: this.selectedArea
                    }
                };
            }
            return captureResult;
        } catch (error) {
            logger.error('[EnhancedScreenCapture] Failed to capture persistent area:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Clear persistent area selection
     */
    clearPersistentArea() {
        if (this.selectedArea && this.selectedArea.persistent) {
            logger.info('[EnhancedScreenCapture] Clearing persistent area selection');
            this.selectedArea.persistent = false;
            
            // Notify all windows that persistent area was cleared
            BrowserWindow.getAllWindows().forEach(window => {
                if (window.webContents) {
                    window.webContents.send('persistent-area-cleared');
                }
            });
        }
        return { success: true, cleared: true };
    }

    /**
     * Get current status
     */
    getStatus() {
        return {
            isSelecting: this.isSelecting,
            hasSelectedArea: !!this.selectedArea,
            hasPersistentArea: !!(this.selectedArea && this.selectedArea.persistent),
            selectedArea: this.selectedArea,
            contentProtection: this.contentProtection,
            platform: platformManager.platform,
            capabilities: platformManager.capabilities
        };
    }
}

// Export singleton instance
const enhancedScreenCapture = new EnhancedScreenCapture();

module.exports = {
    enhancedScreenCapture,
    EnhancedScreenCapture
};