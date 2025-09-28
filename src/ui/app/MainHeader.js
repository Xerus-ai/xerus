import { html, css, LitElement } from '../assets/lit-core-2.7.4.min.js';
import { ThemeMixin } from '../mixins/ThemeMixin.js';
import './marble/MarbleListenButton.js';

export class MainHeader extends ThemeMixin(LitElement) {
    static properties = {
        isTogglingSession: { type: Boolean, state: true },
        shortcuts: { type: Object, state: true },
        listenSessionStatus: { type: String, state: true },
        hasPersistentArea: { type: Boolean, state: true },
        personalities: { type: Array, state: true },
        selectedPersonality: { type: Object, state: true },
        ttsEnabled: { type: Boolean, state: true },
        agentModeActive: { type: Boolean, state: true },
    };

    static styles = css`
        :host {
            display: flex;
            transition: transform 0.2s cubic-bezier(0.23, 1, 0.32, 1), opacity 0.2s ease-out;
            margin: 0 10px;
        }

        :host(.hiding) {
            animation: slideUp 0.3s cubic-bezier(0.4, 0, 0.6, 1) forwards;
        }

        :host(.showing) {
            animation: slideDown 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }

        :host(.sliding-in) {
            animation: fadeIn 0.2s ease-out forwards;
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

        .header {
            -webkit-app-region: drag;
            width: 100%;
            height: 60px;
            padding: 10px 20px;
            background: var(--surface-elevated, #ffffff);
            border-bottom: 1px solid var(--border-light, #e5e7eb);
            border-radius: 12px;
            justify-content: space-between;
            align-items: center;
            display: flex;
            box-sizing: border-box;
            position: relative;
        }

        .listen-button {
            -webkit-app-region: no-drag;
            height: 40px;
            width: 40px;
            padding: 0;
            background: var(--interactive-primary, #2563eb);
            border-radius: 50%;
            justify-content: center;
            align-items: center;
            display: flex;
            border: none;
            cursor: pointer;
            position: relative;
            font-weight: 500;
            font-size: 14px;
            transition: all 0.15s ease;
        }

        .listen-button:disabled {
            cursor: default;
            opacity: 0.6;
        }

        .listen-button.active {
            background: #dc2626;
            border-color: #dc2626;
        }

        .listen-button.active:hover {
            background: #b91c1c;
            border-color: #b91c1c;
        }

        .listen-button.done {
            background: var(--surface-elevated, #ffffff);
            border-color: var(--border-medium, #d1d5db);
            color: var(--text-primary, #1f2937);
            box-shadow: var(--shadow-sm, 0 1px 2px 0 rgba(0, 0, 0, 0.05));
        }

        .listen-button.done .action-text-content {
            color: var(--text-primary, #1f2937);
        }
        
        .listen-button.done .listen-icon svg rect,
        .listen-button.done .listen-icon svg path {
            fill: var(--text-primary, #1f2937);
        }

        .listen-button.done:hover {
            background: var(--background-secondary, #f8f9fa);
            border-color: var(--border-strong, #9ca3af);
        }

        .listen-button:hover {
            background: var(--interactive-primary-hover, #1d4ed8);
            border-color: var(--interactive-primary-hover, #1d4ed8);
            box-shadow: var(--shadow-md, 0 4px 6px -1px rgba(0, 0, 0, 0.1));
        }

        .loading-dots {
            display: flex;
            align-items: center;
            gap: 5px;
        }

        .loading-dots span {
            width: 6px;
            height: 6px;
            background-color: white;
            border-radius: 50%;
            animation: pulse 1.4s infinite ease-in-out both;
        }
        .loading-dots span:nth-of-type(1) {
            animation-delay: -0.32s;
        }
        .loading-dots span:nth-of-type(2) {
            animation-delay: -0.16s;
        }
        @keyframes pulse {
            0%, 80%, 100% {
                opacity: 0.2;
            }
            40% {
                opacity: 1.0;
            }
        }

        .header-actions {
            -webkit-app-region: no-drag;
            height: 40px;
            box-sizing: border-box;
            justify-content: center;
            align-items: center;
            gap: 8px;
            display: flex;
            padding: 0 12px;
            border-radius: 8px;
            border: none;
            background: transparent;
            transition: all 0.15s ease;
            cursor: pointer;
            font-weight: 500;
            font-size: 14px;
            color: var(--text-secondary, #6b7280);
            white-space: nowrap;
        }

        .header-actions:hover {
            background: var(--background-tertiary, #e5e7eb);
            border-radius: 8px;
        }

        .header-left {
            display: flex;
            align-items: center;
            gap: 18px;
            flex-shrink: 0;
            margin-right: 18px;
        }


        .header-center {
            display: flex;
            align-items: center;
            gap: 4px;
            flex: 1;
            justify-content: center;
        }

        .header-right {
            display: flex;
            align-items: center;
            gap: 12px;
            flex-shrink: 0;
            margin-right: 6px;
        }

        .action-button,
        .action-text {
            padding-bottom: 1px;
            justify-content: center;
            align-items: center;
            gap: 10px;
            display: flex;
        }

        .action-text-content {
            color: var(--text-secondary, #6b7280);
            font-size: 14px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-weight: 500;
            white-space: nowrap;
        }

        .listen-button .action-text-content {
            color: var(--text-inverse, #ffffff);
        }

        .icon-container {
            justify-content: flex-start;
            align-items: center;
            gap: 4px;
            display: flex;
        }

        .icon-container.ask-icons svg,
        .icon-container.showhide-icons svg {
            width: 12px;
            height: 12px;
        }

        .listen-icon svg {
            width: 12px;
            height: 11px;
            position: relative;
            top: 1px;
        }

        .listen-icon img {
            width: 18px;
            height: 18px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .icon-box {
            color: var(--text-tertiary, #9ca3af);
            font-size: 11px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace;
            font-weight: 500;
            background-color: var(--background-tertiary, #f1f3f4);
            border: 1px solid var(--border-light, #e5e7eb);
            border-radius: 4px;
            width: 20px;
            height: 18px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: var(--shadow-sm, 0 1px 2px 0 rgba(0, 0, 0, 0.05));
        }

        .settings-button {
            -webkit-app-region: no-drag;
            padding: 8px;
            border-radius: 50%;
            background: var(--background-secondary, #f8f9fa);
            border: 1px solid var(--border-light, #e5e7eb);
            transition: all 0.15s ease;
            color: var(--text-secondary, #6b7280);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 36px;
            height: 36px;
        }

        .settings-button:hover {
            background: var(--background-tertiary, #f1f3f4);
            border-color: var(--border-medium, #d1d5db);
        }

        .settings-icon {
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 3px;
        }

        .settings-icon svg {
            width: 18px;
            height: 18px;
        }

        /* Persistent area indicator */
        .header-actions.persistent-area {
            background: rgba(37, 99, 235, 0.1);
            border-color: var(--interactive-primary, #2563eb);
            color: var(--interactive-primary, #2563eb);
        }

        .header-actions.persistent-area:hover {
            background: rgba(37, 99, 235, 0.15);
            border-color: var(--interactive-primary-hover, #1d4ed8);
        }

        .header-actions.persistent-area .action-text-content {
            color: var(--interactive-primary, #2563eb);
        }

        .header-actions.persistent-area svg {
            stroke: var(--interactive-primary, #2563eb);
        }
        /* ────────────────[ GLASS BYPASS ]─────────────── */
        :host-context(body.has-glass) .header,
        :host-context(body.has-glass) .listen-button,
        :host-context(body.has-glass) .header-actions {
            background: transparent !important;
            filter: none !important;
            box-shadow: none !important;
            backdrop-filter: none !important;
        }
        
        /* Keep settings button visible in glass mode */
        :host-context(body.has-glass) .settings-button {
            background: rgba(0, 0, 0, 0.3) !important;
            border: 1px solid rgba(255, 255, 255, 0.2) !important;
            backdrop-filter: blur(10px) !important;
        }
        :host-context(body.has-glass) .icon-box {
            background: transparent !important;
            border: none !important;
        }

        :host-context(body.has-glass) .header::before,
        :host-context(body.has-glass) .header::after,
        :host-context(body.has-glass) .listen-button::before,
        :host-context(body.has-glass) .listen-button::after {
            display: none !important;
        }

        :host-context(body.has-glass) .header-actions:hover,
        :host-context(body.has-glass) .listen-button:hover::before {
            background: transparent !important;
        }
        
        /* Keep settings button hover visible in glass mode */
        :host-context(body.has-glass) .settings-button:hover {
            background: rgba(0, 0, 0, 0.5) !important;
            border: 1px solid rgba(255, 255, 255, 0.3) !important;
        }

        :host-context(body.has-glass) .header,
        :host-context(body.has-glass) .listen-button,
        :host-context(body.has-glass) .header-actions,
        :host-context(body.has-glass) .icon-box {
            border-radius: 0 !important;
        }
        
        /* Keep settings button circular in glass mode */
        :host-context(body.has-glass) .settings-button {
            border-radius: 50% !important;
        }

        /* Glass mode styles for agent icon */
        :host-context(body.has-glass) .icon-container.showhide-icons img {
            filter: brightness(1.2) saturate(100%) invert(1) !important;
        }

        /* Agent Icon Styles for Show/Hide */
        .icon-container.showhide-icons {
            display: flex;
            align-items: center;
            gap: 4px;
        }

        .icon-container.showhide-icons img {
            width: 24px;
            height: 24px;
            opacity: 0.7;
            transition: opacity 0.15s ease;
            filter: brightness(0) saturate(100%) invert(0);
        }

        .header-actions:hover .icon-container.showhide-icons img {
            opacity: 1;
        }

        /* Agent icon styling to match header text color */
        .header-actions svg[viewBox="0 0 24 24"] {
            opacity: 0.7;
            transition: opacity 0.15s ease;
            color: var(--text-primary, #1f2937);
        }

        .header-actions:hover svg[viewBox="0 0 24 24"] {
            opacity: 1;
        }

        /* Dark mode agent icon styling */
        :host-context(body.dark) .header-actions svg[viewBox="0 0 24 24"] {
            color: var(--text-primary, #1f2937);
        }

        /* Light mode agent icon styling */
        :host-context(body:not(.dark)) .header-actions svg[viewBox="0 0 24 24"] {
            color: var(--text-primary, #1f2937);
        }


        `;

