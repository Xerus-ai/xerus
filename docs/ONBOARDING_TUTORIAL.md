# 🎯 Xerus - Onboarding Tutorial

> **Welcome to your Digital Mind Extension!** Let's get you up and running with Xerus in just 10 minutes.

---

## 🚀 Quick Start Checklist

Before we begin, make sure you have:
- [ ] Xerus installed on your system
- [ ] At least one AI provider API key (OpenAI, Gemini, Claude, or Deepseek)
- [ ] Screen recording permissions granted
- [ ] Microphone access allowed (optional but recommended)

---

## 📚 Tutorial Overview

This tutorial will guide you through:
1. **First Launch** - Basic setup and permissions
2. **Essential Configuration** - AI providers and key settings
3. **Core Features** - Screen capture, area selection, and AI interaction
4. **Advanced Features** - Tools, shortcuts, and customization
5. **Productivity Workflows** - Real-world usage examples

**Estimated Time**: 10-15 minutes

---

## 🎬 Step 1: First Launch & Permissions

### Launch Xerus
1. **Find Xerus in your Applications folder** (macOS) or **Start Menu** (Windows)
2. **Double-click to launch** - Xerus will appear as a translucent interface
3. **Grant permissions** when prompted:

#### macOS Permissions
```
System Preferences → Security & Privacy → Privacy
✅ Screen Recording → Check "Xerus Glass"
✅ Microphone → Check "Xerus Glass" (for voice features)
✅ Accessibility → Check "Xerus Glass" (for shortcuts)
```

#### Windows Permissions
```
Windows will prompt for:
✅ Camera/Screen recording access
✅ Microphone access
✅ Windows Defender approval
```

