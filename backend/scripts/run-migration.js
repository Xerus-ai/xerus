#!/usr/bin/env node

/**
 * Database Migration Runner for User Agent Isolation
 * Run this script to apply the user isolation migration
 */

const fs = require('fs').promises;
const path = require('path');
const { neonDB } = require('../database/connections/neon');

async function runMigration() {
    console.log('[START] Starting Agent User Isolation Migration...\n');

    try {
        // Read the migration file
        const migrationPath = path.join(__dirname, '../database/migrations/004_add_user_agent_isolation.sql');
        const migrationSQL = await fs.readFile(migrationPath, 'utf8');

        console.log('📄 Migration file loaded successfully');
        console.log('[TOOL] Applying migration to PostgreSQL database...\n');

        // Execute the migration
        await neonDB.query(migrationSQL);

        console.log('[OK] Migration completed successfully!\n');

        // Verify the changes
        console.log('[SEARCH] Verifying migration results...');
        
        // Check if columns were added
        const columnCheck = await neonDB.sql`
            SELECT column_name, data_type, is_nullable 
            FROM information_schema.columns 
            WHERE table_name = 'agents' 
            AND column_name IN ('user_id', 'agent_type', 'created_by')
            ORDER BY column_name;
        `;

        console.log('[DATA] New columns added:');
        columnCheck.forEach(col => {
            console.log(`  - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
        });

        // Check if functions were created
        const functionCheck = await neonDB.sql`
            SELECT proname 
            FROM pg_proc 
            WHERE proname IN ('get_user_agents', 'can_user_access_agent');
        `;

        console.log('\n[TASKS] Functions created:');
        functionCheck.forEach(func => {
            console.log(`  - ${func.proname}()`);
        });

        // Check if existing agents were marked as system agents
        const agentTypeCheck = await neonDB.sql`
            SELECT agent_type, COUNT(*) as count 
            FROM agents 
            GROUP BY agent_type;
        `;

        console.log('\n👥 Agent types in database:');
        agentTypeCheck.forEach(type => {
            console.log(`  - ${type.agent_type}: ${type.count} agents`);
        });

        console.log('\n🎉 Migration verification completed successfully!');
        console.log('\n📝 Next steps:');
        console.log('  1. Restart your backend service');
        console.log('  2. Test agent creation with different users');
        console.log('  3. Verify user isolation is working');

    } catch (error) {
        console.error('[ERROR] Migration failed:', error.message);
        console.error('\n[SEARCH] Error details:', error);
        process.exit(1);
    }
}

// Run the migration
if (require.main === module) {
    runMigration().catch(console.error);
}

module.exports = { runMigration };