    constructor() {
        super();
        this.shortcuts = {};
        this.isVisible = true;
        this.isAnimating = false;
        this.hasSlidIn = false;
        this.settingsHideTimer = null;
        this.isTogglingSession = false;
        this.listenSessionStatus = 'beforeSession';
        this.hasPersistentArea = false;
        this.animationEndTimer = null;
        this.personalities = [];
        this.selectedPersonality = null;
        this.ttsEnabled = localStorage.getItem('xerus_tts_enabled') === 'true';
        this.agentModeActive = false; // Separate from TTS enabled - tracks if user is in agent conversation mode
        this.handleAnimationEnd = this.handleAnimationEnd.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
        this.handleDocumentClick = this.handleDocumentClick.bind(this);
        this.handleMarbleTTSToggle = this.handleMarbleTTSToggle.bind(this);
        this.dragState = null;
        this.wasJustDragged = false;
    }

    _getListenButtonText(status) {
        switch (status) {
            case 'beforeSession': return 'Listen';
            case 'inSession'   : return 'Stop';
            case 'afterSession': return 'Done';
            default            : return 'Listen';
        }
    }

    _getMarbleState(sessionStatus, isToggling) {
        if (isToggling) {
            return 'idle'; // Orange state during loading
        }
        
        // Only show purple when actually in agent mode, not just when TTS is enabled
        switch (sessionStatus) {
            case 'beforeSession': return 'idle';                           // Orange - ready to start
            case 'inSession':     return this.agentModeActive ? 'tts' : 'listening'; // Purple if in agent mode, Green if normal
            case 'afterSession':  return 'stopping';                       // Red - ready to stop/done
            default:              return 'idle';
        }
    }

