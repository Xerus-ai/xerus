# MCP (Model Context Protocol) Implementation

**Version**: 1.0  
**Last Updated**: August 2025  
**Status**: Production Ready

## Overview

The Xerus AI Assistant implements the Model Context Protocol (MCP) to provide standardized integration with external AI tools and services. This implementation follows industry best practices and is inspired by successful architectures like Goose AI.

## What is MCP?

The Model Context Protocol (MCP) is a standard protocol that enables AI applications to securely connect to data sources and tools. It provides:

- **Standardized Communication**: Uniform interface for tool integration
- **Secure Credential Management**: AES-256-GCM encryption for sensitive data
- **Server Lifecycle Management**: Automatic startup, shutdown, and health monitoring
- **Remote Capability**: Support for both local and remote MCP servers

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Xerus AI Assistant                       │
├─────────────────────────────────────────────────────────────────┤
│  Tools Page UI (Next.js)                                       │
│  ├── Tool Cards with Icons                                     │
│  ├── Connect/Execute Buttons                                   │
│  └── Configuration Modal                                       │
├─────────────────────────────────────────────────────────────────┤
│  Backend API Layer (Express.js)                                │
│  ├── /api/v1/tools/mcp-servers                                │
│  ├── /api/v1/tools/execute-mcp                                │
│  ├── /api/v1/tools/configure-mcp                              │
│  └── /api/v1/tools/icons/:iconName                            │
├─────────────────────────────────────────────────────────────────┤
│  MCP Manager Service                                            │
│  ├── Server Lifecycle Management                               │
│  ├── Credential Management (AES-256-GCM)                      │
│  ├── SSE Transport for Remote Servers                         │
│  └── Error Handling & Logging                                 │
├─────────────────────────────────────────────────────────────────┤
│  Database Layer (Neon PostgreSQL)                              │
│  ├── tool_configurations (MCP server configs)                 │
│  ├── mcp_credentials (encrypted credentials)                   │
│  └── tool_executions (execution logs)                         │
└─────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. MCP Manager (`backend/services/mcp/mcpManager.js`)

The central service responsible for managing MCP server lifecycle and communication.

**Key Features:**
- **Server Registration**: Automatic discovery and registration of MCP servers
- **Lifecycle Management**: Start, stop, restart, health monitoring
- **Credential Encryption**: AES-256-GCM encryption for OAuth tokens and API keys
- **Transport Layer**: SSE (Server-Sent Events) for remote communication
- **Error Recovery**: Automatic retry and fallback mechanisms

**Supported MCP Servers:**
```javascript
const PRODUCTION_MCP_SERVERS = {
  'playwright-remote': {
    name: 'Playwright Browser Testing',
    description: 'Cross-browser automation and testing',
    category: 'testing',
    icon: 'playwright-logo.png',
    oauth_required: false,
    capabilities: ['browser automation', 'testing', 'screenshots']
  },
  'weather-remote': {
    name: 'Weather Information',
    description: 'Real-time weather data and forecasts',
    category: 'data',
    icon: 'weather-icon.png',
    oauth_required: false,
    capabilities: ['weather data', 'forecasts', 'location-based']
  },
  'github-remote': {
    name: 'GitHub Integration',
    description: 'Repository management and code analysis',
    category: 'development',
    icon: 'github-logo.png',
    oauth_required: true,
    capabilities: ['repository access', 'code analysis', 'issue management']
  },
  'gmail-remote': {
    name: 'Gmail Integration',
    description: 'Email management and automation',
    category: 'communication',
    icon: 'gmail-logo.png',
    oauth_required: true,
    capabilities: ['email management', 'automation', 'search']
  },
  'atlassian-remote': {
    name: 'Atlassian Integration',
    description: 'Jira and Confluence integration with issue management, project tracking, and documentation',
    category: 'productivity',
    icon: 'atlassian-logo.png',
    oauth_required: true,
    capabilities: ['issue management', 'project tracking', 'documentation', 'collaboration'],
    tools: 23,
    features: ['Jira CRUD operations', 'Confluence page management', 'Advanced search', 'OAuth 2.0']
  }
};
```

