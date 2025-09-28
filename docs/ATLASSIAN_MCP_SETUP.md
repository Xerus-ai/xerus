# Atlassian MCP Server Setup Guide

## Current Issue

The Atlassian tool shows "⚠️ Not Configured" despite successful OAuth authentication because the hosted MCP server at `https://mcp-atlassian-eexd.onrender.com/mcp/` is not configured with the required `ATLASSIAN_OAUTH_ENABLE=true` environment variable.

## Root Cause Analysis

1. **Authentication Works**: OAuth tokens are properly sent and accepted (200 status)
2. **Server Responds**: But returns empty `{"tools": []}` array
3. **Configuration Missing**: Server needs `ATLASSIAN_OAUTH_ENABLE=true` for per-request authentication

## Solutions

### Solution 1: Use Properly Configured Hosted Server (Recommended)

Contact the server maintainer to add `ATLASSIAN_OAUTH_ENABLE=true` to their environment configuration, or deploy your own instance with proper configuration.

### Solution 2: Local Development Server

For development/testing, run a local MCP server:

1. **Prerequisites**: 
   - Python 3.8+
   - MCP Atlassian package dependencies

2. **Setup Local Server**:
   ```bash
   # Set environment variables
   export ATLASSIAN_OAUTH_ENABLE=true
   export MCP_VERBOSE=true
   export HOST=localhost
   export PORT=8000
   
   # Enable local server in Xerus
   export ATLASSIAN_LOCAL_MCP_ENABLED=true
   
   # Start the local server (from mcp-atlassian directory)
   python web_server.py
   ```

3. **Configure Xerus Backend**:
   - Server will be available at: `http://localhost:8000/mcp`
   - Xerus will automatically detect and use the local server when `ATLASSIAN_LOCAL_MCP_ENABLED=true`

### Solution 3: Alternative Server Deployment

Deploy your own instance of the MCP Atlassian server with proper configuration:

1. **Fork the repository**: `https://github.com/sooperset/mcp-atlassian`
2. **Set environment variables**:
   ```
   ATLASSIAN_OAUTH_ENABLE=true
   MCP_VERBOSE=true
   ```
3. **Deploy to your preferred platform** (Render, Heroku, Railway, etc.)
4. **Update Xerus configuration** to use your server URL

## Environment Variables Needed

For the MCP server to expose tools with per-request authentication:

```bash
# Required for per-request OAuth authentication
ATLASSIAN_OAUTH_ENABLE=true

# Optional but recommended for debugging
MCP_VERBOSE=true
MCP_LOGGING_STDOUT=true
```

## Testing

Use the provided test scripts:

```bash
# Test local server
cd glass/backend
node test-local-mcp.js

# Test remote server (for debugging)
node debug-sse.js
```

## Current Status

- ✅ **OAuth Authentication**: Working correctly
- ✅ **MCP Protocol**: Handshake and communication working
- ✅ **SSE Parsing**: Response parsing working
- ❌ **Server Configuration**: Missing `ATLASSIAN_OAUTH_ENABLE=true`

## Next Steps

1. **Immediate**: Use local server for development
2. **Short-term**: Deploy properly configured hosted server
3. **Long-term**: Contribute fix back to upstream project