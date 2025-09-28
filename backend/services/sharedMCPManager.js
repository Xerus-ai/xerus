/**
 * Shared MCP Manager Instance
 * Creates a single MCP Manager instance that can be shared between
 * the web portal tools API and the agent orchestration system
 */

const MCPManager = require('./mcp/mcpManager');

// Create single shared instance
const sharedMCPManager = new MCPManager();

console.log('[TOOL] Shared MCP Manager initialized - single instance for both web portal and agent integration');

module.exports = sharedMCPManager;