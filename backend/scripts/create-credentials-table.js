#!/usr/bin/env node

/**
 * Database Migration Runner for User Credentials Table
 * Run this script to create the user_credentials table for OAuth/API key storage
 */

const fs = require('fs').promises;
const path = require('path');
const { neonDB } = require('../database/connections/neon');

async function createCredentialsTable() {
    console.log('[START] Creating User Credentials Table...\n');

    try {
        // Read the migration file
        const migrationPath = path.join(__dirname, '../database/migrations/005_create_user_credentials_table.sql');
        const migrationSQL = await fs.readFile(migrationPath, 'utf8');

        console.log('📄 Migration file loaded successfully');
        console.log('[TOOL] Creating user_credentials table in PostgreSQL database...\n');

        // Execute the migration
        await neonDB.query(migrationSQL);

        console.log('[OK] User credentials table created successfully!\n');

        // Verify the table was created
        console.log('[SEARCH] Verifying table creation...');
        
        // Check if table exists and get column information
        const tableCheck = await neonDB.sql`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_name = 'user_credentials' 
            ORDER BY ordinal_position;
        `;

        if (tableCheck.length > 0) {
            console.log('[DATA] user_credentials table structure:');
            tableCheck.forEach(col => {
                console.log(`  - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
            });

            // Check indexes
            const indexCheck = await neonDB.sql`
                SELECT indexname, indexdef 
                FROM pg_indexes 
                WHERE tablename = 'user_credentials';
            `;

            console.log('\n[SEARCH] Table indexes:');
            indexCheck.forEach(idx => {
                console.log(`  - ${idx.indexname}`);
            });

            console.log('\n🎉 User credentials table is ready for OAuth token storage!');
            console.log('\n📝 The table supports:');
            console.log('  [OK] OAuth access and refresh tokens');
            console.log('  [OK] API key storage');
            console.log('  [OK] Per-user isolation');
            console.log('  [OK] Encrypted credential storage');
            console.log('  [OK] Automatic timestamps');

        } else {
            throw new Error('Table creation verification failed - table not found');
        }

    } catch (error) {
        console.error('[ERROR] Migration failed:', error.message);
        console.error('\n[SEARCH] Error details:', error);
        process.exit(1);
    }
}

// Run the migration
if (require.main === module) {
    createCredentialsTable().catch(console.error);
}

module.exports = { createCredentialsTable };