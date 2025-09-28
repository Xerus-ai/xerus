/**
 * Backend API User Repository
 * Temporary implementation that returns empty data to prevent Firebase errors
 * TODO: Implement actual backend user endpoints
 */

const { createLogger } = require('../../services/logger.js');

const logger = createLogger('Backend.UserRepository');

async function findOrCreate(user) {
    console.log('[SEARCH] [DEBUG] Backend findOrCreate user called with:', { user });
    
    try {
        // TODO: Implement actual backend API call for finding/creating users
        // For now, return mock user data to prevent Firebase errors
        const mockUser = {
            uid: user.uid || 'default_user',
            email: user.email || 'contact@xerus.ai',
            displayName: user.displayName || 'Default User',
            created_at: Date.now(),
            updated_at: Date.now()
        };
        logger.info('[Backend.UserRepository] Found/created mock user (backend endpoints not implemented yet):', mockUser.uid);
        return mockUser;
    } catch (error) {
        console.log('[ERROR] [DEBUG] Backend findOrCreate user failed:', { error: error.message, user });
        throw new Error(`Backend user repository: ${error.message}`);
    }
}

async function getById(uid) {
    console.log('[SEARCH] [DEBUG] Backend getById user called with:', { uid });
    
    try {
        // TODO: Implement actual backend API call for getting user by ID
        // For now, return mock user data to prevent Firebase errors
        const mockUser = {
            uid: uid || 'default_user',
            email: 'contact@xerus.ai',
            displayName: 'Default User',
            created_at: Date.now(),
            updated_at: Date.now()
        };
        logger.info('[Backend.UserRepository] Retrieved mock user (backend endpoints not implemented yet):', uid);
        return mockUser;
    } catch (error) {
        console.log('[ERROR] [DEBUG] Backend getById user failed:', { error: error.message, uid });
        throw new Error(`Backend user repository: ${error.message}`);
    }
}

async function update(updateData) {
    console.log('[SEARCH] [DEBUG] Backend update user called with:', { updateData });
    
    try {
        // TODO: Implement actual backend API call for updating user
        // For now, return success to prevent Firebase errors
        const updatedUser = {
            ...updateData,
            updated_at: Date.now()
        };
        logger.info('[Backend.UserRepository] Updated mock user (backend endpoints not implemented yet):', updateData.uid);
        return updatedUser;
    } catch (error) {
        console.log('[ERROR] [DEBUG] Backend update user failed:', { error: error.message, updateData });
        throw new Error(`Backend user repository: ${error.message}`);
    }
}

async function deleteById(uid) {
    console.log('[SEARCH] [DEBUG] Backend deleteById user called with:', { uid });
    
    try {
        // TODO: Implement actual backend API call for deleting user
        // For now, return success to prevent Firebase errors
        logger.info('[Backend.UserRepository] Deleted mock user (backend endpoints not implemented yet):', uid);
        return { deleted: true };
    } catch (error) {
        console.log('[ERROR] [DEBUG] Backend deleteById user failed:', { error: error.message, uid });
        throw new Error(`Backend user repository: ${error.message}`);
    }
}

module.exports = {
    findOrCreate,
    getById,
    update,
    deleteById
};