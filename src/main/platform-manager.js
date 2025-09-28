/**
 * XERUS PLATFORM MANAGER
 * Cross-platform compatibility layer for Xerus AI Assistant
 * 
 * Handles platform-specific implementations for:
 * - Screen capture (Windows/macOS)
 * - Audio capture (Windows/macOS)
 * - Window management
 * - System integration
 * - Notifications
 */

const { desktopCapturer, Notification, nativeImage } = require('electron');
const os = require('os');
const path = require('path');
const fs = require('fs').promises;
const util = require('util');
const { createLogger } = require('../common/services/logger.js');

const logger = createLogger('Main.Platform-manager');
const execFile = util.promisify(require('child_process').execFile);

class PlatformManager {
    constructor() {
        this.platform = process.platform;
        this.capabilities = this.detectCapabilities();
        this.initializePlatform();
    }

    /**
     * Detect platform capabilities
     */
    detectCapabilities() {
        const capabilities = {
            platform: this.platform,
            screenCapture: true,
            audioCapture: true,
            nativeScreenCapture: false,
            liquidGlass: true,
            systemIntegration: false,
            systemNotifications: false,
            permissions: {
                screenRecording: false,
                microphone: false,
                accessibility: false
            }
        };

        if (this.platform === 'darwin') {
            // macOS capabilities
            capabilities.nativeScreenCapture = true;
            capabilities.liquidGlass = this.checkLiquidGlassSupport();
            capabilities.systemIntegration = true;
            capabilities.systemNotifications = true;
        } else if (this.platform === 'win32') {
            // Windows capabilities
            capabilities.nativeScreenCapture = false; // Use Electron's desktopCapturer
            capabilities.liquidGlass = true; // Not supported on Windows
            capabilities.systemIntegration = true;
            capabilities.systemNotifications = true;
        } else {
            // Linux/other platforms
            capabilities.nativeScreenCapture = false;
            capabilities.liquidGlass = false;
            capabilities.systemIntegration = false;
            capabilities.systemNotifications = false;
        }

        return capabilities;
    }

    /**
     * Check if liquid glass is supported (macOS Darwin 26+)
     */
    checkLiquidGlassSupport() {
        if (this.platform !== 'darwin') return false;
        
        try {
            const majorVersion = parseInt(os.release().split('.')[0], 10);
            return majorVersion >= 26; // macOS 26+ (Darwin 26+)
        } catch (error) {
            logger.warn('Could not detect macOS version for liquid glass support');
            return false;
        }
    }

    /**
     * Get platform capabilities
     */
    getCapabilities() {
        return this.capabilities;
    }

    /**
     * Initialize platform-specific settings
     */
    initializePlatform() {
        logger.info('Initializing for');
        logger.info('Capabilities:', { capabilities: this.capabilities });

        if (this.platform === 'darwin') {
            this.initializeMacOS();
        } else if (this.platform === 'win32') {
            this.initializeWindows();
        }
    }

    /**
     * Initialize macOS-specific features
     */
    initializeMacOS() {
        logger.info('[PlatformManager] Initializing macOS features');
        
        // Check for screen recording permissions
        this.checkMacOSPermissions();
        
        // Initialize liquid glass if supported
        if (this.capabilities.liquidGlass) {
            this.initializeLiquidGlass();
        }
    }

    /**
     * Initialize Windows-specific features
     */
    initializeWindows() {
        logger.info('[PlatformManager] Initializing Windows features');
        
        // Windows-specific initialization
        this.checkWindowsCapabilities();
        
        // Initialize Windows notification system
        this.initializeWindowsNotifications();
    }

    /**
     * Check macOS permissions
     */
    async checkMacOSPermissions() {
        try {
            // This is a simplified check - in a real implementation,
            // you would use native modules or system APIs
            this.capabilities.permissions.screenRecording = true;
            this.capabilities.permissions.microphone = true;
            logger.info('[PlatformManager] macOS permissions checked');
        } catch (error) {
            logger.warn('Could not check macOS permissions:', { error });
        }
    }

    /**
     * Check Windows capabilities
     */
    checkWindowsCapabilities() {
        try {
            // Check Windows version and capabilities
            const version = os.release();
            logger.info('Windows version:');
            
            // Windows 10+ has better screen capture support
            this.capabilities.permissions.screenRecording = true;
            this.capabilities.permissions.microphone = true;
        } catch (error) {
            logger.warn('Could not check Windows capabilities:', { error });
        }
    }

