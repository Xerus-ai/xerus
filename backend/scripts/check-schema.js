const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function showSchema() {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'tool_configurations'
      ORDER BY ordinal_position;
    `);
    console.log('[TASKS] tool_configurations table schema:');
    result.rows.forEach(col => {
      console.log(`  ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'} ${col.column_default ? 'DEFAULT ' + col.column_default : ''}`);
    });
    
    // Also show existing tools
    console.log('\n[TASKS] Existing tools:');
    const tools = await client.query('SELECT tool_name, icon FROM tool_configurations ORDER BY tool_name');
    tools.rows.forEach(tool => {
      console.log(`  ${tool.tool_name}: ${tool.icon || 'No icon'}`);
    });
    
  } finally {
    client.release();
    await pool.end();
  }
}

showSchema().catch(console.error);