### 2. Tools Page Integration (`xerus_web/app/tools/page.tsx`)

Unified interface where both regular tools and MCP servers are displayed together.

**Key Features:**
- **Unified Display**: MCP servers appear as tools alongside regular integrations
- **Visual Indicators**: Brand icons and capability badges
- **One-Click Activation**: Connect/Execute buttons automatically start MCP servers
- **Configuration Modal**: In-place credential and parameter setup
- **Real-time Status**: Live server status and health indicators

**UI Components:**
```typescript
// Tool Card Layout (220px height for compact display)
<Card className="bg-white border border-gray-200 rounded-xl p-4 h-[220px] flex flex-col">
  <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center p-1">
    <img src={tool.icon} alt={`${tool.name} icon`} className="w-full h-full object-contain" />
  </div>
  <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2">{tool.name}</h3>
  <p className="text-sm text-gray-600 flex-1 line-clamp-3 mb-4">{tool.description}</p>
  
  {/* Status and action buttons */}
  <div className="flex items-center justify-between">
    <StatusIndicator status={tool.status} />
    <ActionButton tool={tool} onExecute={handleExecute} />
  </div>
</Card>
```

### 3. API Layer (`backend/api/routes/tools.js`)

RESTful endpoints for MCP server management and execution.

**Endpoints:**
- `GET /api/v1/tools/mcp-servers` - List available MCP servers
- `POST /api/v1/tools/execute-mcp` - Execute MCP server operations
- `PUT /api/v1/tools/configure-mcp` - Configure server credentials and settings
- `POST /api/v1/tools/start-mcp/:serverId` - Start specific MCP server
- `POST /api/v1/tools/stop-mcp/:serverId` - Stop specific MCP server
- `GET /api/v1/tools/icons/:iconName` - Serve tool icons with CORS headers

### 4. Icon System

Professional brand logos and visual indicators for enhanced UX.

**Features:**
- **Brand Icons**: Official logos for GitHub, Gmail, Playwright, Weather services
- **CORS Handling**: Next.js API proxy route to avoid cross-origin issues
- **Caching**: 24-hour cache headers for optimal performance
- **Fallback**: Graceful fallback to default icons

**Implementation:**
```javascript
// Backend icon serving
router.get('/icons/:iconName', asyncHandler(async (req, res) => {
  const { iconName } = req.params;
  const iconPath = path.join(__dirname, '../../tool_icons', iconName);
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(iconPath);
}));

// Frontend proxy to avoid CORS
// xerus_web/app/api/tools/icons/[iconName]/route.ts
const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api';
const iconUrl = `${backendUrl}/v1/tools/icons/${iconName}`;
```

## Security Implementation

### Credential Management

All sensitive data is encrypted using AES-256-GCM encryption:

```javascript
const crypto = require('crypto');

class CredentialManager {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.key = crypto.randomBytes(32); // In production, use secure key management
  }

  encrypt(text) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher(this.algorithm, this.key);
    cipher.setAAD(Buffer.from('mcp-credentials'));
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  }

  decrypt(encryptedData) {
    const decipher = crypto.createDecipher(this.algorithm, this.key);
    decipher.setAAD(Buffer.from('mcp-credentials'));
    decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
    
    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
}
```

### OAuth Integration

Secure OAuth 2.0 flow for services requiring authentication:

1. **Authorization Request**: Redirect user to service OAuth page
2. **Callback Handling**: Secure token exchange and storage
3. **Token Refresh**: Automatic token renewal before expiration
4. **Revocation**: Clean credential removal when disconnecting

## Database Schema