    async handleMouseDown(e) {
        e.preventDefault();

        const initialPosition = await window.api.mainHeader.getHeaderPosition();

        this.dragState = {
            initialMouseX: e.screenX,
            initialMouseY: e.screenY,
            initialWindowX: initialPosition.x,
            initialWindowY: initialPosition.y,
            moved: false,
        };

        window.addEventListener('mousemove', this.handleMouseMove, { capture: true });
        window.addEventListener('mouseup', this.handleMouseUp, { once: true, capture: true });
    }

    handleMouseMove(e) {
        if (!this.dragState) return;

        const deltaX = Math.abs(e.screenX - this.dragState.initialMouseX);
        const deltaY = Math.abs(e.screenY - this.dragState.initialMouseY);
        
        if (deltaX > 3 || deltaY > 3) {
            this.dragState.moved = true;
        }

        const newWindowX = this.dragState.initialWindowX + (e.screenX - this.dragState.initialMouseX);
        const newWindowY = this.dragState.initialWindowY + (e.screenY - this.dragState.initialMouseY);

        window.api.mainHeader.moveHeaderTo(newWindowX, newWindowY);
    }

    handleMouseUp(e) {
        if (!this.dragState) return;

        const wasDragged = this.dragState.moved;

        window.removeEventListener('mousemove', this.handleMouseMove, { capture: true });
        this.dragState = null;

        if (wasDragged) {
            this.wasJustDragged = true;
            setTimeout(() => {
                this.wasJustDragged = false;
            }, 0);
        }
    }

