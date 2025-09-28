// User model selections using electron-store (user preferences should be stored locally)
const Store = require('electron-store');
const { createLogger } = require('../../services/logger.js');

const store = new Store({ name: 'user-model-selections' });
const logger = createLogger('UserModelSelectionsRepository');

let authService = null;

function setAuthService(service) {
    authService = service;
}

// Local storage for user model selections
function getLocalRepository() {
    return {
        async get(uid) {
            try {
                const selections = store.get(`selections.${uid}`, null);
                logger.info(`[UserModelSelections] Retrieved selections for user: ${uid}`);
                return selections;
            } catch (error) {
                logger.error('[UserModelSelections] Error getting selections:', { error });
                return null;
            }
        },

        async upsert(uid, selections) {
            try {
                store.set(`selections.${uid}`, selections);
                logger.info(`[UserModelSelections] Saved selections for user: ${uid}`);
                return selections;
            } catch (error) {
                logger.error('[UserModelSelections] Error saving selections:', { error });
                throw error;
            }
        },

        async remove(uid) {
            try {
                store.delete(`selections.${uid}`);
                logger.info(`[UserModelSelections] Removed selections for user: ${uid}`);
                return true;
            } catch (error) {
                logger.error('[UserModelSelections] Error removing selections:', { error });
                throw error;
            }
        }
    };
}

function getBaseRepository() {
    // Use local storage for user model selections
    return getLocalRepository();
}

const userModelSelectionsRepositoryAdapter = {
    async get() {
        const repo = getBaseRepository();
        const uid = authService.getCurrentUserId();
        return await repo.get(uid);
    },

    async upsert(selections) {
        const repo = getBaseRepository();
        const uid = authService.getCurrentUserId();
        const now = Date.now();
        
        const selectionsWithMeta = {
            ...selections,
            uid,
            updated_at: now
        };
        
        return await repo.upsert(uid, selectionsWithMeta);
    },

    async remove() {
        const repo = getBaseRepository();
        const uid = authService.getCurrentUserId();
        return await repo.remove(uid);
    }
};

module.exports = {
    ...userModelSelectionsRepositoryAdapter,
    setAuthService
}; 