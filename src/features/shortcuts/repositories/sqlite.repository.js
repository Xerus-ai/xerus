/**
 * SQLite Shortcuts Repository - REMOVED
 * This functionality has been migrated to backend API endpoints.
 * Use the backend API instead of this SQLite repository.
 */

function getAllKeybinds() {
    throw new Error('SQLite repository has been removed. Use backend API endpoints instead.');
}

function upsertKeybinds(keybinds) {
    throw new Error('SQLite repository has been removed. Use backend API endpoints instead.');
}

module.exports = {
    getAllKeybinds,
    upsertKeybinds
}; 