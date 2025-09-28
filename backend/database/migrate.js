/**
 * Database Migration Runner
 * Run database migrations for knowledge base folder support
 */

const fs = require('fs');
const path = require('path');
const { neonDB } = require('./connections/neon');

async function runMigration(migrationFile) {
  try {
    console.log(`[LOADING] Running migration: ${migrationFile}`);
    
    const migrationPath = path.join(__dirname, 'migrations', migrationFile);
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Initialize database connection
    if (!neonDB.isConnected) {
      await neonDB.initialize();
    }
    
    // Split migration into individual statements and execute each
    const statements = migrationSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt && !stmt.startsWith('--'));
    
    for (const statement of statements) {
      if (statement.trim()) {
        await neonDB.query(statement + ';');
      }
    }
    
    console.log(`[OK] Migration completed: ${migrationFile}`);
    
  } catch (error) {
    console.error(`[ERROR] Migration failed: ${migrationFile}`, error.message);
    throw error;
  }
}

async function runAllMigrations() {
  try {
    console.log('[START] Starting database migrations...');
    
    const migrationsDir = path.join(__dirname, 'migrations');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort(); // Run migrations in order
    
    console.log(`Found ${migrationFiles.length} migration(s) to run:`);
    migrationFiles.forEach(file => console.log(`  - ${file}`));
    
    // Run each migration
    for (const migrationFile of migrationFiles) {
      await runMigration(migrationFile);
    }
    
    console.log('[SUCCESS] All migrations completed successfully!');
    
  } catch (error) {
    console.error('[ERROR] Migration process failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runAllMigrations().then(() => {
    console.log('Migration process finished.');
    process.exit(0);
  });
}

module.exports = {
  runMigration,
  runAllMigrations
};