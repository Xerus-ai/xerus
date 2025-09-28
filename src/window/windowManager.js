const { BrowserWindow, globalShortcut, screen, app, shell } = require('electron');
const WindowLayoutManager = require('./windowLayoutManager');
const SmoothMovementManager = require('./smoothMovementManager');
const path = require('node:path');
const os = require('os');
const fs = require('fs');
const shortcutsService = require('../features/shortcuts/shortcutsService');
const internalBridge = require('../bridge/internalBridge');
const permissionRepository = require('../common/repositories/permission');
const { themeService } = require('../domains/ui');

/* ────────────────[ ENHANCED GLASS SYSTEM ]─────────────── */
const { platformManager } = require('../main/platform-manager');
const { createLogger } = require('../common/services/logger.js');

const logger = createLogger('WindowManager');

let liquidGlass;
let shouldUseLiquidGlass = platformManager.capabilities.liquidGlass;

if (shouldUseLiquidGlass) {
    try {
        liquidGlass = require('electron-liquid-glass');
        logger.info('[WindowManager] Liquid glass support initialized via platform manager');
    } catch (e) {
        logger.warn('Could not load optional dependency "electron-liquid-glass". The feature will be disabled.');
        shouldUseLiquidGlass = false;
    }
}

logger.info('Platform:');
logger.info('Liquid glass supported:');
logger.info('Platform capabilities:', { capabilities: platformManager.capabilities });

