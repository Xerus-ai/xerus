/**
 * SQLite Ask Repository - REMOVED
 * This functionality has been migrated to backend API endpoints.
 * Use the backend API instead of this SQLite repository.
 */

function addAiMessage({ uid, sessionId, role, content, model = 'unknown' }) {
    throw new Error('SQLite repository has been removed. Use backend API endpoints instead.');
}

function getAllAiMessagesBySessionId(sessionId) {
    throw new Error('SQLite repository has been removed. Use backend API endpoints instead.');
}

module.exports = {
    addAiMessage,
    getAllAiMessagesBySessionId
}; 