    /**
     * Initialize liquid glass support
     */
    initializeLiquidGlass() {
        if (this.platform !== 'darwin') {
            logger.info('[PlatformManager] Liquid glass only supported on macOS');
            this.capabilities.liquidGlass = false;
            return;
        }
        
        try {
            this.liquidGlass = require('electron-liquid-glass');
            logger.info('[PlatformManager] Liquid glass support initialized');
        } catch (error) {
            logger.warn('Could not initialize liquid glass:', { message: error.message });
            this.capabilities.liquidGlass = false;
        }
    }

    /**
     * Get screen capture service for current platform
     */
    getScreenCaptureService() {
        if (this.platform === 'darwin') {
            return new MacOSScreenCapture();
        } else if (this.platform === 'win32') {
            return new WindowsScreenCapture();
        } else {
            return new GenericScreenCapture();
        }
    }

    /**
     * Get audio capture service for current platform
     */
    getAudioCaptureService() {
        if (this.platform === 'darwin') {
            return new MacOSAudioCapture();
        } else if (this.platform === 'win32') {
            return new WindowsAudioCapture();
        } else {
            return new GenericAudioCapture();
        }
    }

    /**
     * Apply liquid glass effects to window
     */
    applyLiquidGlass(window, options = {}) {
        if (!this.capabilities.liquidGlass || !this.liquidGlass) {
            logger.warn('Liquid glass not supported on this platform');
            return false;
        }

        try {
            const viewId = this.liquidGlass.addView(window.getNativeWindowHandle());
            if (viewId !== -1) {
                const variant = options.variant || this.liquidGlass.GlassMaterialVariant.bubbles;
                this.liquidGlass.unstable_setVariant(viewId, variant);
                
                if (options.scrim !== undefined) {
                    this.liquidGlass.unstable_setScrim(viewId, options.scrim);
                }
                
                if (options.subdued !== undefined) {
                    this.liquidGlass.unstable_setSubdued(viewId, options.subdued);
                }
                
                logger.info('Liquid glass applied to window (viewId: )');
                return true;
            }
        } catch (error) {
            logger.error('Error applying liquid glass:', { error });
        }
        
        return false;
    }

    /**
     * Get platform-specific window options
     */
    getWindowOptions(baseOptions = {}) {
        const platformOptions = { ...baseOptions };

        if (this.platform === 'darwin') {
            // macOS-specific options
            platformOptions.titleBarStyle = 'hiddenInset';
            platformOptions.vibrancy = 'ultra-dark';
            platformOptions.transparent = true;
        } else if (this.platform === 'win32') {
            // Windows-specific options
            platformOptions.transparent = true;
            platformOptions.frame = false;
        }

        return platformOptions;
    }

    /**
     * Initialize Windows notification system
     */
    initializeWindowsNotifications() {
        if (this.platform !== 'win32') return;
        
        try {
            // Check if notifications are supported
            if (Notification.isSupported()) {
                logger.info('[PlatformManager] Windows notifications supported');
                this.capabilities.systemNotifications = true;
            } else {
                logger.warn('Windows notifications not supported');
                this.capabilities.systemNotifications = false;
            }
        } catch (error) {
            logger.error('Error initializing Windows notifications:', { error });
            this.capabilities.systemNotifications = false;
        }
    }

    /**
     * Show platform-specific notification
     */
    showNotification(title, body, options = {}) {
        if (!this.capabilities.systemNotifications) {
            logger.warn('System notifications not supported');
            return false;
        }

        try {
            const notification = new Notification({
                title,
                body,
                icon: options.icon || path.join(__dirname, '../ui/assets/logo.png'),
                sound: options.sound !== false,
                silent: options.silent === true,
                urgency: options.urgency || 'normal',
                timeoutType: options.timeoutType || 'default',
                actions: options.actions || []
            });

            // Handle notification events
            notification.on('show', () => {
                logger.info('[PlatformManager] Notification shown:', title);
            });

            notification.on('click', () => {
                logger.info('[PlatformManager] Notification clicked:', title);
                if (options.onClick) options.onClick();
            });

            notification.on('close', () => {
                logger.info('[PlatformManager] Notification closed:', title);
                if (options.onClose) options.onClose();
            });

            notification.on('action', (event, index) => {
                logger.info('[PlatformManager] Notification action:', index);
                if (options.onAction) options.onAction(index);
            });

            // Show the notification
            notification.show();
            return true;
        } catch (error) {
            logger.error('Error showing notification:', { error });
            return false;
        }
    }

