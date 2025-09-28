// src/bridge/windowBridge.js
const { ipcMain, shell } = require('electron');
const windowManager = require('../window/windowManager');

module.exports = {
  initialize() {
    ipcMain.removeHandler('toggle-content-protection');
    ipcMain.handle('toggle-content-protection', () => windowManager.toggleContentProtection());
    ipcMain.removeHandler('resize-header-window');
    ipcMain.handle('resize-header-window', (event, args) => windowManager.resizeHeaderWindow(args));
    ipcMain.removeHandler('get-content-protection-status');
    ipcMain.handle('get-content-protection-status', () => windowManager.getContentProtectionStatus());
    ipcMain.on('show-settings-window', () => windowManager.showSettingsWindow());
    ipcMain.on('hide-settings-window', () => windowManager.hideSettingsWindow());
    ipcMain.on('cancel-hide-settings-window', () => windowManager.cancelHideSettingsWindow());
    
    ipcMain.on('show-agent-selector-window', () => windowManager.showAgentSelectorWindow());
    ipcMain.on('hide-agent-selector-window', () => windowManager.hideAgentSelectorWindow());
    ipcMain.on('cancel-hide-agent-selector-window', () => windowManager.cancelHideAgentSelectorWindow());

    ipcMain.removeHandler('open-login-page');
    ipcMain.handle('open-login-page', () => windowManager.openLoginPage());
    ipcMain.removeHandler('open-personalize-page');
    ipcMain.handle('open-personalize-page', () => windowManager.openLoginPage());
    ipcMain.removeHandler('move-window-step');
    ipcMain.handle('move-window-step', (event, direction) => windowManager.moveWindowStep(direction));
    ipcMain.removeHandler('open-external');
    ipcMain.handle('open-external', (event, url) => shell.openExternal(url));

    // Newly moved handlers from windowManager
    ipcMain.on('header-state-changed', (event, state) => windowManager.handleHeaderStateChanged(state));
    ipcMain.on('header-animation-finished', (event, state) => windowManager.handleHeaderAnimationFinished(state));
    ipcMain.removeHandler('get-header-position');
    ipcMain.handle('get-header-position', () => windowManager.getHeaderPosition());
    ipcMain.removeHandler('move-header');
    ipcMain.handle('move-header', (event, newX, newY) => windowManager.moveHeader(newX, newY));
    ipcMain.removeHandler('move-header-to');
    ipcMain.handle('move-header-to', (event, newX, newY) => windowManager.moveHeaderTo(newX, newY));
    ipcMain.removeHandler('adjust-window-height');
    ipcMain.handle('adjust-window-height', (event, targetHeight) => windowManager.adjustWindowHeight(event.sender, targetHeight));
    ipcMain.removeHandler('set-window-opacity');
    ipcMain.handle('set-window-opacity', (event, opacity) => windowManager.setWindowOpacity(opacity));
    ipcMain.removeHandler('toggle-click-through');
    ipcMain.handle('toggle-click-through', () => windowManager.toggleClickThrough());
    ipcMain.removeHandler('get-click-through-status');
    ipcMain.handle('get-click-through-status', () => windowManager.getClickThroughStatus());

    // Theme management IPC handlers
    ipcMain.removeHandler('get-current-theme');
    ipcMain.handle('get-current-theme', () => windowManager.getCurrentTheme());
    ipcMain.removeHandler('set-theme');
    ipcMain.handle('set-theme', (event, theme) => windowManager.setTheme(theme));
    ipcMain.removeHandler('toggle-theme');
    ipcMain.handle('toggle-theme', () => windowManager.toggleTheme());

    // Liquid Glass & Platform APIs
    ipcMain.removeHandler('liquid-glass:add-view');
    ipcMain.handle('liquid-glass:add-view', () => windowManager.liquidGlassAPI.addView());
    ipcMain.removeHandler('liquid-glass:remove-view');
    ipcMain.handle('liquid-glass:remove-view', (event, viewId) => windowManager.liquidGlassAPI.removeView(viewId));
    ipcMain.removeHandler('liquid-glass:set-variant');
    ipcMain.handle('liquid-glass:set-variant', (event, viewId, variant) => windowManager.liquidGlassAPI.setVariant(viewId, variant));
    ipcMain.removeHandler('liquid-glass:set-scrim');
    ipcMain.handle('liquid-glass:set-scrim', (event, viewId, scrim) => windowManager.liquidGlassAPI.setScrim(viewId, scrim));
    ipcMain.removeHandler('liquid-glass:set-subdued');
    ipcMain.handle('liquid-glass:set-subdued', (event, viewId, subdued) => windowManager.liquidGlassAPI.setSubdued(viewId, subdued));
    ipcMain.removeHandler('get-platform-info');
    ipcMain.handle('get-platform-info', () => windowManager.getPlatformInfo());
  },

  notifyFocusChange(win, isFocused) {
    win.webContents.send('window:focus-change', isFocused);
  }
};