    toggleVisibility() {
        if (this.isAnimating) {
            console.log('[MainHeader] Animation already in progress, ignoring toggle');
            return;
        }
        
        if (this.animationEndTimer) {
            clearTimeout(this.animationEndTimer);
            this.animationEndTimer = null;
        }
        
        this.isAnimating = true;
        
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }

    hide() {
        this.classList.remove('showing');
        this.classList.add('hiding');
    }
    
    show() {
        this.classList.remove('hiding', 'hidden');
        this.classList.add('showing');
    }
    
    handleAnimationEnd(e) {
        if (e.target !== this) return;
    
        this.isAnimating = false;
    
        if (this.classList.contains('hiding')) {
            this.classList.add('hidden');
            if (window.api) {
                window.api.mainHeader.sendHeaderAnimationFinished('hidden');
            }
        } else if (this.classList.contains('showing')) {
            if (window.api) {
                window.api.mainHeader.sendHeaderAnimationFinished('visible');
            }
        }
    }

    startSlideInAnimation() {
        if (this.hasSlidIn) return;
        this.classList.add('sliding-in');
    }

    connectedCallback() {
        super.connectedCallback();
        this.addEventListener('animationend', this.handleAnimationEnd);

        if (window.api) {

            this._sessionStateTextListener = (event, { success }) => {
                if (success) {
                    const oldStatus = this.listenSessionStatus;
                    this.listenSessionStatus = ({
                        beforeSession: 'inSession',
                        inSession: 'afterSession',
                        afterSession: 'beforeSession',
                    })[this.listenSessionStatus] || 'beforeSession';
                    
                    // Reset agent mode when session ends (afterSession -> beforeSession)
                    if (oldStatus === 'afterSession' && this.listenSessionStatus === 'beforeSession') {
                        this.agentModeActive = false;
                        console.log(`[MainHeader] Agent mode reset - session ended`);
                        // Notify ListenService about agent mode change
                        if (window.api && window.api.mainHeader) {
                            window.api.mainHeader.setAgentMode(false);
                        }
                    }
                } else {
                    this.listenSessionStatus = 'beforeSession';
                    // Also reset agent mode on session failure
                    this.agentModeActive = false;
                    // Notify ListenService about agent mode change
                    if (window.api && window.api.mainHeader) {
                        window.api.mainHeader.setAgentMode(false);
                    }
                }
                this.isTogglingSession = false; // ✨ Loading Status[Korean comment translated] [Korean comment translated]
            };
            window.api.mainHeader.onListenChangeSessionResult(this._sessionStateTextListener);

            this._shortcutListener = (event, keybinds) => {
                console.log('[MainHeader] Received updated shortcuts:', keybinds);
                this.shortcuts = keybinds;
            };
            window.api.mainHeader.onShortcutsUpdated(this._shortcutListener);

            // Listen for persistent area changes
            this._persistentAreaSetListener = (event, data) => {
                console.log('[MainHeader] Persistent area set:', data);
                this.hasPersistentArea = true;
            };
            
            this._persistentAreaClearedListener = (event) => {
                console.log('[MainHeader] Persistent area cleared');
                this.hasPersistentArea = false;
            };

            // Register the event listeners
            window.api.common.onPersistentAreaSet(this._persistentAreaSetListener);
            window.api.common.onPersistentAreaCleared(this._persistentAreaClearedListener);

            // Check initial persistent area status
            if (window.api.common && window.api.common.getPersistentAreaStatus) {
                window.api.common.getPersistentAreaStatus().then(status => {
                    this.hasPersistentArea = status.hasPersistentArea;
                }).catch(error => {
                    console.warn('[MainHeader] Could not get initial persistent area status:', error);
                });
            }

            // Load available personalities/agents
            this.loadPersonalities();
        }

        // Add document click listener for dropdown
        document.addEventListener('click', this.handleDocumentClick);
    }

