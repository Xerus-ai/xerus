/**
 * SQLite Session Repository - REMOVED
 * This functionality has been migrated to backend API endpoints.
 * Use the backend API instead of this SQLite repository.
 */

function getById(id) {
    throw new Error('SQLite repository has been removed. Use backend API endpoints instead.');
}

function create(uid, type = 'ask') {
    throw new Error('SQLite repository has been removed. Use backend API endpoints instead.');
}

function getAllByUserId(uid) {
    throw new Error('SQLite repository has been removed. Use backend API endpoints instead.');
}

function updateTitle(id, title) {
    throw new Error('SQLite repository has been removed. Use backend API endpoints instead.');
}

function deleteWithRelatedData(id) {
    throw new Error('SQLite repository has been removed. Use backend API endpoints instead.');
}

function end(id) {
    throw new Error('SQLite repository has been removed. Use backend API endpoints instead.');
}

function updateType(id, type) {
    throw new Error('SQLite repository has been removed. Use backend API endpoints instead.');
}

function touch(id) {
    throw new Error('SQLite repository has been removed. Use backend API endpoints instead.');
}

function getOrCreateActive(uid, requestedType = 'ask') {
    throw new Error('SQLite repository has been removed. Use backend API endpoints instead.');
}

function endAllActiveSessions(uid) {
    throw new Error('SQLite repository has been removed. Use backend API endpoints instead.');
}

module.exports = {
    getById,
    create,
    getAllByUserId,
    updateTitle,
    deleteWithRelatedData,
    end,
    updateType,
    touch,
    getOrCreateActive,
    endAllActiveSessions,
}; 