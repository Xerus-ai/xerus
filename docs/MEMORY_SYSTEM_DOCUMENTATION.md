# Xerus Memory System Documentation

**Version**: 4.1 (Production Complete)  
**Last Updated**: January 2025  
**Status**: Complete - Source of Truth for Memory Architecture

This document serves as the comprehensive source of truth for the Xerus Memory System, eliminating the need to scan multiple files for memory-related information.

---

## 🧠 Overview

The Xerus Memory System is a sophisticated 4-type memory architecture designed to provide contextual awareness, learning capabilities, and intelligent information retrieval for AI assistants. It seamlessly integrates frontend real-time context capture with backend long-term memory storage.

### Key Features
- **4-Type Memory System**: Working, Episodic, Semantic, and Procedural memory
- **Real-time Screenshot Capture**: Continuous visual context awareness
- **AI-Enhanced Visual Memory**: Automated caption generation and privacy checking
- **Cross-Platform Storage**: Unified Neon PostgreSQL for all users
- **Intelligent Retrieval**: Context-aware memory selection for AI queries

---

## 🏗️ Architecture Components

### Frontend Layer (Electron App)

#### Fast Context Manager
**Location**: `glass/src/domains/ai/fast-context-manager.js`

**Purpose**: Real-time screenshot capture and immediate context storage
- **Storage Type**: In-memory sliding window buffer
- **Capacity**: Configurable buffer with automatic overflow handling
- **Features**: Duplicate detection, trigger source tracking, timestamp management

**Storage Triggers**:
```javascript
// 1. Ask Button Click
triggerSource: 'ask_button_click'
isCurrentScreen: true

// 2. Listen Mode (Every 3 seconds)
triggerSource: 'listening_periodic'
isPeriodicCapture: true

// 3. Form Submission
triggerSource: 'form_submit'
hasVisualReference: true
```

#### Listen Service Integration
**Location**: `glass/src/features/listen/listenService.js`

**Periodic Screenshot Capture**:
```javascript
// Configuration
this.screenshotIntervalMs = 3000; // 3 seconds
this.lastScreenshotHash = null;   // Duplicate detection

// Function: startPeriodicScreenshots()
- Captures every 3 seconds during listening
- Stores in FastContextManager
- Includes duplicate detection
- Automatic cleanup on stop
```

#### Ask Service Integration
**Location**: `glass/src/features/ask/askService.js`

**Screenshot on Demand**:
```javascript
// Function: captureCurrentScreenToMemory()
- Triggered on Ask button click
- Immediate screenshot capture
- Stored in FastContextManager for quick access
- Quality: 80%, Format: JPEG
```

### Enhanced Ask Service (Visual Memory Processing)
**Location**: `glass/src/domains/conversation/enhanced-ask-service.js`

**Dual Storage System**:
```javascript
// Function: storeVisualMemory()
async storeVisualMemory(screenshotResult, caption, userPrompt, privacyCheck, agentId, userId, requestId) {
    // 1. Store FULL visual data in Episodic Memory
    const content = {
        type: 'visual_memory',
        screenshot: screenshotResult.base64,  // Full image data
        caption: caption,                     // AI-generated caption
        privacy_check: privacyCheck,          // Privacy analysis
        metadata: {
            width: screenshotResult.width,
            height: screenshotResult.height,
            format: 'jpeg',
            file_size: screenshotResult.base64.length
        }
    };
    await episodicMemory.store(content, context, metadata);
    
    // 2. Store REFERENCE in Working Memory as attention sink
    await workingMemory.store(
        {
            type: 'visual_context',
            visual_memory_id: visualMemoryResult.id,  // Reference to episodic memory
            caption_summary: caption.ai_caption,      // Summary only
            has_screenshot: true
        },
        { hasScreenshot: true, sessionId: requestId },
        { isAttentionSink: true }                     // Special attention marking
    );
}
```

---

## 🗄️ Backend Memory Service

### Memory Service Core
**Location**: `glass/backend/services/memoryService/`

**4-Type Memory System**:
```javascript
// Memory Instance Structure
{
    working: WorkingMemory,     // Immediate context, attention sinks
    episodic: EpisodicMemory,   // Long-term episodes, full visual data
    semantic: SemanticMemory,   // Knowledge base, concepts
    procedural: ProceduralMemory // Behavioral patterns, analytics
}
```

### Working Memory
**Location**: `glass/backend/services/memoryService/workingMemory.js`

**Purpose**: Immediate context and quick retrieval
- **Storage**: Recent interactions, screenshot references, attention sinks
- **Capacity**: Sliding window with configurable size
- **Retrieval**: Sub-100ms access for AI queries