    async loadPersonalities() {
        try {
            console.log('[MainHeader] Starting to load personalities...');
            console.log('[MainHeader] window.api available:', !!window.api);
            console.log('[MainHeader] window.api.askView available:', !!(window.api && window.api.askView));
            console.log('[MainHeader] getPersonalities method available:', !!(window.api && window.api.askView && window.api.askView.getPersonalities));
            
            if (window.api && window.api.askView && window.api.askView.getPersonalities) {
                console.log('[MainHeader] Calling getPersonalities...');
                const personalities = await window.api.askView.getPersonalities();
                console.log('[MainHeader] Raw personalities response:', personalities);
                
                this.personalities = Array.isArray(personalities) ? personalities : [];
                console.log('[MainHeader] Processed personalities array:', this.personalities);
                
                // Set default selected personality if none selected
                if (this.personalities.length > 0 && !this.selectedPersonality) {
                    this.selectedPersonality = this.personalities[0];
                    console.log('[MainHeader] Set default personality:', this.selectedPersonality);
                }
                
                console.log('[MainHeader] Final state - personalities count:', this.personalities.length);
                
                // Trigger a re-render after loading
                this.requestUpdate();
            } else {
                console.warn('[MainHeader] API not available for loading personalities');
                this.personalities = [];
            }
        } catch (error) {
            console.error('[MainHeader] Failed to load personalities:', error);
            this.personalities = [];
            this.requestUpdate();
        }
    }

    showAgentSelectorWindow() {
        if (this.wasJustDragged) return;
        if (window.api && window.api.mainHeader) {
            console.log('[MainHeader] Showing agent selector window');
            window.api.mainHeader.showAgentSelectorWindow();
        }
    }

    hideAgentSelectorWindow() {
        if (this.wasJustDragged) return;
        if (window.api && window.api.mainHeader) {
            console.log('[MainHeader] Hiding agent selector window');
            window.api.mainHeader.hideAgentSelectorWindow();
        }
    }

    _handleAgentIconClick(event) {
        if (event) {
            event.stopPropagation();
        }
        if (this.wasJustDragged) {
            console.log('[MainHeader] Blocking agent selector due to drag');
            return;
        }
        
        console.log('[MainHeader] Opening agent selector window');
        this.showAgentSelectorWindow();
        
        // Reset wasJustDragged after a short delay
        setTimeout(() => {
            this.wasJustDragged = false;
        }, 100);
    }

    handleDocumentClick(event) {
        // No specific document click handling needed
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.removeEventListener('animationend', this.handleAnimationEnd);
        
        // Remove document click listener
        document.removeEventListener('click', this.handleDocumentClick);
        
        if (this.animationEndTimer) {
            clearTimeout(this.animationEndTimer);
            this.animationEndTimer = null;
        }
        
        if (window.api) {
            if (this._sessionStateTextListener) {
                window.api.mainHeader.removeOnListenChangeSessionResult(this._sessionStateTextListener);
            }
            if (this._shortcutListener) {
                window.api.mainHeader.removeOnShortcutsUpdated(this._shortcutListener);
            }
            // Remove persistent area listeners
            if (this._persistentAreaSetListener && window.api.common) {
                window.api.common.removeOnPersistentAreaSet(this._persistentAreaSetListener);
                window.api.common.removeOnPersistentAreaCleared(this._persistentAreaClearedListener);
            }
        }
    }

    showSettingsWindow(element) {
        if (this.wasJustDragged) return;
        if (window.api) {
            console.log(`[MainHeader] showSettingsWindow called at ${Date.now()}`);
            window.api.mainHeader.showSettingsWindow();

        }
    }

    hideSettingsWindow() {
        if (this.wasJustDragged) return;
        if (window.api) {
            console.log(`[MainHeader] hideSettingsWindow called at ${Date.now()}`);
            window.api.mainHeader.hideSettingsWindow();
        }
    }

    async _handleListenClick() {
        if (this.wasJustDragged) return;
        if (this.isTogglingSession) {
            return;
        }

        this.isTogglingSession = true;

        try {
            if (window.api) {
                // Check if API keys are configured and show helpful message if needed
                console.log('[MainHeader] [SEARCH] DEBUG: About to check hasConfiguredProviders...');
                const hasProviders = await window.api.apiKeyHeader.hasConfiguredProviders();
                console.log('[MainHeader] [SEARCH] DEBUG: hasConfiguredProviders returned:', hasProviders);
                
                if (!hasProviders) {
                    // Show helpful message about API keys but don't force login
                    console.log('[MainHeader] API keys not configured, showing settings hint');
                    alert('To use the Listen feature, please add your AI provider API keys in Settings first.');
                    this.isTogglingSession = false;
                    // Open settings window to help user
                    window.api.mainHeader.showSettingsWindow();
                    return;
                }
                
                // Proceed with listen functionality if providers are configured
                const listenButtonText = this._getListenButtonText(this.listenSessionStatus);
                await window.api.mainHeader.sendListenButtonClick(listenButtonText);
            }
        } catch (error) {
            console.error('IPC invoke for session change failed:', error);
            this.isTogglingSession = false;
        }
    }

