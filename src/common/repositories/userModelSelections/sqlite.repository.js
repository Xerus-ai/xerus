/**
 * SQLite User Model Selections Repository - REMOVED
 * This functionality has been migrated to backend API endpoints.
 * Use the backend API instead of this SQLite repository.
 */

function get(uid) {
    throw new Error('SQLite repository has been removed. Use backend API endpoints instead.');
}

function upsert(uid, selections) {
    throw new Error('SQLite repository has been removed. Use backend API endpoints instead.');
}

function remove(uid) {
    throw new Error('SQLite repository has been removed. Use backend API endpoints instead.');
}

module.exports = {
    get,
    upsert,
    remove
}; 