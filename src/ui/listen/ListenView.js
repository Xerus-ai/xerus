import { html, css, LitElement } from '../assets/lit-core-2.7.4.min.js';
import { ThemeMixin } from '../mixins/ThemeMixin.js';
import './stt/SttView.js';
import './summary/SummaryView.js';
import { WebSocketTTSClient } from '../../domains/audio/websocket-tts-client.js';

export class ListenView extends ThemeMixin(LitElement) {
    static styles = css`
        :host {
            display: block;
            width: 400px;
            transform: translate3d(0, 0, 0);
            backface-visibility: hidden;
            transition: transform 0.2s cubic-bezier(0.23, 1, 0.32, 1), opacity 0.2s ease-out;
            will-change: transform, opacity;
        }

        :host(.hiding) {
            animation: slideUp 0.3s cubic-bezier(0.4, 0, 0.6, 1) forwards;
        }

        :host(.showing) {
            animation: slideDown 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }

        :host(.hidden) {
            opacity: 0;
            transform: translateY(-150%) scale(0.85);
            pointer-events: none;
        }


        * {
            font-family: 'Helvetica Neue', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            cursor: default;
            user-select: none;
        }

/* Allow text selection in insights responses */
.insights-container, .insights-container *, .markdown-content {
    user-select: text !important;
    cursor: text !important;
}

/* Add highlight.js styles - Light theme */
.insights-container pre {
    background: var(--background-secondary, #f8f9fa) !important;
    border-radius: 8px !important;
    padding: 12px !important;
    margin: 8px 0 !important;
    overflow-x: auto !important;
    border: 1px solid var(--border-light, #e5e7eb) !important;
    white-space: pre !important;
    word-wrap: normal !important;
    word-break: normal !important;
    box-shadow: var(--shadow-sm, 0 1px 2px 0 rgba(0, 0, 0, 0.05)) !important;
}

.insights-container code {
    font-family: 'Monaco', 'Menlo', 'Consolas', monospace !important;
    font-size: 12px !important;
    background: transparent !important;
    white-space: pre !important;
    word-wrap: normal !important;
    word-break: normal !important;
    color: var(--text-primary, #1f2937) !important;
}

.insights-container pre code {
    white-space: pre !important;
    word-wrap: normal !important;
    word-break: normal !important;
    display: block !important;
}

.insights-container p code {
    background: var(--background-tertiary, #f1f3f4) !important;
    padding: 2px 6px !important;
    border-radius: 4px !important;
    color: var(--interactive-primary, #2563eb) !important;
    border: 1px solid var(--border-light, #e5e7eb) !important;
}

/* Light theme syntax highlighting */
.hljs-keyword {
    color: #7c3aed !important;
}

.hljs-string {
    color: #059669 !important;
}

.hljs-comment {
    color: #6b7280 !important;
}

.hljs-number {
    color: #dc2626 !important;
}

.hljs-function {
    color: #2563eb !important;
}

.hljs-title {
    color: #2563eb !important;
}

.hljs-variable {
    color: #0891b2 !important;
}

.hljs-built_in {
    color: #ea580c !important;
}

.hljs-attr {
    color: #2563eb !important;
}

.hljs-tag {
    color: #7c3aed !important;
}
        .assistant-container {
            display: flex;
            flex-direction: column;
            color: var(--text-primary, #1f2937);
            box-sizing: border-box;
            position: relative;
            background: var(--surface-elevated, #ffffff);
            overflow: hidden;
            border-radius: 12px;
            width: 100%;
            height: 100%;
            border: 1px solid var(--border-light, #e5e7eb);
            box-shadow: var(--shadow-lg, 0 10px 15px -3px rgba(0, 0, 0, 0.1));
        }

        .assistant-container::after {
            display: none;
        }

        .assistant-container::before {
            display: none;
        }

        .top-bar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 20px;
            min-height: 40px;
            position: relative;
            z-index: 1;
            width: 100%;
            box-sizing: border-box;
            flex-shrink: 0;
            border-bottom: 1px solid var(--border-light, #e5e7eb);
            background: var(--background-secondary, #f8f9fa);
            border-top-left-radius: 12px;
            border-top-right-radius: 12px;
        }

        .bar-left-text {
            color: var(--text-primary, #1f2937);
            font-size: 14px;
            font-family: 'Helvetica Neue', sans-serif;
            font-weight: 600;
            position: relative;
            overflow: hidden;
            white-space: nowrap;
            flex: 1;
            min-width: 0;
            max-width: 240px;
        }

        .bar-left-text-content {
            display: inline-block;
            transition: transform 0.3s ease;
        }

        .bar-left-text-content.slide-in {
            animation: slideIn 0.3s ease forwards;
        }

        .bar-controls {
            display: flex;
            gap: 4px;
            align-items: center;
            flex-shrink: 0;
            width: 120px;
            justify-content: flex-end;
            box-sizing: border-box;
            padding: 4px;
        }

        .toggle-button {
            display: flex;
            align-items: center;
            gap: 6px;
            background: var(--background-tertiary, #f1f3f4);
            color: var(--text-secondary, #6b7280);
            border: 1px solid var(--border-light, #e5e7eb);
            outline: none;
            box-shadow: var(--shadow-sm, 0 1px 2px 0 rgba(0, 0, 0, 0.05));
            padding: 6px 12px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            height: 32px;
            white-space: nowrap;
            transition: all 0.15s ease;
            justify-content: center;
        }

        .toggle-button:hover {
            background: var(--background-secondary, #f8f9fa);
            border-color: var(--border-medium, #d1d5db);
            color: var(--text-primary, #1f2937);
            box-shadow: var(--shadow-md, 0 4px 6px -1px rgba(0, 0, 0, 0.1));
        }

        .toggle-button svg {
            flex-shrink: 0;
            width: 12px;
            height: 12px;
            pointer-events: none;
        }

        .toggle-button span {
            pointer-events: none;
        }

        .copy-button {
            background: var(--background-tertiary, #f1f3f4);
            color: var(--text-secondary, #6b7280);
            border: 1px solid var(--border-light, #e5e7eb);
            outline: none;
            box-shadow: var(--shadow-sm, 0 1px 2px 0 rgba(0, 0, 0, 0.05));
            padding: 6px;
            border-radius: 6px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            min-width: 32px;
            height: 32px;
            flex-shrink: 0;
            transition: all 0.15s ease;
            position: relative;
            overflow: hidden;
        }

        .copy-button:hover {
            background: var(--background-secondary, #f8f9fa);
            border-color: var(--border-medium, #d1d5db);
            color: var(--text-primary, #1f2937);
            box-shadow: var(--shadow-md, 0 4px 6px -1px rgba(0, 0, 0, 0.1));
        }

        .copy-button svg {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            transition: opacity 0.2s ease-in-out, transform 0.2s ease-in-out;
        }

        .copy-button .check-icon {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.5);
        }

        .copy-button.copied .copy-icon {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.5);
        }

        .copy-button.copied .check-icon {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
        }

        .tts-button {
            background: var(--background-tertiary, #f1f3f4);
            color: var(--text-secondary, #6b7280);
            border: 1px solid var(--border-light, #e5e7eb);
            outline: none;
            box-shadow: var(--shadow-sm, 0 1px 2px 0 rgba(0, 0, 0, 0.05));
            padding: 6px;
            border-radius: 6px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            min-width: 32px;
            height: 32px;
            flex-shrink: 0;
            transition: all 0.15s ease;
            position: relative;
        }

        .tts-button:hover {
            background: var(--background-secondary, #f8f9fa);
            border-color: var(--border-medium, #d1d5db);
            color: var(--text-primary, #1f2937);
            box-shadow: var(--shadow-md, 0 4px 6px -1px rgba(0, 0, 0, 0.1));
        }

        .tts-button.enabled {
            background: rgba(37, 99, 235, 0.1);
            border-color: var(--interactive-primary, #2563eb);
            color: var(--interactive-primary, #2563eb);
        }

        .tts-button.enabled:hover {
            background: rgba(37, 99, 235, 0.15);
            border-color: var(--interactive-primary, #2563eb);
            color: var(--interactive-primary, #2563eb);
        }

        .tts-button.playing {
            background: rgba(16, 185, 129, 0.1);
            border-color: #10b981;
            color: #10b981;
        }

        .tts-button.playing .tts-icon {
            animation: pulse 1.5s infinite;
        }

        .tts-button.disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .tts-button.disabled:hover {
            background: var(--background-tertiary, #f1f3f4);
            border-color: var(--border-light, #e5e7eb);
            color: var(--text-secondary, #6b7280);
            box-shadow: var(--shadow-sm, 0 1px 2px 0 rgba(0, 0, 0, 0.05));
        }

        @keyframes pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.1); }
        }

        .timer {
            font-family: 'Monaco', 'Menlo', monospace;
            font-size: 11px;
            color: var(--text-tertiary, #9ca3af);
            font-weight: 500;
        }

        .screen-capture-button {
            background: var(--background-tertiary, #f1f3f4);
            color: var(--text-secondary, #6b7280);
            border: 1px solid var(--border-light, #e5e7eb);
            outline: none;
            box-shadow: var(--shadow-sm, 0 1px 2px 0 rgba(0, 0, 0, 0.05));
            padding: 6px;
            border-radius: 6px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            min-width: 32px;
            height: 32px;
            flex-shrink: 0;
            transition: all 0.15s ease;
        }

        .screen-capture-button:hover {
            background: var(--background-secondary, #f8f9fa);
            border-color: var(--border-medium, #d1d5db);
            color: var(--text-primary, #1f2937);
            box-shadow: var(--shadow-md, 0 4px 6px -1px rgba(0, 0, 0, 0.1));
        }

        .screen-capture-button.active {
            background: rgba(37, 99, 235, 0.1);
            border-color: var(--interactive-primary, #2563eb);
            color: var(--interactive-primary, #2563eb);
            box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.1);
        }

    `;

