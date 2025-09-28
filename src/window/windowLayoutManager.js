const { screen } = require('electron');

/**
 * 
 * @param {BrowserWindow} window 
 * @returns {Display}
 */
function getCurrentDisplay(window) {
    if (!window || window.isDestroyed()) return screen.getPrimaryDisplay();

    const windowBounds = window.getBounds();
    const windowCenter = {
        x: windowBounds.x + windowBounds.width / 2,
        y: windowBounds.y + windowBounds.height / 2,
    };

    return screen.getDisplayNearestPoint(windowCenter);
}

class WindowLayoutManager {
    /**
     * @param {Map<string, BrowserWindow>} windowPool - Map of windows to manage
     */
    constructor(windowPool) {
        this.windowPool = windowPool;
        this.isUpdating = false;
        this.PADDING = 80;
    }

    updateLayout() {
        if (this.isUpdating) return;
        this.isUpdating = true;

        setImmediate(() => {
            this.positionWindows();
            this.isUpdating = false;
        });
    }

    /**
     * 
     * @param {object} [visibilityOverride] - { listen: true, ask: true }
     * @returns {{listen: {x:number, y:number}|null, ask: {x:number, y:number}|null}}
     */
    getTargetBoundsForFeatureWindows(visibilityOverride = {}) {
        const header = this.windowPool.get('header');
        if (!header?.getBounds) return {};
 
        const headerBounds = header.getBounds();
        const display = getCurrentDisplay(header);
        const { width: screenWidth, height: screenHeight } = display.workAreaSize;
        const { x: workAreaX, y: workAreaY } = display.workArea;
 
        const ask = this.windowPool.get('ask');
        const listen = this.windowPool.get('listen');
 
        const askVis = visibilityOverride.ask !== undefined ?
            visibilityOverride.ask :
            (ask && ask.isVisible() && !ask.isDestroyed());
        const listenVis = visibilityOverride.listen !== undefined ?
            visibilityOverride.listen :
            (listen && listen.isVisible() && !listen.isDestroyed());
 
        if (!askVis && !listenVis) return {};
 
        const PAD = 8;
        const headerTopRel = headerBounds.y - workAreaY;
        const headerBottomRel = headerTopRel + headerBounds.height;
        const headerCenterXRel = headerBounds.x - workAreaX + headerBounds.width / 2;
        
        const relativeX = headerCenterXRel / screenWidth;
        const relativeY = (headerBounds.y - workAreaY) / screenHeight;
        const strategy = this.determineLayoutStrategy(headerBounds, screenWidth, screenHeight, relativeX, relativeY, workAreaX, workAreaY);
 
        const askB = ask ? ask.getBounds() : null;
        const listenB = listen ? listen.getBounds() : null;
 
        const result = { listen: null, ask: null };
 
        if (askVis && listenVis) {
            let askXRel = headerCenterXRel - (askB.width / 2);
            let listenXRel = askXRel - listenB.width - PAD;
 
            if (listenXRel < PAD) {
                listenXRel = PAD;
                askXRel = listenXRel + listenB.width + PAD;
            }
            if (askXRel + askB.width > screenWidth - PAD) {
                askXRel = screenWidth - PAD - askB.width;
                listenXRel = askXRel - listenB.width - PAD;
            }
            
            // [[Korean comment translated]] 'above'[Korean comment translated] [Korean comment translated] [Korean comment translated] [Korean comment translated], 'below'[Korean comment translated] [Korean comment translated] [Korean comment translated] [Korean comment translated]
            if (strategy.primary === 'above') {
                const windowBottomAbs = headerBounds.y - PAD;
                const askY = windowBottomAbs - askB.height;
                const listenY = windowBottomAbs - listenB.height;
                result.ask = { x: Math.round(askXRel + workAreaX), y: Math.round(askY) };
                result.listen = { x: Math.round(listenXRel + workAreaX), y: Math.round(listenY) };
            } else { // 'below'
                const yPos = headerBottomRel + PAD;
                const yAbs = yPos + workAreaY;
                result.ask = { x: Math.round(askXRel + workAreaX), y: Math.round(yAbs) };
                result.listen = { x: Math.round(listenXRel + workAreaX), y: Math.round(yAbs) };
            }
 
        } else { // [Korean comment translated] [Korean comment translated] [Korean comment translated] [Korean comment translated] [Korean comment translated] [Korean comment translated] [Korean comment translated] ([Korean comment translated] [Korean comment translated] Confirm)
            const winB = askVis ? askB : listenB;
            let xRel = headerCenterXRel - winB.width / 2;
            xRel = Math.max(PAD, Math.min(screenWidth - winB.width - PAD, xRel));

            let yPos;
            if (strategy.primary === 'above') {
                const windowBottomRel = headerTopRel - PAD;
                yPos = windowBottomRel - winB.height;
            } else { // 'below'
                yPos = headerBottomRel + PAD;
            }
            
            const abs = { x: Math.round(xRel + workAreaX), y: Math.round(yPos + workAreaY) };
            if (askVis) result.ask = abs;
            if (listenVis) result.listen = abs;
        }
        return result;
    }

