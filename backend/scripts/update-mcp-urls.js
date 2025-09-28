/**
 * Update MCP Server URLs for Production Deployment
 * Updates the deployed URLs in both mcpManager.js and database
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

// Configuration for deployed MCP servers
const DEPLOYED_MCP_URLS = {
  'atlassian-remote': {
    url: 'https://mcp-atlassian-eexd.onrender.com/mcp/',
    oauthCallbackUrl: 'https://mcp-atlassian-eexd.onrender.com/oauth2callback',
    status: 'available'
  },
  'weather-remote': {
    url: 'https://weather-mcp.example.com/mcp/', 
    status: 'placeholder' // Update when deployed
  },
  'github-remote': {
    url: 'https://api.githubcopilot.com/mcp/',
    status: 'available'
  },
  'gmail-remote': {
    url: 'https://gmail.gongrzhe.com',
    oauthCallbackUrl: 'https://gmail.gongrzhe.com/oauth2callback', 
    status: 'available'
  }
};

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function updateMCPManagerFile(deployedUrls) {
  console.log('[LOADING] Updating mcpManager.js with deployed URLs...');
  
  const mcpManagerPath = path.join(__dirname, '../services/mcp/mcpManager.js');
  let content = fs.readFileSync(mcpManagerPath, 'utf8');
  
  // Update each server configuration
  for (const [serverId, config] of Object.entries(deployedUrls)) {
    if (config.status === 'available') {
      // Update the URL in the server registry
      const serverRegex = new RegExp(
        `(this\\.serverRegistry\\.set\\('${serverId}',[\\s\\S]*?url: ')([^']*)(')`,
        'g'
      );
      content = content.replace(serverRegex, `$1${config.url}$3`);
      
      // Update OAuth callback URL if provided
      if (config.oauthCallbackUrl) {
        const callbackRegex = new RegExp(
          `(oauthCallbackUrl: ')([^']*)(')`,
          'g'
        );
        content = content.replace(callbackRegex, `$1${config.oauthCallbackUrl}$3`);
      }
      
      console.log(`[OK] Updated ${serverId}: ${config.url}`);
    } else {
      console.log(`[WAIT] ${serverId}: ${config.status} - skipping update`);
    }
  }
  
  // Write the updated content back
  fs.writeFileSync(mcpManagerPath, content, 'utf8');
  console.log('[OK] mcpManager.js updated successfully!');
}

async function updateDatabaseUrls(deployedUrls) {
  console.log('[LOADING] Updating database with deployed URLs...');
  
  const client = await pool.connect();
  
  try {
    for (const [serverId, config] of Object.entries(deployedUrls)) {
      if (config.status === 'available') {
        // Update the default_config JSON with new URLs
        const result = await client.query(
          `UPDATE tool_configurations 
           SET default_config = default_config || $1,
               updated_at = CURRENT_TIMESTAMP
           WHERE tool_name = $2`,
          [
            JSON.stringify({
              url: config.url,
              oauthCallbackUrl: config.oauthCallbackUrl || config.url + '/oauth2callback'
            }),
            serverId
          ]
        );
        
        if (result.rowCount > 0) {
          console.log(`[OK] Updated ${serverId} in database`);
        } else {
          console.log(`[WARNING]  ${serverId} not found in database`);
        }
      }
    }
    
    // Show updated MCP servers
    console.log('\n[TASKS] Current MCP servers with URLs:');
    const servers = await client.query(
      `SELECT tool_name, display_name, default_config->>'url' as url, is_enabled 
       FROM tool_configurations 
       WHERE provider = 'mcp' OR tool_name LIKE '%-remote'
       ORDER BY display_name`
    );
    
    servers.rows.forEach(server => {
      const status = server.is_enabled ? '🟢' : '🔴';
      const url = server.url || 'No URL configured';
      console.log(`  ${status} ${server.display_name}: ${url}`);
    });
    
  } finally {
    client.release();
    await pool.end();
  }
}

async function main() {
  console.log('[START] Updating MCP server URLs for production deployment...\n');
  
  try {
    // Update mcpManager.js file
    await updateMCPManagerFile(DEPLOYED_MCP_URLS);
    
    console.log('');
    
    // Update database URLs
    await updateDatabaseUrls(DEPLOYED_MCP_URLS);
    
    console.log('\n[OK] All MCP server URLs updated successfully!');
    console.log('\n📝 Next steps:');
    console.log('   1. Restart Xerus backend to pick up mcpManager.js changes');
    console.log('   2. Test MCP server connections');
    console.log('   3. Configure OAuth credentials for new deployments');
    console.log('   4. Enable servers in Xerus tools page');
    
  } catch (error) {
    console.error('[ERROR] Error updating MCP URLs:', error);
    process.exit(1);
  }
}

// Allow customizing URLs via command line arguments
if (process.argv.length > 2) {
  const customServerId = process.argv[2];
  const customUrl = process.argv[3];
  
  if (customServerId && customUrl) {
    DEPLOYED_MCP_URLS[customServerId] = {
      url: customUrl,
      oauthCallbackUrl: customUrl.replace('/mcp/', '/oauth2callback'),
      status: 'available'
    };
    console.log(`[TOOL] Custom URL set for ${customServerId}: ${customUrl}`);
  }
}

// Run the update
main().catch(console.error);