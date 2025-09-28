/**
 * SQLite Permission Repository - REMOVED
 * This functionality has been migrated to backend API endpoints.
 * Use the backend API instead of this SQLite repository.
 */

async function markPermissionsAsCompleted() {
    throw new Error('SQLite repository has been removed. Use backend API endpoints instead.');
}

async function checkPermissionsCompleted() {
    throw new Error('SQLite repository has been removed. Use backend API endpoints instead.');
}

module.exports = {
    markPermissionsAsCompleted,
    checkPermissionsCompleted,
}; 