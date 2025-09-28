// SQLite repository has been removed - using Neon PostgreSQL only
const neonRepository = require('./neon.repository');
const authService = require('../../../common/services/authService');

function getBaseRepository() {
    // SQLite has been removed - always use Neon PostgreSQL (via backend API)
    console.log('[SEARCH] [DEBUG] Using Neon repository');
    return neonRepository;
}

// The adapter layer that injects the UID
const askRepositoryAdapter = {
    addAiMessage: async ({ sessionId, role, content, model }) => {
        const uid = authService.getCurrentUserId();
        const repository = getBaseRepository();
        
        console.log('[SEARCH] [DEBUG] askRepositoryAdapter.addAiMessage called:', {
            uid,
            sessionId,
            role,
            model,
            contentLength: content?.length || 0,
            repositoryType: 'Neon'
        });
        
        try {
            const result = await repository.addAiMessage({ uid, sessionId, role, content, model });
            console.log('[OK] [DEBUG] askRepositoryAdapter.addAiMessage succeeded');
            return result;
        } catch (error) {
            console.log('[ERROR] [DEBUG] askRepositoryAdapter.addAiMessage failed:', {
                error: error.message,
                code: error.code,
                name: error.name
            });
            throw error;
        }
    },
    getAllAiMessagesBySessionId: (sessionId) => {
        // This function does not require a UID at the service level.
        return getBaseRepository().getAllAiMessagesBySessionId(sessionId);
    }
};

module.exports = askRepositoryAdapter; 