    /**
     * Show Windows-specific toast notification
     */
    showWindowsToast(title, body, options = {}) {
        if (this.platform !== 'win32') {
            return this.showNotification(title, body, options);
        }

        // Windows-specific toast features
        const toastOptions = {
            ...options,
            icon: options.icon || path.join(__dirname, '../ui/assets/logo.ico'),
            tag: options.tag || 'xerus-notification',
            renotify: options.renotify || false
        };

        return this.showNotification(title, body, toastOptions);
    }

    /**
     * Show macOS-specific notification
     */
    showMacOSNotification(title, body, options = {}) {
        if (this.platform !== 'darwin') {
            return this.showNotification(title, body, options);
        }

        // macOS-specific notification features
        const macOptions = {
            ...options,
            icon: options.icon || path.join(__dirname, '../ui/assets/logo.icns'),
            hasReply: options.hasReply || false,
            replyPlaceholder: options.replyPlaceholder || 'Reply...'
        };

        return this.showNotification(title, body, macOptions);
    }

    /**
     * Get platform information
     */
    getPlatformInfo() {
        return {
            platform: this.platform,
            version: os.release(),
            arch: os.arch(),
            capabilities: this.capabilities,
            liquidGlassSupported: this.capabilities.liquidGlass,
            notificationsSupported: this.capabilities.systemNotifications
        };
    }
}

/**
 * macOS Screen Capture Implementation
 */
class MacOSScreenCapture {
    async captureScreen(options = {}) {
        try {
            const quality = options.quality || 80;
            const height = options.height || 384;
            const tempPath = path.join(os.tmpdir(), `xerus-screenshot-${Date.now()}.jpg`);

            // Use native screencapture command
            await execFile('screencapture', ['-x', '-t', 'jpg', tempPath]);

            const imageBuffer = await fs.readFile(tempPath);
            await fs.unlink(tempPath);

            // Process with Sharp if available
            let processedBuffer = imageBuffer;
            if (this.hasSharp()) {
                try {
                    const sharp = require('sharp');
                    processedBuffer = await sharp(imageBuffer)
                        .resize({ height })
                        .jpeg({ quality })
                        .toBuffer();
                } catch (sharpError) {
                    logger.warn('Sharp processing failed, using original image');
                }
            }

            const base64 = processedBuffer.toString('base64');
            
            // Get metadata if Sharp is available
            let metadata = { width: null, height: null };
            if (this.hasSharp()) {
                try {
                    const sharp = require('sharp');
                    metadata = await sharp(processedBuffer).metadata();
                } catch (error) {
                    logger.warn('Could not get image metadata');
                }
            }

            return {
                success: true,
                base64,
                width: metadata.width,
                height: metadata.height,
                timestamp: Date.now()
            };
        } catch (error) {
            logger.error('Failed to capture screen:', { error });
            return {
                success: false,
                error: error.message
            };
        }
    }

