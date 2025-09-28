/**
 * SQLite Settings Repository - REMOVED
 * This functionality has been migrated to backend API endpoints.
 * Use the backend API instead of this SQLite repository.
 */

function getPresets(uid) {
    throw new Error('SQLite repository has been removed. Use backend API endpoints instead.');
}

function getPresetTemplates() {
    throw new Error('SQLite repository has been removed. Use backend API endpoints instead.');
}

function createPreset({ uid, title, prompt }) {
    throw new Error('SQLite repository has been removed. Use backend API endpoints instead.');
}

function updatePreset(id, { title, prompt }, uid) {
    throw new Error('SQLite repository has been removed. Use backend API endpoints instead.');
}

function deletePreset(id, uid) {
    throw new Error('SQLite repository has been removed. Use backend API endpoints instead.');
}

function getAutoUpdate(uid) {
    throw new Error('SQLite repository has been removed. Use backend API endpoints instead.');
}

function setAutoUpdate(uid, isEnabled) {
    throw new Error('SQLite repository has been removed. Use backend API endpoints instead.');
}

module.exports = {
    getPresets,
    getPresetTemplates,
    createPreset,
    updatePreset,
    deletePreset,
    getAutoUpdate,
    setAutoUpdate
};