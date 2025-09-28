# Guest Permissions Architecture - Database-Driven Solution

## 🏗️ Senior Architect Solution Overview

This document outlines the **scalable, database-driven guest permission system** implemented to address the original hardcoded approach.

### ❌ Previous Implementation (Hardcoded)
```javascript
// BAD: Hardcoded in routes
const GUEST_ENABLED_AGENTS = ['demo', 'customer_support', 'assistant'];
const GUEST_ENABLED_TOOLS = ['tavily', 'perplexity'];
```

### ✅ New Implementation (Database-Driven)
```javascript
// GOOD: Database-driven with caching
const enabledAgents = await guestPermissionService.getEnabledAgents();
const enabledTools = await guestPermissionService.getEnabledTools();
```

---

## 🎯 Key Benefits

### 1. **Scalability**
- ✅ Add/remove guest permissions without code changes
- ✅ Bulk updates via API endpoints
- ✅ Configuration managed through admin panel

### 2. **Maintainability** 
- ✅ Single source of truth in database
- ✅ Audit trail for all permission changes
- ✅ Centralized configuration management

### 3. **Performance**
- ✅ 5-minute caching layer
- ✅ Optimized database queries
- ✅ Health monitoring and metrics

### 4. **Governance**
- ✅ Role-based admin access
- ✅ Permission audit logging
- ✅ Change tracking with timestamps

---

## 🗄️ Database Schema

### Core Tables

