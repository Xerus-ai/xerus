const { globalShortcut, screen } = require('electron');
const shortcutsRepository = require('./repositories');
const internalBridge = require('../../bridge/internalBridge');
const askService = require('../ask/askService');
const { createLogger } = require('../../common/services/logger.js');

const logger = createLogger('ShortcutsService');


class ShortcutsService {
    constructor() {
        this.lastVisibleWindows = new Set(['header']);
        this.windowPool = null;
        this.allWindowVisibility = true;
    }

    initialize(windowPool) {
        this.windowPool = windowPool;
        internalBridge.on('reregister-shortcuts', () => {
            logger.info('[ShortcutsService] Reregistering shortcuts due to header state change.');
            this.registerShortcuts();
        });
        logger.info('[ShortcutsService] Initialized with dependencies and event listener.');
    }

    async openShortcutSettingsWindow () {
        const keybinds = await this.loadKeybinds();
        const shortcutWin = this.windowPool.get('shortcut-settings');
        shortcutWin.webContents.send('shortcut:loadShortcuts', keybinds);

        globalShortcut.unregisterAll();
        internalBridge.emit('window:requestVisibility', { name: 'shortcut-settings', visible: true });
        logger.info('[ShortcutsService] Shortcut settings window opened.');
        return { success: true };
    }

    async closeShortcutSettingsWindow () {
        await this.registerShortcuts();
        internalBridge.emit('window:requestVisibility', { name: 'shortcut-settings', visible: false });
        logger.info('[ShortcutsService] Shortcut settings window closed.');
        return { success: true };
    }

    async handleSaveShortcuts(newKeybinds) {
        try {
            await this.saveKeybinds(newKeybinds);
            await this.closeShortcutSettingsWindow();
            return { success: true };
        } catch (error) {
            logger.error('Error occurred', { error  });
            await this.closeShortcutSettingsWindow();
            return { success: false, error: error.message };
        }
    }

    async handleRestoreDefaults() {
        const defaults = this.getDefaultKeybinds();
        return defaults;
    }

    getDefaultKeybinds() {
        const isMac = process.platform === 'darwin';
        return {
            moveUp: isMac ? 'Cmd+Up' : 'Ctrl+Up',
            moveDown: isMac ? 'Cmd+Down' : 'Ctrl+Down',
            moveLeft: isMac ? 'Cmd+Left' : 'Ctrl+Left',
            moveRight: isMac ? 'Cmd+Right' : 'Ctrl+Right',
            toggleVisibility: isMac ? 'Cmd+\\' : 'Ctrl+\\',
            toggleClickThrough: isMac ? 'Cmd+M' : 'Ctrl+M',
            nextStep: isMac ? 'Cmd+Enter' : 'Ctrl+Enter',
            manualScreenshot: isMac ? 'Cmd+Shift+S' : 'Ctrl+Shift+S',
            previousResponse: isMac ? 'Cmd+[' : 'Ctrl+[',
            nextResponse: isMac ? 'Cmd+]' : 'Ctrl+]',
            scrollUp: isMac ? 'Cmd+Shift+Up' : 'Ctrl+Shift+Up',
            scrollDown: isMac ? 'Cmd+Shift+Down' : 'Ctrl+Shift+Down',
        };
    }

    async loadKeybinds() {
        let keybindsArray = await shortcutsRepository.getAllKeybinds();

        if (!keybindsArray || keybindsArray.length === 0) {
            logger.info('No keybinds found. Loading defaults.');
            const defaults = this.getDefaultKeybinds();
            await this.saveKeybinds(defaults); 
            return defaults;
        }

        const keybinds = {};
        keybindsArray.forEach(k => {
            keybinds[k.action] = k.accelerator;
        });

        const defaults = this.getDefaultKeybinds();
        let needsUpdate = false;
        for (const action in defaults) {
            if (!keybinds[action]) {
                keybinds[action] = defaults[action];
                needsUpdate = true;
            }
        }

        if (needsUpdate) {
            logger.info('[Shortcuts] Updating missing keybinds with defaults.');
            await this.saveKeybinds(keybinds);
        }

        return keybinds;
    }

    async saveKeybinds(newKeybinds) {
        const keybindsToSave = [];
        for (const action in newKeybinds) {
            if (Object.prototype.hasOwnProperty.call(newKeybinds, action)) {
                keybindsToSave.push({
                    action: action,
                    accelerator: newKeybinds[action],
                });
            }
        }
        await shortcutsRepository.upsertKeybinds(keybindsToSave);
        logger.info('Saved keybinds.');
    }

    async toggleAllWindowsVisibility() {
        const targetVisibility = !this.allWindowVisibility;
        internalBridge.emit('window:requestToggleAllWindowsVisibility', {
            targetVisibility: targetVisibility
        });

        if (this.allWindowVisibility) {
            await this.registerShortcuts(true);
        } else {
            await this.registerShortcuts();
        }

        this.allWindowVisibility = !this.allWindowVisibility;
    }