/* ────────────────[ LIQUID GLASS API ]─────────────── */
const liquidGlassAPI = {
    async addView() {
        if (!shouldUseLiquidGlass || !liquidGlass) {
            return { success: false, error: 'Liquid glass not supported' };
        }

        try {
            const mainWindow = getMainWindow();
            if (!mainWindow) {
                return { success: false, error: 'Main window not found' };
            }

            const viewId = liquidGlass.addView(mainWindow.getNativeWindowHandle());
            if (viewId !== -1) {
                return { success: true, viewId };
            } else {
                return { success: false, error: 'Failed to create liquid glass view' };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    async removeView(viewId) {
        if (!shouldUseLiquidGlass || !liquidGlass) {
            return { success: false, error: 'Liquid glass not supported' };
        }

        try {
            liquidGlass.removeView(viewId);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    async setVariant(viewId, variant) {
        if (!shouldUseLiquidGlass || !liquidGlass) {
            return { success: false, error: 'Liquid glass not supported' };
        }

        try {
            const variantMap = {
                'default': liquidGlass.GlassMaterialVariant.bubbles,
                'bubbles': liquidGlass.GlassMaterialVariant.bubbles,
                'ultra-dark': liquidGlass.GlassMaterialVariant.ultra_dark,
                'light': liquidGlass.GlassMaterialVariant.light,
                'vibrant': liquidGlass.GlassMaterialVariant.vibrant
            };

            const glassVariant = variantMap[variant] || liquidGlass.GlassMaterialVariant.bubbles;
            liquidGlass.unstable_setVariant(viewId, glassVariant);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    async setScrim(viewId, scrim) {
        if (!shouldUseLiquidGlass || !liquidGlass) {
            return { success: false, error: 'Liquid glass not supported' };
        }

        try {
            liquidGlass.unstable_setScrim(viewId, scrim);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    async setSubdued(viewId, subdued) {
        if (!shouldUseLiquidGlass || !liquidGlass) {
            return { success: false, error: 'Liquid glass not supported' };
        }

        try {
            liquidGlass.unstable_setSubdued(viewId, subdued);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
};

function getMainWindow() {
    for (const [name, window] of windowPool.entries()) {
        if (name === 'main' || name === 'listen') {
            return window;
        }
    }
    return null;
}
/* ────────────────[ LIQUID GLASS API ]─────────────── */

let isContentProtectionOn = true;
let lastVisibleWindows = new Set(['header']);

let currentHeaderState = 'apikey';
const windowPool = new Map();

let settingsHideTimer = null;
let agentSelectorHideTimer = null;


let layoutManager = null;
function updateLayout() {
    if (layoutManager) {
        layoutManager.updateLayout();
    }
}
let movementManager = null;

/**
 * @param {BrowserWindow} win
 * @param {number} from
 * @param {number} to
 * @param {number} duration
 * @param {Function=} onComplete 
 */
function fadeWindow(win, from, to, duration = 250, onComplete) {
  if (!win || win.isDestroyed()) return;

  const FPS   = 60;
  const steps       = Math.max(1, Math.round(duration / (1000 / FPS)));
  let   currentStep = 0;

  win.setOpacity(from);

  const timer = setInterval(() => {
    if (win.isDestroyed()) { clearInterval(timer); return; }

    currentStep += 1;
    const progress = currentStep / steps;
    const eased    = progress < 1
      ? 1 - Math.pow(1 - progress, 3)
      : 1;

    win.setOpacity(from + (to - from) * eased);

    if (currentStep >= steps) {
      clearInterval(timer);
      win.setOpacity(to);
      onComplete && onComplete();
    }
  }, 1000 / FPS);
}

const showSettingsWindow = () => {
    internalBridge.emit('window:requestVisibility', { name: 'settings', visible: true });
};

const hideSettingsWindow = () => {
    internalBridge.emit('window:requestVisibility', { name: 'settings', visible: false });
};

const cancelHideSettingsWindow = () => {
    internalBridge.emit('window:requestVisibility', { name: 'settings', visible: true });
};

const showAgentSelectorWindow = () => {
    internalBridge.emit('window:requestVisibility', { name: 'agent-selector', visible: true });
};

const hideAgentSelectorWindow = () => {
    internalBridge.emit('window:requestVisibility', { name: 'agent-selector', visible: false });
};

const cancelHideAgentSelectorWindow = () => {
    internalBridge.emit('window:requestVisibility', { name: 'agent-selector', visible: true });
};


function setupWindowController(windowPool, layoutManager, movementManager) {
    // Initialize theme service with window pool reference
    themeService.setWindowPool(windowPool);
    
    internalBridge.on('window:requestVisibility', ({ name, visible }) => {
        handleWindowVisibilityRequest(windowPool, layoutManager, movementManager, name, visible);
    });
    internalBridge.on('window:requestToggleAllWindowsVisibility', ({ targetVisibility }) => {
        changeAllWindowsVisibility(windowPool, targetVisibility);
    });
    internalBridge.on('window:moveToDisplay', ({ displayId }) => {
        movementManager.moveToDisplay(displayId);
    });
    internalBridge.on('window:moveToEdge', ({ direction }) => {
        movementManager.moveToEdge(direction);
    });
    internalBridge.on('window:moveStep', ({ direction }) => {
        movementManager.moveStep(direction);
    });
}

function changeAllWindowsVisibility(windowPool, targetVisibility) {
    const header = windowPool.get('header');
    if (!header) return;

    if (typeof targetVisibility === 'boolean' &&
        header.isVisible() === targetVisibility) {
        return;
    }
  
    if (header.isVisible()) {
      lastVisibleWindows.clear();
  
      windowPool.forEach((win, name) => {
        if (win && !win.isDestroyed() && win.isVisible()) {
          lastVisibleWindows.add(name);
        }
      });
  
      lastVisibleWindows.forEach(name => {
        if (name === 'header') return;
        const win = windowPool.get(name);
        if (win && !win.isDestroyed()) win.hide();
      });
      header.hide();
  
      return;
    }
  
    lastVisibleWindows.forEach(name => {
      const win = windowPool.get(name);
      if (win && !win.isDestroyed())
        win.show();
    });
  }

/**
 * 
 * @param {Map<string, BrowserWindow>} windowPool
 * @param {WindowLayoutManager} layoutManager 
 * @param {SmoothMovementManager} movementManager
 * @param {'listen' | 'ask' | 'settings' | 'shortcut-settings'} name 
 * @param {boolean} shouldBeVisible 
 */
async function handleWindowVisibilityRequest(windowPool, layoutManager, movementManager, name, shouldBeVisible) {
    logger.info('Request: set window visibility to', { name, shouldBeVisible });
    let win = windowPool.get(name);

    if (!win || win.isDestroyed()) {
        logger.info(`Window '${name}' not found, creating it...`);
        // Call createFeatureWindows with the header and the specific window name
        const header = windowPool.get('header');
        if (header && !header.isDestroyed()) {
            createFeatureWindows(header, [name]);
            // Get the newly created window
            win = windowPool.get(name);
            if (!win) {
                logger.error(`Failed to create window '${name}'`);
                return;
            }
            logger.info(`Window '${name}' created successfully`);
        } else {
            logger.error(`Cannot create window '${name}' - header window not found`);
            return;
        }
    }

    if (name !== 'settings' && name !== 'agent-selector') {
        const isCurrentlyVisible = win.isVisible();
        if (isCurrentlyVisible === shouldBeVisible) {
            logger.info(`Window '${name}' is already in the desired state.`);
            return;
        }
    }

    const disableClicks = (selectedWindow) => {
        for (const [name, win] of windowPool) {
            if (win !== selectedWindow && !win.isDestroyed()) {
                win.setIgnoreMouseEvents(true, { forward: true });
            }
        }
    };

    const restoreClicks = () => {
        for (const [, win] of windowPool) {
            if (!win.isDestroyed()) win.setIgnoreMouseEvents(false);
        }
    };

    if (name === 'settings') {
        if (shouldBeVisible) {
            // Cancel any pending hide operations
            if (settingsHideTimer) {
                clearTimeout(settingsHideTimer);
                settingsHideTimer = null;
            }
            const position = layoutManager.calculateSettingsWindowPosition();
            if (position) {
                win.setBounds(position);
                win.__lockedByButton = true;
                win.show();
                win.moveTop();
                win.setAlwaysOnTop(true);
            } else {
                logger.warn('Could not calculate settings window position.');
            }
        } else {
            // Hide after a delay
            if (settingsHideTimer) {
                clearTimeout(settingsHideTimer);
            }
            settingsHideTimer = setTimeout(() => {
                if (win && !win.isDestroyed()) {
                    win.setAlwaysOnTop(false);
                    win.hide();
                }
                settingsHideTimer = null;
            }, 200);

            win.__lockedByButton = false;
        }
        return;
    }

    if (name === 'agent-selector') {
        if (shouldBeVisible) {
            // Cancel any pending hide operations
            if (agentSelectorHideTimer) {
                clearTimeout(agentSelectorHideTimer);
                agentSelectorHideTimer = null;
            }
            const position = layoutManager.calculateAgentSelectorWindowPosition();
            if (position) {
                win.setBounds(position);
                win.__lockedByButton = true;
                win.show();
                win.moveTop();
                win.setAlwaysOnTop(true);
            } else {
                // Fallback: use current bounds and just show the window
                logger.warn('Could not calculate agent selector window position, using fallback position');
                const currentBounds = win.getBounds();
                
                // Ensure window has minimum viable bounds
                if (currentBounds.width < 200 || currentBounds.height < 150) {
                    win.setBounds({ x: currentBounds.x, y: currentBounds.y, width: 320, height: 280 });
                }
                
                win.__lockedByButton = true;
                win.show();
                win.moveTop();
                win.setAlwaysOnTop(true);
            }
        } else {
            // Hide after a delay
            if (agentSelectorHideTimer) {
                clearTimeout(agentSelectorHideTimer);
            }
            agentSelectorHideTimer = setTimeout(() => {
                if (win && !win.isDestroyed()) {
                    win.setAlwaysOnTop(false);
                    win.hide();
                }
                agentSelectorHideTimer = null;
            }, 200);

            win.__lockedByButton = false;
        }
        return;
    }

    if (name === 'shortcut-settings') {
        if (shouldBeVisible) {
            layoutManager.positionShortcutSettingsWindow();
            if (process.platform === 'darwin') {
                win.setAlwaysOnTop(true, 'screen-saver');
            } else {
                win.setAlwaysOnTop(true);
            }
            // globalShortcut.unregisterAll();
            disableClicks(win);
            win.show();
        } else {
            if (process.platform === 'darwin') {
                win.setAlwaysOnTop(false, 'screen-saver');
            } else {
                win.setAlwaysOnTop(false);
            }
            restoreClicks();
            win.hide();
        }
        return;
    }

    if (name === 'listen' || name === 'ask') {
        const otherName = name === 'listen' ? 'ask' : 'listen';
        const otherWin = windowPool.get(otherName);
        const isOtherWinVisible = otherWin && !otherWin.isDestroyed() && otherWin.isVisible();

        const ANIM_OFFSET_X = 100; 
        const ANIM_OFFSET_Y = 20; 

        if (shouldBeVisible) {
            win.setOpacity(0);

            if (name === 'listen') {
                if (!isOtherWinVisible) {
                    const targets = layoutManager.getTargetBoundsForFeatureWindows({ listen: true, ask: false });
                    if (!targets.listen) return;

                    const startPos = { x: targets.listen.x - ANIM_OFFSET_X, y: targets.listen.y };
                    win.setBounds(startPos);
                    win.show();
                    fadeWindow(win, 0, 1);
                    movementManager.animateWindow(win, targets.listen.x, targets.listen.y);

                } else {
                    const targets = layoutManager.getTargetBoundsForFeatureWindows({ listen: true, ask: true });
                    if (!targets.listen || !targets.ask) return;

                    const startListenPos = { x: targets.listen.x - ANIM_OFFSET_X, y: targets.listen.y };
                    win.setBounds(startListenPos);

                    win.show();
                    fadeWindow(win, 0, 1);
                    movementManager.animateWindow(otherWin, targets.ask.x, targets.ask.y);
                    movementManager.animateWindow(win, targets.listen.x, targets.listen.y);
                }
            } else if (name === 'ask') {
                if (!isOtherWinVisible) {
                    const targets = layoutManager.getTargetBoundsForFeatureWindows({ listen: false, ask: true });
                    if (!targets.ask) return;

                    const startPos = { x: targets.ask.x, y: targets.ask.y - ANIM_OFFSET_Y };
                    win.setBounds(startPos);
                    win.show();
                    fadeWindow(win, 0, 1);
                    movementManager.animateWindow(win, targets.ask.x, targets.ask.y);

                } else {
                    const targets = layoutManager.getTargetBoundsForFeatureWindows({ listen: true, ask: true });
                    if (!targets.listen || !targets.ask) return;

                    const startAskPos = { x: targets.ask.x, y: targets.ask.y - ANIM_OFFSET_Y };
                    win.setBounds(startAskPos);

                    win.show();
                    fadeWindow(win, 0, 1);
                    movementManager.animateWindow(otherWin, targets.listen.x, targets.listen.y);
                    movementManager.animateWindow(win, targets.ask.x, targets.ask.y);
                }
            }
        } else {
            const currentBounds = win.getBounds();
            fadeWindow(
                win, 1, 0, undefined,
                () => win.hide()
            );
            if (name === 'listen') {
                if (!isOtherWinVisible) {
                    const targetX = currentBounds.x - ANIM_OFFSET_X;
                    movementManager.animateWindow(win, targetX, currentBounds.y);
                } else {
                    const targetX = currentBounds.x - currentBounds.width;
                    movementManager.animateWindow(win, targetX, currentBounds.y);
                }
            } else if (name === 'ask') {
                if (!isOtherWinVisible) {
                    const targetY = currentBounds.y - ANIM_OFFSET_Y;
                    movementManager.animateWindow(win, currentBounds.x, targetY);
                } else {
                    const targetAskY = currentBounds.y - ANIM_OFFSET_Y;
                    movementManager.animateWindow(win, currentBounds.x, targetAskY);

                    const targets = layoutManager.getTargetBoundsForFeatureWindows({ listen: true, ask: false });
                    if (targets.listen) {
                        movementManager.animateWindow(otherWin, targets.listen.x, targets.listen.y);
                    }
                }
            }
        }
    }
}


const setContentProtection = (status) => {
    isContentProtectionOn = status;
    logger.info('Content protection toggled to:');
    windowPool.forEach(win => {
        if (win && !win.isDestroyed()) {
            win.setContentProtection(isContentProtectionOn);
        }
    });
};

const getContentProtectionStatus = () => isContentProtectionOn;

const toggleContentProtection = () => {
    const newStatus = !getContentProtectionStatus();
    setContentProtection(newStatus);
    return newStatus;
};

const resizeHeaderWindow = ({ width, height }) => {
    const header = windowPool.get('header');
    if (header) {
      logger.info('Resize request: x');
      
      if (movementManager && movementManager.isAnimating) {
        logger.info('[WindowManager] Skipping resize during animation');
        return { success: false, error: 'Cannot resize during animation' };
      }

      const currentBounds = header.getBounds();
      logger.info('Current bounds: x at (, )');
      
      if (currentBounds.width === width && currentBounds.height === height) {
        logger.info('[WindowManager] Already at target size, skipping resize');
        return { success: true };
      }

      const wasResizable = header.isResizable();
      if (!wasResizable) {
        header.setResizable(true);
      }

      const centerX = currentBounds.x + currentBounds.width / 2;
      const newX = Math.round(centerX - width / 2);

      const display = getCurrentDisplay(header);
      const { x: workAreaX, width: workAreaWidth } = display.workArea;
      
      const clampedX = Math.max(workAreaX, Math.min(workAreaX + workAreaWidth - width, newX));

      header.setBounds({ x: clampedX, y: currentBounds.y, width, height });

      if (!wasResizable) {
        header.setResizable(false);
      }
      
      if (updateLayout) {
        updateLayout();
      }
      
      return { success: true };
    }
    return { success: false, error: 'Header window not found' };
};


const openLoginPage = () => {
    const webUrl = process.env.XERUS_WEB_URL || 'http://localhost:3000';
    const personalizeUrl = `${webUrl}/personalize?desktop=true`;
    shell.openExternal(personalizeUrl);
    logger.info('Opening personalization page:', personalizeUrl);
};

const moveWindowStep = (direction) => {
    if (movementManager) {
        movementManager.moveStep(direction);
    }
};


function createFeatureWindows(header, namesToCreate) {
    // if (windowPool.has('listen')) return;

    const commonChildOptions = {
        parent: header,
        show: false,
        frame: false,
        transparent: true,
        vibrancy: false,
        hasShadow: false,
        skipTaskbar: true,
        hiddenInMissionControl: true,
        resizable: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, '../preload.js'),
        },
    };

    const createFeatureWindow = (name) => {
        if (windowPool.has(name)) return;
        
        switch (name) {
            case 'listen': {
                const listen = new BrowserWindow({
                    ...commonChildOptions, width:400,minWidth:400,maxWidth:900,
                    maxHeight:900,
                });
                listen.setContentProtection(isContentProtectionOn);
                listen.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true});
                if (process.platform === 'darwin') {
                    listen.setWindowButtonVisibility(false);
                }
                const listenLoadOptions = { query: { view: 'listen' } };
                if (!shouldUseLiquidGlass) {
                    listen.loadFile(path.join(__dirname, '../ui/app/content.html'), listenLoadOptions);
                }
                else {
                    listenLoadOptions.query.glass = 'true';
                    listen.loadFile(path.join(__dirname, '../ui/app/content.html'), listenLoadOptions);
                    listen.webContents.once('did-finish-load', () => {
                        const viewId = liquidGlass.addView(listen.getNativeWindowHandle());
                        if (viewId !== -1) {
                            liquidGlass.unstable_setVariant(viewId, liquidGlass.GlassMaterialVariant.bubbles);
                            // liquidGlass.unstable_setScrim(viewId, 1);
                            // liquidGlass.unstable_setSubdued(viewId, 1);
                        }
                    });
                }
                if (!app.isPackaged && process.env.OPEN_DEV_TOOLS === 'true') {
                    listen.webContents.openDevTools({ mode: 'detach' });
                }
                windowPool.set('listen', listen);
                // Apply current theme to the listen window
                applyThemeToNewWindow(listen, 'listen');
                break;
            }

            // ask
            case 'ask': {
                const ask = new BrowserWindow({ 
                    ...commonChildOptions, 
                    width: 600,
                    height: 400, // Reasonable initial height - will be adjusted by renderer
                    minHeight: 200,
                    maxHeight: 900
                });
                ask.setContentProtection(isContentProtectionOn);
                ask.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true});
                if (process.platform === 'darwin') {
                    ask.setWindowButtonVisibility(false);
                }
                const askLoadOptions = { query: { view: 'ask' } };
                if (!shouldUseLiquidGlass) {
                    ask.loadFile(path.join(__dirname, '../ui/app/content.html'), askLoadOptions);
                }
                else {
                    askLoadOptions.query.glass = 'true';
                    ask.loadFile(path.join(__dirname, '../ui/app/content.html'), askLoadOptions);
                    ask.webContents.once('did-finish-load', () => {
                        const viewId = liquidGlass.addView(ask.getNativeWindowHandle());
                        if (viewId !== -1) {
                            liquidGlass.unstable_setVariant(viewId, liquidGlass.GlassMaterialVariant.bubbles);
                            // liquidGlass.unstable_setScrim(viewId, 1);
                            // liquidGlass.unstable_setSubdued(viewId, 1);
                        }
                    });
                }
                
                // Open DevTools in development
                if (!app.isPackaged && process.env.OPEN_DEV_TOOLS === 'true') {
                    ask.webContents.openDevTools({ mode: 'detach' });
                }
                windowPool.set('ask', ask);
                // Apply current theme to the ask window
                applyThemeToNewWindow(ask, 'ask');
                break;
            }

            // settings
            case 'settings': {
                // Use larger window size for liquid glass mode to accommodate horizontal layout
                const windowOptions = shouldUseLiquidGlass 
                    ? { ...commonChildOptions, width: 800, height: 80, maxHeight: 120, minHeight: 60, parent: undefined }
                    : { ...commonChildOptions, width: 240, maxHeight: 400, parent: undefined };
                
                const settings = new BrowserWindow(windowOptions);
                settings.setContentProtection(isContentProtectionOn);
                settings.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true});
                if (process.platform === 'darwin') {
                    settings.setWindowButtonVisibility(false);
                }
                const settingsLoadOptions = { query: { view: 'settings' } };
                if (!shouldUseLiquidGlass) {
                    settings.loadFile(path.join(__dirname,'../ui/app/content.html'), settingsLoadOptions)
                        .catch(console.error);
                }
                else {
                    settingsLoadOptions.query.glass = 'true';
                    settings.loadFile(path.join(__dirname,'../ui/app/content.html'), settingsLoadOptions)
                        .catch(console.error);
                    settings.webContents.once('did-finish-load', () => {
                        const viewId = liquidGlass.addView(settings.getNativeWindowHandle());
                        if (viewId !== -1) {
                            liquidGlass.unstable_setVariant(viewId, liquidGlass.GlassMaterialVariant.bubbles);
                            // liquidGlass.unstable_setScrim(viewId, 1);
                            // liquidGlass.unstable_setSubdued(viewId, 1);
                        }
                    });
                }
                windowPool.set('settings', settings);  
                // Apply current theme to the settings window
                applyThemeToNewWindow(settings, 'settings');

                if (!app.isPackaged && process.env.OPEN_DEV_TOOLS === 'true') {
                    settings.webContents.openDevTools({ mode: 'detach' });
                }
                break;
            }

            // agent-selector
            case 'agent-selector': {
                // Ensure window has proper initial position near header
                const header = windowPool.get('header');
                let initialX = 100, initialY = 100; // Default fallback position
                
                if (header && !header.isDestroyed()) {
                    const headerBounds = header.getBounds();
                    initialX = headerBounds.x + 50;
                    initialY = headerBounds.y + headerBounds.height + 10;
                }
                
                const windowOptions = shouldUseLiquidGlass 
                    ? { ...commonChildOptions, width: 400, height: 400, maxHeight: 500, minHeight: 300, parent: undefined, x: initialX, y: initialY, show: false }
                    : { ...commonChildOptions, width: 320, height: 380, maxHeight: 500, minHeight: 300, parent: undefined, x: initialX, y: initialY, show: false };
                
                const agentSelector = new BrowserWindow(windowOptions);
                agentSelector.setContentProtection(isContentProtectionOn);
                agentSelector.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true});
                if (process.platform === 'darwin') {
                    agentSelector.setWindowButtonVisibility(false);
                }
                const agentSelectorLoadOptions = { query: { view: 'agent-selector' } };
                if (!shouldUseLiquidGlass) {
                    agentSelector.loadFile(path.join(__dirname,'../ui/app/content.html'), agentSelectorLoadOptions)
                        .then(() => {
                        })
                        .catch((error) => {
                            console.error('[WindowManager] Failed to load agent selector window content:', error);
                        });
                }
                else {
                    agentSelectorLoadOptions.query.glass = 'true';
                    agentSelector.loadFile(path.join(__dirname,'../ui/app/content.html'), agentSelectorLoadOptions)
                        .then(() => {
                        })
                        .catch((error) => {
                            console.error('[WindowManager] Failed to load agent selector window content (glass mode):', error);
                        });
                    agentSelector.webContents.once('did-finish-load', () => {
                        const viewId = liquidGlass.addView(agentSelector.getNativeWindowHandle());
                        if (viewId !== -1) {
                            liquidGlass.unstable_setVariant(viewId, liquidGlass.GlassMaterialVariant.bubbles);
                        }
                    });
                }
                windowPool.set('agent-selector', agentSelector);  
                // Apply current theme to the agent selector window
                applyThemeToNewWindow(agentSelector, 'agent-selector');

                if (!app.isPackaged && process.env.OPEN_DEV_TOOLS === 'true') {
                    agentSelector.webContents.openDevTools({ mode: 'detach' });
                }
                break;
            }

            case 'shortcut-settings': {
                const shortcutEditor = new BrowserWindow({
                    ...commonChildOptions,
                    width: 353,
                    height: 720,
                    modal: false,
                    parent: undefined,
                    alwaysOnTop: true,
                    titleBarOverlay: false,
                });

                shortcutEditor.setContentProtection(isContentProtectionOn);
                shortcutEditor.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true});
                if (process.platform === 'darwin') {
                    shortcutEditor.setWindowButtonVisibility(false);
                }

                const loadOptions = { query: { view: 'shortcut-settings' } };
                if (!shouldUseLiquidGlass) {
                    shortcutEditor.loadFile(path.join(__dirname, '../ui/app/content.html'), loadOptions);
                } else {
                    loadOptions.query.glass = 'true';
                    shortcutEditor.loadFile(path.join(__dirname, '../ui/app/content.html'), loadOptions);
                    shortcutEditor.webContents.once('did-finish-load', () => {
                        const viewId = liquidGlass.addView(shortcutEditor.getNativeWindowHandle());
                        if (viewId !== -1) {
                            liquidGlass.unstable_setVariant(viewId, liquidGlass.GlassMaterialVariant.bubbles);
                        }
                    });
                }

                windowPool.set('shortcut-settings', shortcutEditor);
                // Apply current theme to the shortcut editor window
                applyThemeToNewWindow(shortcutEditor, 'shortcut-settings');
                if (!app.isPackaged && process.env.OPEN_DEV_TOOLS === 'true') {
                    shortcutEditor.webContents.openDevTools({ mode: 'detach' });
                }
                break;
            }
        }
    };

    if (Array.isArray(namesToCreate)) {
        namesToCreate.forEach(name => createFeatureWindow(name));
    } else if (typeof namesToCreate === 'string') {
        createFeatureWindow(namesToCreate);
    } else {
        createFeatureWindow('listen');
        createFeatureWindow('ask');
        createFeatureWindow('settings');
        createFeatureWindow('shortcut-settings');
    }
}