### tool_configurations Table
```sql
CREATE TABLE tool_configurations (
  id SERIAL PRIMARY KEY,
  tool_name VARCHAR(255) NOT NULL UNIQUE,
  display_name VARCHAR(255),
  description TEXT,
  category VARCHAR(100),
  icon VARCHAR(500), -- Added for MCP server icons
  enabled BOOLEAN DEFAULT false,
  oauth_required BOOLEAN DEFAULT false,
  capabilities JSONB DEFAULT '[]',
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### mcp_credentials Table
```sql
CREATE TABLE mcp_credentials (
  id SERIAL PRIMARY KEY,
  tool_name VARCHAR(255) NOT NULL,
  user_id VARCHAR(255), -- For user-specific credentials
  encrypted_credentials TEXT NOT NULL,
  iv VARCHAR(32) NOT NULL,
  auth_tag VARCHAR(32) NOT NULL,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (tool_name) REFERENCES tool_configurations(tool_name) ON DELETE CASCADE
);
```

## Error Handling

Comprehensive error handling with user-friendly messages:

```javascript
class MCPError extends Error {
  constructor(message, code, serverName = null) {
    super(message);
    this.name = 'MCPError';
    this.code = code;
    this.serverName = serverName;
  }
}

const ERROR_CODES = {
  SERVER_NOT_FOUND: 'MCP_SERVER_NOT_FOUND',
  SERVER_START_FAILED: 'MCP_SERVER_START_FAILED',
  CREDENTIAL_ERROR: 'MCP_CREDENTIAL_ERROR',
  EXECUTION_FAILED: 'MCP_EXECUTION_FAILED',
  OAUTH_FAILED: 'MCP_OAUTH_FAILED'
};
```

## Performance Considerations

### Caching Strategy
- **Server Metadata**: Cached for 1 hour to reduce database queries
- **Icon Assets**: 24-hour browser cache with CDN-like headers
- **Capability Discovery**: Cached until server restart

### Resource Management
- **Connection Pooling**: Reuse MCP connections when possible
- **Graceful Shutdown**: Clean disconnection on app termination
- **Memory Monitoring**: Automatic cleanup of inactive servers

### Scalability
- **Horizontal Scaling**: Support for multiple MCP gateway instances
- **Load Balancing**: Distribute requests across available servers
- **Health Monitoring**: Automatic failover for unhealthy servers

## Development Workflow

### Adding New MCP Servers

1. **Register Server**: Add to `PRODUCTION_MCP_SERVERS` configuration
2. **Add Icon**: Place brand logo in `backend/tool_icons/`
3. **Database Entry**: Insert into `tool_configurations` table
4. **Test Integration**: Verify connection and capability detection
5. **UI Integration**: Ensure proper display in tools page

### Testing

```bash
# Test MCP server connectivity
node scripts/test-mcp-connection.js

# Test credential encryption/decryption
node scripts/test-credential-manager.js

# Integration tests
npm run test:mcp
```

## Deployment

### Environment Variables
```bash
# MCP Configuration
MCP_GATEWAY_PORT=3001
MCP_LOG_LEVEL=info
MCP_CREDENTIAL_KEY=your-32-byte-key

# Database
DATABASE_URL=postgresql://user:pass@host:5432/xerus

# OAuth Credentials (encrypted in database)
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
GMAIL_CLIENT_ID=your-gmail-client-id
GMAIL_CLIENT_SECRET=your-gmail-client-secret
```

### Production Checklist
- [ ] Secure credential key management
- [ ] SSL/TLS certificates for OAuth callbacks
- [ ] Database connection pooling
- [ ] Monitoring and alerting
- [ ] Log aggregation
- [ ] Backup and recovery procedures

## Troubleshooting

### Common Issues

**"MCP server is not running"**
- Verify server configuration in database
- Check server logs for startup errors
- Ensure required OAuth credentials are configured

**"Tool execution failed"**
- Check network connectivity to remote MCP servers
- Verify API keys and authentication tokens
- Review execution logs for specific error details

**"OAuth configuration failed"**
- Verify OAuth client credentials
- Check callback URL configuration
- Ensure proper redirect URI whitelisting

**CORS errors on icon loading**
- Icons are served through Next.js proxy route
- Verify `NEXT_PUBLIC_API_URL` environment variable
- Check backend server accessibility

## Atlassian MCP Server Integration

### Overview
The Atlassian MCP server provides comprehensive integration with Jira and Confluence, enabling seamless issue management, project tracking, and documentation workflows within the Xerus AI assistant.

### Features
- **Jira Integration**: Full CRUD operations for issues, projects, and metadata
- **Confluence Integration**: Page and space management with search capabilities
- **OAuth 2.0 Authentication**: Secure cloud authentication with comprehensive scopes
- **Advanced Search**: Powerful search across both Jira and Confluence platforms
- **Comment Management**: Add and retrieve comments on issues and pages
- **Workflow Management**: Issue transitions, assignments, and status management

### Supported Tools (23 total)

#### Jira Tools (16)
```javascript
// Issue Management
'jira_create_issue', 'jira_get_issue', 'jira_update_issue', 'jira_delete_issue',
'jira_search_issues', 'jira_add_comment', 'jira_get_comments', 'jira_transition_issue',

