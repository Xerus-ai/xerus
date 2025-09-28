# Agent Mode Documentation

## Overview
Agent Mode enables real-time AI conversations with TTS (Text-to-Speech) responses, allowing natural back-and-forth dialogue with your selected AI agent.

## How to Enable Agent Mode

### Method 1: Double-Click Marble Button
1. **Double-click** the marble button when idle or listening
2. Button turns **purple** to indicate Agent Mode is active
3. Start speaking - the agent will respond with voice

### Method 2: Manual Toggle
1. Single-click marble button to start listening (green)
2. Click the TTS toggle button to enable agent responses
3. Marble button turns **purple** when agent mode activates

## Visual Indicators

| Color | Status | Behavior |
|-------|--------|----------|
| **Green** | Normal Listening | Speech-to-text only, no agent responses |
| **Purple** | Agent Mode Active | AI agent responds with TTS audio |
| **Red** | Error/Unavailable | Check connection and try again |

## Capabilities

### ✅ What Agent Mode Provides
- **Real-time AI conversation** with selected agent personality
- **Voice responses** using TTS technology
- **Continuous dialogue** - no need to restart sessions
- **Smart audio handling** - prevents feedback loops
- **Agent personality** matching your selected AI assistant

### 🔧 Technical Features
- **Ultra-low latency** TTS responses (WebSocket streaming)
- **Dual audio capture** - microphone + system audio
- **Feedback prevention** - TTS audio doesn't create duplicate transcripts
- **Session persistence** - maintains conversation context

## Usage Tips

1. **Speak clearly** and wait for the agent to finish responding
2. **Purple marble** confirms agent mode is working
3. **Single-click** to end session and return to normal listening
4. **Check agent selection** in settings for personality preferences

## Troubleshooting

- **No voice response**: Verify TTS WebSocket server is running on port 5001
- **Marble stays green**: Double-click to activate agent mode
- **Audio feedback**: Built-in prevention should handle this automatically
- **Connection issues**: Check backend service status

## Backend Requirements
- TTS WebSocket server running on `ws://localhost:5001/tts-stream`
- Selected agent with valid model configuration
- Active internet connection for AI model access