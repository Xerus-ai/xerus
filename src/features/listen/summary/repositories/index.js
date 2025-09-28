// SQLite repository has been removed - using Firebase/backend API only
const firebaseRepository = require('./firebase.repository');
const authService = require('../../../../common/services/authService');

function getBaseRepository() {
    // SQLite has been removed - always use Firebase/backend API
    return firebaseRepository;
}

const summaryRepositoryAdapter = {
    saveSummary: ({ sessionId, tldr, text, bullet_json, action_json, model }) => {
        const uid = authService.getCurrentUserId();
        return getBaseRepository().saveSummary({ uid, sessionId, tldr, text, bullet_json, action_json, model });
    },
    getSummaryBySessionId: (sessionId) => {
        return getBaseRepository().getSummaryBySessionId(sessionId);
    }
};

module.exports = summaryRepositoryAdapter; 