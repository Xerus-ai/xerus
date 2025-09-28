/**
 * XERUS PLATFORM OPTIMIZATIONS
 * Platform-specific performance and feature optimizations
 * 
 * Handles:
 * - Windows-specific optimizations
 * - macOS-specific optimizations
 * - Memory management
 * - Performance tuning
 * - Resource management
 */

const { app, BrowserWindow, screen } = require('electron');
const os = require('os');
const path = require('path');
const { createLogger } = require('../common/services/logger.js');

const logger = createLogger('Main.Platform-optimizations');

class PlatformOptimizations {
    constructor() {
        this.platform = process.platform;
        this.optimizations = {
            memoryOptimization: true,
            performanceMode: 'balanced', // balanced, performance, battery
            renderingOptimization: true,
            audioOptimization: true,
            networkOptimization: true
        };
        
        this.initialize();
    }

    /**
     * Initialize platform optimizations
     */
    initialize() {
        logger.info('Initializing for');
        
        // Apply platform-specific optimizations
        if (this.platform === 'win32') {
            this.initializeWindowsOptimizations();
        } else if (this.platform === 'darwin') {
            this.initializeMacOSOptimizations();
        }
        
        // Apply general optimizations
        this.applyMemoryOptimizations();
        this.applyRenderingOptimizations();
        this.applyAudioOptimizations();
        
        logger.info('[PlatformOptimizations] Optimizations applied');
    }

    /**
     * Windows-specific optimizations
     */
    initializeWindowsOptimizations() {
        logger.info('[PlatformOptimizations] Applying Windows optimizations');
        
        // Windows-specific app settings
        if (app.isReady()) {
            // Enable hardware acceleration on Windows
            app.commandLine.appendSwitch('enable-features', 'VaapiVideoEncoder');
            app.commandLine.appendSwitch('enable-accelerated-video-decode');
            
            // Windows-specific GPU optimizations
            app.commandLine.appendSwitch('enable-gpu-rasterization');
            app.commandLine.appendSwitch('enable-zero-copy');
            
            // Windows audio optimizations
            app.commandLine.appendSwitch('enable-exclusive-audio');
            app.commandLine.appendSwitch('disable-audio-output');
        }
        
        // Windows memory management
        this.optimizeWindowsMemory();
        
        // Windows display optimizations
        this.optimizeWindowsDisplay();
        
        // Windows network optimizations
        this.optimizeWindowsNetwork();
    }

    /**
     * macOS-specific optimizations
     */
    initializeMacOSOptimizations() {
        logger.info('[PlatformOptimizations] Applying macOS optimizations');
        
        // macOS-specific app settings
        if (app.isReady()) {
            // macOS Metal API support
            app.commandLine.appendSwitch('enable-metal');
            
            // macOS display optimizations
            app.commandLine.appendSwitch('enable-features', 'Metal');
            app.commandLine.appendSwitch('disable-software-rasterizer');
            
            // macOS audio optimizations
            app.commandLine.appendSwitch('enable-exclusive-audio');
        }
        
        // macOS memory management
        this.optimizeMacOSMemory();
        
        // macOS display optimizations
        this.optimizeMacOSDisplay();
    }

    /**
     * Windows memory optimizations
     */
    optimizeWindowsMemory() {
        try {
            // Windows memory management
            if (global.gc) {
                // Force garbage collection on Windows
                setInterval(() => {
                    if (process.memoryUsage().heapUsed > 100 * 1024 * 1024) { // 100MB threshold
                        global.gc();
                        logger.info('[PlatformOptimizations] Windows memory cleanup triggered');
                    }
                }, 60000); // Every minute
            }
            
            // Windows-specific memory limits
            app.commandLine.appendSwitch('max-old-space-size', '512'); // 512MB limit
            app.commandLine.appendSwitch('max-semi-space-size', '64'); // 64MB limit
            
            logger.info('[PlatformOptimizations] Windows memory optimizations applied');
        } catch (error) {
            logger.error('Error applying Windows memory optimizations:', { error });
        }
    }

