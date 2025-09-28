// Provider settings using electron-store (API keys should be stored locally for security)
const Store = require('electron-store');
const { createLogger } = require('../../services/logger.js');

const store = new Store({ name: 'provider-settings' });
const logger = createLogger('ProviderSettingsRepository');

let authService = null;

function setAuthService(service) {
    authService = service;
}

// Local storage for provider settings (API keys)
function getLocalRepository() {
    return {
        async getByProvider(uid, provider) {
            try {
                const settings = store.get(`settings.${uid}.${provider}`, null);
                logger.info(`[ProviderSettings] Retrieved settings for provider: ${provider}`);
                return settings;
            } catch (error) {
                logger.error(`[ProviderSettings] Error getting settings for ${provider}:`, { error });
                return null;
            }
        },

        async getAllByUid(uid) {
            try {
                const allSettings = store.get(`settings.${uid}`, {});
                logger.info(`[ProviderSettings] Retrieved all settings for user: ${uid}`);
                return Object.values(allSettings);
            } catch (error) {
                logger.error('[ProviderSettings] Error getting all settings:', { error });
                return [];
            }
        },

        async upsert(uid, provider, settings) {
            try {
                store.set(`settings.${uid}.${provider}`, settings);
                logger.info(`[ProviderSettings] Saved settings for provider: ${provider}`);
                return settings;
            } catch (error) {
                logger.error(`[ProviderSettings] Error saving settings for ${provider}:`, { error });
                throw error;
            }
        },

        async remove(uid, provider) {
            try {
                store.delete(`settings.${uid}.${provider}`);
                logger.info(`[ProviderSettings] Removed settings for provider: ${provider}`);
                return true;
            } catch (error) {
                logger.error(`[ProviderSettings] Error removing settings for ${provider}:`, { error });
                throw error;
            }
        },

        async removeAllByUid(uid) {
            try {
                store.delete(`settings.${uid}`);
                logger.info(`[ProviderSettings] Removed all settings for user: ${uid}`);
                return true;
            } catch (error) {
                logger.error('[ProviderSettings] Error removing all settings:', { error });
                throw error;
            }
        }
    };
}

function getBaseRepository() {
    // Use local storage for provider settings (API keys should be stored locally)
    return getLocalRepository();
}

const providerSettingsRepositoryAdapter = {
    // Core CRUD operations
    async getByProvider(provider) {
        const repo = getBaseRepository();
        const uid = authService.getCurrentUserId();
        return await repo.getByProvider(uid, provider);
    },

    async getAllByUid() {
        const repo = getBaseRepository();
        const uid = authService.getCurrentUserId();
        return await repo.getAllByUid(uid);
    },

    async upsert(provider, settings) {
        const repo = getBaseRepository();
        const uid = authService.getCurrentUserId();
        const now = Date.now();
        
        const settingsWithMeta = {
            ...settings,
            uid,
            provider,
            updated_at: now,
            created_at: settings.created_at || now
        };
        
        return await repo.upsert(uid, provider, settingsWithMeta);
    },

    async remove(provider) {
        const repo = getBaseRepository();
        const uid = authService.getCurrentUserId();
        return await repo.remove(uid, provider);
    },

    async removeAllByUid() {
        const repo = getBaseRepository();
        const uid = authService.getCurrentUserId();
        return await repo.removeAllByUid(uid);
    }
};

module.exports = {
    ...providerSettingsRepositoryAdapter,
    setAuthService
}; 