    static properties = {
        viewMode: { type: String },
        isHovering: { type: Boolean },
        isAnimating: { type: Boolean },
        copyState: { type: String },
        elapsedTime: { type: String },
        captureStartTime: { type: Number },
        isSessionActive: { type: Boolean },
        hasCompletedRecording: { type: Boolean },
        audioSource: { type: String },
        ttsEnabled: { type: Boolean },
        ttsConnected: { type: Boolean },
        ttsPlaying: { type: Boolean },
    };

    constructor() {
        super();
        this.isSessionActive = false;
        this.hasCompletedRecording = false;
        this.viewMode = 'transcript';
        this.isHovering = false;
        this.isAnimating = false;
        this.elapsedTime = '00:00';
        this.captureStartTime = null;
        
        // TTS properties - will be updated based on selected agent
        const ttsStoredState = localStorage.getItem('xerus_tts_enabled');
        this.ttsEnabled = ttsStoredState === null ? true : ttsStoredState === 'true';
        this.currentAgent = null; // Track current agent for TTS settings
        this.ttsConnected = false;
        
        console.log('[TOOL] [DEBUG] TTS initialization:', {
            storedState: ttsStoredState,
            ttsEnabled: this.ttsEnabled,
            ttsConnected: this.ttsConnected
        });
        this.ttsPlaying = false;
        this.ttsClient = new WebSocketTTSClient();
        this.timerInterval = null;
        this.adjustHeightThrottle = null;
        this.isThrottled = false;
        this.copyState = 'idle';
        this.copyTimeout = null;

        this.adjustWindowHeight = this.adjustWindowHeight.bind(this);
    }

