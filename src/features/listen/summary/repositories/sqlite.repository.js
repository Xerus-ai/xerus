/**
 * SQLite Summary Repository - REMOVED
 * This functionality has been migrated to backend API endpoints.
 * Use the backend API instead of this SQLite repository.
 */

function saveSummary({ uid, sessionId, tldr, text, bullet_json, action_json, model = 'unknown' }) {
    throw new Error('SQLite repository has been removed. Use backend API endpoints instead.');
}

function getSummaryBySessionId(sessionId) {
    throw new Error('SQLite repository has been removed. Use backend API endpoints instead.');
}

module.exports = {
    saveSummary,
    getSummaryBySessionId,
}; 