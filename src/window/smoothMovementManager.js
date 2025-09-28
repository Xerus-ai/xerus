const { screen } = require('electron');
const { createLogger } = require('../common/services/logger.js');

const logger = createLogger('SmoothMovementManager');

class SmoothMovementManager {
    constructor(windowPool, getDisplayById, getCurrentDisplay, updateLayout) {
        this.windowPool = windowPool;
        this.getDisplayById = getDisplayById;
        this.getCurrentDisplay = getCurrentDisplay;
        this.updateLayout = updateLayout;
        this.stepSize = 80;
        this.animationDuration = 300;
        this.headerPosition = { x: 0, y: 0 };
        this.isAnimating = false;
        this.hiddenPosition = null;
        this.lastVisiblePosition = null;
        this.currentDisplayId = null;
        this.animationFrameId = null;
    }

    /**
     * @param {BrowserWindow} win
     * @returns {boolean}
     */
    _isWindowValid(win) {
        if (!win || win.isDestroyed()) {
            if (this.isAnimating) {
                logger.warn('Window destroyed mid-animation. Halting.');
                this.isAnimating = false;
                if (this.animationFrameId) {
                    clearTimeout(this.animationFrameId);
                    this.animationFrameId = null;
                }
            }
            return false;
        }
        return true;
    }

    moveToDisplay(displayId) {
        const header = this.windowPool.get('header');
        if (!this._isWindowValid(header) || !header.isVisible() || this.isAnimating) return;

        const targetDisplay = this.getDisplayById(displayId);
        if (!targetDisplay) return;

        const currentBounds = header.getBounds();
        const currentDisplay = this.getCurrentDisplay(header);

        if (currentDisplay.id === targetDisplay.id) return;

        const relativeX = (currentBounds.x - currentDisplay.workArea.x) / currentDisplay.workAreaSize.width;
        const relativeY = (currentBounds.y - currentDisplay.workArea.y) / currentDisplay.workAreaSize.height;
        const targetX = targetDisplay.workArea.x + targetDisplay.workAreaSize.width * relativeX;
        const targetY = targetDisplay.workArea.y + targetDisplay.workAreaSize.height * relativeY;

        const finalX = Math.max(targetDisplay.workArea.x, Math.min(targetDisplay.workArea.x + targetDisplay.workAreaSize.width - currentBounds.width, targetX));
        const finalY = Math.max(targetDisplay.workArea.y, Math.min(targetDisplay.workArea.y + targetDisplay.workAreaSize.height - currentBounds.height, targetY));

        this.headerPosition = { x: currentBounds.x, y: currentBounds.y };
        this.animateToPosition(header, finalX, finalY);
        this.currentDisplayId = targetDisplay.id;
    }

    hideToEdge(edge, callback, { instant = false } = {}) {
        const header = this.windowPool.get('header');
        if (!header || header.isDestroyed()) {
            if (typeof callback === 'function') callback();
            return;
        }
      
        const { x, y } = header.getBounds();
        this.lastVisiblePosition = { x, y };
        this.hiddenPosition     = { edge };
      
        if (instant) {
            header.hide();
            if (typeof callback === 'function') callback();
            return;
        }

        header.webContents.send('window-hide-animation');
      
        setTimeout(() => {
            if (!header.isDestroyed()) header.hide();
            if (typeof callback === 'function') callback();
        }, 5);
    }
      
    showFromEdge(callback) {
        const header = this.windowPool.get('header');
        if (!header || header.isDestroyed()) {
            if (typeof callback === 'function') callback();
            return;
        }
      
        // [Korean comment translated] [Korean comment translated] [Korean comment translated] [Korean comment translated] [Korean comment translated]
        if (this.lastVisiblePosition) {
            header.setPosition(
                this.lastVisiblePosition.x,
                this.lastVisiblePosition.y,
                false   // animate: false
            );
        }
      
        header.show();
        header.webContents.send('window-show-animation');
      
        // [Korean comment translated] Status Initialize
        this.hiddenPosition      = null;
        this.lastVisiblePosition = null;
      
        if (typeof callback === 'function') callback();
    }

    moveStep(direction) {
        const header = this.windowPool.get('header');
        if (!this._isWindowValid(header) || !header.isVisible() || this.isAnimating) return;

        const currentBounds = header.getBounds();
        this.headerPosition = { x: currentBounds.x, y: currentBounds.y };
        let targetX = this.headerPosition.x;
        let targetY = this.headerPosition.y;

        logger.info('Moving  from (, )');

        const windowSize = {
            width: currentBounds.width,
            height: currentBounds.height
        };

        switch (direction) {
            case 'left': targetX -= this.stepSize; break;
            case 'right': targetX += this.stepSize; break;
            case 'up': targetY -= this.stepSize; break;
            case 'down': targetY += this.stepSize; break;
            default: return;
        }

        // Find the display that contains or is nearest to the target position
        const nearestDisplay = screen.getDisplayNearestPoint({ x: targetX, y: targetY });
        const { x: workAreaX, y: workAreaY, width: workAreaWidth, height: workAreaHeight } = nearestDisplay.workArea;
        
        // Only clamp if the target position would actually go out of bounds
        let clampedX = targetX;
        let clampedY = targetY;
        
        // Check horizontal bounds
        if (targetX < workAreaX) {
            clampedX = workAreaX;
        } else if (targetX + currentBounds.width > workAreaX + workAreaWidth) {
            clampedX = workAreaX + workAreaWidth - currentBounds.width;
        }
        
        // Check vertical bounds
        if (targetY < workAreaY) {
            clampedY = workAreaY;
            logger.info('Clamped Y to top edge:');
        } else if (targetY + currentBounds.height > workAreaY + workAreaHeight) {
            clampedY = workAreaY + workAreaHeight - currentBounds.height;
            logger.info('Clamped Y to bottom edge:');
        }

        logger.info('Final position: (, ), Work area: , x');

        // Only move if there's an actual change in position
        if (clampedX === this.headerPosition.x && clampedY === this.headerPosition.y) {
            logger.info('No position change, skipping animation');
            return;
        }
        
        this.animateToPosition(header, clampedX, clampedY, windowSize);
    }