    hasSharp() {
        try {
            require('sharp');
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Capture a specific area of the screen
     */
    async captureArea(area, options = {}) {
        try {
            const quality = options.quality || 80;
            const tempPath = path.join(os.tmpdir(), `xerus-area-${Date.now()}.jpg`);

            // Use native screencapture with region
            const { x, y, width, height } = area;
            await execFile('screencapture', [
                '-x', '-t', 'jpg', 
                '-R', `${x},${y},${width},${height}`,
                tempPath
            ]);

            const imageBuffer = await fs.readFile(tempPath);
            await fs.unlink(tempPath);

            // Process with Sharp if available
            let processedBuffer = imageBuffer;
            if (this.hasSharp()) {
                try {
                    const sharp = require('sharp');
                    processedBuffer = await sharp(imageBuffer)
                        .jpeg({ quality })
                        .toBuffer();
                } catch (sharpError) {
                    logger.warn('Sharp processing failed, using original image');
                }
            }

            const base64 = processedBuffer.toString('base64');
            
            // Get metadata
            let metadata = { width: width, height: height };
            if (this.hasSharp()) {
                try {
                    const sharp = require('sharp');
                    metadata = await sharp(processedBuffer).metadata();
                } catch (error) {
                    logger.warn('Could not get image metadata');
                }
            }

            return {
                success: true,
                base64,
                width: metadata.width,
                height: metadata.height,
                area: area,
                timestamp: Date.now()
            };
        } catch (error) {
            logger.error('Failed to capture area:', { error });
            return {
                success: false,
                error: error.message
            };
        }
    }
}

/**
 * Windows Screen Capture Implementation
 */
class WindowsScreenCapture {
    async captureScreen(options = {}) {
        try {
            const quality = options.quality || 70;
            const maxWidth = options.maxWidth || 1920;
            const maxHeight = options.maxHeight || 1080;

            const sources = await desktopCapturer.getSources({
                types: ['screen'],
                thumbnailSize: {
                    width: maxWidth,
                    height: maxHeight
                }
            });

            if (sources.length === 0) {
                throw new Error('No screen sources available');
            }

            const source = sources[0];
            const buffer = source.thumbnail.toJPEG(quality);
            const base64 = buffer.toString('base64');
            const size = source.thumbnail.getSize();

            return {
                success: true,
                base64,
                width: size.width,
                height: size.height,
                timestamp: Date.now()
            };
        } catch (error) {
            logger.error('Failed to capture screen:', { error });
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Capture a specific area of the screen (Windows implementation)
     */
    async captureArea(area, options = {}) {
        try {
            const quality = options.quality || 70;
            const maxWidth = 4096; // Higher resolution for area capture
            const maxHeight = 4096;

            const sources = await desktopCapturer.getSources({
                types: ['screen'],
                thumbnailSize: {
                    width: maxWidth,
                    height: maxHeight
                }
            });

            if (sources.length === 0) {
                throw new Error('No screen sources available');
            }

            const source = sources[0];
            const fullScreenBuffer = source.thumbnail.toJPEG(quality);
            const fullScreenSize = source.thumbnail.getSize();

            // Calculate scaling factors
            const scaleX = fullScreenSize.width / area.display.bounds.width;
            const scaleY = fullScreenSize.height / area.display.bounds.height;

            // Calculate area coordinates in captured image
            const captureX = Math.floor(area.x * scaleX);
            const captureY = Math.floor(area.y * scaleY);
            const captureWidth = Math.floor(area.width * scaleX);
            const captureHeight = Math.floor(area.height * scaleY);


            // Use Sharp for area cropping if available, fallback to Canvas cropping
            let croppedBuffer = fullScreenBuffer;
            let finalWidth = captureWidth;
            let finalHeight = captureHeight;
            
            if (this.hasSharp()) {
                try {
                    const sharp = require('sharp');
                    croppedBuffer = await sharp(fullScreenBuffer)
                        .extract({
                            left: captureX,
                            top: captureY,
                            width: captureWidth,
                            height: captureHeight
                        })
                        .jpeg({ quality })
                        .toBuffer();
                    logger.info(`[WindowsScreenCapture] Sharp cropping successful: ${captureWidth}x${captureHeight}`);
                } catch (sharpError) {
                    logger.warn('Sharp cropping failed, attempting nativeImage fallback:', sharpError.message);
                    const nativeImageCropResult = await this.cropWithNativeImage(fullScreenBuffer, captureX, captureY, captureWidth, captureHeight, quality);
                    if (nativeImageCropResult.success) {
                        croppedBuffer = nativeImageCropResult.buffer;
                        finalWidth = nativeImageCropResult.width;
                        finalHeight = nativeImageCropResult.height;
                    } else {
                        logger.error('NativeImage cropping also failed, using full screen');
                    }
                }
            } else {
                logger.info('Sharp not available, using nativeImage cropping fallback');
                const nativeImageCropResult = await this.cropWithNativeImage(fullScreenBuffer, captureX, captureY, captureWidth, captureHeight, quality);
                if (nativeImageCropResult.success) {
                    croppedBuffer = nativeImageCropResult.buffer;
                    finalWidth = nativeImageCropResult.width;
                    finalHeight = nativeImageCropResult.height;
                } else {
                    logger.error('NativeImage cropping failed, using full screen');
                }
            }

            const base64 = croppedBuffer.toString('base64');


            return {
                success: true,
                base64,
                width: finalWidth,
                height: finalHeight,
                area: area,
                timestamp: Date.now()
            };
        } catch (error) {
            logger.error('Failed to capture area:', { error });
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Fallback cropping using Electron's nativeImage when Sharp is not available
     */
    async cropWithNativeImage(imageBuffer, x, y, width, height, quality = 70) {
        try {
            // Create nativeImage from buffer
            const image = nativeImage.createFromBuffer(imageBuffer);
            
            // Verify image was created successfully
            if (!image || image.isEmpty()) {
                throw new Error('Failed to create image from buffer or image is empty');
            }
            
            const originalSize = image.getSize();
            
            // Verify we have valid original dimensions
            if (originalSize.width <= 0 || originalSize.height <= 0) {
                throw new Error(`Invalid original image size: ${originalSize.width}x${originalSize.height}`);
            }
            
            logger.info(`[WindowsScreenCapture] Original image size: ${originalSize.width}x${originalSize.height}, cropping at ${x},${y} with ${width}x${height}`);
            
            // Calculate the crop rectangle ensuring it's within bounds and using integers as required by Electron
            const cropX = Math.max(0, Math.min(Math.floor(x), originalSize.width - 1));
            const cropY = Math.max(0, Math.min(Math.floor(y), originalSize.height - 1));
            const cropWidth = Math.min(Math.floor(width), originalSize.width - cropX);
            const cropHeight = Math.min(Math.floor(height), originalSize.height - cropY);
            
            // Ensure we have valid dimensions
            if (cropWidth <= 0 || cropHeight <= 0) {
                throw new Error(`Invalid crop dimensions: ${cropWidth}x${cropHeight} at ${cropX},${cropY}`);
            }
            
            // Rectangle structure as required by Electron (all integers)
            const cropRect = {
                x: cropX,
                y: cropY,
                width: cropWidth,
                height: cropHeight
            };
            
            logger.info(`[WindowsScreenCapture] Calculated crop rectangle:`, cropRect);
            
            // Crop the image
            const croppedImage = image.crop(cropRect);
            const croppedSize = croppedImage.getSize();
            
            // Convert to JPEG buffer
            const croppedBuffer = croppedImage.toJPEG(quality);
            
            logger.info(`[WindowsScreenCapture] Native image cropping successful: ${croppedSize.width}x${croppedSize.height}`);
            return {
                success: true,
                buffer: croppedBuffer,
                width: croppedSize.width,
                height: croppedSize.height
            };
        } catch (error) {
            logger.error('Native image cropping failed:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    hasSharp() {
        try {
            require('sharp');
            return true;
        } catch (error) {
            return false;
        }
    }
}

/**
 * Generic Screen Capture Implementation (fallback)
 */
class GenericScreenCapture {
    async captureScreen(options = {}) {
        try {
            const sources = await desktopCapturer.getSources({
                types: ['screen'],
                thumbnailSize: {
                    width: 1920,
                    height: 1080
                }
            });

            if (sources.length === 0) {
                throw new Error('No screen sources available');
            }

            const source = sources[0];
            const buffer = source.thumbnail.toJPEG(70);
            const base64 = buffer.toString('base64');
            const size = source.thumbnail.getSize();

            return {
                success: true,
                base64,
                width: size.width,
                height: size.height,
                timestamp: Date.now()
            };
        } catch (error) {
            logger.error('Failed to capture screen:', { error });
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Capture a specific area of the screen (Generic implementation)
     */
    async captureArea(area, options = {}) {
        try {
            const sources = await desktopCapturer.getSources({
                types: ['screen'],
                thumbnailSize: {
                    width: 1920,
                    height: 1080
                }
            });

            if (sources.length === 0) {
                throw new Error('No screen sources available');
            }

            const source = sources[0];
            const buffer = source.thumbnail.toJPEG(70);
            const base64 = buffer.toString('base64');
            const size = source.thumbnail.getSize();

            // For generic implementation, return full screen
            // Area cropping would require Sharp or Canvas
            return {
                success: true,
                base64,
                width: size.width,
                height: size.height,
                area: area,
                timestamp: Date.now(),
                note: 'Generic implementation returns full screen'
            };
        } catch (error) {
            logger.error('Failed to capture area:', { error });
            return {
                success: false,
                error: error.message
            };
        }
    }
}

/**
 * Audio Capture Classes (placeholder implementations)
 */
class MacOSAudioCapture {
    async startCapture() {
        logger.info('[MacOSAudioCapture] Starting audio capture');
        return { success: true };
    }

    async stopCapture() {
        logger.info('[MacOSAudioCapture] Stopping audio capture');
        return { success: true };
    }
}

class WindowsAudioCapture {
    async startCapture() {
        logger.info('[WindowsAudioCapture] Starting audio capture');
        return { success: true };
    }

    async stopCapture() {
        logger.info('[WindowsAudioCapture] Stopping audio capture');
        return { success: true };
    }
}

class GenericAudioCapture {
    async startCapture() {
        logger.info('[GenericAudioCapture] Starting audio capture');
        return { success: true };
    }

    async stopCapture() {
        logger.info('[GenericAudioCapture] Stopping audio capture');
        return { success: true };
    }
}

// Export singleton instance
const platformManager = new PlatformManager();

module.exports = {
    platformManager,
    PlatformManager,
    MacOSScreenCapture,
    WindowsScreenCapture,
    GenericScreenCapture
};