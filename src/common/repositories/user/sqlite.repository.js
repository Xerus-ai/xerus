/**
 * SQLite User Repository - REMOVED
 * This functionality has been migrated to backend API endpoints.
 * Use the backend API instead of this SQLite repository.
 */

function findOrCreate(user) {
    throw new Error('SQLite repository has been removed. Use backend API endpoints instead.');
}

function getById(uid) {
    throw new Error('SQLite repository has been removed. Use backend API endpoints instead.');
}

function update({ uid, displayName }) {
    throw new Error('SQLite repository has been removed. Use backend API endpoints instead.');
}

function setMigrationComplete(uid) {
    throw new Error('SQLite repository has been removed. Use backend API endpoints instead.');
}

function deleteById(uid) {
    throw new Error('SQLite repository has been removed. Use backend API endpoints instead.');
}

module.exports = {
    findOrCreate,
    getById,
    update,
    setMigrationComplete,
    deleteById
}; 