    async registerShortcuts(registerOnlyToggleVisibility = false) {
        if (!this.windowPool) {
            logger.error('Service not initialized. Cannot register shortcuts.');
            return;
        }
        const keybinds = await this.loadKeybinds();
        globalShortcut.unregisterAll();
        
        const header = this.windowPool.get('header');
        const mainWindow = header;

        const sendToRenderer = (channel, ...args) => {
            this.windowPool.forEach(win => {
                if (win && !win.isDestroyed()) {
                    try {
                        win.webContents.send(channel, ...args);
                    } catch (e) {
                        // Ignore errors for destroyed windows
                    }
                }
            });
        };
        
        sendToRenderer('shortcuts-updated', keybinds);

        if (registerOnlyToggleVisibility) {
            if (keybinds.toggleVisibility) {
                globalShortcut.register(keybinds.toggleVisibility, () => this.toggleAllWindowsVisibility());
            }
            logger.info('[Shortcuts] registerOnlyToggleVisibility, only toggleVisibility shortcut is registered.');
            return;
        }

        // --- Hardcoded shortcuts ---
        const isMac = process.platform === 'darwin';
        const modifier = isMac ? 'Cmd' : 'Ctrl';
        
        // Monitor switching
        const displays = screen.getAllDisplays();
        if (displays.length > 1) {
            displays.forEach((display, index) => {
                const key = `${modifier}+Shift+${index + 1}`;
                globalShortcut.register(key, () => internalBridge.emit('window:moveToDisplay', { displayId: display.id }));
            });
        }

        // Edge snapping
        const edgeDirections = [
            { key: `${modifier}+Shift+Left`, direction: 'left' },
            { key: `${modifier}+Shift+Right`, direction: 'right' },
        ];
        edgeDirections.forEach(({ key, direction }) => {
            globalShortcut.register(key, () => {
                if (header && header.isVisible()) internalBridge.emit('window:moveToEdge', { direction });
            });
        });

        // --- User-configurable shortcuts ---
        if (header?.currentHeaderState === 'apikey') {
            if (keybinds.toggleVisibility) {
                globalShortcut.register(keybinds.toggleVisibility, () => this.toggleAllWindowsVisibility());
            }
            logger.info('[Shortcuts] ApiKeyHeader is active, only toggleVisibility shortcut is registered.');
            return;
        }

        for (const action in keybinds) {
            const accelerator = keybinds[action];
            if (!accelerator) continue;

            let callback;
            switch(action) {
                case 'toggleVisibility':
                    callback = () => this.toggleAllWindowsVisibility();
                    break;
                case 'nextStep':
                    callback = () => askService.toggleAskButton(true);
                    break;
                case 'scrollUp':
                    callback = () => {
                        const askWindow = this.windowPool.get('ask');
                        if (askWindow && !askWindow.isDestroyed() && askWindow.isVisible()) {
                            askWindow.webContents.send('scroll-response-up');
                        }
                    };
                    break;
                case 'scrollDown':
                    callback = () => {
                        const askWindow = this.windowPool.get('ask');
                        if (askWindow && !askWindow.isDestroyed() && askWindow.isVisible()) {
                            askWindow.webContents.send('scroll-response-down');
                        }
                    };
                    break;
                case 'moveUp':
                    callback = () => { if (header && header.isVisible()) internalBridge.emit('window:moveStep', { direction: 'up' }); };
                    break;
                case 'moveDown':
                    callback = () => { if (header && header.isVisible()) internalBridge.emit('window:moveStep', { direction: 'down' }); };
                    break;
                case 'moveLeft':
                    callback = () => { if (header && header.isVisible()) internalBridge.emit('window:moveStep', { direction: 'left' }); };
                    break;
                case 'moveRight':
                    callback = () => { if (header && header.isVisible()) internalBridge.emit('window:moveStep', { direction: 'right' }); };
                    break;
                case 'toggleClickThrough':
                     callback = () => {
                        const windowManager = require('../../window/windowManager');
                        windowManager.toggleClickThrough();
                     };
                     break;
                case 'manualScreenshot':
                    callback = () => {
                        if(mainWindow && !mainWindow.isDestroyed()) {
                             mainWindow.webContents.executeJavaScript('window.captureManualScreenshot && window.captureManualScreenshot();');
                        }
                    };
                    break;
                case 'previousResponse':
                    callback = () => sendToRenderer('navigate-previous-response');
                    break;
                case 'nextResponse':
                    callback = () => sendToRenderer('navigate-next-response');
                    break;
            }
            
            if (callback) {
                try {
                    globalShortcut.register(accelerator, callback);
                } catch(e) {
                    logger.error(`Failed to register shortcut for ${action} (${accelerator}):`, e.message);
                }
            }
        }
        logger.info('[Shortcuts] All shortcuts have been registered.');
    }

    unregisterAll() {
        globalShortcut.unregisterAll();
        logger.info('[Shortcuts] All shortcuts have been unregistered.');
    }
}


const shortcutsService = new ShortcutsService();

module.exports = shortcutsService;