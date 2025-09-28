// SQLite-to-Firebase migration has been removed - using unified Neon database
const { createLogger } = require('./logger.js');

const logger = createLogger('MigrationService');

async function checkAndRunMigration(firebaseUser) {
    if (!firebaseUser || !firebaseUser.uid) {
        logger.info('[Migration] No user, skipping migration check.');
        return;
    }

    logger.info('[Migration] SQLite-to-Firebase migration has been removed. Using unified Neon database architecture.');
    return;
}

module.exports = {
    checkAndRunMigration,
}; 