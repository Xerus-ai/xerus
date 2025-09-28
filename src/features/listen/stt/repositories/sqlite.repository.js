/**
 * SQLite STT Repository - REMOVED
 * This functionality has been migrated to backend API endpoints.
 * Use the backend API instead of this SQLite repository.
 */

function addTranscript({ uid, sessionId, speaker, text }) {
    throw new Error('SQLite repository has been removed. Use backend API endpoints instead.');
}

function getAllTranscriptsBySessionId(sessionId) {
    throw new Error('SQLite repository has been removed. Use backend API endpoints instead.');
}

module.exports = {
    addTranscript,
    getAllTranscriptsBySessionId,
}; 