function destroyFeatureWindows() {
    const featureWindows = ['listen','ask','settings','agent-selector','shortcut-settings'];
    if (settingsHideTimer) {
        clearTimeout(settingsHideTimer);
        settingsHideTimer = null;
    }
    if (agentSelectorHideTimer) {
        clearTimeout(agentSelectorHideTimer);
        agentSelectorHideTimer = null;
    }
    featureWindows.forEach(name=>{
        const win = windowPool.get(name);
        if (win && !win.isDestroyed()) win.destroy();
        windowPool.delete(name);
    });
}



function getCurrentDisplay(window) {
    if (!window || window.isDestroyed()) return screen.getPrimaryDisplay();

    const windowBounds = window.getBounds();
    const windowCenter = {
        x: windowBounds.x + windowBounds.width / 2,
        y: windowBounds.y + windowBounds.height / 2,
    };

    return screen.getDisplayNearestPoint(windowCenter);
}

function getDisplayById(displayId) {
    const displays = screen.getAllDisplays();
    return displays.find(d => d.id === displayId) || screen.getPrimaryDisplay();
}






function createWindows() {
    const HEADER_HEIGHT        = 64;
    const DEFAULT_WINDOW_WIDTH = 520;

    const primaryDisplay = screen.getPrimaryDisplay();
    const { y: workAreaY, width: screenWidth } = primaryDisplay.workArea;

    const initialX = Math.round((screenWidth - DEFAULT_WINDOW_WIDTH) / 2);
    const initialY = workAreaY + 21;
    movementManager = new SmoothMovementManager(windowPool, getDisplayById, getCurrentDisplay, updateLayout);
    
    const header = new BrowserWindow({
        width: DEFAULT_WINDOW_WIDTH,
        height: HEADER_HEIGHT,
        x: initialX,
        y: initialY,
        frame: false,
        transparent: true,
        vibrancy: false,
        hasShadow: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        hiddenInMissionControl: true,
        resizable: false,
        focusable: true,
        acceptFirstMouse: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, '../preload.js'),
            backgroundThrottling: false,
            webSecurity: false, // Required for app functionality - CSP handles security in HTML files
            enableRemoteModule: false,
            // Ensure proper rendering and prevent pixelation
            experimentalFeatures: false,
        },
        // Prevent pixelation and ensure proper rendering
        useContentSize: true,
        disableAutoHideCursor: true,
    });
    if (process.platform === 'darwin') {
        header.setWindowButtonVisibility(false);
    }
    const headerLoadOptions = {};
    // Disable glass mode for header - use light theme only
    header.loadFile(path.join(__dirname, '../ui/app/header.html'), headerLoadOptions);
    
    if (shouldUseLiquidGlass) {
        // Keep liquid glass effects but without glass UI theme
        header.webContents.once('did-finish-load', () => {
            const viewId = liquidGlass.addView(header.getNativeWindowHandle());
            if (viewId !== -1) {
                liquidGlass.unstable_setVariant(viewId, liquidGlass.GlassMaterialVariant.bubbles);
                // liquidGlass.unstable_setScrim(viewId, 1); 
                // liquidGlass.unstable_setSubdued(viewId, 1);
            }
        });
    }
    windowPool.set('header', header);
    header.on('moved', updateLayout);
    // Apply current theme to the header window
    applyThemeToNewWindow(header, 'header');
    layoutManager = new WindowLayoutManager(windowPool);

    header.webContents.once('dom-ready', () => {
        shortcutsService.initialize(windowPool);
        shortcutsService.registerShortcuts();
    });

    setupIpcHandlers(movementManager);
    setupWindowController(windowPool, layoutManager, movementManager);

    if (currentHeaderState === 'main') {
        createFeatureWindows(header, ['listen', 'ask', 'settings', 'shortcut-settings']);
    }

    header.setContentProtection(isContentProtectionOn);
    header.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    
    // Open DevTools in development
    if (!app.isPackaged && process.env.OPEN_DEV_TOOLS === 'true') {
        header.webContents.openDevTools({ mode: 'detach' });
    }

    header.on('focus', () => {
        logger.info('[WindowManager] Header gained focus');
    });

    header.on('blur', () => {
        logger.info('[WindowManager] Header lost focus');
    });

    header.webContents.on('before-input-event', (event, input) => {
        if (input.type === 'mouseDown') {
            const target = input.target;
            if (target && (target.includes('input') || target.includes('apikey'))) {
                header.focus();
            }
        }
    });

    header.on('resize', () => {
        logger.info('[WindowManager] Header resize event triggered');
        updateLayout();
    });

    return windowPool;
}

