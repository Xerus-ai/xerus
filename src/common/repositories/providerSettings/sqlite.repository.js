/**
 * SQLite Provider Settings Repository - REMOVED
 * This functionality has been migrated to backend API endpoints.
 * Use the backend API instead of this SQLite repository.
 */

function getByProvider(uid, provider) {
    throw new Error('SQLite repository has been removed. Use backend API endpoints instead.');
}

function getAllByUid(uid) {
    throw new Error('SQLite repository has been removed. Use backend API endpoints instead.');
}

function upsert(uid, provider, settings) {
    throw new Error('SQLite repository has been removed. Use backend API endpoints instead.');
}

function remove(uid, provider) {
    throw new Error('SQLite repository has been removed. Use backend API endpoints instead.');
}

function removeAllByUid(uid) {
    throw new Error('SQLite repository has been removed. Use backend API endpoints instead.');
}

module.exports = {
    getByProvider,
    getAllByUid,
    upsert,
    remove,
    removeAllByUid
}; 