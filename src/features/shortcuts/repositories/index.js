// Local shortcuts repository using electron-store (shortcuts are device-specific, not cloud)
const Store = require('electron-store');
const { createLogger } = require('../../../common/services/logger.js');

const store = new Store({ name: 'shortcuts' });
const logger = createLogger('ShortcutsRepository');

module.exports = {
  // Get all keybind configurations
  async getAllKeybinds() {
    try {
      const keybinds = store.get('keybinds', []);
      logger.info(`[ShortcutsRepository] Retrieved ${keybinds.length} keybinds`);
      return keybinds;
    } catch (error) {
      logger.error('[ShortcutsRepository] Error getting keybinds:', { error });
      return [];
    }
  },

  // Save keybind configurations
  async upsertKeybinds(keybindsArray) {
    try {
      store.set('keybinds', keybindsArray);
      logger.info(`[ShortcutsRepository] Saved ${keybindsArray.length} keybinds`);
      return true;
    } catch (error) {
      logger.error('[ShortcutsRepository] Error saving keybinds:', { error });
      throw error;
    }
  },

  // Legacy method mappings for compatibility
  ...Object.fromEntries(['getById', 'create', 'update', 'delete', 'getAll'].map(method => [
    method, () => { throw new Error('SQLite repository has been removed. Use backend API endpoints instead.'); }
  ]))
}; 