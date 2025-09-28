/**
 * Add Icon Column Script
 * Adds icon column to tool_configurations table and updates with icon URLs
 */

const { Pool } = require('pg');
require('dotenv').config();

// Database configuration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Tool icon mappings
const toolIconMappings = {
  'firecrawl': 'http://localhost:5001/api/v1/tools/icons/firecrawl_logo.png',
  'web_search': 'http://localhost:5001/api/v1/tools/icons/tavily-color.png',
  'google_calendar': 'http://localhost:5001/api/v1/tools/icons/Google-Calendar-Logo.png'
};

async function addIconColumnAndUpdate() {
  const client = await pool.connect();
  
  try {
    console.log('[LOADING] Adding icon column to tool_configurations...');
    
    // Add icon column
    try {
      await client.query('ALTER TABLE tool_configurations ADD COLUMN icon TEXT;');
      console.log('[OK] Icon column added successfully!');
    } catch (error) {
      if (error.code === '42701') {
        console.log('[INFO]  Icon column already exists, skipping...');
      } else {
        throw error;
      }
    }
    
    console.log('\n[LOADING] Updating tool icons...');
    
    // Update tools with icon URLs
    for (const [toolName, iconUrl] of Object.entries(toolIconMappings)) {
      const result = await client.query(
        'UPDATE tool_configurations SET icon = $1 WHERE tool_name = $2',
        [iconUrl, toolName]
      );
      console.log(`[OK] Updated ${toolName}: ${result.rowCount} row(s) affected`);
    }
    
    // Show current tools with their icons
    console.log('\n[TASKS] Current tools with icons:');
    const tools = await client.query(
      'SELECT tool_name, icon FROM tool_configurations ORDER BY tool_name'
    );
    
    tools.rows.forEach(tool => {
      const iconDisplay = tool.icon ? tool.icon.substring(tool.icon.lastIndexOf('/') + 1) : 'No icon';
      console.log(`  ${tool.tool_name}: ${iconDisplay}`);
    });
    
    console.log('\n[OK] Icon column added and tools updated successfully!');
    
  } catch (error) {
    console.error('[ERROR] Error updating database:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the update
addIconColumnAndUpdate().catch(console.error);