**Screenshot Storage Structure**:
```javascript
{
    type: 'visual',
    context_type: 'screenshot',
    content: {
        imageContext: 'Screenshot',
        timestamp: new Date(),
        hasImage: true
    },
    image_data: base64String,     // Full screenshot data
    metadata: {
        source: 'user_request',
        type: 'screenshot'
    }
}
```

**Attention Sink Structure** (from Enhanced Ask Service):
```javascript
{
    type: 'visual_context',
    visual_memory_id: episodicId,    // Reference to full data
    caption_summary: aiCaption,      // AI-generated summary
    has_screenshot: true,
    metadata: { isAttentionSink: true }
}
```

### Episodic Memory
**Location**: `glass/backend/services/memoryService/episodicMemory.js`

**Purpose**: Long-term visual learning and episode storage
- **Storage**: Full screenshots with AI captions, learning episodes
- **Features**: Privacy checking, AI analysis, episode categorization

**Visual Memory Structure**:
```javascript
{
    type: 'visual_memory',
    screenshot: base64ImageData,      // Complete screenshot
    caption: {
        ai_caption: "AI-generated description",
        browser_url: "https://...",
        app_detected: "Application Name",
        domain: "domain.com"
    },
    privacy_check: {
        hasSensitiveInfo: false,
        privacyScore: 0.2,
        cleanedCaption: "Safe description"
    },
    metadata: {
        width: 1920,
        height: 1080,
        format: 'jpeg',
        file_size: 123456,
        episodeType: 'visual_learning',
        userInitiated: true
    }
}
```

### Semantic Memory
**Location**: `glass/backend/services/memoryService/semanticMemory.js`

**Purpose**: Knowledge base and concept storage
- **Storage**: Facts, concepts, knowledge entries
- **Features**: Concept extraction, knowledge organization

### Procedural Memory
**Location**: `glass/backend/services/memoryService/proceduralMemory.js`

**Purpose**: Behavioral patterns and usage analytics
- **Storage**: User behaviors, workflow patterns
- **Features**: Pattern recognition, usage optimization

---

## 🔄 Information Flow

### Complete Memory Flow Pipeline

#### 1. Frontend Capture
```
User Action → Service Trigger → FastContextManager → Stored Context
```

**Trigger Types**:
- **Ask Button**: Immediate screenshot for query context
- **Form Submit**: Visual reference for submissions
- **Listen Mode**: Continuous 3-second captures

#### 2. Enhanced Processing (Form Submissions)
```
FastContextManager → Enhanced Ask Service → AI Caption → Privacy Check → Dual Storage
```

**AI Caption Generation**:
```javascript
// AI Provider called to generate captions
const caption = await aiProvider.generateCaption(screenshot);

// Privacy analysis
const privacyCheck = await privacyAnalyzer.analyze(caption);

// Dual storage: Full data + Reference
await storeVisualMemory(screenshot, caption, userPrompt, privacyCheck, agentId, userId);
```

#### 3. Backend Storage
```
Enhanced Ask Service → Memory Service → Database Tables
```

**Storage Destinations**:
- **Episodic Memory**: Full visual data with captions
- **Working Memory**: References and attention sinks
- **Database**: Persistent storage (Neon PostgreSQL)

#### 4. AI Query Integration
```
AI Query → Agent Orchestrator → Memory Retrieval → Context Enhancement → AI Response
```

**Retrieval Logic**:
```javascript
// Agent Orchestrator: getRecentVisualMemory()
async getRecentVisualMemory(agentId, userId) {
    // 1. Check FastContextManager first (fastest)
    const latestScreenshot = await fastContextManager.getLatestContext('screenshot');
    
    // 2. Fallback to Memory Service Working Memory
    const memoryInstance = await this.memoryService.getMemoryInstance(agentId, userId);
    const recentMemories = await memoryInstance.working.retrieve('', {}, { limit: 3 });
    
    // 3. Find screenshot or visual context
    const visualMemory = recentMemories.find(memory => 
        memory.context_type === 'screenshot' || 
        (memory.content && memory.content.windowTitle)
    );
    
    return visualMemory || null;
}
```

---

## 🗃️ Database Schema

### Production (Neon PostgreSQL)

#### Working Memory Table
```sql
CREATE TABLE working_memory (
    id SERIAL PRIMARY KEY,
    agent_id INTEGER NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    context_type VARCHAR(50),
    content JSONB,
    image_data TEXT,              -- Base64 screenshot data
    metadata JSONB,
    timestamp TIMESTAMP DEFAULT NOW(),
    relevance_score DECIMAL(3,2),
    is_attention_sink BOOLEAN DEFAULT FALSE
);
```