function setupIpcHandlers(movementManager) {
    // quit-application handler moved to windowBridge.js to avoid duplication
    screen.on('display-added', (event, newDisplay) => {
        logger.info('[Display] New display added:', newDisplay.id);
    });

    screen.on('display-removed', (event, oldDisplay) => {
        logger.info('[Display] Display removed:', oldDisplay.id);
        const header = windowPool.get('header');
        if (header && getCurrentDisplay(header).id === oldDisplay.id) {
            const primaryDisplay = screen.getPrimaryDisplay();
            movementManager.moveToDisplay(primaryDisplay.id);
        }
    });

    screen.on('display-metrics-changed', (event, display, changedMetrics) => {
        // logger.info('[Display] Display metrics changed:', display.id, changedMetrics);
        updateLayout();
    });
}

const handleHeaderStateChanged = (state) => {
    logger.info('Header state changed to:');
    currentHeaderState = state;

    if (state === 'main') {
        createFeatureWindows(windowPool.get('header'));
    } else {         // 'apikey' | 'permission'
        destroyFeatureWindows();
    }
    internalBridge.emit('reregister-shortcuts');
};

const handleHeaderAnimationFinished = (state) => {
    const header = windowPool.get('header');
    if (!header || header.isDestroyed()) return;

    if (state === 'hidden') {
        header.hide();
        logger.info('[WindowManager] Header hidden after animation.');
    } else if (state === 'visible') {
        logger.info('[WindowManager] Header shown after animation.');
        updateLayout();
    }
};

