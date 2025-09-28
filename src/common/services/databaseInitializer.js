/**
 * Database Initializer - REMOVED
 * 
 * SQLite functionality has been completely removed in favor of unified Neon PostgreSQL database.
 * All database operations are now handled by the backend API service.
 * 
 * This file exists only to prevent import errors during the migration.
 */

const { createLogger } = require('./logger.js');
const logger = createLogger('DatabaseInitializer-Removed');

class DatabaseInitializer {
    constructor() {
        this.isInitialized = true; // Always initialized - backend handles database
        logger.info('[DatabaseInitializer] Using backend API for all database operations');
    }

    // All methods now throw errors - no SQLite functionality
    async initialize() {
        throw new Error('DatabaseInitializer has been removed. All database operations handled by backend API.');
    }

    async ensureDataDirectory() {
        throw new Error('DatabaseInitializer has been removed. All database operations handled by backend API.');
    }

    async checkDatabaseExists() {
        throw new Error('DatabaseInitializer has been removed. All database operations handled by backend API.');
    }

    async createNewDatabase() {
        throw new Error('DatabaseInitializer has been removed. All database operations handled by backend API.');
    }

    async connectToExistingDatabase() {
        throw new Error('DatabaseInitializer has been removed. All database operations handled by backend API.');
    }

    async validateAndRecoverData() {
        throw new Error('DatabaseInitializer has been removed. All database operations handled by backend API.');
    }

    async getStatus() {
        throw new Error('DatabaseInitializer has been removed. All database operations handled by backend API.');
    }

    async reset() {
        throw new Error('DatabaseInitializer has been removed. All database operations handled by backend API.');
    }

    close() {
        logger.info('[DatabaseInitializer] DatabaseInitializer has been removed - no action needed');
    }

    getDatabasePath() {
        throw new Error('DatabaseInitializer has been removed. All database operations handled by backend API.');
    }
}

const databaseInitializer = new DatabaseInitializer();

module.exports = databaseInitializer; 