    connectedCallback() {
        super.connectedCallback();
        // Only start timer if session is active
        if (this.isSessionActive) {
            this.startTimer();
        }
        
        // Initialize TTS WebSocket client
        this.initializeTTS();
        
        // Add safe API access with null checks
        if (window.api && window.api.listenView && window.api.listenView.onSessionStateChanged) {
            window.api.listenView.onSessionStateChanged((event, { isActive }) => {
                const wasActive = this.isSessionActive;
                this.isSessionActive = isActive;

                if (!wasActive && isActive) {
                    this.hasCompletedRecording = false;
                    this.startTimer();
                    
                    // Ensure TTS WebSocket is connected when starting new session
                    if (this.ttsEnabled && this.ttsClient && !this.ttsConnected) {
                        this.ttsClient.connect().catch(error => {
                            console.error('[ERROR] TTS reconnection failed:', error);
                        });
                    }
                    
                    // Reset child components
                    this.updateComplete.then(() => {
                        const sttView = this.shadowRoot.querySelector('stt-view');
                        const summaryView = this.shadowRoot.querySelector('summary-view');
                        if (sttView) sttView.resetTranscript();
                        if (summaryView) summaryView.resetAnalysis();
                    });
                    this.requestUpdate();
                }
                if (wasActive && !isActive) {
                    this.hasCompletedRecording = true;
                    this.stopTimer();
                    
                    // Stop any playing TTS audio when session ends
                    if (this.ttsClient && this.ttsPlaying) {
                        console.log('🔇 [ListenView] Stopping TTS audio - session ended');
                        this.ttsClient.stopAudio();
                        this.ttsPlaying = false;
                    }
                    
                    this.requestUpdate();
                }
            });
        } else {
            console.warn('[ListenView] window.api.listenView not available - running in demo/test mode');
        }
        
        // Listen for raw transcripts for TTS processing
        if (window.api && window.api.on) {
            window.api.on('raw-transcript-for-tts', async (event, { agentId, transcript, context }) => {
                // Update TTS enabled state based on current agent if agent ID is provided
                if (agentId && agentId !== 'default') {
                    await this.updateTTSStateForAgent(agentId);
                }
                
                console.log('[TOOL] [DEBUG] raw-transcript-for-tts received:', {
                    ttsEnabled: this.ttsEnabled,
                    ttsConnected: this.ttsConnected,
                    hasTranscript: !!transcript,
                    transcriptLength: transcript?.length,
                    agentId,
                    currentAgent: this.currentAgent?.name || 'unknown'
                });
                
                if (this.ttsEnabled && this.ttsConnected && transcript) {
                    try {
                        await this.sendRawTranscriptToTTS(agentId, transcript, context);
                    } catch (error) {
                        console.error('Failed to send raw transcript to TTS:', error);
                    }
                } else {
                    console.warn('[ALERT] [DEBUG] TTS request blocked:', {
                        ttsEnabled: this.ttsEnabled,
                        ttsConnected: this.ttsConnected,
                        hasTranscript: !!transcript,
                        agentTtsEnabled: this.currentAgent?.ttsEnabled,
                        reason: !this.ttsEnabled ? 'TTS disabled' : !this.ttsConnected ? 'TTS not connected' : !transcript ? 'No transcript' : 'Unknown'
                    });
                }
            });
            
            // Listen for TTS state changes from marble double-click
            window.api.on('tts-state-changed', (event, { ttsEnabled }) => {
                console.log(`[ListenView] TTS state changed via marble: ${ttsEnabled}`);
                this.ttsEnabled = ttsEnabled;
                this.requestUpdate();
            });
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.stopTimer();

        if (this.adjustHeightThrottle) {
            clearTimeout(this.adjustHeightThrottle);
            this.adjustHeightThrottle = null;
        }
        if (this.copyTimeout) {
            clearTimeout(this.copyTimeout);
        }
        
        // Stop any playing TTS audio and clean up TTS client
        if (this.ttsClient) {
            if (this.ttsPlaying) {
                console.log('🔇 [ListenView] Stopping TTS audio - component disconnecting');
                this.ttsClient.stopAudio();
            }
            this.ttsClient.disconnect();
        }
    }

    startTimer() {
        this.captureStartTime = Date.now();
        this.timerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - this.captureStartTime) / 1000);
            const minutes = Math.floor(elapsed / 60)
                .toString()
                .padStart(2, '0');
            const seconds = (elapsed % 60).toString().padStart(2, '0');
            this.elapsedTime = `${minutes}:${seconds}`;
            this.requestUpdate();
        }, 1000);
    }

    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    adjustWindowHeight() {
        // Add null check for API
        if (!window.api || !window.api.listenView || !window.api.listenView.adjustWindowHeight) {
            console.warn('[ListenView] Window API not available for height adjustment');
            return;
        }

        this.updateComplete
            .then(() => {
                const topBar = this.shadowRoot.querySelector('.top-bar');
                const activeContent = this.viewMode === 'transcript'
                    ? this.shadowRoot.querySelector('stt-view')
                    : this.shadowRoot.querySelector('summary-view');

                if (!topBar || !activeContent) return;

                const topBarHeight = topBar.offsetHeight;
                const contentHeight = activeContent.scrollHeight;
                const idealHeight = topBarHeight + contentHeight;
                const targetHeight = Math.min(700, idealHeight);

                console.log(
                    `[Height Adjusted] Mode: ${this.viewMode}, TopBar: ${topBarHeight}px, Content: ${contentHeight}px, Ideal: ${idealHeight}px, Target: ${targetHeight}px`
                );

                window.api.listenView.adjustWindowHeight(targetHeight);
            })
            .catch(error => {
                console.error('Error in adjustWindowHeight:', error);
            });
    }

    toggleViewMode() {
        this.viewMode = this.viewMode === 'insights' ? 'transcript' : 'insights';
        this.requestUpdate();
    }



    handleCopyHover(isHovering) {
        this.isHovering = isHovering;
        if (isHovering) {
            this.isAnimating = true;
        } else {
            this.isAnimating = false;
        }
        this.requestUpdate();
    }

    async handleCopy() {
        if (this.copyState === 'copied') return;

        let textToCopy = '';

        if (this.viewMode === 'transcript') {
            const sttView = this.shadowRoot.querySelector('stt-view');
            textToCopy = sttView ? sttView.getTranscriptText() : '';
        } else {
            const summaryView = this.shadowRoot.querySelector('summary-view');
            textToCopy = summaryView ? summaryView.getSummaryText() : '';
        }

        try {
            await navigator.clipboard.writeText(textToCopy);
            console.log('Content copied to clipboard');

            this.copyState = 'copied';
            this.requestUpdate();

            if (this.copyTimeout) {
                clearTimeout(this.copyTimeout);
            }

            this.copyTimeout = setTimeout(() => {
                this.copyState = 'idle';
                this.requestUpdate();
            }, 1500);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    }

    adjustWindowHeightThrottled() {
        if (this.isThrottled) {
            return;
        }

        this.adjustWindowHeight();

        this.isThrottled = true;

        this.adjustHeightThrottle = setTimeout(() => {
            this.isThrottled = false;
        }, 16);
    }

    updated(changedProperties) {
        super.updated(changedProperties);

        if (changedProperties.has('viewMode')) {
            this.adjustWindowHeight();
        }
    }

    // TTS Methods
    async initializeTTS() {
        try {
            console.log('[AUDIO] Initializing TTS client...');
            
            // Setup TTS event listeners
            this.ttsClient.on('connected', () => {
                console.log('[OK] TTS WebSocket connected');
                this.ttsConnected = true;
                this.requestUpdate();
            });

            this.ttsClient.on('disconnected', () => {
                console.log('[ERROR] TTS WebSocket disconnected');
                this.ttsConnected = false;
                this.ttsPlaying = false;
                this.requestUpdate();
            });

            // Pause audio capture immediately when TTS streaming starts (before audio plays)
            this.ttsClient.on('ttsStreamingStarted', async () => {
                console.log('🔇 TTS streaming started - immediately pausing audio capture');
                
                if (window.api && window.api.invoke) {
                    try {
                        // Pause immediately to prevent any TTS audio from being captured
                        await window.api.invoke('listen:pause-microphone');
                        await window.api.invoke('listen:pause-system-audio');
                    } catch (error) {
                        console.warn('[ERROR] Failed to pause audio captures on TTS start:', error);
                    }
                }
            });

            this.ttsClient.on('audioPlaying', async () => {
                this.ttsPlaying = true;
                
                // Audio should already be paused by ttsStreamingStarted event
                // This is a safety backup in case the earlier pause didn't work
                if (window.api && window.api.invoke) {
                    try {
                        // Safety pause (likely already paused by ttsStreamingStarted)
                        await window.api.invoke('listen:pause-microphone');
                        await window.api.invoke('listen:pause-system-audio');
                    } catch (error) {
                        console.warn('[ERROR] Failed to pause audio captures (safety backup):', error);
                    }
                } else {
                    console.warn('[ERROR] window.api.invoke not available for pausing audio');
                }
                
                this.requestUpdate();
            });

            this.ttsClient.on('audioFinished', async () => {
                this.ttsPlaying = false;
                
                // Resume audio processing after TTS finishes
                if (window.api && window.api.invoke) {
                    try {
                        // Add a small delay to ensure TTS audio has fully stopped
                        setTimeout(async () => {
                            try {
                                // Resume microphone capture
                                await window.api.invoke('listen:resume-microphone');
                                await window.api.invoke('listen:resume-system-audio');
                                
                            } catch (timeoutError) {
                                console.error('[ERROR] Error in TTS cleanup timeout:', timeoutError);
                            }
                        }, 500);
                    } catch (error) {
                        console.warn('Failed to setup TTS cleanup:', error);
                    }
                }
                
                this.requestUpdate();
            });

            this.ttsClient.on('error', async (error) => {
                console.error('[ERROR] TTS error:', error);
                this.ttsPlaying = false;
                
                // Resume audio capture if TTS fails to ensure we don't get stuck with paused audio
                if (window.api && window.api.invoke) {
                    try {
                        await window.api.invoke('listen:resume-microphone');
                        await window.api.invoke('listen:resume-system-audio');
                        console.log('[AUDIO] Audio capture resumed after TTS error');
                    } catch (resumeError) {
                        console.warn('[ERROR] Failed to resume audio after TTS error:', resumeError);
                    }
                }
                
                this.requestUpdate();
            });

            // Listen for agent analysis results to display in transcript
            this.ttsClient.on('agentAnalysisResult', (data) => {
                console.log('[AI] Agent analysis result received for transcript:', data);
                
                // Check both data.analysis (backend format) and data.response (fallback)
                const responseText = data.analysis || data.response;
                
                if (responseText) {
                    console.log('[TEXT] Replacing agent placeholder with actual response:', responseText);
                    
                    // Get the STT view component and directly call its handler
                    this.updateComplete.then(() => {
                        const sttView = this.shadowRoot.querySelector('stt-view');
                        if (sttView) {
                            // Replace the "Thinking..." placeholder with actual response
                            sttView.handleSttUpdate(null, {
                                speaker: 'agent',
                                text: responseText,
                                isFinal: true,
                                isPartial: false,
                                replacePlaceholder: true
                            });
                        } else {
                            console.warn('STT view not found for adding agent response');
                        }
                    });
                } else {
                    console.warn('No response text found in agent analysis result:', data);
                }
            });

            // Connect to TTS server
            console.log('[CONNECT] [DEBUG] Attempting to connect to TTS WebSocket...');
            const connected = await this.ttsClient.connect();
            console.log('[CONNECT] [DEBUG] TTS WebSocket connection result:', connected);
            if (!connected) {
                console.warn('[WARNING] TTS WebSocket connection failed, TTS features disabled');
            } else {
                console.log('[OK] [DEBUG] TTS WebSocket connected successfully');
            }
        } catch (error) {
            console.error('[ERROR] TTS initialization failed:', error);
        }
    }

    toggleTTS() {
        this.ttsEnabled = !this.ttsEnabled;
        console.log(`[AUDIO] TTS ${this.ttsEnabled ? 'enabled' : 'disabled'}`);
        
        // Store TTS preference in localStorage
        try {
            localStorage.setItem('xerus_tts_enabled', this.ttsEnabled.toString());
        } catch (error) {
            console.warn('Failed to save TTS preference:', error);
        }
        
        this.requestUpdate();
    }
    
    /**
     * Update TTS enabled state based on the current agent's settings
     */
    async updateTTSStateForAgent(agentId) {
        try {
            // Get all agents to find the current one
            const personalities = await window.api.invoke('ask:getPersonalities');
            const agent = personalities.find(p => p.id == agentId);
            
            if (agent) {
                this.currentAgent = agent;
                
                // In agent mode (purple header), use the agent's TTS setting
                // Fall back to localStorage setting if agent TTS setting is not available
                const agentTtsEnabled = agent.ttsEnabled !== undefined ? agent.ttsEnabled : this.ttsEnabled;
                
                if (this.ttsEnabled !== agentTtsEnabled) {
                    console.log(`[TOOL] [DEBUG] Updating TTS for agent ${agent.name}:`, {
                        previousTtsEnabled: this.ttsEnabled,
                        agentTtsEnabled: agentTtsEnabled,
                        agentId: agentId
                    });
                    
                    this.ttsEnabled = agentTtsEnabled;
                    this.requestUpdate();
                }
            } else {
                console.warn(`[WARNING] Agent ${agentId} not found in personalities list`);
            }
            
        } catch (error) {
            console.error('Failed to update TTS state for agent:', error);
            // Continue with current TTS setting if agent lookup fails
        }
    }

    async sendRawTranscriptToTTS(agentId, transcript, context) {
        if (!this.ttsClient || !this.ttsConnected) {
            console.warn('[WARNING] TTS client not connected - cannot send request');
            return;
        }

        // IMMEDIATE audio pause - before TTS request is even sent (fixes timing lag)
        console.log('🔇 Immediately pausing audio BEFORE TTS request to prevent feedback');
        if (window.api && window.api.invoke) {
            try {
                await window.api.invoke('listen:pause-microphone');
                await window.api.invoke('listen:pause-system-audio');
                
                // REMOVED: Aggressive 30s safety timeout that was causing microphone to resume too early
                // Audio will resume properly when TTS actually finishes via audioFinished event
                
            } catch (error) {
                console.warn('[ERROR] Failed to pause audio immediately before TTS:', error);
            }
        }

        try {
            // SIMPLE FIX: Show "agent is thinking..." placeholder immediately
            this.updateComplete.then(() => {
                const sttView = this.shadowRoot.querySelector('stt-view');
                if (sttView) {
                    sttView.handleSttUpdate(null, {
                        speaker: 'agent',
                        text: 'Thinking...',
                        isFinal: false,
                        isPartial: true,
                        isPlaceholder: true
                    });
                }
            });

            // Send request to TTS Agent service for analysis + TTS generation
            this.ttsClient.requestAgentAnalysis(agentId, transcript, context);
        } catch (error) {
            console.error('Failed to send raw transcript to TTS:', error);
        }
    }

    handleSttMessagesUpdated(event) {
        // Handle messages update from SttView if needed
        this.adjustWindowHeightThrottled();
    }

    firstUpdated() {
        super.firstUpdated();
        setTimeout(() => this.adjustWindowHeight(), 200);
    }

    render() {
        const displayText = this.isHovering
            ? this.viewMode === 'transcript'
                ? 'Copy Transcript'
                : 'Copy Xerus Analysis'
            : this.viewMode === 'insights'
            ? `Live insights`
            : `Xerus is Listening ${this.elapsedTime}`;

        return html`
            <div class="assistant-container">
                <div class="top-bar">
                    <div class="bar-left-text">
                        <span class="bar-left-text-content ${this.isAnimating ? 'slide-in' : ''}">${displayText}</span>
                    </div>
                    <div class="bar-controls">
                        <button class="toggle-button" @click=${this.toggleViewMode}>
                            ${this.viewMode === 'insights'
                                ? html`
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
                                          <circle cx="12" cy="12" r="3" />
                                      </svg>
                                      <span>Show Transcript</span>
                                  `
                                : html`
                                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                          <path d="M9 11l3 3L22 4" />
                                          <path d="M22 12v7a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h11" />
                                      </svg>
                                      <span>Show Insights</span>
                                  `}
                        </button>
                        <button
                            class="copy-button ${this.copyState === 'copied' ? 'copied' : ''}"
                            @click=${this.handleCopy}
                            @mouseenter=${() => this.handleCopyHover(true)}
                            @mouseleave=${() => this.handleCopyHover(false)}
                        >
                            <svg class="copy-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                            </svg>
                            <svg class="check-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                                <path d="M20 6L9 17l-5-5" />
                            </svg>
                        </button>
                    </div>
                </div>

                <stt-view 
                    .isVisible=${this.viewMode === 'transcript'}
                    @stt-messages-updated=${this.handleSttMessagesUpdated}
                ></stt-view>

                <summary-view 
                    .isVisible=${this.viewMode === 'insights'}
                    .hasCompletedRecording=${this.hasCompletedRecording}
                ></summary-view>

            </div>
        `;
    }
}

customElements.define('listen-view', ListenView);