#### 1. **guest_config**
```sql
CREATE TABLE guest_config (
    id SERIAL PRIMARY KEY,
    key VARCHAR(100) UNIQUE NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 2. **guest_agent_permissions**
```sql
CREATE TABLE guest_agent_permissions (
    id SERIAL PRIMARY KEY,
    agent_id INTEGER REFERENCES agents(id) ON DELETE CASCADE,
    personality_type VARCHAR(100) UNIQUE,
    is_enabled BOOLEAN DEFAULT false,
    access_level VARCHAR(50) DEFAULT 'read_only',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 3. **guest_tool_permissions**
```sql
CREATE TABLE guest_tool_permissions (
    id SERIAL PRIMARY KEY,
    tool_name VARCHAR(100) UNIQUE NOT NULL,
    tool_category VARCHAR(100),
    is_enabled BOOLEAN DEFAULT false,
    usage_limit INTEGER DEFAULT -1,
    rate_limit_per_hour INTEGER DEFAULT 100,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 4. **guest_permission_audit**
```sql
CREATE TABLE guest_permission_audit (
    id SERIAL PRIMARY KEY,
    action VARCHAR(50) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id VARCHAR(100) NOT NULL,
    old_value JSONB,
    new_value JSONB,
    changed_by VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 🚀 Service Architecture

### Core Service: `GuestPermissionService`

```javascript
class GuestPermissionService {
    // Core Methods
    async getEnabledAgents()      // Get all guest-enabled agents
    async getEnabledTools()       // Get all guest-enabled tools
    async getBasePermissions()    // Get base guest permissions
    
    // Management Methods
    async updateAgentPermission(personalityType, isEnabled, accessLevel)
    async updateToolPermission(toolName, isEnabled, usageLimit, rateLimit)
    
    // Admin Methods
    async getGuestConfiguration() // Full config for admin panel
    async logPermissionChange()   // Audit logging
    
    // Performance
    getFromCache() / setCache()   // 5-minute caching
    async healthCheck()           // Service health monitoring
}
```

### Caching Strategy
- **Cache Duration**: 5 minutes
- **Cache Keys**: `base_permissions`, `enabled_agents`, `enabled_tools`
- **Cache Invalidation**: Automatic on configuration changes
- **Fallback**: Returns safe defaults if cache/DB unavailable

---

## 🌐 API Endpoints

### Admin Management APIs

#### **GET /api/v1/guest-config**
Get complete guest configuration (Admin only)
```bash
curl -H "Authorization: Bearer admin_token" \
     -H "X-User-ID: admin_user" \
     http://localhost:5001/api/v1/guest-config
```

#### **PUT /api/v1/guest-config/agents/:personalityType**
Update agent permission
```bash
curl -X PUT \
     -H "Authorization: Bearer admin_token" \
     -H "X-User-ID: admin_user" \
     -H "Content-Type: application/json" \
     -d '{"isEnabled": true, "accessLevel": "full"}' \
     http://localhost:5001/api/v1/guest-config/agents/demo
```

#### **PUT /api/v1/guest-config/tools/:toolName**
Update tool permission
```bash
curl -X PUT \
     -H "Authorization: Bearer admin_token" \
     -H "X-User-ID: admin_user" \
     -H "Content-Type: application/json" \
     -d '{"isEnabled": true, "usageLimit": 50, "rateLimitPerHour": 20}' \
     http://localhost:5001/api/v1/guest-config/tools/tavily
```

#### **POST /api/v1/guest-config/agents/bulk-update**
Bulk update multiple agents
```bash
curl -X POST \
     -H "Authorization: Bearer admin_token" \
     -H "X-User-ID: admin_user" \
     -H "Content-Type: application/json" \
     -d '{
       "updates": [
         {"personalityType": "demo", "isEnabled": true, "accessLevel": "full"},
         {"personalityType": "customer_support", "isEnabled": true, "accessLevel": "full"},
         {"personalityType": "research", "isEnabled": false}
       ]
     }' \
     http://localhost:5001/api/v1/guest-config/agents/bulk-update
```

### Monitoring APIs

#### **GET /api/v1/guest-config/health**
Service health check
```bash
curl http://localhost:5001/api/v1/guest-config/health
```

#### **GET /api/v1/guest-config/audit**
Permission change audit log (Admin only)
```bash
curl -H "Authorization: Bearer admin_token" \
     -H "X-User-ID: admin_user" \
     "http://localhost:5001/api/v1/guest-config/audit?limit=20&resourceType=agent"
```

---

## 🔄 Migration Path

### Default Configuration
The service automatically seeds default permissions:

**Agents:**
- ✅ `assistant`: Enabled with full access
- ✅ `demo`: Enabled with full access  
- ✅ `customer_support`: Enabled with full access
- ❌ All other agents: Disabled

**Tools:**
- ✅ `tavily`: Enabled (50 uses/day, 20/hour)
- ✅ `perplexity`: Enabled (30 uses/day, 15/hour)
- ❌ All other tools: Disabled

### Admin Customization
Administrators can modify these defaults through:
1. **Admin Panel UI** (Future)
2. **Direct API calls**
3. **Database updates**

---

## 📊 Benefits Over Previous Approach

| Aspect | Previous (Hardcoded) | New (Database-Driven) |
|--------|---------------------|----------------------|
| **Scalability** | ❌ Code changes required | ✅ Configuration via API |
| **Maintainability** | ❌ Scattered across files | ✅ Centralized service |
| **Audit Trail** | ❌ No change tracking | ✅ Full audit logging |
| **Performance** | ✅ Fast (hardcoded) | ✅ Fast (5min cache) |
| **Flexibility** | ❌ Binary on/off | ✅ Rich configuration |
| **Monitoring** | ❌ No visibility | ✅ Health checks & metrics |
| **Governance** | ❌ No access control | ✅ Role-based admin access |

---

## 🎯 Usage Examples

### Frontend Integration
```javascript
// React component showing guest-enabled tools
const { tools, loading } = useFetch('/api/v1/tools');

const guestEnabledTools = tools.filter(tool => tool.guest_enabled);
const disabledTools = tools.filter(tool => !tool.guest_enabled);

return (
  <div>
    <h3>Available Tools</h3>
    {guestEnabledTools.map(tool => (
      <ToolCard key={tool.id} tool={tool} enabled={true} />
    ))}
    
    <h3>Sign In Required</h3>
    {disabledTools.map(tool => (
      <ToolCard key={tool.id} tool={tool} enabled={false} 
                reason={tool.guest_disabled_reason} />
    ))}
  </div>
);
```

### Admin Panel Integration
```javascript
// Admin component for managing permissions
const [agentPermissions, setAgentPermissions] = useState({});

const updateAgentPermission = async (personalityType, enabled) => {
  await fetch(`/api/v1/guest-config/agents/${personalityType}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isEnabled: enabled })
  });
  
  // Refresh data
  loadAgentPermissions();
};
```

---

## 🚀 Future Enhancements

### Phase 2: Advanced Configuration
- **Time-based permissions** (e.g., weekend restrictions)
- **Geographic restrictions** (by IP/region)
- **Usage quotas and billing integration**
- **A/B testing configuration**

### Phase 3: AI-Driven Optimization  
- **Usage pattern analysis**
- **Automatic permission recommendations**
- **Fraud detection and rate limiting**
- **Performance optimization suggestions**

---

*This architecture follows enterprise-grade patterns for scalability, maintainability, and governance while providing immediate value through database-driven configuration management.*