const getHeaderPosition = () => {
    const header = windowPool.get('header');
    if (header) {
        const [x, y] = header.getPosition();
        return { x, y };
    }
    return { x: 0, y: 0 };
};

const moveHeader = (newX, newY) => {
    const header = windowPool.get('header');
    if (header) {
        const currentY = newY !== undefined ? newY : header.getBounds().y;
        header.setPosition(newX, currentY, false);
        updateLayout();
    }
};

const moveHeaderTo = (newX, newY) => {
    const header = windowPool.get('header');
    if (header) {
        const targetDisplay = screen.getDisplayNearestPoint({ x: newX, y: newY });
        const { x: workAreaX, y: workAreaY, width, height } = targetDisplay.workArea;
        const headerBounds = header.getBounds();

        let clampedX = newX;
        let clampedY = newY;
        
        if (newX < workAreaX) {
            clampedX = workAreaX;
        } else if (newX + headerBounds.width > workAreaX + width) {
            clampedX = workAreaX + width - headerBounds.width;
        }
        
        if (newY < workAreaY) {
            clampedY = workAreaY;
        } else if (newY + headerBounds.height > workAreaY + height) {
            clampedY = workAreaY + height - headerBounds.height;
        }

        header.setPosition(clampedX, clampedY, false);
        updateLayout();
    }
};