    /**
     * [Fix[KR]] [KR] [KR] [Korean text] [Korean text] [Korean text].
     * Complete [KR] [KR] [KR] Option[KR] Support[KR].
     * @param {BrowserWindow} win - [Korean text] [KR]
     * @param {number} targetX - [KR] X [KR]
     * @param {number} targetY - [KR] Y [KR]
     * @param {object} [options] - Add Option
     * @param {object} [options.sizeOverride] - [Korean text] [KR] [KR] [KR] Size
     * @param {function} [options.onComplete] - [Korean text] Complete [KR] Execute[KR] [KR]
     * @param {number} [options.duration] - [Korean text] [KR] [KR] (ms)
     */
    animateWindow(win, targetX, targetY, options = {}) {
        if (!this._isWindowValid(win)) {
            if (options.onComplete) options.onComplete();
            return;
        }

        const { sizeOverride, onComplete, duration: animDuration } = options;
        const start = win.getBounds();
        const startTime = Date.now();
        const duration = animDuration || this.animationDuration;
        const { width, height } = sizeOverride || start;

        const step = () => {
            // [Korean comment translated] [Korean comment translated] [Korean comment translated] [Korean comment translated] [Korean comment translated] [Korean comment translated] Execute[Korean comment translated] Abort
            if (!this._isWindowValid(win)) {
                if (onComplete) onComplete();
                return;
            }

            const p = Math.min((Date.now() - startTime) / duration, 1);
            const eased = 1 - Math.pow(1 - p, 3); // ease-out-cubic
            const x = start.x + (targetX - start.x) * eased;
            const y = start.y + (targetY - start.y) * eased;

            win.setBounds({ x: Math.round(x), y: Math.round(y), width, height });

            if (p < 1) {
                setTimeout(step, 8); // requestAnimationFrame [Korean comment translated] setTimeout[Korean comment translated] [Korean comment translated] Process
            } else {
                // [Korean comment translated] Shutdown
                this.updateLayout(); // [Korean comment translated] [Korean comment translated]
                if (onComplete) {
                    onComplete(); // Complete [Korean comment translated] Execute
                }
            }
        };
        step();
    }

    animateToPosition(header, targetX, targetY, windowSize) {
        if (!this._isWindowValid(header)) return;
        
        this.isAnimating = true;
        const startX = this.headerPosition.x;
        const startY = this.headerPosition.y;
        const startTime = Date.now();

        if (!Number.isFinite(targetX) || !Number.isFinite(targetY) || !Number.isFinite(startX) || !Number.isFinite(startY)) {
            this.isAnimating = false;
            return;
        }

        const animate = () => {
            if (!this._isWindowValid(header)) return;

            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / this.animationDuration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            const currentX = startX + (targetX - startX) * eased;
            const currentY = startY + (targetY - startY) * eased;

            if (!Number.isFinite(currentX) || !Number.isFinite(currentY)) {
                this.isAnimating = false;
                return;
            }

            if (!this._isWindowValid(header)) return;
            const { width, height } = windowSize || header.getBounds();
            header.setBounds({
                x: Math.round(currentX),
                y: Math.round(currentY),
                width,
                height
            });

            if (progress < 1) {
                this.animationFrameId = setTimeout(animate, 8);
            } else {
                this.animationFrameId = null;
                this.isAnimating = false;
                if (Number.isFinite(targetX) && Number.isFinite(targetY)) {
                    if (!this._isWindowValid(header)) return;
                    header.setPosition(Math.round(targetX), Math.round(targetY));
                    // Update header position to the actual final position
                    this.headerPosition = { x: Math.round(targetX), y: Math.round(targetY) };
                }
                this.updateLayout();
            }
        };
        animate();
    }

    moveToEdge(direction) {
        const header = this.windowPool.get('header');
        if (!this._isWindowValid(header) || !header.isVisible() || this.isAnimating) return;

        const display = this.getCurrentDisplay(header);
        const { width, height } = display.workAreaSize;
        const { x: workAreaX, y: workAreaY } = display.workArea;
        const currentBounds = header.getBounds();
        
        const windowSize = {
            width: currentBounds.width,
            height: currentBounds.height
        };

        let targetX = currentBounds.x;
        let targetY = currentBounds.y;

        switch (direction) {
            case 'left': 
                targetX = workAreaX; 
                break;
            case 'right': 
                targetX = workAreaX + width - windowSize.width; 
                break;
            case 'up': 
                targetY = workAreaY; 
                break;
            case 'down': 
                targetY = workAreaY + height - windowSize.height; 
                break;
        }

        header.setBounds({
            x: Math.round(targetX),
            y: Math.round(targetY),
            width: windowSize.width,
            height: windowSize.height
        });

        this.headerPosition = { x: targetX, y: targetY };
        this.updateLayout();
    }

    destroy() {
        if (this.animationFrameId) {
            clearTimeout(this.animationFrameId);
            this.animationFrameId = null;
        }
        this.isAnimating = false;
        logger.info('[Movement] Manager destroyed');
    }
}

module.exports = SmoothMovementManager;
