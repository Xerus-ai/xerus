/**
 * SQLite Ollama Model Repository - REMOVED
 * This functionality has been migrated to backend API endpoints.
 * Use the backend API instead of this SQLite repository.
 */

function getAllModels() {
    throw new Error('SQLite repository has been removed. Use backend API endpoints instead.');
}

function getModel(name) {
    throw new Error('SQLite repository has been removed. Use backend API endpoints instead.');
}

function upsertModel({ name, size, installed = false, installing = false }) {
    throw new Error('SQLite repository has been removed. Use backend API endpoints instead.');
}

function updateInstallStatus(name, installed, installing = false) {
    throw new Error('SQLite repository has been removed. Use backend API endpoints instead.');
}

function initializeDefaultModels() {
    throw new Error('SQLite repository has been removed. Use backend API endpoints instead.');
}

function deleteModel(name) {
    throw new Error('SQLite repository has been removed. Use backend API endpoints instead.');
}

function getInstalledModels() {
    throw new Error('SQLite repository has been removed. Use backend API endpoints instead.');
}

function getInstallingModels() {
    throw new Error('SQLite repository has been removed. Use backend API endpoints instead.');
}

module.exports = {
    getAllModels,
    getModel,
    upsertModel,
    updateInstallStatus,
    initializeDefaultModels,
    deleteModel,
    getInstalledModels,
    getInstallingModels
}; 