const adjustWindowHeight = (sender, targetHeight) => {
    const senderWindow = BrowserWindow.fromWebContents(sender);
    
    if (senderWindow) {
        // DPI Scaling Fix - Get display information
        const display = screen.getPrimaryDisplay();
        const scaleFactor = display.scaleFactor;
        
        const currentBounds = senderWindow.getBounds();
        const currentContentBounds = senderWindow.getContentBounds();
        
        // Ensure window is ready for resize
        if (senderWindow.isMinimized()) {
            senderWindow.restore();
        }
        
        const wasResizable = senderWindow.isResizable();
        
        if (!wasResizable) {
            senderWindow.setResizable(true);
        }

        const minHeight = senderWindow.getMinimumSize()[1];
        const maxHeight = senderWindow.getMaximumSize()[1];
        
        let adjustedHeight;
        if (maxHeight === 0) {
            adjustedHeight = Math.max(minHeight, targetHeight);
        } else {
            adjustedHeight = Math.max(minHeight, Math.min(maxHeight, targetHeight));
        }
        
        // Try multiple resize approaches to fix DPI issues
        // Approach 1: Use setContentSize (recommended for DPI issues)
        senderWindow.setContentSize(currentContentBounds.width, adjustedHeight);
        
        // Small delay then try setSize as fallback
        setTimeout(() => {
            const dpiAdjustedHeight = Math.round(adjustedHeight);
            const dpiAdjustedWidth = Math.round(currentBounds.width);
            senderWindow.setSize(dpiAdjustedWidth, dpiAdjustedHeight, false);
            
            if (!wasResizable) {
                senderWindow.setResizable(false);
            }

            updateLayout();
        }, 100);
    }
};


