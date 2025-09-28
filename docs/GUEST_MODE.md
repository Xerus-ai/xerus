# 🎯 Guest Mode Testing Guide

> **Complete guide** for testing the Xerus Glass guest user experience with database-driven permissions

---

## 🌐 What is Guest Mode?

Guest Mode allows users to experience Xerus Glass without creating an account. The system uses **database-driven permissions** for scalable configuration:

- ✅ **Configurable Agent Access**: Database-controlled agent permissions
- ✅ **Dynamic Tool Usage**: Admin-configurable tool access with usage limits
- ✅ **Credit-Based System**: Guest users get 10 free credits, stored in PostgreSQL
- ✅ **Real-time Configuration**: No code changes needed to modify guest permissions
- ✅ **Audit Trail**: Complete change history for all permission modifications

## 🏗️ Architecture Overview

### Database-Driven Permissions
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│ Guest Request   │───▶│ Permission Check │───▶│ Database Query  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │ Cached Response  │
                       └──────────────────┘
```

### Default Permissions (Auto-Seeded)
**Agents:**
- ✅ `assistant` - Full access
- ✅ `demo` - Full access  
- ✅ `customer_support` - Full access
- ❌ All other agents - Disabled (shown but locked)

**Tools:**
- ✅ `tavily` - 50 uses/day, 20/hour
- ✅ `perplexity` - 30 uses/day, 15/hour
- ❌ All other tools - Disabled (shown but locked)

## 🚀 Quick Setup

### Enable Guest Mode
Open browser console at `http://localhost:3000` and run:
```javascript
localStorage.setItem('prefer_guest_mode', 'true');
location.reload();
```

### Disable Guest Mode  
```javascript
localStorage.removeItem('prefer_guest_mode');
localStorage.removeItem('guest_session');
location.reload();
```

---

## 🧪 Testing Guest Features

**🎯 Unified Permissions System**: Guest permission restrictions have been removed. All users (guest and authenticated) now have the same permissions and access to all features.

### ✅ Available for All Users (Guest and Authenticated)
- `/agents` - **Full access to ALL agents** and configurations
- `/tools` - **Full access to ALL tools** including advanced features
- `/search` - Complete search functionality (Perplexity, Tavily, Firecrawl, etc.)
- `/knowledge-base` - Knowledge base management and access
- Agent configurations and customization
- Advanced tool usage and settings
- Full conversation storage and history

**Key Changes:**
- 🔓 **No More Guest Restrictions**: All functionality available to all users
- 💳 **Credit-Based System**: Guest users get 10 credits, authenticated users get 50 credits
- 🎯 **Unified Experience**: Same interface and capabilities regardless of login status

---

## 🔧 Admin Configuration Testing

> **Note**: Requires admin authentication to modify guest permissions

### View Current Configuration
```bash
curl -H "Authorization: Bearer admin_token" \
     -H "X-User-ID: admin_user" \
     http://localhost:5001/api/v1/guest-config
```

### Enable New Agent for Guests
```bash
curl -X PUT \
     -H "Authorization: Bearer admin_token" \
     -H "X-User-ID: admin_user" \
     -H "Content-Type: application/json" \
     -d '{"isEnabled": true, "accessLevel": "full"}' \
     http://localhost:5001/api/v1/guest-config/agents/research_assistant
```

### Enable New Tool for Guests
```bash
curl -X PUT \
     -H "Authorization: Bearer admin_token" \
     -H "X-User-ID: admin_user" \
     -H "Content-Type: application/json" \
     -d '{"isEnabled": true, "usageLimit": 25, "rateLimitPerHour": 10}' \
     http://localhost:5001/api/v1/guest-config/tools/calculator
```

### Bulk Update Multiple Permissions
```bash
curl -X POST \
     -H "Authorization: Bearer admin_token" \
     -H "X-User-ID: admin_user" \
     -H "Content-Type: application/json" \
     -d '{
       "updates": [
         {"personalityType": "research", "isEnabled": true, "accessLevel": "full"},
         {"personalityType": "creative", "isEnabled": false, "accessLevel": "read_only"}
       ]
     }' \
     http://localhost:5001/api/v1/guest-config/agents/bulk-update
```

---

## 🧪 API Testing Scenarios

### Guest API Calls (Should Work)
```bash
# View agents - ALL agents returned with guest_enabled status
curl -H "Authorization: guest" -H "x-guest-session: test123" \
  http://localhost:5001/api/v1/agents

# View tools - ALL tools returned with guest_enabled status  
curl -H "Authorization: guest" -H "x-guest-session: test123" \
  http://localhost:5001/api/v1/tools

# Execute enabled tool
curl -X POST \
     -H "Authorization: guest" \
     -H "x-guest-session: test123" \
     -H "Content-Type: application/json" \
     -d '{"parameters": {"query": "AI developments", "max_results": 3}}' \
     http://localhost:5001/api/v1/tools/tavily/execute

# Chat with enabled agent
curl -X POST \
     -H "Authorization: guest" \
     -H "x-guest-session: test123" \
     -H "Content-Type: application/json" \
     -d '{"input": "Hello, can you help me?"}' \
     http://localhost:5001/api/v1/agents/1/execute
```

