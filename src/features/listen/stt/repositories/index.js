// SQLite repository has been removed - using Firebase/backend API only
const firebaseRepository = require('./firebase.repository');
const authService = require('../../../../common/services/authService');

function getBaseRepository() {
    // SQLite has been removed - always use Firebase/backend API
    return firebaseRepository;
}

const sttRepositoryAdapter = {
    addTranscript: ({ sessionId, speaker, text }) => {
        const uid = authService.getCurrentUserId();
        return getBaseRepository().addTranscript({ uid, sessionId, speaker, text });
    },
    getAllTranscriptsBySessionId: (sessionId) => {
        return getBaseRepository().getAllTranscriptsBySessionId(sessionId);
    }
};

module.exports = sttRepositoryAdapter; 