/* ────────────────[ THEME MANAGEMENT ]─────────────── */
const getCurrentTheme = () => {
    return themeService.getCurrentTheme();
};

const setTheme = async (theme) => {
    logger.info(`[WindowManager] Setting theme to: ${theme}`);
    const result = await themeService.setTheme(theme);
    
    if (result.success) {
        logger.info(`[WindowManager] Theme successfully changed to: ${theme}`);
    } else {
        logger.error(`[WindowManager] Failed to set theme: ${result.error}`);
    }
    
    return result;
};

const toggleTheme = async () => {
    logger.info('[WindowManager] Toggling theme');
    const result = await themeService.toggleTheme();
    
    if (result.success) {
        logger.info(`[WindowManager] Theme toggled from ${result.previousTheme} to ${result.theme}`);
    } else {
        logger.error(`[WindowManager] Failed to toggle theme: ${result.error}`);
    }
    
    return result;
};

// Apply theme to newly created windows
const applyThemeToNewWindow = (window, windowName) => {
    if (themeService) {
        themeService.applyThemeToWindow(window, windowName);
    }
};

/* ────────────────[ CLICK-THROUGH MANAGEMENT ]─────────────── */
let clickThroughEnabled = false;

const toggleClickThrough = () => {
    clickThroughEnabled = !clickThroughEnabled;
    logger.info(`[WindowManager] Click-through ${clickThroughEnabled ? 'enabled' : 'disabled'}`);
    
    // Apply click-through to all windows
    const windowNames = ['header', 'settings', 'ask', 'listen'];
    windowNames.forEach(windowName => {
        const window = windowPool.get(windowName);
        if (window && !window.isDestroyed()) {
            window.setIgnoreMouseEvents(clickThroughEnabled);
            logger.info(`[WindowManager] Set click-through for ${windowName}: ${clickThroughEnabled}`);
        }
    });
    
    // Broadcast click-through state change to all windows
    windowPool.forEach((window) => {
        if (window && !window.isDestroyed()) {
            window.webContents.send('click-through-changed', clickThroughEnabled);
        }
    });
    
    return {
        success: true,
        enabled: clickThroughEnabled
    };
};

