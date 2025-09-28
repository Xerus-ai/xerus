# 🔧 Xerus Glass - API Documentation

> **Complete API Reference** - Backend service endpoints, authentication, and intelligent tool integration

---

## 📋 Table of Contents

- [Backend Service API](#backend-service-api)
- [Authentication](#authentication)  
- [Privacy & Security API](#privacy--security-api)
- [Agents API](#agents-api)
- [Knowledge API](#knowledge-api)
- [Tools API](#tools-api)
- [Tool Manager Architecture](#tool-manager-architecture)
- [Base Tool Interface](#base-tool-interface)
- [Built-in Tools](#built-in-tools)
- [Custom Tool Development](#custom-tool-development)
- [Integration Examples](#integration-examples)
- [Error Handling](#error-handling)
- [Performance Considerations](#performance-considerations)

---

## 🌐 Backend Service API

The Xerus backend service runs on `http://localhost:5001` and provides **24 RESTful endpoints** for managing agents, knowledge, tools, and user authentication.

### Base URL
```
http://localhost:5001/api/v1
```

### Latest Features (January 2025)
- ✅ **Production Authentication**: Firebase JWT with role-based permissions (authentication only)
- ✅ **Unified PostgreSQL Architecture**: All data (guest and authenticated users) stored in Neon PostgreSQL
- ✅ **Credit-Based System**: Guest users (10 credits), Authenticated users (50 credits), Admin users (unlimited)
- ✅ **Enhanced Agent System**: 8 database-driven AI personalities with backend API execution
- ✅ **Agent TTS Integration**: Real-time text-to-speech with WebSocket streaming
- ✅ **Dynamic Model Selection**: Real-time AI model switching
- ✅ **SQLite Removal Complete**: Eliminated dual database architecture for simplified operations
- ✅ **Boolean Type Safety**: Fixed PostgreSQL type conversion issues

### Health Check
```bash
curl http://localhost:5001/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2025-01-21T15:00:00.000Z",
  "version": "1.0.0",
  "environment": "development",
  "database": {
    "status": "healthy", 
    "version": "PostgreSQL 17.5"
  },
  "features": {
    "authentication": "Firebase JWT",
    "database": "Neon PostgreSQL",
    "agents": 8,
    "endpoints": 24
  }
}
```

### Database Architecture

**Current Architecture (January 2025)**:
- 🏢 **PostgreSQL (Neon)**: Unified database for all users (guest and authenticated)
  - Conversations, messages, agents, knowledge base
  - All user data, session management, agent configurations
  - Vector embeddings via pgvector extension
  - Guest users receive temporary anonymous sessions
  - Credit-based system for guest vs authenticated access

- 🔐 **Firebase**: Authentication services only
  - JWT token generation and validation
  - User identity and role management
  - Does not store application data

**Architecture Benefits**:
- **Unified Data Management**: Single source of truth for all data
- **Simplified Operations**: No dual database complexity
- **Enhanced Performance**: Direct PostgreSQL access for all operations
- **Better Scalability**: Cloud-native PostgreSQL scaling

---

## 🔐 Authentication

### Development Mode
For development, use the following headers:

```bash
Authorization: Bearer development_token
X-User-ID: admin_user
```

### Admin User (Full Permissions)
```bash
curl -H "Authorization: Bearer development_token" \
     -H "X-User-ID: admin_user" \
     http://localhost:5001/api/v1/agents
```

### Regular User (Limited Permissions)  
```bash
curl -H "Authorization: Bearer development_token" \
     -H "X-User-ID: development_user" \
     http://localhost:5001/api/v1/agents
```

### Guest Mode (NEW)
For guest users without authentication:

```bash
curl -H "Authorization: guest" \
     -H "x-guest-session: guest_session_token" \
     http://localhost:5001/api/v1/agents
```

**Guest Permissions:**
- ✅ **Allowed**: `/agents`, `/tools` (limited), search functionality
- ❌ **Restricted**: `/knowledge`, `/user`, advanced configurations

**Response Headers:**
- `X-Guest-Mode: true`
- `X-Guest-Session: your_session_token`
- `X-Allowed-APIs: perplexity,firecrawl,tavily`

### Production Mode
In production, use proper JWT tokens:
```bash
Authorization: Bearer <jwt_token>
X-User-ID: <user_id>
```

---

## 🛡️ Privacy & Security API

**Status**: ✅ **Backend Implemented** | ⚠️ **UI Integration Pending**

The Privacy Manager provides comprehensive security controls via IPC (Inter-Process Communication) handlers between the frontend and Electron main process.

### Available IPC Endpoints

#### Privacy Settings
```javascript
// Get current privacy status
const status = await window.electronAPI.invoke('get-privacy-status');

// Update privacy settings
await window.electronAPI.invoke('update-privacy-settings', {
  contentProtection: true,
  microphoneEnabled: false,
  privacyMode: 'enhanced'
});
```

#### Content Protection
```javascript
// Toggle content protection (prevents screenshots)
await window.electronAPI.invoke('toggle-content-protection', true);
```

#### Microphone Controls  
```javascript
// Toggle microphone access
await window.electronAPI.invoke('toggle-microphone', false);

// Get microphone status
const micStatus = await window.electronAPI.invoke('get-microphone-status');
```

#### Privacy Modes
```javascript
// Set privacy mode: 'normal', 'enhanced', 'paranoid'
await window.electronAPI.invoke('set-privacy-mode', 'paranoid');
```

#### System Permissions
```javascript
// Check current permissions
const permissions = await window.electronAPI.invoke('check-permissions');

// Request permissions (macOS/Windows)
await window.electronAPI.invoke('request-permissions', ['screen', 'microphone']);
```

#### Privacy Indicators
```javascript
// Show privacy indicator
await window.electronAPI.invoke('show-privacy-indicator', 'shield', 'Content protection enabled');

// Hide privacy indicator  
await window.electronAPI.invoke('hide-privacy-indicator', 'shield');
```

#### Secure Storage
```javascript
// Store encrypted data
await window.electronAPI.invoke('secure-store', 'my-key', { secret: 'data' });

// Retrieve encrypted data
const data = await window.electronAPI.invoke('secure-retrieve', 'my-key');

// Delete encrypted data
await window.electronAPI.invoke('secure-delete', 'my-key');
```

### Keyboard Shortcuts
- **`Ctrl/Cmd + Shift + P`**: Toggle content protection
- **`Ctrl/Cmd + Shift + M`**: Toggle microphone access

### Security Features
- **AES-256-GCM Encryption**: All settings stored with military-grade encryption
- **Platform-Aware Permissions**: macOS system preferences integration
- **Real-time Privacy Indicators**: Visual feedback for active privacy features
- **Content Protection**: Prevents screen recording/screenshots when enabled
- **Secure Storage**: Encrypted file storage in `~/.xerus/secure/`

### Implementation Files
- **Backend**: `src/main/privacy-manager.js`
- **UI Component**: `src/ui/components/PrivacyControls.js` (not yet integrated)
- **Storage Location**: `~/.xerus/secure/*.enc`

---

## 👤 Guest Mode Endpoints

### POST /api/v1/migration/check-guest-data
Check if guest session has data to migrate.

**Headers:**
```bash
Authorization: guest
x-guest-session: your_guest_session_token
```

**Response:**
```json
{
  "hasData": true,
  "conversationCount": 5,
  "messageCount": 23,
  "canMigrate": true
}
```

### POST /api/v1/migration/migrate-to-postgresql
Migrate guest session data to authenticated user's PostgreSQL storage.

**Headers:**
```bash
Authorization: Bearer <firebase_jwt>
x-guest-session: your_guest_session_token
```

**Response:**
```json
{
  "success": true,
  "migrationId": "migration_12345",
  "migratedItems": {
    "conversations": 5,
    "messages": 23
  }
}
```

---

## 🔧 Guest Configuration Management (Admin Only)

> **Database-Driven Guest Permissions** - Scalable configuration without code changes

### GET /api/v1/guest-config
Get complete guest configuration (Admin only)

**Headers:**
```bash
Authorization: Bearer admin_token
X-User-ID: admin_user
```

**Response:**
```json
{
  "success": true,
  "configuration": {
    "basePermissions": ["agents:read", "agents:chat", "tools:read", "tools:perplexity", "tools:tavily"],
    "enabledAgents": {
      "assistant": {"isEnabled": true, "accessLevel": "full"},
      "demo": {"isEnabled": true, "accessLevel": "full"},
      "customer_support": {"isEnabled": true, "accessLevel": "full"}
    },
    "enabledTools": {
      "tavily": {"isEnabled": true, "usageLimit": 50, "rateLimitPerHour": 20},
      "perplexity": {"isEnabled": true, "usageLimit": 30, "rateLimitPerHour": 15}
    },
    "lastUpdated": "2025-01-21T15:30:00.000Z"
  }
}
```

### GET /api/v1/guest-config/agents
Get guest agent permissions

**Example:**
```bash
curl -H "Authorization: Bearer admin_token" \
     -H "X-User-ID: admin_user" \
     http://localhost:5001/api/v1/guest-config/agents
```

**Response:**
```json
{
  "success": true,
  "enabledAgents": {
    "assistant": {"isEnabled": true, "accessLevel": "full", "agentId": 1},
    "demo": {"isEnabled": true, "accessLevel": "full", "agentId": 2},
    "research": {"isEnabled": false, "accessLevel": "read_only"}
  },
  "count": 3
}
```

### GET /api/v1/guest-config/tools
Get guest tool permissions

**Example:**
```bash
curl -H "Authorization: Bearer admin_token" \
     -H "X-User-ID: admin_user" \
     http://localhost:5001/api/v1/guest-config/tools
```

**Response:**
```json
{
  "success": true,
  "enabledTools": {
    "tavily": {"isEnabled": true, "category": "search", "usageLimit": 50, "rateLimitPerHour": 20},
    "perplexity": {"isEnabled": true, "category": "search", "usageLimit": 30, "rateLimitPerHour": 15},
    "firecrawl": {"isEnabled": false, "category": "scraping", "usageLimit": 0, "rateLimitPerHour": 0}
  },
  "count": 3
}
```

### PUT /api/v1/guest-config/agents/:personalityType
Update guest agent permission

**Example:**
```bash
curl -X PUT \
     -H "Authorization: Bearer admin_token" \
     -H "X-User-ID: admin_user" \
     -H "Content-Type: application/json" \
     -d '{"isEnabled": true, "accessLevel": "full"}' \
     http://localhost:5001/api/v1/guest-config/agents/research_assistant
```

**Response:**
```json
{
  "success": true,
  "message": "Agent research_assistant permission updated",
  "personalityType": "research_assistant",
  "isEnabled": true,
  "accessLevel": "full",
  "updatedAt": "2025-01-21T15:30:00.000Z"
}
```

### PUT /api/v1/guest-config/tools/:toolName
Update guest tool permission

**Example:**
```bash
curl -X PUT \
     -H "Authorization: Bearer admin_token" \
     -H "X-User-ID: admin_user" \
     -H "Content-Type: application/json" \
     -d '{"isEnabled": true, "usageLimit": 100, "rateLimitPerHour": 50}' \
     http://localhost:5001/api/v1/guest-config/tools/web_search
```

**Response:**
```json
{
  "success": true,
  "message": "Tool web_search permission updated",
  "toolName": "web_search",
  "isEnabled": true,
  "usageLimit": 100,
  "rateLimitPerHour": 50,
  "updatedAt": "2025-01-21T15:30:00.000Z"
}
```

### POST /api/v1/guest-config/agents/bulk-update
Bulk update multiple agent permissions

**Example:**
```bash
curl -X POST \
     -H "Authorization: Bearer admin_token" \
     -H "X-User-ID: admin_user" \
     -H "Content-Type: application/json" \
     -d '{
       "updates": [
         {"personalityType": "demo", "isEnabled": true, "accessLevel": "full"},
         {"personalityType": "customer_support", "isEnabled": true, "accessLevel": "full"},
         {"personalityType": "research", "isEnabled": false, "accessLevel": "read_only"}
       ]
     }' \
     http://localhost:5001/api/v1/guest-config/agents/bulk-update
```

**Response:**
```json
{
  "success": true,
  "message": "Bulk update completed: 3/3 successful",
  "results": [
    {"personalityType": "demo", "success": true, "isEnabled": true, "accessLevel": "full"},
    {"personalityType": "customer_support", "success": true, "isEnabled": true, "accessLevel": "full"},
    {"personalityType": "research", "success": true, "isEnabled": false, "accessLevel": "read_only"}
  ],
  "timestamp": "2025-01-21T15:30:00.000Z"
}
```

### POST /api/v1/guest-config/tools/bulk-update
Bulk update multiple tool permissions

**Example:**
```bash
curl -X POST \
     -H "Authorization: Bearer admin_token" \
     -H "X-User-ID: admin_user" \
     -H "Content-Type: application/json" \
     -d '{
       "updates": [
         {"toolName": "tavily", "isEnabled": true, "usageLimit": 50, "rateLimitPerHour": 20},
         {"toolName": "perplexity", "isEnabled": true, "usageLimit": 30, "rateLimitPerHour": 15},
         {"toolName": "firecrawl", "isEnabled": false, "usageLimit": 0, "rateLimitPerHour": 0}
       ]
     }' \
     http://localhost:5001/api/v1/guest-config/tools/bulk-update
```

**Response:**
```json
{
  "success": true,
  "message": "Bulk update completed: 3/3 successful",
  "results": [
    {"toolName": "tavily", "success": true, "isEnabled": true, "usageLimit": 50, "rateLimitPerHour": 20},
    {"toolName": "perplexity", "success": true, "isEnabled": true, "usageLimit": 30, "rateLimitPerHour": 15},
    {"toolName": "firecrawl", "success": true, "isEnabled": false, "usageLimit": 0, "rateLimitPerHour": 0}
  ],
  "timestamp": "2025-01-21T15:30:00.000Z"
}
```

### GET /api/v1/guest-config/audit
Get guest permission audit log (Admin only)

**Example:**
```bash
curl -H "Authorization: Bearer admin_token" \
     -H "X-User-ID: admin_user" \
     "http://localhost:5001/api/v1/guest-config/audit?limit=20&resourceType=agent&action=update"
```

**Response:**
```json
{
  "success": true,
  "auditLog": [
    {
      "id": 1,
      "action": "update",
      "resource_type": "agent", 
      "resource_id": "demo",
      "old_value": {"is_enabled": false},
      "new_value": {"is_enabled": true, "access_level": "full"},
      "changed_by": "admin_user",
      "created_at": "2025-01-21T15:30:00.000Z"
    }
  ],
  "pagination": {
    "limit": 20,
    "offset": 0,
    "total": 1
  }
}
```

### GET /api/v1/guest-config/health
Health check for guest permission service

**Example:**
```bash
curl http://localhost:5001/api/v1/guest-config/health
```

**Response:**
```json
{
  "service": "guest-permission-service",
  "status": "healthy",
  "initialized": true,
  "timestamp": "2025-01-21T15:30:00.000Z"
}
```

---

## 🤖 Agents API

### GET /api/v1/agents
List all agents with filtering and pagination.

**Headers:**
```bash
Authorization: Bearer development_token
X-User-ID: admin_user
```

**Query Parameters:**
- `personality_type` (string): Filter by personality type
- `is_active` (boolean): Filter by active status
- `limit` (number): Max results (default: 50, max: 100)
- `offset` (number): Pagination offset

**Example:**
```bash
curl -H "Authorization: Bearer development_token" \
     -H "X-User-ID: admin_user" \
     "http://localhost:5001/api/v1/agents?personality_type=assistant&limit=10"
```

**Response:**
```json
[
  {
    "id": 1,
    "name": "Assistant",
    "personality_type": "assistant",
    "description": "General balanced AI assistant",
    "system_prompt": "You are a helpful AI assistant...",
    "capabilities": ["general_qa", "conversation"],
    "response_style": {
      "tone": "professional_friendly",
      "formality": "moderate"
    },
    "is_active": true,
    "is_default": true,
    "usage_count": 0,
    "created_at": "2025-01-18T15:20:31.765Z",
    "updated_at": "2025-01-18T15:20:31.765Z"
  }
]
```

### GET /api/v1/agents/:id
Get a specific agent by ID.

**Example:**
```bash
curl -H "Authorization: Bearer development_token" \
     -H "X-User-ID: admin_user" \
     http://localhost:5001/api/v1/agents/1
```

### POST /api/v1/agents
Create a new agent.

**Required Permission:** `agents:create` (admin role)

**Example:**
```bash
curl -X POST \
     -H "Authorization: Bearer development_token" \
     -H "X-User-ID: admin_user" \
     -H "Content-Type: application/json" \
     -d '{
       "name": "Demo Tutorial Agent",
       "personality_type": "demo_tutorial",
       "description": "Interactive tutorial system",
       "system_prompt": "You are a demo tutorial agent...",
       "capabilities": ["tutorial_guidance", "onboarding"],
       "response_style": {
         "tone": "encouraging",
         "formality": "friendly"
       },
       "is_active": true,
       "is_default": false,
       "ai_model": "gpt-4o"
     }' \
     http://localhost:5001/api/v1/agents
```

### PUT /api/v1/agents/:id
Update an existing agent.

**Required Permission:** `agents:update` (admin role)

### DELETE /api/v1/agents/:id  
Delete an agent.

**Required Permission:** `agents:delete` (admin role)

---

## 📚 Knowledge API

### GET /api/v1/knowledge
List knowledge documents.

### POST /api/v1/knowledge
Upload new knowledge document.

**Required Permission:** `knowledge:create`

---

## 🛠️ Tools API

### GET /api/v1/tools
List all available tools.

**Example:**
```bash
curl -H "Authorization: Bearer development_token" \
     -H "X-User-ID: admin_user" \
     http://localhost:5001/api/v1/tools
```

### POST /api/v1/tools/:toolName/execute
Execute a specific tool.

**Example:**
```bash
curl -X POST \
     -H "Authorization: Bearer development_token" \
     -H "X-User-ID: admin_user" \
     -H "Content-Type: application/json" \
     -d '{
       "parameters": {
         "query": "latest AI news",
         "max_results": 5
       }
     }' \
     http://localhost:5001/api/v1/tools/web_search/execute
```

---

## 🔊 Text-to-Speech (TTS) API (Simplified)

The TTS API provides real-time agent voice responses using Hume AI's emotion-aware text-to-speech technology. **Simplified to 2 essential endpoints only** - removing over-engineered complexity.

### WebSocket TTS Streaming

**Endpoint:** `ws://localhost:5001/tts-stream`

```javascript
const ws = new WebSocket('ws://localhost:5001/tts-stream');

ws.onopen = () => {
    console.log('TTS WebSocket connected');
};

ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    console.log('TTS message:', message);
};
```

### WebSocket Message Types

#### Agent Analysis Request
```javascript
ws.send(JSON.stringify({
    type: 'agent_analysis_request',
    data: {
        agentId: 1,
        transcript: 'What is the Xerus API documentation?',
        context: {
            screenshot: 'base64_image_data', // optional
            session_id: 'user_session_123'
        }
    },
    timestamp: Date.now()
}));
```

#### Agent Selection
```javascript
ws.send(JSON.stringify({
    type: 'agent_selection',
    data: { agentId: 1 },
    timestamp: Date.now()
}));
```

#### Direct TTS Generation
```javascript
ws.send(JSON.stringify({
    type: 'tts_generate',
    data: {
        text: 'Hello, this is a test message',
        voiceConfig: {
            voiceName: 'Female English Actor',
            provider: 'HUME_AI',
            speed: 1.0
        }
    },
    timestamp: Date.now()
}));
```

### REST API Endpoints (Simplified)

**Note: Old TTS endpoints (generate, test, voices, cache, enable/disable) have been removed for simplicity. Only essential endpoints remain.**
Generate TTS audio from text (non-streaming).

**Headers:**
```bash
Authorization: Bearer development_token
X-User-ID: admin_user
Content-Type: application/json
```

**Request Body:**
```json
{
    "text": "Hello, this is a TTS test message",
    "voiceConfig": {
        "voiceName": "Female English Actor",
        "provider": "HUME_AI",
        "speed": 1.0,
        "format": "wav",
        "instantMode": true
    }
}
```

**Example:**
```bash
curl -X POST \
     -H "Authorization: Bearer development_token" \
     -H "X-User-ID: admin_user" \
     -H "Content-Type: application/json" \
     -d '{
       "text": "Welcome to Xerus AI assistant",
       "voiceConfig": {
         "voiceName": "Female English Actor",
         "speed": 0.9
       }
     }' \
     http://localhost:5001/api/v1/tts/generate
```

**Response:**
```json
{
    "success": true,
    "data": {
        "audio": "base64_audio_data_here",
        "duration": 1250,
        "characterCount": 28,
        "fromCache": false,
        "voiceConfig": {
            "voiceName": "Female English Actor",
            "provider": "HUME_AI",
            "speed": 0.9
        }
    }
}
```

### POST /api/v1/tts/test
Test TTS functionality and connection.

**Example:**
```bash
curl -X POST \
     -H "Authorization: Bearer development_token" \
     -H "X-User-ID: admin_user" \
     -H "Content-Type: application/json" \
     -d '{
       "text": "TTS connection test",
       "voiceConfig": {"voiceName": "Male Conversational"}
     }' \
     http://localhost:5001/api/v1/tts/test
```

**Response:**
```json
{
    "success": true,
    "data": {
        "success": true,
        "duration": 1100,
        "audioLength": 44032,
        "cached": false,
        "message": "TTS test completed successfully"
    }
}
```

### GET /api/v1/tts/voices
Get available TTS voices.

**Example:**
```bash
curl -H "Authorization: Bearer development_token" \
     -H "X-User-ID: admin_user" \
     http://localhost:5001/api/v1/tts/voices
```

**Response:**
```json
{
    "success": true,
    "data": [
        {
            "id": "female-english-actor",
            "name": "Female English Actor",
            "provider": "HUME_AI",
            "language": "en",
            "description": "Professional female English voice with natural expression"
        },
        {
            "id": "male-english-actor",
            "name": "Male English Actor",
            "provider": "HUME_AI",
            "language": "en",
            "description": "Professional male English voice with natural expression"
        },
        {
            "id": "female-conversational",
            "name": "Female Conversational",
            "provider": "HUME_AI",
            "language": "en",
            "description": "Casual female conversational voice"
        },
        {
            "id": "male-conversational",
            "name": "Male Conversational",
            "provider": "HUME_AI",
            "language": "en",
            "description": "Casual male conversational voice"
        }
    ]
}
```

### Agent TTS Configuration

### GET /api/v1/tts/agent/:agentId/config
Get TTS configuration for specific agent.

**Example:**
```bash
curl -H "Authorization: Bearer development_token" \
     -H "X-User-ID: admin_user" \
     http://localhost:5001/api/v1/tts/agent/1/config
```

**Response:**
```json
{
    "success": true,
    "data": {
        "agentId": 1,
        "tts_enabled": true,
        "voice_config": {
            "voiceName": "Female English Actor",
            "provider": "HUME_AI",
            "speed": 0.9,
            "format": "wav",
            "instantMode": true
        },
        "analysis_prompt": "As a Knowledge Base Expert, provide clear, actionable technical guidance."
    }
}
```

### PUT /api/v1/tts/agent/:agentId/config
Update TTS configuration for specific agent.

**Example:**
```bash
curl -X PUT \
     -H "Authorization: Bearer development_token" \
     -H "X-User-ID: admin_user" \
     -H "Content-Type: application/json" \
     -d '{
       "tts_enabled": true,
       "voice_config": {
         "voiceName": "Male English Actor",
         "speed": 0.8,
         "provider": "HUME_AI"
       }
     }' \
     http://localhost:5001/api/v1/tts/agent/1/config
```

### POST /api/v1/tts/agent/:agentId/enable
Enable TTS for an agent with optional voice configuration.

**Example:**
```bash
curl -X POST \
     -H "Authorization: Bearer development_token" \
     -H "X-User-ID: admin_user" \
     -H "Content-Type: application/json" \
     -d '{
       "voiceConfig": {
         "voiceName": "Female Conversational",
         "speed": 1.0
       }
     }' \
     http://localhost:5001/api/v1/tts/agent/1/enable
```

### POST /api/v1/tts/agent/:agentId/disable
Disable TTS for an agent.

**Example:**
```bash
curl -X POST \
     -H "Authorization: Bearer development_token" \
     -H "X-User-ID: admin_user" \
     http://localhost:5001/api/v1/tts/agent/1/disable
```

### GET /api/v1/tts/agent/:agentId/optimal-voice
Get optimal voice configuration for agent personality.

**Example:**
```bash
curl -H "Authorization: Bearer development_token" \
     -H "X-User-ID: admin_user" \
     http://localhost:5001/api/v1/tts/agent/1/optimal-voice
```

**Response:**
```json
{
    "success": true,
    "data": {
        "agentId": 1,
        "personalityType": "assistant",
        "recommendedVoice": {
            "voiceName": "Female Conversational",
            "provider": "HUME_AI",
            "speed": 1.0,
            "rationale": "Optimal for assistant personality type"
        }
    }
}
```

### POST /api/v1/tts/agent/:agentId/analyze
Execute agent analysis with TTS response (alternative to WebSocket).

**Example:**
```bash
curl -X POST \
     -H "Authorization: Bearer development_token" \
     -H "X-User-ID: admin_user" \
     -H "Content-Type: application/json" \
     -d '{
       "transcript": "What are the main features of Xerus?",
       "context": {
         "session_id": "user_session_123",
         "screenshot": "base64_image_data"
       }
     }' \
     http://localhost:5001/api/v1/tts/agent/1/analyze
```

### Cache Management

### GET /api/v1/tts/cache/stats
Get TTS cache statistics.

**Example:**
```bash
curl -H "Authorization: Bearer development_token" \
     -H "X-User-ID: admin_user" \
     http://localhost:5001/api/v1/tts/cache/stats
```

**Response:**
```json
{
    "success": true,
    "data": {
        "size": 25,
        "maxSize": 100,
        "activeConnections": 3,
        "expiryMs": 1800000
    }
}
```

### POST /api/v1/tts/cache/clear
Clear TTS cache.

**Example:**
```bash
curl -X POST \
     -H "Authorization: Bearer development_token" \
     -H "X-User-ID: admin_user" \
     http://localhost:5001/api/v1/tts/cache/clear
```

### TTS Agent Endpoints (Simplified)

#### POST /api/v1/tts/agent/:agentId/respond
**Single unified endpoint** for TTS-optimized AI responses using agent orchestrator with TTS mode.

**Features:**
- Uses agentOrchestrator.js with parallel analysis (screenshot + RAG)  
- TTS-optimized prompts for concise voice responses (~75 words, 30 seconds)
- Supports both quick and full modes via query parameters
- Maintains all agent benefits (memory, caching, context)

**Query Parameters:**
- `?quick=true` - Quick mode (skips screenshot analysis for faster response)
- `?screenshot=false` - Disable screenshot analysis (default: true)
- `?knowledge=false` - Disable knowledge search (default: true)

**Request Body:**
```json
{
  "query": "What is reinforcement learning?",
  "userId": "user123",
  "screenshot": "base64_image_data_here",
  "imageContext": "Screenshot of VS Code with Python file",
  "context": {}
}
```

**Examples:**

**Full Mode (default):**
```bash
curl -X POST \
     -H "Content-Type: application/json" \
     -d '{
       "query": "What is reinforcement learning?",
       "userId": "user123",
       "screenshot": "base64_image_data_optional",
       "imageContext": "Optional screenshot description"
     }' \
     http://localhost:5001/api/v1/tts/agent/1/respond
```

**Quick Mode (faster):**
```bash
curl -X POST \
     -H "Content-Type: application/json" \
     -d '{
       "query": "What is machine learning?", 
       "userId": "user123"
     }' \
     http://localhost:5001/api/v1/tts/agent/1/respond?quick=true
```

**Response:**
```json
{
  "success": true,
  "response": "Reinforcement learning is a machine learning approach where an agent learns to make decisions through trial and error, receiving rewards or penalties for actions. It's like training a dog with treats - the system learns optimal strategies through experience.",
  "agentId": 1,
  "agentName": "Knowledge Base Expert",
  "responseTime": 285,
  "estimatedDuration": "15s",
  "wordCount": 45,
  "quickMode": false,
  "contextUsed": {
    "screenshot": true,
    "knowledge": true,
    "memory": true
  }
}
```

#### GET/PUT /api/v1/tts/agent/:agentId/config
Get or update agent's TTS configuration (voice settings, enabled status).

**GET Example:**
```bash
curl http://localhost:5001/api/v1/tts/agent/1/config
```

**PUT Example:**
```bash
curl -X PUT \
     -H "Content-Type: application/json" \
     -d '{
       "tts_enabled": true,
       "voice_config": {
         "voiceName": "Female English Actor",
         "provider": "HUME_AI",
         "speed": 0.9
       }
     }' \
     http://localhost:5001/api/v1/tts/agent/1/config
```

### TTS Features

- **Ultra-Low Latency**: ~300-500ms response times with WebSocket streaming
- **Agent-Specific Voices**: Personality-based voice selection for different agent types  
- **Emotion-Aware**: Hume AI provides natural expression and emotional nuance
- **Real-Time Streaming**: Progressive audio playback as it's generated
- **LRU Caching**: Intelligent audio caching with 30-minute TTL
- **Error Recovery**: Graceful degradation when TTS unavailable

### Voice Personality Mapping

| Agent Personality | Recommended Voice | Speed | Characteristics |
|-------------------|-------------------|-------|----------------|
| `assistant` | Female Conversational | 1.0 | Friendly, approachable |
| `technical` | Male English Actor | 0.9 | Professional, precise |
| `creative` | Female English Actor | 1.1 | Expressive, dynamic |
| `tutor` | Male Conversational | 0.95 | Patient, educational |
| `executive` | Male English Actor | 0.9 | Authoritative, clear |
| `research` | Female English Actor | 0.85 | Analytical, thoughtful |

---

## 🚨 Common Issues

### Permission Denied
```json
{
  "error": "Forbidden",
  "message": "Insufficient permissions. Required permission: agents:create",
  "code": "INSUFFICIENT_PERMISSIONS"
}
```

**Solution:** Use `admin_user` for operations requiring special permissions:
```bash
curl -H "X-User-ID: admin_user" ...
```

### Unauthorized
```json
{
  "error": "Unauthorized", 
  "message": "Missing or invalid authorization header",
  "code": "MISSING_TOKEN"
}
```

**Solution:** Include proper authorization header:
```bash
curl -H "Authorization: Bearer development_token" ...
```

---

---

## 🏗️ Overview

The Xerus Glass Tool System provides a centralized, extensible framework for integrating external services and capabilities into the AI assistant. It supports parallel execution, automatic error handling, and intelligent tool orchestration.

### Key Features
- **Unified Interface**: Consistent API across all tools
- **Parallel Execution**: Run multiple tools simultaneously
- **Error Recovery**: Graceful handling of tool failures
- **Dynamic Registration**: Add/remove tools at runtime
- **Performance Monitoring**: Execution time tracking
- **API Key Management**: Secure credential handling

---

## 🏛️ Tool Manager Architecture

### Core Class: `ToolManager`

The `ToolManager` is the central orchestrator for all tool operations.

```javascript
const { toolManager } = require('./src/services/tool-manager');

// Get available tools
const tools = toolManager.getAvailableTools();
console.log(tools); // ['web_search', 'firecrawl_scrape', 'get_time', ...]

// Execute a single tool
const result = await toolManager.executeTool('web_search', { 
    query: 'latest AI developments',
    max_results: 5 
});

// Execute multiple tools in parallel
const results = await toolManager.executeTools([
    { name: 'get_time', parameters: {} },
    { name: 'web_search', parameters: { query: 'weather forecast' } }
]);
```

### Tool Registration System

Tools are automatically registered during initialization:

```javascript
class ToolManager {
    initializeTools() {
        // Web search tools
        this.registerTool(new WebSearchTool(this.apiKeys));
        this.registerTool(new FirecrawlTool(this.apiKeys.firecrawl));
        
        // Utility tools
        this.registerTool(new TimeTool());
        this.registerTool(new SystemInfoTool());
        this.registerTool(new CalculatorTool());
        
        // RAG tool
        this.registerTool(new SimpleRAGTool());
    }
}
```

---

## 🔌 Base Tool Interface

All tools must extend the `BaseTool` class and implement the `execute` method.

### BaseTool Class

```javascript
class BaseTool {
    constructor(name, description, parameters) {
        this.name = name;                    // Unique tool identifier
        this.description = description;      // Human-readable description
        this.parameters = parameters;        // JSON schema for parameters
    }

    async execute(parameters) {
        throw new Error('execute() method must be implemented');
    }
}
```

### Parameter Schema

Tools define their input parameters using JSON Schema:

```javascript
{
    type: 'object',
    properties: {
        query: {
            type: 'string',
            description: 'The search query',
        },
        max_results: {
            type: 'number',
            description: 'Maximum number of results',
            default: 5
        }
    },
    required: ['query']
}
```

### Tool Definition Format

For AI function calling, tools are formatted as:

```javascript
{
    type: 'function',
    function: {
        name: 'web_search',
        description: 'Search the web for current information',
        parameters: { /* JSON schema */ }
    }
}
```

---

## 🛠️ Built-in Tools

### 1. Web Search Tool (`web_search`)

Searches the web using Tavily API for current information.

#### Parameters
```javascript
{
    query: string,              // Required: Search query
    max_results: number,        // Optional: Max results (default: 5)
    include_raw_content: boolean // Optional: Include raw content (default: false)
}
```

#### Response
```javascript
{
    success: true,
    result: {
        query: "latest AI developments",
        results: [
            {
                title: "AI Breakthrough in 2024",
                url: "https://example.com/ai-news",
                content: "Recent developments in AI...",
                score: 0.95
            }
        ],
        answer: "Based on recent developments...",
        total_results: 5
    },
    executionTime: 1250,
    timestamp: "2024-01-15T10:30:00.000Z"
}
```

#### Usage Example
```javascript
const result = await toolManager.executeTool('web_search', {
    query: 'latest AI developments',
    max_results: 3,
    include_raw_content: false
});

if (result.success) {
    console.log(`Found ${result.result.total_results} results`);
    result.result.results.forEach(item => {
        console.log(`${item.title}: ${item.content}`);
    });
}
```

### 2. Firecrawl Tool (`firecrawl_scrape`)

Scrapes and extracts content from web pages using Firecrawl API.

#### Parameters
```javascript
{
    url: string,                    // Required: URL to scrape
    formats: string[],              // Optional: ['markdown', 'html', 'links', 'screenshot']
    include_tags: string[],         // Optional: HTML tags to include
    exclude_tags: string[]          // Optional: HTML tags to exclude
}
```

#### Response
```javascript
{
    success: true,
    result: {
        url: "https://example.com",
        title: "Page Title",
        description: "Page description",
        content: "# Page Content\n\nMarkdown formatted content...",
        links: ["https://link1.com", "https://link2.com"],
        screenshot: "base64_image_data",
        success: true
    },
    executionTime: 2100,
    timestamp: "2024-01-15T10:30:00.000Z"
}
```

#### Usage Example
```javascript
const result = await toolManager.executeTool('firecrawl_scrape', {
    url: 'https://example.com/article',
    formats: ['markdown', 'links'],
    exclude_tags: ['script', 'style']
});

if (result.success) {
    console.log('Page Title:', result.result.title);
    console.log('Content:', result.result.content);
    console.log('Links found:', result.result.links.length);
}
```

### 3. Time Tool (`get_time`)

Retrieves current time and date information.

#### Parameters
```javascript
{
    timezone: string,       // Optional: Timezone (default: 'local')
    format: string         // Optional: 'iso', 'readable', 'timestamp' (default: 'readable')
}
```

#### Response
```javascript
{
    success: true,
    result: {
        timestamp: 1705320600000,
        iso: "2024-01-15T10:30:00.000Z",
        readable: "1/15/2024, 10:30:00 AM",
        timezone: "Local",
        day_of_week: "Monday",
        date: "1/15/2024",
        time: "10:30:00 AM"
    },
    executionTime: 5,
    timestamp: "2024-01-15T10:30:00.000Z"
}
```

### 4. System Info Tool (`get_system_info`)

Retrieves system information and computer details.

#### Parameters
```javascript
{
    details: string[]   // Optional: ['platform', 'memory', 'cpu', 'network', 'all']
}
```

#### Response
```javascript
{
    success: true,
    result: {
        platform: {
            os: "darwin",
            arch: "x64",
            version: "20.6.0",
            hostname: "MacBook-Pro",
            uptime: 86400
        },
        memory: {
            total: 17179869184,
            free: 8589934592,
            used: 8589934592,
            totalGB: 16,
            freeGB: 8,
            usagePercent: 50
        }
    },
    executionTime: 12,
    timestamp: "2024-01-15T10:30:00.000Z"
}
```

### 5. Calculator Tool (`calculate`)

Performs mathematical calculations safely.

#### Parameters
```javascript
{
    expression: string,     // Required: Mathematical expression
    precision: number       // Optional: Decimal places (default: 2)
}
```

#### Response
```javascript
{
    success: true,
    result: {
        expression: "2 + 3 * 4",
        result: 14,
        formatted: "14.00"
    },
    executionTime: 3,
    timestamp: "2024-01-15T10:30:00.000Z"
}
```

### 6. Simple RAG Tool (`search_documents`)

Searches through local documents and knowledge base.

#### Parameters
```javascript
{
    query: string,      // Required: Search query
    limit: number       // Optional: Max results (default: 5)
}
```

#### Response
```javascript
{
    success: true,
    result: {
        query: "API documentation",
        results: [
            {
                title: "API Guide",
                content: "This document explains how to use the API...",
                score: 1.0
            }
        ],
        total_found: 1
    },
    executionTime: 50,
    timestamp: "2024-01-15T10:30:00.000Z"
}
```

---

## 🔨 Custom Tool Development

### Creating a New Tool

1. **Extend BaseTool**:
```javascript
class CustomTool extends BaseTool {
    constructor(apiKey) {
        super(
            'custom_tool',
            'Description of what this tool does',
            {
                type: 'object',
                properties: {
                    input: {
                        type: 'string',
                        description: 'Input parameter description'
                    }
                },
                required: ['input']
            }
        );
        this.apiKey = apiKey;
    }

    async execute(parameters) {
        const { input } = parameters;
        
        try {
            // Tool implementation
            const result = await this.performOperation(input);
            
            return {
                processed_input: input,
                result: result,
                metadata: {
                    tool_version: '1.0.0',
                    execution_context: 'custom'
                }
            };
        } catch (error) {
            throw new Error(`Custom tool failed: ${error.message}`);
        }
    }

    async performOperation(input) {
        // Custom logic here
        return `Processed: ${input}`;
    }
}
```

2. **Register the Tool**:
```javascript
// Add to ToolManager.initializeTools()
this.registerTool(new CustomTool(this.apiKeys.custom));
```

### Tool Best Practices

#### Error Handling
```javascript
async execute(parameters) {
    try {
        // Validate parameters
        if (!parameters.required_param) {
            throw new Error('required_param is missing');
        }

        // Perform operation
        const result = await this.performOperation(parameters);
        
        return result;
    } catch (error) {
        // Log error details
        console.error(`[${this.name}] Error:`, error);
        
        // Throw with context
        throw new Error(`${this.name} failed: ${error.message}`);
    }
}
```

#### API Key Management
```javascript
class APITool extends BaseTool {
    constructor(apiKey) {
        super(/* ... */);
        this.apiKey = apiKey;
    }

    async execute(parameters) {
        if (!this.apiKey) {
            throw new Error('API key not configured');
        }
        // ... rest of implementation
    }

    updateApiKey(apiKeys) {
        this.apiKey = apiKeys.service_name;
    }
}
```

#### Performance Optimization
```javascript
class CachedTool extends BaseTool {
    constructor() {
        super(/* ... */);
        this.cache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    }

    async execute(parameters) {
        const cacheKey = this.generateCacheKey(parameters);
        const cached = this.cache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.result;
        }

        const result = await this.performOperation(parameters);
        
        this.cache.set(cacheKey, {
            result,
            timestamp: Date.now()
        });

        return result;
    }
}
```

---

## 💡 Integration Examples

### AI Function Calling Integration

```javascript
// Get tool definitions for AI
const toolDefinitions = toolManager.getToolDefinitions();

// Send to AI provider (OpenAI example)
const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
        { role: 'user', content: 'What\'s the weather in Tokyo?' }
    ],
    tools: toolDefinitions,
    tool_choice: 'auto'
});

// Handle tool calls
if (response.choices[0].message.tool_calls) {
    const toolCalls = response.choices[0].message.tool_calls.map(call => ({
        name: call.function.name,
        parameters: JSON.parse(call.function.arguments)
    }));

    const toolResults = await toolManager.executeTools(toolCalls);
    
    // Send results back to AI for final response
    // ...
}
```

### Batch Tool Execution

```javascript
// Execute multiple tools in parallel
const batchOperations = [
    { name: 'get_time', parameters: {} },
    { name: 'get_system_info', parameters: { details: ['memory', 'cpu'] } },
    { name: 'web_search', parameters: { query: 'current events', max_results: 3 } }
];

const results = await toolManager.executeTools(batchOperations);

results.forEach((result, index) => {
    console.log(`Tool ${batchOperations[index].name}:`);
    console.log(`  Success: ${result.success}`);
    console.log(`  Time: ${result.executionTime}ms`);
    if (result.success) {
        console.log(`  Result:`, result.result);
    } else {
        console.log(`  Error:`, result.error);
    }
});
```

### Tool Chain Workflows

```javascript
class WorkflowManager {
    constructor(toolManager) {
        this.toolManager = toolManager;
    }

    async executeResearchWorkflow(topic) {
        // Step 1: Search for information
        const searchResult = await this.toolManager.executeTool('web_search', {
            query: topic,
            max_results: 5
        });

        if (!searchResult.success) {
            throw new Error('Web search failed');
        }

        // Step 2: Scrape detailed content from top results
        const scrapePromises = searchResult.result.results
            .slice(0, 3)
            .map(result => 
                this.toolManager.executeTool('firecrawl_scrape', {
                    url: result.url,
                    formats: ['markdown']
                })
            );

        const scrapeResults = await Promise.all(scrapePromises);

        // Step 3: Combine results
        const combinedContent = {
            topic,
            search_summary: searchResult.result.answer,
            detailed_sources: scrapeResults
                .filter(r => r.success)
                .map(r => r.result),
            timestamp: new Date().toISOString()
        };

        return combinedContent;
    }
}
```

---

## ⚠️ Error Handling

### Error Response Format

When a tool fails, the response follows this format:

```javascript
{
    success: false,
    error: "Error message describing what went wrong",
    timestamp: "2024-01-15T10:30:00.000Z"
}
```

### Common Error Types

#### API Key Errors
```javascript
{
    success: false,
    error: "Tavily API key not configured",
    timestamp: "2024-01-15T10:30:00.000Z"
}
```

#### Network Errors
```javascript
{
    success: false,
    error: "Web search failed: Network timeout",
    timestamp: "2024-01-15T10:30:00.000Z"
}
```

#### Parameter Validation Errors
```javascript
{
    success: false,
    error: "Tool 'web_search' not found",
    timestamp: "2024-01-15T10:30:00.000Z"
}
```

### Error Handling Best Practices

```javascript
async function safeToolExecution(toolName, parameters) {
    try {
        const result = await toolManager.executeTool(toolName, parameters);
        
        if (!result.success) {
            console.error(`Tool ${toolName} failed:`, result.error);
            return null;
        }
        
        return result.result;
    } catch (error) {
        console.error(`Tool execution error:`, error);
        return null;
    }
}

// Usage with fallback
const webResults = await safeToolExecution('web_search', { query: 'AI news' });
if (!webResults) {
    console.log('Web search unavailable, using cached results');
    // Fallback logic
}
```

---

## ⚡ Performance Considerations

### Execution Time Monitoring

All tool executions are automatically timed:

```javascript
const result = await toolManager.executeTool('web_search', { query: 'test' });
console.log(`Execution time: ${result.executionTime}ms`);
```

### Parallel Execution Benefits

```javascript
// Sequential execution (slow)
const time1 = await toolManager.executeTool('get_time', {});
const search1 = await toolManager.executeTool('web_search', { query: 'news' });
// Total time: ~1500ms

// Parallel execution (fast)
const results = await toolManager.executeTools([
    { name: 'get_time', parameters: {} },
    { name: 'web_search', parameters: { query: 'news' } }
]);
// Total time: ~1200ms (limited by slowest tool)
```

### Performance Tips

1. **Use Parallel Execution**: Execute independent tools simultaneously
2. **Implement Caching**: Cache results for repeated queries
3. **Optimize Parameters**: Use appropriate limits and filters
4. **Monitor Execution**: Track tool performance over time
5. **Graceful Degradation**: Handle tool failures gracefully

### Memory Management

```javascript
class ToolManager {
    constructor() {
        this.tools = new Map();
        this.executionHistory = new Map();
        this.maxHistorySize = 1000;
    }

    async executeTool(toolName, parameters) {
        const result = await tool.execute(parameters);
        
        // Store execution history with size limit
        this.addToHistory(toolName, result.executionTime);
        
        return result;
    }

    addToHistory(toolName, executionTime) {
        if (this.executionHistory.size >= this.maxHistorySize) {
            const firstKey = this.executionHistory.keys().next().value;
            this.executionHistory.delete(firstKey);
        }
        
        this.executionHistory.set(Date.now(), {
            tool: toolName,
            time: executionTime
        });
    }
}
```

---

## 🔄 API Updates & Versioning

### Tool Version Management

Each tool should include version information:

```javascript
class VersionedTool extends BaseTool {
    constructor() {
        super(/* ... */);
        this.version = '1.2.0';
        this.apiVersion = '2023-12-01';
    }

    async execute(parameters) {
        const result = await this.performOperation(parameters);
        
        return {
            ...result,
            metadata: {
                tool_version: this.version,
                api_version: this.apiVersion,
                compatibility: 'stable'
            }
        };
    }
}
```

### Backward Compatibility

When updating tools, maintain backward compatibility:

```javascript
async execute(parameters) {
    // Support both old and new parameter formats
    const query = parameters.query || parameters.search_term;
    const maxResults = parameters.max_results || parameters.limit || 5;
    
    // ... rest of implementation
}
```

---

*For implementation examples and advanced usage patterns, see the [User Guide](./USER_GUIDE.md) and explore the source code in `/src/services/tool-manager.js`.*