### Restricted API Calls (Should Return 401)
```bash
# Try to execute disabled tool
curl -X POST \
     -H "Authorization: guest" \
     -H "x-guest-session: test123" \
     -H "Content-Type: application/json" \
     -d '{"parameters": {"url": "https://example.com"}}' \
     http://localhost:5001/api/v1/tools/firecrawl/execute

# Try to access knowledge base
curl -H "Authorization: guest" -H "x-guest-session: test123" \
  http://localhost:5001/api/v1/knowledge

# Try to access admin config (unless admin)
curl -H "Authorization: guest" -H "x-guest-session: test123" \
  http://localhost:5001/api/v1/guest-config
```

---

## 📊 Expected Response Format

### Agent List Response (Guest Mode)
```json
[
  {
    "id": 1,
    "name": "Assistant",
    "personality_type": "assistant",
    "is_active": true,
    "guest_enabled": true,
    "guest_access_level": "full",
    "guest_disabled_reason": null
  },
  {
    "id": 3, 
    "name": "Research Assistant",
    "personality_type": "research",
    "is_active": false,
    "guest_enabled": false,
    "guest_access_level": "read_only",
    "guest_disabled_reason": "Sign in to use this agent"
  }
]
```

### Tool List Response (Guest Mode)
```json
[
  {
    "id": 1,
    "tool_name": "tavily",
    "is_enabled": true,
    "guest_enabled": true,
    "guest_usage_limit": 50,
    "guest_rate_limit": 20,
    "guest_disabled_reason": null
  },
  {
    "id": 2,
    "tool_name": "firecrawl", 
    "is_enabled": false,
    "guest_enabled": false,
    "guest_usage_limit": 0,
    "guest_rate_limit": 0,
    "guest_disabled_reason": "Sign in to use this tool"
  }
]
```

### Error Response (Disabled Tool/Agent)
```json
{
  "error": "Authentication required",
  "message": "Please sign in to use this tool",
  "guestMode": true,
  "code": "GUEST_LOGIN_REQUIRED",
  "toolName": "firecrawl",
  "allowedTools": ["tavily", "perplexity"]
}
```

---

## 🎯 Visual Indicators

### UI Elements to Verify
- **Sidebar**: Shows "Guest" instead of user name
- **Network Tab**: Look for `X-Guest-Mode: true` headers  
- **Agent Cards**: Enabled agents clickable, disabled ones show lock icon
- **Tool Cards**: Enabled tools functional, disabled ones show "Sign In Required"
- **Headers**: `X-Guest-Enabled-Agents` and `X-Guest-Enabled-Tools` in responses

### Browser Console Verification
```javascript
// Check guest session
console.log('Guest Mode:', localStorage.getItem('prefer_guest_mode'));
console.log('Session Token:', localStorage.getItem('guest_session'));

// Verify API responses include guest indicators
fetch('/api/v1/agents', {
  headers: { 'Authorization': 'guest', 'x-guest-session': 'test123' }
}).then(r => r.headers.get('X-Guest-Mode')); // Should return 'true'
```

---

## 🔄 Dynamic Configuration Testing

### Test Scenario: Add New Agent
1. **Before**: Guest sees research agent as disabled
2. **Admin Action**: Enable research agent via API
3. **After**: Guest immediately sees research agent as enabled (5min cache)

### Test Scenario: Modify Tool Limits
1. **Before**: Tavily has 50 usage limit
2. **Admin Action**: Update to 100 usage limit
3. **After**: Guest sees updated limit in tool response

### Verify Cache Invalidation
- Configuration changes clear relevant cache entries
- New settings take effect within 5 minutes
- Health endpoint shows service status

---

## 🛠️ Troubleshooting

### Common Issues
1. **Agents/Tools not showing**: Check backend server status and database connection
2. **Permissions not updating**: Check cache timeout (5 minutes) or restart backend  
3. **Admin config not accessible**: Verify admin token and role
4. **Guest session not persisting**: Check browser storage and session headers

### Debug Commands
```bash
# Check service health
curl http://localhost:5001/api/v1/guest-config/health

# View audit log
curl -H "Authorization: Bearer admin_token" \
     -H "X-User-ID: admin_user" \
     http://localhost:5001/api/v1/guest-config/audit

# Check database tables (PostgreSQL)
psql $DATABASE_URL -c "SELECT * FROM guest_agent_permissions;"
psql $DATABASE_URL -c "SELECT * FROM guest_tool_permissions;"
```

---

*This testing guide covers the complete database-driven guest permission system. All permissions can be modified without code changes through the admin API endpoints.*