const getClickThroughStatus = () => {
    return {
        success: true,
        enabled: clickThroughEnabled
    };
};

/* ────────────────[ WINDOW OPACITY MANAGEMENT ]─────────────── */
const setWindowOpacity = (opacity) => {
    // Clamp opacity between 0.1 and 1.0
    const clampedOpacity = Math.max(0.1, Math.min(1.0, opacity));
    
    logger.info(`[WindowManager] Setting window opacity to: ${clampedOpacity}`);
    
    // Apply different opacity strategies per window type
    const windowNames = ['header', 'settings', 'ask', 'listen'];
    windowNames.forEach(windowName => {
        const window = windowPool.get(windowName);
        if (window && !window.isDestroyed()) {
            // For header: use CSS-based glassmorphism, keep window at full opacity for content readability
            if (windowName === 'header') {
                // Don't change window opacity for header - use CSS-based background opacity instead
                logger.info(`[WindowManager] Header using CSS-based opacity: ${clampedOpacity}`);
            } else {
                // For other windows: use traditional window opacity
                window.setOpacity(clampedOpacity);
                logger.info(`[WindowManager] Set window opacity for ${windowName}: ${clampedOpacity}`);
            }
        }
    });
    
    // Broadcast opacity change to all windows for CSS-based adjustments
    windowPool.forEach((window) => {
        if (window && !window.isDestroyed()) {
            window.webContents.send('window-opacity-changed', clampedOpacity);
        }
    });
    
    return {
        success: true,
        opacity: clampedOpacity
    };
};


module.exports = {
    updateLayout,
    createWindows,
    windowPool,
    toggleContentProtection,
    resizeHeaderWindow,
    getContentProtectionStatus,
    showSettingsWindow,
    hideSettingsWindow,
    cancelHideSettingsWindow,
    showAgentSelectorWindow,
    hideAgentSelectorWindow,
    cancelHideAgentSelectorWindow,
    openLoginPage,
    moveWindowStep,
    handleHeaderStateChanged,
    handleHeaderAnimationFinished,
    getHeaderPosition,
    moveHeader,
    moveHeaderTo,
    adjustWindowHeight,
    setWindowOpacity,
    toggleClickThrough,
    getClickThroughStatus,
    getCurrentTheme,
    setTheme,
    toggleTheme,
    applyThemeToNewWindow,
    liquidGlassAPI,
    getPlatformInfo: () => platformManager.getPlatformInfo(),
};