// Project & Metadata
'jira_get_projects', 'jira_get_project', 'jira_get_issue_types', 'jira_get_priorities',
'jira_get_statuses', 'jira_assign_issue', 'jira_get_watchers', 'jira_add_watcher'
```

#### Confluence Tools (7)
```javascript
// Page Management
'confluence_create_page', 'confluence_get_page', 'confluence_update_page', 'confluence_delete_page',
'confluence_search_pages', 

// Space & Comments
'confluence_get_spaces', 'confluence_get_space', 'confluence_add_comment', 'confluence_get_comments'
```

### OAuth 2.0 Configuration

#### Required Scopes
```javascript
const ATLASSIAN_OAUTH_SCOPES = [
  // Jira Permissions
  'read:jira-user',           // Read user information
  'read:jira-work',           // Read issues, projects, and work items
  'write:jira-work',          // Create and update issues
  'manage:jira-project',      // Manage project settings and metadata
  
  // Confluence Permissions
  'read:confluence-space.summary',    // Read space information
  'read:confluence-props',            // Read page properties
  'write:confluence-props',           // Write page properties
  'read:confluence-content.all',      // Read all content
  'write:confluence-content'          // Create and update content
];
```

#### Authentication Flow
1. **Authorization Request**: User redirected to Atlassian OAuth page
2. **Consent Grant**: User grants permissions for required scopes
3. **Token Exchange**: Authorization code exchanged for access token
4. **Credential Storage**: Tokens encrypted and stored in database
5. **Token Refresh**: Automatic refresh before expiration

### Usage Examples

#### Creating a Jira Issue
```javascript
const issueData = {
  name: 'jira_create_issue',
  arguments: {
    project: 'PROJ',
    summary: 'Bug report from Xerus AI',
    description: 'Detailed bug description...',
    issueType: 'Bug',
    priority: 'High'
  }
};
```

#### Searching Confluence Pages
```javascript
const searchData = {
  name: 'confluence_search_pages',
  arguments: {
    query: 'API documentation',
    space: 'DEV',
    limit: 10
  }
};
```

### Security Considerations
- **OAuth 2.0 Cloud Only**: Supports Atlassian Cloud instances only
- **Scope Minimization**: Requests only necessary permissions
- **Token Encryption**: All access tokens encrypted at rest
- **Audit Logging**: All operations logged for security compliance

### Integration with Xerus Agents
- **Context-Aware**: Agents can access relevant Jira issues based on conversation context
- **Documentation Integration**: Confluence pages can be referenced in AI responses
- **Workflow Automation**: Agents can create and update issues based on user requests
- **Knowledge Base**: Confluence content enriches agent knowledge for better responses

## Future Enhancements

### Planned Features
- **Custom MCP Servers**: User-defined server integration
- **Server Marketplace**: Community-contributed MCP servers
- **Advanced Analytics**: Usage metrics and performance monitoring
- **Multi-tenancy**: Organization-level server management
- **SDK Development**: JavaScript SDK for third-party integrations
- **Atlassian Server Support**: Support for self-hosted Atlassian instances

### API Versioning
Current implementation uses API version `v1`. Future versions will maintain backward compatibility while introducing enhanced features.

## Contributing

When contributing to MCP implementation:

1. Follow existing code patterns and conventions
2. Add comprehensive tests for new functionality
3. Update documentation for API changes
4. Ensure security best practices are maintained
5. Test integration with existing tools and agents

## References

- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Goose AI MCP Implementation](https://github.com/square/goose)
- [Xerus API Documentation](./API_DOCUMENTATION.md)
- [Xerus User Guide](./USER_GUIDE.md)