    positionWindows() {
        const header = this.windowPool.get('header');
        if (!header?.getBounds) return;

        const headerBounds = header.getBounds();
        const display = getCurrentDisplay(header);
        const { width: screenWidth, height: screenHeight } = display.workAreaSize;
        const { x: workAreaX, y: workAreaY } = display.workArea;

        const headerCenterX = headerBounds.x - workAreaX + headerBounds.width / 2;
        const headerCenterY = headerBounds.y - workAreaY + headerBounds.height / 2;

        const relativeX = headerCenterX / screenWidth;
        const relativeY = headerCenterY / screenHeight;

        const strategy = this.determineLayoutStrategy(headerBounds, screenWidth, screenHeight, relativeX, relativeY, workAreaX, workAreaY);

        this.positionFeatureWindows(headerBounds, strategy, screenWidth, screenHeight, workAreaX, workAreaY);
        const settings = this.windowPool.get('settings');
        if (settings && !settings.isDestroyed() && settings.isVisible()) {
            const settingPos = this.calculateSettingsWindowPosition();
            if (settingPos) {
                const { width, height } = settings.getBounds();
                settings.setBounds({ x: settingPos.x, y: settingPos.y, width, height });
            }
        }
        
        const agentSelector = this.windowPool.get('agent-selector');
        if (agentSelector && !agentSelector.isDestroyed() && agentSelector.isVisible()) {
            const agentSelectorPos = this.calculateAgentSelectorWindowPosition();
            if (agentSelectorPos) {
                const { width, height } = agentSelector.getBounds();
                agentSelector.setBounds({ x: agentSelectorPos.x, y: agentSelectorPos.y, width, height });
            }
        }
    }

    /**
     * 
     * @returns {{name: string, primary: string, secondary: string}}
     */
    determineLayoutStrategy(headerBounds, screenWidth, screenHeight, relativeX, relativeY, workAreaX, workAreaY) {
        const headerRelX = headerBounds.x - workAreaX;
        const headerRelY = headerBounds.y - workAreaY;

        const spaceBelow = screenHeight - (headerRelY + headerBounds.height);
        const spaceAbove = headerRelY;
        const spaceLeft = headerRelX;
        const spaceRight = screenWidth - (headerRelX + headerBounds.width);

        if (spaceBelow >= 400) {
            return { name: 'below', primary: 'below', secondary: relativeX < 0.5 ? 'right' : 'left' };
        } else if (spaceAbove >= 400) {
            return { name: 'above', primary: 'above', secondary: relativeX < 0.5 ? 'right' : 'left' };
        } else if (relativeX < 0.3 && spaceRight >= 800) {
            return { name: 'right-side', primary: 'right', secondary: spaceBelow > spaceAbove ? 'below' : 'above' };
        } else if (relativeX > 0.7 && spaceLeft >= 800) {
            return { name: 'left-side', primary: 'left', secondary: spaceBelow > spaceAbove ? 'below' : 'above' };
        } else {
            return { name: 'adaptive', primary: spaceBelow > spaceAbove ? 'below' : 'above', secondary: spaceRight > spaceLeft ? 'right' : 'left' };
        }
    }