    async _handleAskClick() {
        if (this.wasJustDragged) return;
        await this._openAskWindow();
    }

    async _openAskWindow() {
        try {
            if (window.api) {
                const hasProviders = await window.api.apiKeyHeader.hasConfiguredProviders();
                
                if (!hasProviders) {
                    // Show helpful message about API keys but don't force login
                    console.log('[MainHeader] API keys not configured, showing settings hint');
                    alert('To use the Ask feature, please add your AI provider API keys in Settings first.');
                    // Open settings window to help user
                    window.api.mainHeader.showSettingsWindow();
                    return;
                }
                
                console.log('MainHeader: Opening Ask window');
                // Proceed with ask functionality
                await window.api.mainHeader.sendAskButtonClick();
            }
        } catch (error) {
            console.error('IPC invoke for ask button failed:', error);
        }
    }

    async _handleToggleAllWindowsVisibility() {
        if (this.wasJustDragged) return;

        try {
            if (window.api) {
                await window.api.mainHeader.sendToggleAllWindowsVisibility();
            }
        } catch (error) {
            console.error('IPC invoke for all windows visibility button failed:', error);
        }
    }

    async _handleAreaSelector() {
        if (this.wasJustDragged) return;

        try {
            if (window.api && window.api.common) {
                // If there's already a persistent area, clear it, otherwise start new selection
                if (this.hasPersistentArea) {
                    console.log('[MainHeader] Clearing persistent area');
                    const result = await window.api.common.clearPersistentArea();
                    if (result && result.success) {
                        console.log('[MainHeader] Persistent area cleared successfully');
                        this.hasPersistentArea = false;
                    } else {
                        console.warn('[MainHeader] Failed to clear persistent area:', result?.error);
                    }
                } else {
                    console.log('[MainHeader] Starting area selection');
                    const result = await window.api.common.startAreaSelection();
                    if (result && result.success) {
                        console.log('[MainHeader] Area selection started successfully');
                    } else {
                        console.warn('[MainHeader] Area selection failed:', result?.error);
                    }
                }
            }
        } catch (error) {
            console.error('IPC invoke for area selector failed:', error);
        }
    }

    handleMarbleTTSToggle(event) {
        const { ttsEnabled, originalState } = event.detail;
        console.log(`[MainHeader] Marble TTS toggle received: ${ttsEnabled}, originalState: ${originalState}`);
        
        // Update TTS enabled state
        this.ttsEnabled = ttsEnabled;
        
        // IMMEDIATE agent mode activation for double-click from idle (fixes color lag)
        if (ttsEnabled && originalState === 'idle') {
            this.agentModeActive = true;
            console.log(`[MainHeader] Agent mode activated immediately for double-click from idle`);
            // Force immediate UI update for instant color change
            this.requestUpdate();
            // Notify ListenService about agent mode change
            if (window.api && window.api.mainHeader) {
                window.api.mainHeader.setAgentMode(true);
            }
        }
        // Also handle other cases
        else if (ttsEnabled && this.listenSessionStatus === 'inSession') {
            this.agentModeActive = true;
            console.log(`[MainHeader] Agent mode activated for existing session`);
            // Notify ListenService about agent mode change
            if (window.api && window.api.mainHeader) {
                window.api.mainHeader.setAgentMode(true);
            }
        } else if (!ttsEnabled) {
            // If TTS is disabled, deactivate agent mode
            this.agentModeActive = false;
            console.log(`[MainHeader] Agent mode deactivated`);
            // Notify ListenService about agent mode change
            if (window.api && window.api.mainHeader) {
                window.api.mainHeader.setAgentMode(false);
            }
        }
        
        // Notify other components about TTS state change
        if (window.api && window.api.emit) {
            window.api.emit('tts-state-changed', { ttsEnabled, agentModeActive: this.agentModeActive });
        }
        
        // Request update to reflect new marble state
        this.requestUpdate();
    }