### Test Basic Functionality
1. **Press `Cmd + \` (Mac) or `Ctrl + \` (Windows)** to toggle Glass visibility
2. **You should see a translucent glass interface** appear/disappear
3. **Success!** Glass is now running

---

## ⚙️ Step 2: Essential Configuration

### Add Your First AI Provider

1. **Click the Settings Icon** (⚙️) in the Glass interface
2. **Navigate to "AI Providers"**
3. **Choose your preferred provider**:

#### Option A: OpenAI (Recommended for beginners)
```
1. Go to https://platform.openai.com/api-keys
2. Create a new API key
3. Copy the key (starts with "sk-...")
4. Paste into Glass → Settings → AI Providers → OpenAI
5. Select model: "gpt-4-turbo-preview" (best quality) or "gpt-3.5-turbo" (faster)
6. Click "Test Connection" to verify
```

#### Option B: Google Gemini (Fast and free tier available)
```
1. Go to https://aistudio.google.com/apikey
2. Create API key
3. Copy the key (starts with "AIza...")
4. Paste into Glass → Settings → AI Providers → Gemini
5. Select model: "gemini-pro"
6. Click "Test Connection" to verify
```

#### Option C: Local AI (No API key needed)
```
1. Install Ollama from https://ollama.ai
2. Run: ollama pull llama2:7b
3. In Glass: Settings → AI Providers → Local (Ollama)
4. Endpoint: http://localhost:11434
5. Model: llama2:7b
6. Click "Test Connection"
```

### Basic Settings Configuration
1. **Privacy Settings**:
   - Content Protection: ON (prevents screenshots in sensitive apps)
   - Auto Capture: ON (captures context automatically)
   - History Retention: 7 days (adjust as needed)

2. **Interface Settings**:
   - Opacity: 85% (adjust for visibility)
   - Always on Top: ON
   - Dark Mode: Auto (follows system)

---

## 🖼️ Step 3: Core Features Walkthrough

### Your First AI Interaction

Let's test the basic functionality:

1. **Open any document or webpage** on your screen
2. **Press `Cmd + \` to show Glass**
3. **Type your first question**: 
   ```
   "What's on my screen right now?"
   ```
4. **Press Enter and watch Glass analyze your screen**
5. **Glass will respond** with a description of what it sees

### Screen Capture Modes

#### Automatic Capture (Default)
- **When it works**: Glass automatically captures your screen when you ask questions
- **Best for**: General use, quick questions
- **Example**: 
  ```
  You: "Summarize this article"
  Glass: [automatically captures screen] "This article discusses..."
  ```

#### Manual Capture
- **When to use**: When you want control over what's captured
- **How**: Press `Cmd/Ctrl + Shift + S` to capture immediately
- **Example**: Capture a specific chart before asking about it

#### Area Selection (Advanced)
- **When to use**: Focus on specific parts of your screen
- **How**: 
  1. Press `Cmd/Ctrl + A` to start area selection
  2. Click and drag to select region
  3. Press Enter to confirm
  4. Ask your question about the selected area

### Testing Area Selection

Let's practice area selection:

1. **Open a webpage with multiple sections**
2. **Press `Cmd/Ctrl + A`** - your screen should overlay with selection tools
3. **Click and drag** around a specific paragraph or image
4. **Press Enter** to confirm selection
5. **Ask Glass**: "What does this selected area contain?"
6. **Glass will analyze only your selected region**

---

## ⚡ Step 4: Advanced Features

### Keyboard Shortcuts Mastery

Memorize these essential shortcuts:

| Action | Windows | macOS | When to Use |
|--------|---------|-------|-------------|
| **Toggle Glass** | `Ctrl + \` | `Cmd + \` | Show/hide interface |
| **Quick Ask** | `Ctrl + Alt + N` | `Cmd + Alt + N` | Fast AI query |
| **Manual Capture** | `Ctrl + Shift + S` | `Cmd + Shift + S` | Controlled capture |
| **Area Selection** | `Ctrl + A` | `Cmd + A` | Select specific regions |

### Tool Integration

Glass has built-in tools for enhanced capabilities:

#### Web Search Tool
```
You: "What's the latest news about AI?"
Glass: [uses web search] "Here are the latest AI developments..."
```

#### Calculator Tool
```
You: "Calculate 15% tip on $87.50"
Glass: [uses calculator] "15% tip on $87.50 is $13.13, total: $100.63"
```

#### Time & System Info
```
You: "What time is it in Tokyo?"
Glass: [uses time tool] "Current time in Tokyo is 11:30 PM JST"
```

### Privacy Controls

Learn to control what Glass can see:

1. **Content Protection Toggle**: Click the shield icon (🛡️)
   - **ON**: Prevents Glass from capturing sensitive content
   - **Auto-activates**: In banking apps, password fields
   
2. **Selective Capture**:
   - Use area selection for sensitive documents
   - Manual capture instead of auto-capture in private browsing

---

## 🏭 Step 5: Productivity Workflows

### Workflow 1: Document Analysis

**Scenario**: You need to review a long contract or report

1. **Open the document**
2. **Ask Glass**: "Give me a summary of this document's key points"
3. **Follow up with**: "What are the potential risks or concerns?"
4. **Get specific**: "Focus on the financial terms in section 3"

**Pro Tip**: Use area selection to focus on specific clauses or sections.

### Workflow 2: Meeting Assistance

**Scenario**: You're in a video call and need real-time help

1. **Before the meeting**: Ask "Help me prepare talking points for a client meeting about project timelines"
2. **During the meeting**: Use area selection to capture shared screens
3. **Follow-up questions**: "What questions should I ask about this proposal?"
4. **After the meeting**: "Create action items from this discussion"

### Workflow 3: Research & Learning

**Scenario**: Learning about a new topic

1. **Start broad**: "Explain machine learning in simple terms"
2. **Get current info**: "What are the latest developments in ML?"
3. **Go deeper**: "Show me examples of how ML is used in healthcare"
4. **Compare sources**: Use web search to get multiple perspectives

### Workflow 4: Code Review & Development

**Scenario**: Working on code and need assistance

1. **Show code**: Open your IDE and ask "Review this function for potential issues"
2. **Debug help**: "Why might this code be throwing an error?"
3. **Optimization**: "How can I make this code more efficient?"
4. **Documentation**: "Write documentation for this API endpoint"

---

## 🎨 Step 6: Customization & Optimization

### Interface Customization

Make Glass work perfectly for your setup:

1. **Adjust Transparency**:
   - Settings → Interface → Opacity
   - **85-90%**: Good balance of visibility and transparency
   - **95%+**: Maximum readability
   - **70-80%**: Subtle, artistic appearance

2. **Position & Size**:
   - **Drag Glass** to your preferred screen position
   - **Resize** by dragging corners
   - **Multiple monitors**: Glass remembers position per monitor

3. **Theme & Appearance**:
   - **Dark Mode**: Better for evening use
   - **Light Mode**: Better for bright environments
   - **Auto**: Follows your system settings

### Shortcut Customization

Adapt shortcuts to your workflow:

1. **Go to Settings → Shortcuts**
2. **Common customizations**:
   ```
   Power users: Change toggle to F1 for one-handed access
   Developers: Set quick-ask to Ctrl+` for terminal compatibility
   Writers: Map capture to Ctrl+Shift+C for documentation
   ```