    /**
     * macOS memory optimizations
     */
    optimizeMacOSMemory() {
        try {
            // macOS memory management
            if (global.gc) {
                // More aggressive garbage collection on macOS
                setInterval(() => {
                    if (process.memoryUsage().heapUsed > 150 * 1024 * 1024) { // 150MB threshold
                        global.gc();
                        logger.info('[PlatformOptimizations] macOS memory cleanup triggered');
                    }
                }, 30000); // Every 30 seconds
            }
            
            // macOS-specific memory limits
            app.commandLine.appendSwitch('max-old-space-size', '1024'); // 1GB limit (higher for macOS)
            
            logger.info('[PlatformOptimizations] macOS memory optimizations applied');
        } catch (error) {
            logger.error('Error applying macOS memory optimizations:', { error });
        }
    }

    /**
     * Windows display optimizations
     */
    optimizeWindowsDisplay() {
        try {
            // Windows display scaling
            app.commandLine.appendSwitch('high-dpi-support', '1');
            app.commandLine.appendSwitch('force-device-scale-factor', '1');
            
            // Windows compositor optimizations
            app.commandLine.appendSwitch('enable-features', 'UseSkiaRenderer');
            app.commandLine.appendSwitch('enable-gpu-compositing');
            
            logger.info('[PlatformOptimizations] Windows display optimizations applied');
        } catch (error) {
            logger.error('Error applying Windows display optimizations:', { error });
        }
    }

    /**
     * macOS display optimizations
     */
    optimizeMacOSDisplay() {
        try {
            // macOS Retina display optimizations
            app.commandLine.appendSwitch('force-device-scale-factor', '2');
            app.commandLine.appendSwitch('enable-features', 'VizDisplayCompositor');
            
            // macOS Metal rendering
            app.commandLine.appendSwitch('enable-features', 'Metal');
            
            logger.info('[PlatformOptimizations] macOS display optimizations applied');
        } catch (error) {
            logger.error('Error applying macOS display optimizations:', { error });
        }
    }

    /**
     * Windows network optimizations
     */
    optimizeWindowsNetwork() {
        try {
            // Windows network stack optimizations
            app.commandLine.appendSwitch('enable-features', 'NetworkService');
            app.commandLine.appendSwitch('enable-network-service-logging');
            
            logger.info('[PlatformOptimizations] Windows network optimizations applied');
        } catch (error) {
            logger.error('Error applying Windows network optimizations:', { error });
        }
    }

    /**
     * General memory optimizations
     */
    applyMemoryOptimizations() {
        if (!this.optimizations.memoryOptimization) return;
        
        try {
            // Enable memory pressure monitoring
            app.commandLine.appendSwitch('enable-features', 'MemoryPressureSignalMonitor');
            
            // Disable unused features to save memory
            app.commandLine.appendSwitch('disable-features', 'VizDisplayCompositor');
            app.commandLine.appendSwitch('disable-background-timer-throttling');
            
            // Enable memory monitoring
            this.monitorMemoryUsage();
            
            logger.info('[PlatformOptimizations] Memory optimizations applied');
        } catch (error) {
            logger.error('Error applying memory optimizations:', { error });
        }
    }

    /**
     * General rendering optimizations
     */
    applyRenderingOptimizations() {
        if (!this.optimizations.renderingOptimization) return;
        
        try {
            // Enable GPU acceleration
            app.commandLine.appendSwitch('enable-gpu-rasterization');
            app.commandLine.appendSwitch('enable-accelerated-2d-canvas');
            
            // Optimize for smooth animations
            app.commandLine.appendSwitch('enable-smooth-scrolling');
            app.commandLine.appendSwitch('enable-features', 'VSync');
            
            // Reduce visual effects on low-end hardware
            const totalMemory = os.totalmem();
            if (totalMemory < 4 * 1024 * 1024 * 1024) { // Less than 4GB RAM
                app.commandLine.appendSwitch('disable-features', 'VizDisplayCompositor');
                app.commandLine.appendSwitch('disable-gpu-compositing');
            }
            
            logger.info('[PlatformOptimizations] Rendering optimizations applied');
        } catch (error) {
            logger.error('Error applying rendering optimizations:', { error });
        }
    }

