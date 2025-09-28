/**
 * Add Atlassian MCP Server to Database
 * Inserts Atlassian MCP server configuration into tool_configurations table
 */

const { Pool } = require('pg');
require('dotenv').config();

// Database configuration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Atlassian MCP Server Configuration
const atlassianMCPConfig = {
  tool_name: 'atlassian-remote',
  display_name: 'Atlassian',
  description: 'Jira and Confluence integration with issue management, project tracking, and documentation',
  category: 'productivity',
  icon: '/api/tools/icons/atlassian-logo.png',
  is_enabled: false, // Disabled by default until OAuth is configured
  requires_auth: true,
  auth_type: 'oauth',
  provider: 'mcp',
  tool_type: 'remote',
  default_config: JSON.stringify({
    type: 'remote',
    url: 'https://atlassian-mcp.example.com/mcp/',
    authType: 'oauth',
    oauthCallbackUrl: 'https://atlassian-mcp.example.com/oauth2callback',
    npmPackage: 'mcp-atlassian',
    documentation: 'https://github.com/sooperset/mcp-atlassian',
    toolCount: 23,
    oauthScopes: [
      'read:jira-user',
      'read:jira-work', 
      'write:jira-work',
      'manage:jira-project',
      'read:confluence-space.summary',
      'read:confluence-props',
      'write:confluence-props',
      'read:confluence-content.all',
      'write:confluence-content'
    ],
    tools: [
      // Jira Tools
      'jira_create_issue', 'jira_get_issue', 'jira_update_issue', 'jira_delete_issue',
      'jira_search_issues', 'jira_add_comment', 'jira_get_comments', 'jira_transition_issue',
      'jira_get_projects', 'jira_get_project', 'jira_get_issue_types', 'jira_get_priorities',
      'jira_get_statuses', 'jira_assign_issue', 'jira_get_watchers', 'jira_add_watcher',
      // Confluence Tools  
      'confluence_create_page', 'confluence_get_page', 'confluence_update_page', 'confluence_delete_page',
      'confluence_search_pages', 'confluence_get_spaces', 'confluence_get_space', 
      'confluence_add_comment', 'confluence_get_comments'
    ],
    features: [
      'OAuth 2.0 Authentication (Cloud)',
      'Jira Issue Management (CRUD operations)',
      'Jira Project and Metadata Access',
      'Confluence Page Management (CRUD operations)', 
      'Confluence Space Management',
      'Advanced Search Capabilities',
      'Comment Management',
      'Issue Transitions and Assignments'
    ]
  })
};

async function addAtlassianMCP() {
  const client = await pool.connect();
  
  try {
    console.log('[LOADING] Adding Atlassian MCP server to database...');
    
    // Check if Atlassian MCP already exists
    const existingCheck = await client.query(
      'SELECT tool_name FROM tool_configurations WHERE tool_name = $1',
      [atlassianMCPConfig.tool_name]
    );
    
    if (existingCheck.rows.length > 0) {
      console.log('[WARNING]  Atlassian MCP server already exists, updating configuration...');
      
      // Update existing entry
      const result = await client.query(
        `UPDATE tool_configurations SET 
         display_name = $2, 
         description = $3, 
         category = $4, 
         icon = $5, 
         is_enabled = $6, 
         requires_auth = $7, 
         auth_type = $8, 
         provider = $9,
         tool_type = $10,
         default_config = $11,
         updated_at = CURRENT_TIMESTAMP
         WHERE tool_name = $1`,
        [
          atlassianMCPConfig.tool_name,
          atlassianMCPConfig.display_name,
          atlassianMCPConfig.description,
          atlassianMCPConfig.category,
          atlassianMCPConfig.icon,
          atlassianMCPConfig.is_enabled,
          atlassianMCPConfig.requires_auth,
          atlassianMCPConfig.auth_type,
          atlassianMCPConfig.provider,
          atlassianMCPConfig.tool_type,
          atlassianMCPConfig.default_config
        ]
      );
      
      console.log(`[OK] Updated Atlassian MCP: ${result.rowCount} row(s) affected`);
    } else {
      // Insert new entry
      const result = await client.query(
        `INSERT INTO tool_configurations 
         (tool_name, display_name, description, category, icon, is_enabled, requires_auth, auth_type, provider, tool_type, default_config)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          atlassianMCPConfig.tool_name,
          atlassianMCPConfig.display_name,
          atlassianMCPConfig.description,
          atlassianMCPConfig.category,
          atlassianMCPConfig.icon,
          atlassianMCPConfig.is_enabled,
          atlassianMCPConfig.requires_auth,
          atlassianMCPConfig.auth_type,
          atlassianMCPConfig.provider,
          atlassianMCPConfig.tool_type,
          atlassianMCPConfig.default_config
        ]
      );
      
      console.log(`[OK] Added Atlassian MCP: ${result.rowCount} row(s) inserted`);
    }
    
    // Show current MCP servers
    console.log('\n[TASKS] Current MCP servers in database:');
    const mcpServers = await client.query(
      `SELECT tool_name, display_name, is_enabled, requires_auth, auth_type, icon
       FROM tool_configurations 
       WHERE tool_name LIKE '%-remote' OR provider = 'mcp'
       ORDER BY display_name`
    );
    
    mcpServers.rows.forEach(server => {
      const status = server.is_enabled ? '🟢' : '🔴';
      const auth = server.requires_auth ? `🔐 ${server.auth_type || 'OAuth'}` : '🔑 API Key';
      const icon = server.icon ? '🖼️' : '[ERROR]';
      console.log(`  ${status} ${server.display_name} (${server.tool_name}) - ${auth} ${icon}`);
    });
    
    console.log('\n[OK] Atlassian MCP server configuration added successfully!');
    console.log('\n📝 Next steps:');
    console.log('   1. Add atlassian_logo.png to backend/tool_icons/ folder');
    console.log('   2. Configure OAuth 2.0 credentials in MCP server deployment');
    console.log('   3. Update URL in mcpManager.js once server is deployed');
    console.log('   4. Test OAuth flow and tool execution');
    
  } catch (error) {
    console.error('[ERROR] Error adding Atlassian MCP server:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the script
addAtlassianMCP().catch(console.error);