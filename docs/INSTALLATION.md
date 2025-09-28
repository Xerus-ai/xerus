# Xerus AI Assistant - Installation Guide

## Overview
Xerus is a cross-platform AI assistant that provides real-time contextual help through screen capture and audio analysis. Features include AI agents with personality management, RAG-powered knowledge base, integrated tools, voice commands, and a web dashboard for advanced configuration. This guide covers manual installation for Windows and macOS.

## System Requirements

### Windows
- **Operating System**: Windows 10/11 (64-bit)
- **RAM**: 4GB minimum, 8GB recommended
- **Storage**: 2GB free disk space
- **Permissions**: Administrator privileges for installation
- **Audio**: Microphone access (for speech-to-text)
- **Display**: Screen recording permissions

### macOS
- **Operating System**: macOS 11.0 (Big Sur) or later
- **RAM**: 4GB minimum, 8GB recommended  
- **Storage**: 2GB free disk space
- **Permissions**: Screen recording and microphone access
- **Audio**: Microphone access (for speech-to-text)

## Installation Methods

### Method 1: Pre-built Release (Recommended)
1. Visit the [Xerus Glass Releases](https://github.com/Xerus-ai/xerus/releases) page
2. Download the latest release for your platform:
   - Windows: `Xerus-Setup-x.x.x.exe`
   - macOS: `Xerus-x.x.x.dmg`
3. Run the installer and follow the setup wizard

### Method 2: Manual Installation from Source

#### Prerequisites
- Node.js v20.x.x or later
- Python 3.8+ (for native module compilation)
- Git

#### Windows Installation
1. **Install Dependencies**:
   ```bash
   # Install Node.js from https://nodejs.org/
   # Install Python from https://python.org/
   # Install Git from https://git-scm.com/
   ```

2. **Clone Repository**:
   ```bash
   git clone https://github.com/Xerus-ai/xerus.git
   cd xerus/glass
   ```

3. **Install Dependencies**:
   ```bash
   npm install
   ```

4. **Build Application**:
   ```bash
   npm run build:all
   ```

5. **Run Application**:
   ```bash
   npm start
   ```

#### macOS Installation
1. **Install Dependencies**:
   ```bash
   # Install Node.js
   brew install node
   
   # Install Python
   brew install python
   
   # Install Git
   brew install git
   ```

2. **Clone Repository**:
   ```bash
   git clone https://github.com/Xerus-ai/xerus.git
   cd xerus/glass
   ```

3. **Install Dependencies**:
   ```bash
   npm install
   ```

4. **Build Application**:
   ```bash
   npm run build:all
   ```

5. **Run Application**:
   ```bash
   npm start
   ```

## Configuration

### First-Time Setup
1. **Launch Xerus Glass**
2. **Grant Permissions**:
   - Windows: Allow screen capture and microphone access
   - macOS: Grant screen recording and microphone permissions in System Preferences
3. **Configure AI Provider**:
   - Open settings
   - Add your AI API key (OpenAI, Anthropic, Google, etc.)
   - Select preferred models for text and speech

### AI Agent Configuration
Xerus Glass includes 6 built-in AI personalities:
- **Assistant**: General balanced AI for everyday tasks
- **Technical Expert**: Specialized for development and technical tasks
- **Creative Assistant**: Optimized for creative work and brainstorming
- **Tutor**: Patient educational assistant for learning
- **Executive Assistant**: Professional assistant for business tasks
- **Research Assistant**: Analytical specialist for research and investigation

### API Configuration
Xerus Glass supports multiple AI providers:

#### OpenAI
- Get API key from [OpenAI Platform](https://platform.openai.com/)
- Models: GPT-4, GPT-3.5-turbo, Whisper (STT)

#### Anthropic Claude
- Get API key from [Anthropic Console](https://console.anthropic.com/)
- Models: Claude 3 Opus, Claude 3 Sonnet, Claude 3 Haiku

#### Google Gemini
- Get API key from [Google AI Studio](https://aistudio.google.com/)
- Models: Gemini Pro, Gemini Pro Vision

#### Local Options
- **Ollama**: For local LLM hosting
- **Whisper**: For local speech-to-text

## Troubleshooting

### Common Issues

#### Windows Issues
1. **"Sharp module not available"**:
   ```bash
   npm install --include=optional sharp
   ```

2. **Permission Errors**:
   - Run as Administrator
   - Allow screen capture in Windows Security settings

3. **Audio Issues**:
   - Check microphone permissions
   - Ensure audio devices are working
   - Restart audio services

#### macOS Issues
1. **Permission Denied**:
   - Grant screen recording permission: System Preferences → Security & Privacy → Screen Recording
   - Grant microphone permission: System Preferences → Security & Privacy → Microphone

2. **Code Signing Issues**:
   - Right-click app and select "Open" to bypass Gatekeeper
   - Or run: `xattr -d com.apple.quarantine /path/to/Xerus.app`

3. **Performance Issues**:
   - Ensure Metal support is enabled
   - Close unnecessary applications
   - Check Activity Monitor for resource usage

### Performance Optimization

#### Windows
- **High DPI**: Enable "Override high DPI scaling" in properties
- **Graphics**: Ensure GPU acceleration is enabled
- **Memory**: Close unnecessary applications
- **Audio**: Use exclusive audio mode for better performance

#### macOS
- **Metal**: Ensure Metal acceleration is enabled
- **Memory**: Monitor memory pressure in Activity Monitor
- **Display**: Optimize for Retina displays
- **Audio**: Use Core Audio for best performance

## Advanced Configuration

### Environment Variables
Create a `.env` file in the application directory:

```bash
# AI Provider Configuration
OPENAI_API_KEY=your_openai_key_here
ANTHROPIC_API_KEY=your_anthropic_key_here
GOOGLE_API_KEY=your_google_key_here

# Audio Configuration
AUDIO_SAMPLE_RATE=24000
AUDIO_CHANNELS=1
AUDIO_BUFFER_SIZE=4096

# Display Configuration
SCREENSHOT_QUALITY=80
SCREENSHOT_INTERVAL=5000
MAX_SCREENSHOT_WIDTH=1920
MAX_SCREENSHOT_HEIGHT=1080

# Performance Configuration
ENABLE_GPU_ACCELERATION=true
MEMORY_LIMIT=512
ENABLE_NOTIFICATIONS=true
```

### Custom Shortcuts
Configure keyboard shortcuts in settings:

- **Windows**: 
  - `Ctrl+Shift+X` - Toggle Xerus
  - `Ctrl+Shift+L` - Start/Stop listening
  - `Ctrl+Shift+S` - Take screenshot

- **macOS**:
  - `Cmd+Shift+X` - Toggle Xerus
  - `Cmd+Shift+L` - Start/Stop listening
  - `Cmd+Shift+S` - Take screenshot

## Security & Privacy

### Data Handling
- **Screen Captures**: Processed locally, sent to AI providers only when needed
- **Audio**: Processed in real-time, not stored permanently
- **Conversations**: Stored securely in Neon PostgreSQL database
- **API Keys**: Stored securely in system keychain

### Privacy Controls
- **Content Protection**: Toggle to prevent sensitive content capture
- **Area Selection**: Capture only selected screen areas
- **Audio Muting**: Mute microphone with one click
- **Session Management**: Clear conversation history anytime

## Uninstallation

### Windows
1. **Standard Uninstall**:
   - Settings → Apps → Xerus Glass → Uninstall
   - Or use Control Panel → Programs and Features

2. **Manual Cleanup**:
   ```bash
   # Remove application data
   rmdir /s "%APPDATA%\Xerus"
   
   # Remove cache
   rmdir /s "%LOCALAPPDATA%\Xerus"
   ```

### macOS
1. **Standard Uninstall**:
   - Drag Xerus.app to Trash
   - Empty Trash

2. **Manual Cleanup**:
   ```bash
   # Remove application data
   rm -rf ~/Library/Application\ Support/Xerus
   
   # Remove cache
   rm -rf ~/Library/Caches/Xerus
   
   # Remove logs
   rm -rf ~/Library/Logs/Xerus
   ```

## Support

### Getting Help
- **Documentation**: [Xerus Glass Wiki](https://github.com/Xerus-ai/xerus/wiki)
- **Issues**: [GitHub Issues](https://github.com/Xerus-ai/xerus/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Xerus-ai/xerus/discussions)

### Logs and Debugging
- **Windows**: `%APPDATA%\Xerus\logs\`
- **macOS**: `~/Library/Logs/Xerus/`

### System Information
Run the following to get system information for support:

```bash
# In the application directory
npm run debug-info
```

## Updates

### Automatic Updates
- Xerus Glass checks for updates automatically
- Updates are downloaded and installed in the background
- Restart required for major updates

### Manual Updates
1. Download latest release from GitHub
2. Install over existing installation
3. Restart application

## Development

### Building from Source
See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and contribution guidelines.

### Custom Features
Xerus Glass supports plugins and custom tools. See the [Plugin Development Guide](docs/PLUGIN_DEVELOPMENT.md) for details.

---

**Version**: 0.2.4  
**Last Updated**: July 2024  
**Platform Support**: Windows 10/11, macOS 11.0+