    /**
     * Audio optimizations
     */
    applyAudioOptimizations() {
        if (!this.optimizations.audioOptimization) return;
        
        try {
            // Audio processing optimizations
            app.commandLine.appendSwitch('enable-features', 'AudioServiceOutOfProcess');
            app.commandLine.appendSwitch('audioprocessing-disable-agc2');
            
            // Reduce audio latency
            app.commandLine.appendSwitch('enable-exclusive-audio');
            app.commandLine.appendSwitch('disable-audio-output');
            
            logger.info('[PlatformOptimizations] Audio optimizations applied');
        } catch (error) {
            logger.error('Error applying audio optimizations:', { error });
        }
    }

    /**
     * Monitor memory usage
     */
    monitorMemoryUsage() {
        setInterval(() => {
            const memoryUsage = process.memoryUsage();
            const totalMemory = os.totalmem();
            const freeMemory = os.freemem();
            
            // Log memory usage every 5 minutes
            logger.info('[PlatformOptimizations] Memory usage:', {
                heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB',
                heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + 'MB',
                external: Math.round(memoryUsage.external / 1024 / 1024) + 'MB',
                systemFree: Math.round(freeMemory / 1024 / 1024) + 'MB',
                systemTotal: Math.round(totalMemory / 1024 / 1024) + 'MB'
            });
            
            // Trigger garbage collection if memory usage is high
            if (memoryUsage.heapUsed > 200 * 1024 * 1024 && global.gc) { // 200MB threshold
                global.gc();
                logger.info('[PlatformOptimizations] Garbage collection triggered');
            }
        }, 300000); // Every 5 minutes
    }

    /**
     * Optimize window creation
     */
    optimizeWindow(window, options = {}) {
        if (!window) return;
        
        try {
            // Platform-specific window optimizations
            if (this.platform === 'win32') {
                this.optimizeWindowsWindow(window, options);
            } else if (this.platform === 'darwin') {
                this.optimizeMacOSWindow(window, options);
            }
            
            // General window optimizations
            window.webContents.setFrameRate(60);
            window.webContents.setVisualZoomLevelLimits(1, 1);
            
            logger.info('[PlatformOptimizations] Window optimizations applied');
        } catch (error) {
            logger.error('Error optimizing window:', { error });
        }
    }

    /**
     * Optimize Windows window
     */
    optimizeWindowsWindow(window, options) {
        try {
            // Windows-specific window settings
            window.setSkipTaskbar(options.skipTaskbar || false);
            
            // Windows compositor optimizations
            if (options.transparency) {
                window.setOpacity(0.95); // Slightly opaque for better performance
            }
            
            logger.info('[PlatformOptimizations] Windows window optimizations applied');
        } catch (error) {
            logger.error('Error optimizing Windows window:', { error });
        }
    }

    /**
     * Optimize macOS window
     */
    optimizeMacOSWindow(window, options) {
        try {
            // macOS-specific window settings
            if (options.vibrancy) {
                window.setVibrancy('ultra-dark');
            }
            
            // macOS Metal rendering
            window.webContents.setFrameRate(60);
            
            logger.info('[PlatformOptimizations] macOS window optimizations applied');
        } catch (error) {
            logger.error('Error optimizing macOS window:', { error });
        }
    }

    /**
     * Update optimization settings
     */
    updateOptimizations(newSettings) {
        this.optimizations = { ...this.optimizations, ...newSettings };
        logger.info('[PlatformOptimizations] Settings updated:', this.optimizations);
        
        // Reapply optimizations
        this.initialize();
    }

    /**
     * Get optimization status
     */
    getOptimizationStatus() {
        return {
            platform: this.platform,
            optimizations: this.optimizations,
            memoryUsage: process.memoryUsage(),
            systemInfo: {
                totalMemory: os.totalmem(),
                freeMemory: os.freemem(),
                cpuCount: os.cpus().length,
                arch: os.arch()
            }
        };
    }
}

// Export singleton instance
const platformOptimizations = new PlatformOptimizations();

module.exports = {
    platformOptimizations,
    PlatformOptimizations
};