    renderShortcut(accelerator) {
        if (!accelerator) return html``;

        const keyMap = {
            'Cmd': '⌘', 'Command': '⌘',
            'Ctrl': '⌃', 'Control': '⌃',
            'Alt': '⌥', 'Option': '⌥',
            'Shift': '⇧',
            'Enter': '↵',
            'Backspace': '⌫',
            'Delete': '⌦',
            'Tab': '⇥',
            'Escape': '⎋',
            'Up': '↑', 'Down': '↓', 'Left': '←', 'Right': '→',
            '\\': html`<svg viewBox="0 0 6 12" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:6px; height:12px;"><path d="M1.5 1.3L5.1 10.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
        };

        const keys = accelerator.split('+');
        return html`${keys.map(key => html`
            <div class="icon-box">${keyMap[key] || key}</div>
        `)}`;
    }

    render() {
        const listenButtonText = this._getListenButtonText(this.listenSessionStatus);
    
        const buttonClasses = {
            active: listenButtonText === 'Stop',
            done: listenButtonText === 'Done',
        };
        const showStopIcon = listenButtonText === 'Stop' || listenButtonText === 'Done';

        return html`
            <div class="header" @mousedown=${this.handleMouseDown}>
                <div class="header-left">
                    <marble-listen-button
                        .state=${this._getMarbleState(this.listenSessionStatus, this.isTogglingSession)}
                        .ttsEnabled=${this.ttsEnabled}
                        ?disabled=${this.isTogglingSession}
                        @marble-click=${this._handleListenClick}
                        @marble-tts-toggle=${this.handleMarbleTTSToggle}
                    ></marble-listen-button>
                </div>

                <div class="header-center">
                    <div class="header-actions" @click=${() => this._handleAskClick()}>
                        <div class="action-text">
                            <div class="action-text-content">Ask AI</div>
                        </div>
                        <div class="icon-container">
                            ${this.renderShortcut(this.shortcuts.nextStep)}
                        </div>
                    </div>

                                         <div class="header-actions" @click=${() => this._handleToggleAllWindowsVisibility()}>
                         <div class="action-text">
                             <div class="action-text-content">Show/Hide</div>
                         </div>
                         <div class="icon-container showhide-icons">
                             ${this.renderShortcut(this.shortcuts.toggleVisibility)}
                         </div>
                     </div>

                                           <div class="header-actions ${this.hasPersistentArea ? 'persistent-area' : ''}" @click=${() => this._handleAreaSelector()}>
                          <div class="action-text">
                              <div class="action-text-content">${this.hasPersistentArea ? 'Clear Area' : 'Area'}</div>
                          </div>
                          <div class="icon-container">
                              ${this.hasPersistentArea 
                                  ? html`
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                          <path d="M18 6L6 18"/>
                                          <path d="M6 6l12 12"/>
                                      </svg>
                                  `
                                  : html`
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                          <path d="M9 9h6v6h-6z"/>
                                          <path d="M21 15v4a2 2 0 0 1-2 2h-4"/>
                                          <path d="M21 9V5a2 2 0 0 0-2-2h-4"/>
                                          <path d="M3 9V5a2 2 0 0 1 2-2h4"/>
                                          <path d="M3 15v4a2 2 0 0 0 2 2h4"/>
                                      </svg>
                                  `
                              }
                          </div>
                      </div>

                                             <div class="header-actions">
                           <svg 
                               width="24" 
                               height="24" 
                               viewBox="0 0 24 24" 
                               style="cursor: pointer;" 
                               @click=${(e) => this._handleAgentIconClick(e)}
                               @mouseenter=${(e) => this.showAgentSelectorWindow(e.currentTarget)}
                               @mouseleave=${() => this.hideAgentSelectorWindow()}
                           >
                               <g stroke="none" stroke-width="1" fill="none" fill-rule="evenodd">
                                   <g fill="currentColor" fill-rule="nonzero">
                                       <path d="M17.5,12 C20.5375661,12 23,14.4624339 23,17.5 C23,20.5375661 20.5375661,23 17.5,23 C14.4624339,23 12,20.5375661 12,17.5 C12,14.4624339 14.4624339,12 17.5,12 Z M12.0222607,13.9993086 C11.7255613,14.4626083 11.4860296,14.9660345 11.3136172,15.4996352 L4.25354153,15.499921 C3.83932796,15.499921 3.50354153,15.8357075 3.50354153,16.249921 L3.50354153,17.1572408 C3.50354153,17.8128951 3.78953221,18.4359296 4.28670709,18.8633654 C5.5447918,19.9450082 7.44080155,20.5010712 10,20.5010712 C10.598839,20.5010712 11.1614445,20.4706245 11.6881394,20.4101192 C11.9370538,20.9102887 12.2508544,21.3740111 12.6170965,21.7904935 C11.8149076,21.9312924 10.9419626,22.0010712 10,22.0010712 C7.11050247,22.0010712 4.87168436,21.3444691 3.30881727,20.0007885 C2.48019625,19.2883988 2.00354153,18.2500002 2.00354153,17.1572408 L2.00354153,16.249921 C2.00354153,15.0072804 3.01090084,13.999921 4.25354153,13.999921 L12.0222607,13.9993086 Z M17.5,13.9992349 L17.4101244,14.0072906 C17.2060313,14.0443345 17.0450996,14.2052662 17.0080557,14.4093593 L17,14.4992349 L16.9996498,16.9992349 L14.4976498,17 L14.4077742,17.0080557 C14.2036811,17.0450996 14.0427494,17.2060313 14.0057055,17.4101244 L13.9976498,17.5 L14.0057055,17.5898756 C14.0427494,17.7939687 14.2036811,17.9549004 14.4077742,17.9919443 L14.4976498,18 L17.0006498,17.9992349 L17.0011076,20.5034847 L17.0091633,20.5933603 C17.0462073,20.7974534 17.207139,20.9583851 17.411232,20.995429 L17.5011076,21.0034847 L17.5909833,20.995429 C17.7950763,20.9583851 17.956008,20.7974534 17.993052,20.5933603 L18.0011076,20.5034847 L18.0006498,17.9992349 L20.5045655,18 L20.5944411,17.9919443 C20.7985342,17.9549004 20.9594659,17.7939687 20.9965098,17.5898756 L21.0045655,17.5 L20.9965098,17.4101244 C20.9594659,17.2060313 20.7985342,17.0450996 20.5944411,17.0080557 L20.5045655,17 L17.9996498,16.9992349 L18,14.4992349 L17.9919443,14.4093593 C17.9549004,14.2052662 17.7939687,14.0443345 17.5898756,14.0072906 L17.5,13.9992349 Z M10.0003312,2.00049432 C10.380027,2.00049432 10.6938222,2.2826482 10.7434846,2.64872376 L10.7503312,2.75049432 L10.7495415,3.49949432 L14.25,3.5 C15.4926407,3.5 16.5,4.50735931 16.5,5.75 L16.5,10.254591 C16.5,10.5557334 16.4408388,10.843058 16.3335049,11.1055761 C15.2082115,11.3083422 14.1840602,11.8017755 13.3407048,12.5047635 L5.75,12.504591 C4.50735931,12.504591 3.5,11.4972317 3.5,10.254591 L3.5,5.75 C3.5,4.50735931 4.50735931,3.5 5.75,3.5 L9.24954153,3.49949432 L9.25033122,2.75049432 C9.25033122,2.40531635 9.48351624,2.11460166 9.80095151,2.02728504 L9.89856066,2.00734093 L10.0003312,2.00049432 Z M14.25,5 L5.75,5 C5.33578644,5 5,5.33578644 5,5.75 L5,10.254591 C5,10.6688046 5.33578644,11.004591 5.75,11.004591 L14.25,11.004591 C14.6642136,11.004591 15,10.6688046 15,10.254591 L15,5.75 C15,5.33578644 14.6642136,5 14.25,5 Z M7.74928905,6.5 C8.43925235,6.5 8.99857811,7.05932576 8.99857811,7.74928905 C8.99857811,8.43925235 8.43925235,8.99857811 7.74928905,8.99857811 C7.05932576,8.99857811 6.5,8.43925235 6.5,7.74928905 C6.5,7.05932576 7.05932576,6.5 7.74928905,6.5 Z M12.2420255,6.5 C12.9319888,6.5 13.4913145,7.05932576 13.4913145,7.74928905 C13.4913145,8.43925235 12.9319888,8.99857811 12.2420255,8.99857811 C11.5520622,8.99857811 10.9927364,8.43925235 10.9927364,7.74928905 C10.9927364,7.05932576 11.5520622,6.5 12.2420255,6.5 Z"></path>
                                   </g>
                               </g>
                           </svg>
                       </div>

                      <button 
                          class="settings-button"
                          @mouseenter=${(e) => this.showSettingsWindow(e.currentTarget)}
                          @mouseleave=${() => this.hideSettingsWindow()}
                      >
                          <div class="settings-icon">
                              <img src="../assets/settings.svg" width="16" height="16" alt="Settings" />
                          </div>
                      </button>
                </div>
            </div>
        `;
    }
}

customElements.define('main-header', MainHeader);