#### Episodic Memory Table
```sql
CREATE TABLE episodic_memory (
    id SERIAL PRIMARY KEY,
    agent_id INTEGER NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    episode_type VARCHAR(50),
    content JSONB,                -- Full visual data with captions
    context JSONB,
    metadata JSONB,
    timestamp TIMESTAMP DEFAULT NOW(),
    importance_score DECIMAL(3,2),
    session_id VARCHAR(255)
);
```

#### Semantic Memory Table
```sql
CREATE TABLE semantic_memory (
    id SERIAL PRIMARY KEY,
    agent_id INTEGER NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    concept VARCHAR(255),
    content JSONB,
    confidence_score DECIMAL(3,2),
    timestamp TIMESTAMP DEFAULT NOW()
);
```

#### Procedural Memory Table
```sql
CREATE TABLE procedural_memory (
    id SERIAL PRIMARY KEY,
    agent_id INTEGER NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    behavior_type VARCHAR(100),
    pattern_data JSONB,
    usage_count INTEGER DEFAULT 1,
    last_used TIMESTAMP DEFAULT NOW()
);
```

### Guest User Storage
Guest users utilize the same Neon PostgreSQL database with limited credit allocation (10 credits vs 50 for authenticated users).

---

## 🔍 Memory Retrieval & Usage

### Agent Orchestrator Integration
**Location**: `glass/backend/services/agentOrchestrator.js`

#### Simple Query Path (Fast Retrieval)
```javascript
// For simple queries like "hi", "thanks"
if (isSimple) {
    // Skip expensive RAG, use Working Memory directly
    const visualMemory = await this.getRecentVisualMemory(agentId, userId);
    if (visualMemory) {
        // Include visual context in prompt
        contextualPromptAddition = `\n\nCURRENT SCREEN: ${JSON.stringify(visualMemory.content, null, 2)}`;
    }
}
```

#### Complex Query Path (Full Retrieval)
```javascript
// For complex queries, full memory retrieval
const memoryContext = await this.retrieveMemoryContext(agentId, userId, query);

// Includes all 4 memory types:
// - Working Memory: Recent screenshots and attention sinks
// - Episodic Memory: Visual learning episodes
// - Semantic Memory: Relevant knowledge
// - Procedural Memory: Behavioral patterns
```

### Memory Context Structure
```javascript
{
    working: [
        {
            type: 'visual',
            context_type: 'screenshot',
            content: { hasImage: true, imageContext: 'Screenshot' },
            image_data: 'base64...',
            timestamp: '2025-01-15T10:30:00Z'
        }
    ],
    episodic: [
        {
            type: 'visual_memory',
            content: {
                screenshot: 'base64...',
                caption: { ai_caption: 'Browser showing documentation' },
                privacy_check: { hasSensitiveInfo: false }
            }
        }
    ],
    semantic: [...],
    procedural: [...]
}
```

---

## ⚡ Performance Metrics

### Response Times
- **FastContextManager Retrieval**: <50ms
- **Working Memory Retrieval**: <100ms  
- **Episodic Memory Retrieval**: <200ms
- **Full Memory Context**: <300ms
- **Screenshot Capture**: <100ms
- **AI Caption Generation**: <2000ms

### Storage Efficiency
- **FastContextManager**: In-memory, unlimited speed
- **Working Memory**: Database with indexes, sub-100ms
- **Episodic Memory**: Full data storage, optimized for learning
- **Duplicate Detection**: Hash-based, <10ms

### Memory Usage
- **FastContextManager**: ~50MB for 100 screenshots
- **Working Memory**: ~10MB active context
- **Database Storage**: Compressed JSON + base64 images

---

## 🔧 Configuration & Settings

### FastContextManager Configuration
```javascript
// glass/src/domains/ai/fast-context-manager.js
const DEFAULT_CONFIG = {
    maxContextSize: 32768,        // 32KB default
    maxBufferSize: 1000,          // 1000 entries
    slidingWindowSize: 100,       // Keep last 100 items
    duplicateThreshold: 0.95      // 95% similarity threshold
};
```

### Listen Service Configuration
```javascript
// glass/src/features/listen/listenService.js
this.screenshotIntervalMs = 3000;  // 3 seconds
this.lastScreenshotHash = null;    // For duplicate detection
```

