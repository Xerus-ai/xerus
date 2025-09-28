/**
 * Update Tool Icons Script
 * Updates tool icons in database with proper icon URLs
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
  'google_calendar': 'http://localhost:5001/api/v1/tools/icons/Google-Calendar-Logo.png',
  'gmail-remote': 'http://localhost:5001/api/v1/tools/icons/gmail_new_logo_icon.png',
  'github-remote': 'http://localhost:5001/api/v1/tools/icons/GitHub-logo-768x432.png',
  'weather-remote': 'http://localhost:5001/api/v1/tools/icons/weather_logo.png'
};

async function updateToolIcons() {
  const client = await pool.connect();
  
  try {
    console.log('[LOADING] Updating tool icons...');
    
    // Update regular tools in tool_configurations
    for (const [toolName, iconUrl] of Object.entries(toolIconMappings)) {
      if (!toolName.includes('-remote')) {
        const result = await client.query(
          'UPDATE tool_configurations SET icon = $1 WHERE tool_name = $2',
          [iconUrl, toolName]
        );
        console.log(`[OK] Updated ${toolName}: ${result.rowCount} row(s) affected`);
      }
    }
    
    // Update MCP server icons (these might be in a different table or stored differently)
    console.log('\n[LOADING] Updating MCP server icons...');
    for (const [toolName, iconUrl] of Object.entries(toolIconMappings)) {
      if (toolName.includes('-remote')) {
        // Try updating if they exist in tool_configurations
        const result = await client.query(
          'UPDATE tool_configurations SET icon = $1 WHERE tool_name = $2',
          [iconUrl, toolName]
        );
        console.log(`[OK] Updated MCP ${toolName}: ${result.rowCount} row(s) affected`);
      }
    }
    
    // Show current tools with their icons
    console.log('\n[LIST] Current tools with icons:');
    const tools = await client.query(
      'SELECT tool_name, icon FROM tool_configurations ORDER BY tool_name'
    );
    
    tools.rows.forEach(tool => {
      console.log(`  ${tool.tool_name}: ${tool.icon}`);
    });
    
    console.log('\n[OK] Tool icons updated successfully!');
    
  } catch (error) {
    console.error('[ERROR] Error updating tool icons:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the update
updateToolIcons().catch(console.error);