    positionFeatureWindows(headerBounds, strategy, screenWidth, screenHeight, workAreaX, workAreaY) {
        const ask = this.windowPool.get('ask');
        const listen = this.windowPool.get('listen');
        const askVisible = ask && ask.isVisible() && !ask.isDestroyed();
        const listenVisible = listen && listen.isVisible() && !listen.isDestroyed();

        if (!askVisible && !listenVisible) return;

        const PAD = 8;
        const headerTopRel = headerBounds.y - workAreaY;
        const headerBottomRel = headerTopRel + headerBounds.height;
        const headerCenterXRel = headerBounds.x - workAreaX + headerBounds.width / 2;
        
        let askBounds = askVisible ? ask.getBounds() : null;
        let listenBounds = listenVisible ? listen.getBounds() : null;

        if (askVisible && listenVisible) {
            let askXRel = headerCenterXRel - (askBounds.width / 2);
            let listenXRel = askXRel - listenBounds.width - PAD;

            if (listenXRel < PAD) {
                listenXRel = PAD;
                askXRel = listenXRel + listenBounds.width + PAD;
            }
            if (askXRel + askBounds.width > screenWidth - PAD) {
                askXRel = screenWidth - PAD - askBounds.width;
                listenXRel = askXRel - listenBounds.width - PAD;
            }

            // [[Korean comment translated]] 'above'[Korean comment translated] [Korean comment translated] [Korean comment translated] [Korean comment translated], 'below'[Korean comment translated] [Korean comment translated] [Korean comment translated] [Korean comment translated]
            if (strategy.primary === 'above') {
                const windowBottomAbs = headerBounds.y - PAD;
                const askY = windowBottomAbs - askBounds.height;
                const listenY = windowBottomAbs - listenBounds.height;
                ask.setBounds({ x: Math.round(askXRel + workAreaX), y: Math.round(askY), width: askBounds.width, height: askBounds.height });
                listen.setBounds({ x: Math.round(listenXRel + workAreaX), y: Math.round(listenY), width: listenBounds.width, height: listenBounds.height });
            } else { // 'below'
                const yPos = headerBottomRel + PAD;
                const yAbs = yPos + workAreaY;
                ask.setBounds({ x: Math.round(askXRel + workAreaX), y: Math.round(yAbs), width: askBounds.width, height: askBounds.height });
                listen.setBounds({ x: Math.round(listenXRel + workAreaX), y: Math.round(yAbs), width: listenBounds.width, height: listenBounds.height });
            }
        
        } else { // [Korean comment translated] [Korean comment translated] [Korean comment translated] [Korean comment translated] [Korean comment translated] [Korean comment translated] [Korean comment translated] ([Korean comment translated] [Korean comment translated] Confirm)
            const win = askVisible ? ask : listen;
            const winBounds = askVisible ? askBounds : listenBounds;
            let xRel = headerCenterXRel - winBounds.width / 2;
            xRel = Math.max(PAD, Math.min(screenWidth - winBounds.width - PAD, xRel));

            let yPos;
            if (strategy.primary === 'above') {
                const windowBottomRel = headerTopRel - PAD;
                yPos = windowBottomRel - winBounds.height;
            } else { // 'below'
                yPos = headerBottomRel + PAD;
            }
            const yAbs = yPos + workAreaY;

            win.setBounds({ x: Math.round(xRel + workAreaX), y: Math.round(yAbs), width: winBounds.width, height: winBounds.height });
        }
    }

