// SQLite and Firebase repositories have been removed - using Backend API repository only
const backendRepository = require('./backend.repository');
const authService = require('../../services/authService');

function getBaseRepository() {
    // Always use Backend API repository - SQLite and Firebase have been removed
    return backendRepository;
}

const presetRepositoryAdapter = {
    getPresets: () => {
        const uid = authService.getCurrentUserId();
        return getBaseRepository().getPresets(uid);
    },

    getPresetTemplates: () => {
        return getBaseRepository().getPresetTemplates();
    },

    create: (options) => {
        const uid = authService.getCurrentUserId();
        return getBaseRepository().create({ uid, ...options });
    },

    update: (id, options) => {
        const uid = authService.getCurrentUserId();
        return getBaseRepository().update(id, options, uid);
    },

    delete: (id) => {
        const uid = authService.getCurrentUserId();
        return getBaseRepository().delete(id, uid);
    },
};

module.exports = presetRepositoryAdapter; 