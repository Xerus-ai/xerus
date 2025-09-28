/**
 * Update Tool Icons to Relative URLs Script
 * Updates tool icons in database with relative URLs for frontend proxy
 */

const { Pool } = require('pg');
require('dotenv').config();

// Database configuration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Tool icon mappings with relative URLs
const toolIconMappings = {
  'firecrawl': '/api/tools/icons/firecrawl_logo.png',
  'web_search': '/api/tools/icons/tavily-color.png',
  'google_calendar': '/api/tools/icons/Google-Calendar-Logo.png',
  // MCP Server Icons
  'github-remote': '/api/tools/icons/GitHub-logo-768x432.png',
  'gmail-remote': '/api/tools/icons/gmail_new_logo_icon.png',
  'weather-remote': '/api/tools/icons/weather_logo.png',
  'atlassian-remote': '/api/tools/icons/atlassian-logo.png'
};

async function updateToolIconsToRelative() {
  const client = await pool.connect();
  
  try {
    console.log('[LOADING] Updating tool icons to relative URLs...');
    
    // Update tools with relative icon URLs
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
    
    console.log('\n[OK] Tool icons updated to relative URLs successfully!');
    
  } catch (error) {
    console.error('[ERROR] Error updating tool icons:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the update
updateToolIconsToRelative().catch(console.error);