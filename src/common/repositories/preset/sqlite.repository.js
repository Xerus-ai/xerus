/**
 * SQLite Preset Repository - REMOVED
 * This functionality has been migrated to backend API endpoints.
 * Use the backend API instead of this SQLite repository.
 */

function getPresets(uid) {
    throw new Error('SQLite repository has been removed. Use backend API endpoints instead.');
}

function getPresetTemplates() {
    throw new Error('SQLite repository has been removed. Use backend API endpoints instead.');
}

function create({ uid, title, prompt }) {
    throw new Error('SQLite repository has been removed. Use backend API endpoints instead.');
}

function update(id, { title, prompt }, uid) {
    throw new Error('SQLite repository has been removed. Use backend API endpoints instead.');
}

function del(id, uid) {
    throw new Error('SQLite repository has been removed. Use backend API endpoints instead.');
}

module.exports = {
    getPresets,
    getPresetTemplates,
    create,
    update,
    delete: del
}; 