    /**
     * @returns {{x: number, y: number} | null}
     */
    calculateSettingsWindowPosition() {
        const header = this.windowPool.get('header');
        const settings = this.windowPool.get('settings');

        if (!header || header.isDestroyed() || !settings || settings.isDestroyed()) {
            return null;
        }

        const headerBounds = header.getBounds();
        const settingsBounds = settings.getBounds();
        const display = getCurrentDisplay(header);
        const { x: workAreaX, y: workAreaY, width: screenWidth, height: screenHeight } = display.workArea;

        const PAD = 5;
        const buttonPadding = 170;

        const x = headerBounds.x + headerBounds.width - settingsBounds.width + buttonPadding;
        const y = headerBounds.y + headerBounds.height + PAD;

        const clampedX = Math.max(workAreaX + 10, Math.min(workAreaX + screenWidth - settingsBounds.width - 10, x));
        const clampedY = Math.max(workAreaY + 10, Math.min(workAreaY + screenHeight - settingsBounds.height - 10, y));

        return { x: Math.round(clampedX), y: Math.round(clampedY) };
    }

    calculateAgentSelectorWindowPosition() {
        const header = this.windowPool.get('header');
        const agentSelector = this.windowPool.get('agent-selector');

        if (!header || header.isDestroyed() || !agentSelector || agentSelector.isDestroyed()) {
            return null;
        }

        const headerBounds = header.getBounds();
        const agentSelectorBounds = agentSelector.getBounds();
        const display = getCurrentDisplay(header);
        const { x: workAreaX, y: workAreaY, width: screenWidth, height: screenHeight } = display.workArea;


        const PAD = 5;
        // Position below the agent dropdown button area (right side of header)
        const agentButtonPadding = 120; // Agent dropdown is on the right side

        const x = headerBounds.x + headerBounds.width - agentSelectorBounds.width - agentButtonPadding;
        const y = headerBounds.y + headerBounds.height + PAD;

        const clampedX = Math.max(workAreaX + 10, Math.min(workAreaX + screenWidth - agentSelectorBounds.width - 10, x));
        const clampedY = Math.max(workAreaY + 10, Math.min(workAreaY + screenHeight - agentSelectorBounds.height - 10, y));

        const finalPosition = { x: Math.round(clampedX), y: Math.round(clampedY) };

        return finalPosition;
    }

    positionShortcutSettingsWindow() {
        const header = this.windowPool.get('header');
        const shortcutSettings = this.windowPool.get('shortcut-settings');

        if (!header || header.isDestroyed() || !shortcutSettings || shortcutSettings.isDestroyed()) {
            return;
        }

        const headerBounds = header.getBounds();
        const shortcutBounds = shortcutSettings.getBounds();
        const display = getCurrentDisplay(header);
        const { workArea } = display;

        let newX = Math.round(headerBounds.x + (headerBounds.width / 2) - (shortcutBounds.width / 2));
        let newY = Math.round(headerBounds.y);

        newX = Math.max(workArea.x, Math.min(newX, workArea.x + workArea.width - shortcutBounds.width));
        newY = Math.max(workArea.y, Math.min(newY, workArea.y + workArea.height - shortcutBounds.height));

        shortcutSettings.setBounds({ x: newX, y: newY, width: shortcutBounds.width, height: shortcutBounds.height });
    }
    
    /**
     * @param {Rectangle} bounds1
     * @param {Rectangle} bounds2
     * @returns {boolean}
     */
    boundsOverlap(bounds1, bounds2) {
        const margin = 10;
        return !(
            bounds1.x + bounds1.width + margin < bounds2.x ||
            bounds2.x + bounds2.width + margin < bounds1.x ||
            bounds1.y + bounds1.height + margin < bounds2.y ||
            bounds2.y + bounds2.height + margin < bounds1.y
        );
    }
}

module.exports = WindowLayoutManager;