### Performance Optimization

For the best experience:

1. **Choose the right AI model**:
   - **Fast responses**: GPT-3.5, Gemini Flash
   - **Best quality**: GPT-4, Claude 3 Opus
   - **Privacy-focused**: Local Ollama models

2. **Adjust capture frequency**:
   - **High**: Captures every interaction (slower but more context)
   - **Medium**: Captures when needed (balanced)
   - **Low**: Manual capture only (fastest)

---

## 🚦 Troubleshooting Common Issues

### "Glass isn't responding to keyboard shortcuts"

**Solution**:
1. Check accessibility permissions (macOS) or run as administrator (Windows)
2. Verify shortcuts aren't conflicting with other apps
3. Try restarting Glass
4. Reset shortcuts to defaults in Settings

### "AI provider showing connection errors"

**Solution**:
1. Verify API key is correct (no extra spaces)
2. Check your internet connection
3. Verify API key has sufficient credits/quota
4. Try switching to a different provider temporarily

### "Screen capture isn't working"

**Solution**:
1. Grant screen recording permissions in system settings
2. Restart Glass after granting permissions
3. Try manual capture (`Cmd/Ctrl + Shift + S`) first
4. Check if other screen recording apps are interfering

### "Glass interface disappeared"

**Solution**:
1. Press `Cmd/Ctrl + \` to toggle visibility
2. Check if Glass moved to another monitor
3. Right-click Glass in system tray → Show Interface
4. Reset window position in Settings

### "Poor performance or high CPU usage"

**Solution**:
1. Reduce screen capture frequency in Settings
2. Use faster AI models (GPT-3.5 instead of GPT-4)
3. Disable unnecessary features in Privacy settings
4. Close other resource-intensive applications

---

## 🎓 Graduation: You're Ready!

Congratulations! You've completed the Xerus Glass onboarding tutorial. You now know how to:

✅ **Set up and configure** Glass with your preferred AI provider  
✅ **Use core features** like screen capture and area selection  
✅ **Master keyboard shortcuts** for efficient interaction  
✅ **Leverage advanced tools** for web search, calculations, and more  
✅ **Apply productivity workflows** for real-world scenarios  
✅ **Customize the interface** to match your preferences  
✅ **Troubleshoot common issues** independently  

### Next Steps

1. **Explore Advanced Features**:
   - Set up additional AI providers for different use cases
   - Create custom shortcuts for your workflow
   - Experiment with voice commands and audio features

2. **Join the Community**:
   - [Discord](https://discord.gg/xW39NNu4m6): Get help and share tips
   - [GitHub](https://github.com/Xerus-ai/xerus): Report issues and contribute
   - Share your productivity workflows with other users

3. **Stay Updated**:
   - Enable automatic updates in Settings
   - Follow our changelog for new features
   - Participate in beta testing for early access

### Quick Reference Card

Save this for easy reference:

```
Essential Shortcuts:
Toggle Glass: Cmd/Ctrl + \
Quick Ask: Cmd/Ctrl + Alt + N
Manual Capture: Cmd/Ctrl + Shift + S
Area Selection: Cmd/Ctrl + A

Common Commands:
"What's on my screen?" - General analysis
"Summarize this document" - Text analysis
"Help me with..." - General assistance
"Search for..." - Web search
"Calculate..." - Math operations

Troubleshooting:
- Check permissions first
- Verify API keys
- Restart Glass if needed
- Reset to defaults if stuck
```

---

## 📞 Need Help?

If you get stuck or have questions:

1. **Check the documentation**:
   - [User Guide](./USER_GUIDE.md) - Comprehensive feature guide
   - [API Documentation](./API_DOCUMENTATION.md) - Technical details

2. **Community support**:
   - [Discord](https://discord.gg/xW39NNu4m6) - Real-time help
   - [GitHub Issues](https://github.com/Xerus-ai/xerus/issues) - Bug reports

3. **Common resources**:
   - FAQ section in our Discord
   - Video tutorials on our website
   - Example workflows from the community

**Welcome to the Xerus Glass community! We're excited to see how you'll use your new digital mind extension.**

---

*This tutorial is designed to get you productive quickly. For advanced features and technical details, explore our [comprehensive documentation](./USER_GUIDE.md).*