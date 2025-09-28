/**
 * Check Database Structure Script
 * Check the current structure of tool_configurations table
 */

const { Pool } = require('pg');
require('dotenv').config();

// Database configuration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkDBStructure() {
  const client = await pool.connect();
  
  try {
    console.log('[SEARCH] Checking tool_configurations table structure...');
    
    const result = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'tool_configurations'
      ORDER BY ordinal_position;
    `);
    
    console.log('\n[TASKS] Columns:');
    result.rows.forEach(col => {
      console.log(`  ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
    });
    
    // Show sample data
    console.log('\n[TASKS] Sample data:');
    const sampleData = await client.query('SELECT id, tool_name, display_name, description FROM tool_configurations LIMIT 3');
    sampleData.rows.forEach(row => {
      console.log(`  ${row.id}: ${row.tool_name} - ${row.description?.substring(0, 50)}...`);
    });
    
  } catch (error) {
    console.error('[ERROR] Error checking database structure:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

checkDBStructure().catch(console.error);