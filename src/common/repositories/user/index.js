// SQLite and Firebase repositories have been removed - using Backend API repository only
const backendRepository = require('./backend.repository');

let authService = null;

function getAuthService() {
    if (!authService) {
        authService = require('../../services/authService');
    }
    return authService;
}

function getBaseRepository() {
    // Always use Backend API repository - SQLite and Firebase have been removed
    return backendRepository;
}

const userRepositoryAdapter = {
    findOrCreate: (user) => {
        // This function receives the full user object, which includes the uid. No need to inject.
        return getBaseRepository().findOrCreate(user);
    },
    
    getById: () => {
        const uid = getAuthService().getCurrentUserId();
        return getBaseRepository().getById(uid);
    },



    update: (updateData) => {
        const uid = getAuthService().getCurrentUserId();
        return getBaseRepository().update({ uid, ...updateData });
    },

    deleteById: () => {
        const uid = getAuthService().getCurrentUserId();
        return getBaseRepository().deleteById(uid);
    }
};

module.exports = {
    ...userRepositoryAdapter
}; 