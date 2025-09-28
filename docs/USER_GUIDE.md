# 📖 Xerus - Comprehensive User Guide

> **Your Digital Mind Extension** - AI assistant which sees and listens

---

## 🚀 Quick Start

### System Requirements
- **macOS**: 10.15+ (Catalina or later)
- **Windows**: 10/11 (64-bit)
- **RAM**: 4GB+ recommended
- **Storage**: 500MB free space
- **Permissions**: Screen recording, microphone access

### First Launch
1. **Download & Install**: Get the latest version from our [releases page](https://github.com/xerus-ai/xerus/releases)
2. **Grant Permissions**: Allow screen recording and microphone access when prompted
3. **Configure AI Provider**: Add your API keys in Settings → AI Providers
4. **Start Using Xerus**: Press `Cmd/Ctrl + \` to open the interface

---

## ⌨️ Keyboard Shortcuts

### Primary Controls
| Action | Windows | macOS | Description |
|--------|---------|-------|-------------|
| **Show/Hide Xerus** | `Ctrl + \` | `Cmd + \` | Toggle main interface |
| **Ask Anything** | `Ctrl + Alt + N` | `Cmd + Alt + N` | Quick AI query |
| **Manual Screenshot** | `Ctrl + Shift + S` | `Cmd + Shift + S` | Capture current screen |

### Window Management
| Action | Windows | macOS | Description |
|--------|---------|-------|-------------|
| **Move Up** | `Ctrl + ↑` | `Cmd + ↑` | Move window up |
| **Move Down** | `Ctrl + ↓` | `Cmd + ↓` | Move window down |
| **Move Left** | `Ctrl + ←` | `Cmd + ←` | Move window left |
| **Move Right** | `Ctrl + →` | `Cmd + →` | Move window right |

### Response Navigation
| Action | Windows | macOS | Description |
|--------|---------|-------|-------------|
| **Scroll Up** | `Ctrl + Shift + ↑` | `Cmd + Shift + ↑` | Scroll response up |
| **Scroll Down** | `Ctrl + Shift + ↓` | `Cmd + Shift + ↓` | Scroll response down |

### Privacy Controls
| Action | Windows | macOS | Description |
|--------|---------|-------|-------------|
| **Toggle Content Protection** | `Ctrl + Shift + P` | `Cmd + Shift + P` | Prevent screen recording |
| **Toggle Microphone** | `Ctrl + Shift + M` | `Cmd + Shift + M` | Enable/disable microphone |

> 💡 **Tip**: All shortcuts can be customized in Settings → Shortcuts

---

## 🎯 Core Features

### 1. **Real-Time Context Capture**

Xerus continuously understands your screen and audio context to provide relevant assistance.

#### Screen Capture
- **Automatic**: Captures screen context when you ask questions
- **Manual**: Use `Cmd/Ctrl + Shift + S` for instant capture
- **Intelligent**: Only captures when needed, respects privacy

#### Audio Processing
- **Meeting Mode**: Real-time audio transcription and summarization
- **Voice Commands**: Natural language voice interaction
- **Echo Cancellation**: Advanced audio processing for clear capture

#### Usage Example:
```
You: "What's the main point of this document?"
Xerus: [Analyzes current screen] "This document discusses quarterly sales metrics, with a 15% growth in Q3..."
```

### 2. **Area Selection & Privacy Controls**

#### Area Selection
- **Click & Drag**: Select specific areas of your screen
- **Multi-Monitor**: Works across multiple displays
- **High-DPI**: Supports retina and 4K displays

**How to Use:**
1. Press `Cmd/Ctrl + A` to start area selection
2. Click and drag to select region
3. Press Enter to confirm or Escape to cancel

#### Privacy Protection
- **Content Protection**: Prevents screenshots in sensitive apps
- **Selective Capture**: Only capture what you choose
- **No Always-On**: No continuous background recording

**Toggle Privacy Mode:**
- Click the shield icon in the interface
- Use keyboard shortcut `Cmd/Ctrl + P`
- Auto-enables in banking/password apps

### 3. **AI Agent Management System**

#### Database-Driven AI Personalities
Xerus features **8 specialized AI agents** with unique capabilities:

- **🎨 Creative Assistant**: Optimized for brainstorming and creative work
- **📞 Customer Support Agent**: Professional support with Xerus AI expertise
- **📚 Demo Tutorial Agent**: Interactive onboarding and feature guidance
- **💼 Executive Assistant**: Business tasks and professional assistance
- **🔬 Research Assistant**: Analytical specialist for investigation
- **⚙️ Technical Expert**: Development and technical problem-solving
- **👨‍🏫 Tutor**: Patient educational assistant for learning
- **🧪 Test Agent**: General purpose testing and experimentation

#### Dynamic Model Selection
Switch between AI models in real-time for each agent:
- **OpenAI**: GPT-4o, GPT-4, GPT-3.5 Turbo
- **Anthropic**: Claude 3.5 Sonnet, Claude 3 Sonnet/Haiku
- **Google**: Gemini Pro, Gemini 1.5 Pro/Flash
- **Deepseek**: Specialized task models
- **Perplexity**: Real-time web search integration

#### Agent Configuration
1. **Navigate to AI Agents** page in web dashboard
2. **Select an Agent** to view details and capabilities
3. **Edit Agent** to modify settings (requires edit mode activation)
4. **Change AI Model** from dropdown when in edit mode
5. **Save Changes** to apply modifications

#### Visual Status System
Each agent displays capability indicators:
- 🌐 **Web Search**: Agent can access real-time internet information
- 🔧 **Tools**: Number of available tools and utilities
- 📖 **Knowledge Base**: Access to specialized domain knowledge
- 🟢🔴 **Status Dot**: Active or Inactive

#### Unified Access System
- **All Users**: Full access to all 8 agents with complete functionality
- **Credit System**: Guest users (10 credits), Authenticated users (50 credits), Admins (unlimited)
- **No Permission Restrictions**: Same interface and capabilities regardless of login status

### 4. **MCP Tools Integration System**

Xerus features a powerful Model Context Protocol (MCP) tools system for enhanced capabilities:

#### Available MCP Tools
- **🌐 Web Search**: Real-time internet information and research
- **📊 Perplexity Integration**: Advanced search with source attribution
- **🔥 Firecrawl**: Website content extraction and analysis
- **⏰ Time & Date**: Current time, scheduling, and calendar assistance
- **🧮 Calculator**: Built-in mathematical calculations
- **📁 File Operations**: Document processing and analysis
- **🔧 System Tools**: Hardware stats and performance metrics

#### MCP Server Management
Tools are managed through MCP (Model Context Protocol) servers that provide:
- **Dynamic Loading**: Tools activate automatically when needed
- **Secure Execution**: Sandboxed tool execution environment
- **Real-time Updates**: Tools can be added/updated without app restart
- **Error Handling**: Graceful fallbacks when tools are unavailable

#### Usage Example:
```
You: "What's the weather like in Tokyo?"
Xerus: [Uses web search MCP tool] "Current weather in Tokyo: 22°C, partly cloudy with 60% humidity. High of 25°C expected today."

You: "Calculate the ROI for this investment"
Xerus: [Uses calculator MCP tool] "Based on the figures: Initial investment $10,000, returns $12,500 over 2 years = 25% ROI"
```

### 5. **Meeting & Audio Features**

#### Real-Time Transcription
- **Live Captions**: See speech-to-text in real-time
- **Speaker Identification**: Distinguishes different voices
- **Keyword Highlighting**: Emphasizes important terms

#### Smart Summarization
- **Action Items**: Automatically extracts tasks and decisions
- **Key Points**: Identifies main discussion topics
- **Follow-ups**: Suggests next steps and deadlines

#### Meeting Assistant
- **Questions**: Ask about meeting content during or after
- **Note Taking**: Automatic structured note generation
- **Sharing**: Export summaries and transcripts

---

## 🎨 Interface & Customization

### Xerus Interface Design

Xerus features a modern, clean interface designed for productivity:

#### Visual Design
- **Modern UI**: Clean, minimalist interface design
- **Responsive Layout**: Adapts to different screen sizes and resolutions
- **Smooth Animations**: Fluid transitions and interactions
- **Dark/Light Mode**: Automatic or manual theme switching

#### Customization Options
- **Position**: Drag to any screen position
- **Size**: Resize interface to your preference
- **Shortcuts**: Customize all keyboard shortcuts
- **Themes**: Switch between light and dark modes

### Window Behavior
- **Always on Top**: Stays above other applications
- **Click Through**: Optional click-through mode
- **Auto-Hide**: Hides when not in use
- **Focus Management**: Smart focus handling

---

## ⚙️ Settings & Configuration

### AI Provider Settings
**Path**: Settings → AI Providers

#### OpenAI Configuration
```
API Key: sk-...
Model: gpt-4-turbo-preview
Max Tokens: 4096
Temperature: 0.7
```

#### Gemini Configuration
```
API Key: AIza...
Model: gemini-pro
Safety Settings: Block few
Response Format: JSON
```

#### Local Models (Ollama)
```
Endpoint: http://localhost:11434
Model: llama2:7b
Context Length: 4096
GPU Acceleration: Enabled
```

### Privacy Settings
**Status**: ✅ **Backend Implemented** | ⚠️ **UI Integration Pending**

**Current Access**: Keyboard shortcuts + API calls
- **`Ctrl/Cmd + Shift + P`** - Toggle content protection
- **`Ctrl/Cmd + Shift + M`** - Toggle microphone access

**Features Implemented**:
- **Content Protection**: Prevents screenshots/screen recording of sensitive windows
- **Microphone Controls**: Enable/disable microphone access with visual indicators  
- **Privacy Modes**: Normal, Enhanced (3-day retention), Paranoid (1-day + biometric)
- **Secure Storage**: AES-256-GCM encrypted settings storage
- **System Permissions**: Auto-checks screen recording/microphone permissions (macOS/Windows)
- **Privacy Indicators**: Real-time visual feedback for active privacy features

**Technical Note**: Full Privacy Controls UI component exists (`PrivacyControls.js`) but requires Settings integration.

### Performance Settings
**Path**: Settings → Performance

- **CPU Usage**: Limit processing power usage
- **Memory Management**: Control RAM usage
- **Cache Size**: Adjust local storage cache
- **Background Processing**: Enable/disable when minimized

### Shortcut Customization
**Path**: Settings → Shortcuts

All keyboard shortcuts can be customized:
1. Click on any shortcut field
2. Press your desired key combination
3. Click Save to apply changes
4. Test the new shortcut

---

## 🔧 Troubleshooting

### Common Issues

#### "No Screen Recording Permission"
**Solution:**
1. Go to System Preferences → Security & Privacy → Privacy
2. Select "Screen Recording" from the left sidebar
3. Check the box next to "Xerus"
4. Restart the application

#### "AI Provider Not Responding"
**Solution:**
1. Check your internet connection
2. Verify API key is correct in Settings
3. Check API provider status page
4. Try switching to a different provider

#### "High CPU Usage"
**Solution:**
1. Reduce screen capture frequency in Settings
2. Disable background processing
3. Lower AI model complexity
4. Close other resource-intensive applications

#### "Interface Not Visible"
**Solution:**
1. Press `Cmd/Ctrl + \` to toggle visibility
2. Check if window is on a different display
3. Reset window position in Settings
4. Restart the application

### Performance Optimization

#### For Better Speed:
- Use local models (Ollama) for faster responses
- Reduce screen capture quality in Settings
- Disable unnecessary features in Privacy settings
- Clear conversation history regularly

#### For Better Quality:
- Use premium AI models (GPT-4, Claude 3 Opus)
- Enable high-quality screen capture
- Allow longer processing times
- Maintain conversation context

### Data Management

#### Local Data Location:
- **macOS**: `~/Library/Application Support/Xerus`
- **Windows**: `%APPDATA%\Xerus`

#### Backup & Restore:
1. **Export**: Settings → Data → Export Configuration
2. **Import**: Settings → Data → Import Configuration
3. **Reset**: Settings → Data → Reset All Data

---

## 🌟 Advanced Tips & Tricks

### Power User Features

#### Context Stacking
Build complex queries by referring to previous captures:
```
You: "Analyze this chart" [shows financial data]
Xerus: [Analyzes chart] "Revenue increased 23% QoQ..."
You: "How does this compare to our competitors?"
Xerus: [Searches web] "Compared to industry average of 15%..."
```

#### Chain Commands
Combine multiple actions in one request:
```
You: "Summarize this meeting, extract action items, and schedule a follow-up"
Xerus: [Processes audio] → [Creates summary] → [Lists tasks] → [Suggests calendar slots]
```

#### Custom Prompts
Create custom prompt templates:
1. Go to Settings → Advanced → Custom Prompts
2. Create templates for frequent tasks
3. Use variables like `{screen_content}`, `{audio_content}`
4. Save and reuse across sessions

### Productivity Workflows

#### Morning Briefing
```
You: "What do I need to know for today?"
Xerus: [Checks calendar] → [Reviews recent emails] → [Gets weather] → [Provides summary]
```

#### Document Review
```
You: "Review this contract for key terms and risks"
Xerus: [Analyzes document] → [Identifies clauses] → [Highlights concerns] → [Suggests questions]
```

#### Meeting Preparation
```
You: "Help me prepare for the 3 PM client meeting"
Xerus: [Reviews calendar] → [Pulls client history] → [Suggests talking points] → [Prepares questions]
```

### Integration Ideas

#### Developer Workflow
- Code review assistance
- Documentation generation
- Bug analysis and debugging
- API documentation lookup

#### Content Creation
- Writing assistance and editing
- Research and fact-checking
- Image analysis and description
- Translation and localization

#### Data Analysis
- Chart and graph interpretation
- Trend identification
- Report summarization
- Metric tracking

---

## 📚 Additional Resources

### Documentation
- **API Reference**: [docs/API_DOCUMENTATION.md](./API_DOCUMENTATION.md)
- **Tool Integration Guide**: [docs/TOOL_INTEGRATION.md](./TOOL_INTEGRATION.md)
- **Developer Guide**: [docs/CONTRIBUTING.md](../CONTRIBUTING.md)

### Community
- **Discord**: [Join our community](https://discord.gg/xW39NNu4m6)
- **GitHub**: [Report issues](https://github.com/Xerus-ai/xerus/issues)
- **Website**: [xerus.ai](https://xerus.ai)

### Support
- **FAQ**: Check common questions in our Discord
- **Bug Reports**: Use GitHub issues with detailed descriptions
- **Feature Requests**: Discuss ideas in our Discord community

---

## 🔄 Updates & Changelog

Xerus automatically checks for updates and notifies you when new versions are available.

### Recent Updates
- **v1.0.0**: Production release with MCP tools integration, 8 AI agents, enhanced authentication
- **v0.9.5**: Enhanced tool integration with MCP servers, improved performance
- **v0.9.0**: Added area selection, privacy controls, agent management system
- **v0.8.5**: Multi-monitor support, improved audio processing with AEC

### Update Process
1. Notification appears when update is available
2. Click "Download Update" to start process
3. Application restarts automatically
4. Your settings and data are preserved

---

*This guide covers the core features of Xerus. For technical implementation details, see the [API Documentation](./API_DOCUMENTATION.md) and [MCP Implementation Guide](./MCP_IMPLEMENTATION.md).*