### Memory Service Configuration
```javascript
// Backend memory service configuration
const MEMORY_CONFIG = {
    workingMemory: {
        maxEntries: 100,
        slidingWindow: true,
        attentionSinkPriority: true
    },
    episodicMemory: {
        retentionDays: 365,
        compressionEnabled: true,
        privacyCheckRequired: true
    }
};
```

---

## 🐛 Troubleshooting & Debugging

### Common Issues

#### Screenshot Not Showing in Memory Logs
**Symptoms**: Logs show `W:0` (0 working memory items) instead of `W:1`
**Cause**: Screenshot not stored in Working Memory
**Solution**: Verify screenshot storage in agentOrchestrator.js

```javascript
// Fix: Ensure screenshot storage after memory retrieval
if (context.image || context.screenshot || context.imageContext) {
    const memoryInstance = await this.memoryService.getMemoryInstance(agentId, userId);
    await memoryInstance.working.addItem({
        type: 'visual',
        context_type: 'screenshot',
        content: { imageContext: context.imageContext || 'Screenshot', hasImage: true },
        image_data: context.image || context.screenshot,
        metadata: { source: 'user_request', type: 'screenshot' }
    });
    console.log('📸 [Working Memory] Stored incoming screenshot in working memory');
}
```

#### FastContextManager Not Storing Screenshots
**Symptoms**: No screenshots in FastContextManager
**Cause**: Trigger source not properly configured
**Solution**: Check trigger source configuration

```javascript
// Verify trigger sources are set correctly
fastContextManager.addContext({
    type: 'screenshot',
    content: 'Screenshot captured',
    metadata: {
        base64: screenshotData,
        triggerSource: 'ask_button_click',  // Must be set
        isCurrentScreen: true
    }
});
```

#### Memory Retrieval Returning Empty
**Symptoms**: `getRecentVisualMemory()` returns null
**Cause**: Database connection or query issues
**Solution**: Check database connectivity and query structure

### Debug Logging
Enable memory debug logging by setting environment variables:
```bash
MEMORY_DEBUG=true
VISUAL_MEMORY_DEBUG=true
FASTCONTEXT_DEBUG=true
```

### Memory Statistics
Access real-time memory statistics:
```javascript
// In browser console or logs
fastContextManager.getStats();
memoryService.getMemoryStats(agentId, userId);
```

---

## 🚀 Future Enhancements

### Planned Features
- **Intelligent Memory Compression**: Automatic old memory compression
- **Cross-Agent Memory Sharing**: Shared knowledge between agents
- **Memory Analytics Dashboard**: Visual memory usage analytics
- **Advanced Privacy Controls**: Fine-grained privacy settings
- **Memory Export/Import**: Backup and restore memory data

### Performance Optimizations
- **Redis Caching Layer**: Ultra-fast memory retrieval
- **Vector Embeddings**: Semantic memory search
- **Batch Processing**: Bulk memory operations
- **Background Sync**: Asynchronous memory updates

---

## 📝 API Reference

### FastContextManager API
```javascript
// Add context
await fastContextManager.addContext(contextData);

// Get latest by type
const screenshot = await fastContextManager.getLatestContext('screenshot');

// Get stats
const stats = fastContextManager.getStats();
```

### Memory Service API
```javascript
// Get memory instance
const memoryInstance = await memoryService.getMemoryInstance(agentId, userId);

// Store in working memory
await memoryInstance.working.addItem(itemData);

// Retrieve from working memory
const memories = await memoryInstance.working.retrieve(query, context, options);

// Store visual memory
await enhancedAskService.storeVisualMemory(screenshot, caption, prompt, privacy, agentId, userId, requestId);
```

### Agent Orchestrator API
```javascript
// Get recent visual memory
const visualMemory = await agentOrchestrator.getRecentVisualMemory(agentId, userId);

// Get full memory context
const memoryContext = await agentOrchestrator.retrieveMemoryContext(agentId, userId, query);
```

---

## 🔒 Memory Isolation

**Location**: `glass/backend/services/memoryService/memoryIsolation.js`

**Purpose**: Prevents cross-user data contamination while allowing cross-agent memory sharing for same user.

**Key Features**:
- ✅ **Cross-agent access allowed** for same user (Agent 1 → Agent 2)
- ❌ **Cross-user access blocked** (User A ↔ User B) 
- 🔍 **Contamination detection** focuses on user-level isolation only
- ⚙️ **Configuration**: `strictMode: false`, `crossAgentSharingAllowed: true`

---

*This document serves as the definitive source of truth for the Xerus Memory System. Last updated: January 2025*