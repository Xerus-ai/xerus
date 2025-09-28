import { LitElement, html, css } from '../assets/lit-core-2.7.4.min.js';

/**
 * XERUS AGENT SELECTOR VIEW
 * 
 * Displays available AI agents in a dedicated window for better UX.
 * Replaces the cramped dropdown with a spacious selection interface.
 * 
 * Features:
 * - Visual agent cards with descriptions
 * - Current agent indicator
 * - Hover effects for better interaction
 * - Backend-driven agent data
 * - Seamless agent switching
 */
class AgentSelectorView extends LitElement {

    static get properties() {
        return {
            personalities: { type: Array },
            selectedPersonality: { type: Object },
            loading: { type: Boolean }
        };
    }

    static get styles() {
        return css`
            :host {
                display: block;
                width: 100%;
                height: 100%;
                background: var(--surface-elevated, #ffffff);
                color: var(--text-primary, #1f2937);
                font-family: 'Helvetica Neue', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                overflow: hidden;
            }

            .agent-selector-container {
                display: flex;
                flex-direction: column;
                height: 100%;
                width: 100%;
                background: var(--surface-elevated, #ffffff);
                border-radius: 12px;
                outline: none;
                box-sizing: border-box;
                position: relative;
                overflow: hidden;
                z-index: 1;
                border: 1px solid var(--border-light, #e5e7eb);
                box-shadow: var(--shadow-lg, 0 10px 15px -3px rgba(0, 0, 0, 0.1));
            }

            .header {
                padding: 12px 16px;
                border-bottom: 1px solid var(--border-light, #e5e7eb);
                background: var(--background-secondary, #f8f9fa);
                flex-shrink: 0;
            }

            .title {
                font-size: 13px;
                font-weight: 600;
                color: var(--text-primary, #1f2937);
                margin: 0;
                text-align: center;
            }

            .agents-list {
                flex: 1;
                overflow-y: auto;
                overflow-x: hidden;
                padding: 0;
                margin: 0;
                max-height: 320px;
                min-height: 200px;
            }

            .agents-list::-webkit-scrollbar {
                width: 6px;
            }

            .agents-list::-webkit-scrollbar-track {
                background: var(--background-secondary, #f8f9fa);
                border-radius: 3px;
            }

            .agents-list::-webkit-scrollbar-thumb {
                background: var(--border-medium, #d1d5db);
                border-radius: 3px;
            }

            .agents-list::-webkit-scrollbar-thumb:hover {
                background: var(--border-strong, #9ca3af);
            }

            .agent-item {
                display: flex;
                align-items: center;
                padding: 10px 16px;
                background: transparent;
                border: none;
                cursor: pointer;
                transition: background-color 0.15s ease;
                position: relative;
                border-bottom: 1px solid var(--border-light, #e5e7eb);
            }

            .agent-item:last-child {
                border-bottom: none;
            }

            .agent-item:hover {
                background: var(--background-secondary, #f8f9fa);
            }

            .agent-item.selected {
                background: var(--interactive-primary-light, #eff6ff);
            }

            .agent-item.selected:hover {
                background: var(--interactive-primary-light, #eff6ff);
            }

            .agent-icon {
                width: 28px;
                height: 28px;
                border-radius: 50%;
                background: var(--background-secondary, #f8f9fa);
                display: flex;
                align-items: center;
                justify-content: center;
                margin-right: 10px;
                flex-shrink: 0;
                overflow: hidden;
                border: 1px solid var(--border-light, #e5e7eb);
            }

            .agent-icon img {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }

            .agent-icon-fallback {
                font-weight: 600;
                color: var(--text-primary, #1f2937);
                font-size: 12px;
            }

            .agent-item.selected .agent-icon {
                background: var(--interactive-primary-hover, #1d4ed8);
            }

            .agent-info {
                flex: 1;
                min-width: 0;
            }

            .agent-name {
                font-size: 13px;
                font-weight: 500;
                color: var(--text-primary, #1f2937);
                margin: 0 0 2px 0;
                line-height: 1.2;
            }

            .agent-description {
                font-size: 11px;
                color: var(--text-secondary, #6b7280);
                margin: 0;
                line-height: 1.3;
                display: -webkit-box;
                -webkit-line-clamp: 1;
                -webkit-box-orient: vertical;
                overflow: hidden;
            }

            .selected-indicator {
                position: absolute;
                right: 16px;
                width: 16px;
                height: 16px;
                border-radius: 50%;
                background: var(--interactive-primary, #2563eb);
                display: flex;
                align-items: center;
                justify-content: center;
                opacity: 0;
                transition: opacity 0.15s ease;
            }

            .agent-item.selected .selected-indicator {
                opacity: 1;
            }

            .checkmark {
                width: 10px;
                height: 10px;
                stroke: white;
                stroke-width: 2;
                fill: none;
            }

            .loading-state {
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 32px;
                color: var(--text-secondary, #6b7280);
                font-size: 14px;
            }

            .empty-state {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 32px;
                color: var(--text-secondary, #6b7280);
                text-align: center;
            }

            .empty-state-text {
                font-size: 14px;
                margin-bottom: 8px;
            }

            .empty-state-subtext {
                font-size: 12px;
                color: var(--text-tertiary, #9ca3af);
            }

            /* Glass mode styles */
            :host-context(body.has-glass) {
                background: rgba(20, 20, 20, 0.95) !important;
                backdrop-filter: blur(20px) !important;
                color: rgba(255, 255, 255, 0.9) !important;
            }

            :host-context(body.has-glass) .title {
                color: rgba(255, 255, 255, 0.9) !important;
            }

            :host-context(body.has-glass) .subtitle {
                color: rgba(255, 255, 255, 0.6) !important;
            }

            :host-context(body.has-glass) .agent-selector-container {
                background: rgba(20, 20, 20, 0.95) !important;
                backdrop-filter: blur(20px) !important;
                border: 1px solid rgba(255, 255, 255, 0.2) !important;
            }

            :host-context(body.has-glass) .header {
                background: rgba(255, 255, 255, 0.05) !important;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1) !important;
            }

            :host-context(body.has-glass) .agent-item {
                border-bottom: 1px solid rgba(255, 255, 255, 0.1) !important;
            }

            :host-context(body.has-glass) .agent-item:hover {
                background: rgba(255, 255, 255, 0.1) !important;
            }

            :host-context(body.has-glass) .agent-item.selected {
                background: rgba(37, 99, 235, 0.3) !important;
            }

            :host-context(body.has-glass) .agent-name {
                color: rgba(255, 255, 255, 0.9) !important;
            }

            :host-context(body.has-glass) .agent-description {
                color: rgba(255, 255, 255, 0.6) !important;
            }

            :host-context(body.has-glass) .agent-icon {
                border: 1px solid rgba(255, 255, 255, 0.2) !important;
                background: rgba(255, 255, 255, 0.1) !important;
            }

            :host-context(body.has-glass) .agent-icon-fallback {
                color: rgba(255, 255, 255, 0.9) !important;
            }
        `;
    }

    constructor() {
        super();
        this.personalities = [];
        this.selectedPersonality = null;
        this.loading = true;
        
        console.log('[AgentSelectorView] Initializing agent selector view');
    }

    connectedCallback() {
        super.connectedCallback();
        this.loadAgents();
        
        // Listen for agent selection changes from other sources
        window.addEventListener('agent-selection-changed', this.handleAgentSelectionChanged.bind(this));
        
        // Keep window open when mouse is over the agent selector
        this.addEventListener('mouseenter', this.handleMouseEnter.bind(this));
        this.addEventListener('mouseleave', this.handleMouseLeave.bind(this));
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        window.removeEventListener('agent-selection-changed', this.handleAgentSelectionChanged.bind(this));
        this.removeEventListener('mouseenter', this.handleMouseEnter.bind(this));
        this.removeEventListener('mouseleave', this.handleMouseLeave.bind(this));
    }

    async loadAgents() {
        try {
            console.log('[AgentSelectorView] Loading agents from askService...');
            this.loading = true;
            this.requestUpdate();

            // Get agents from askService (which loads from backend)
            if (window.api && window.api.askView && window.api.askView.getPersonalities) {
                const personalities = await window.api.askView.getPersonalities();
                console.log('[AgentSelectorView] Loaded personalities:', personalities);
                
                this.personalities = Array.isArray(personalities) ? personalities : [];
                
                // Get current selected agent
                if (window.api.askView.getCurrentPersonality) {
                    const current = await window.api.askView.getCurrentPersonality();
                    console.log('[AgentSelectorView] Current personality:', current);
                    this.selectedPersonality = current;
                }
            } else {
                console.warn('[AgentSelectorView] askView API not available');
                this.personalities = [];
            }
        } catch (error) {
            console.error('[AgentSelectorView] Failed to load agents:', error);
            this.personalities = [];
        } finally {
            this.loading = false;
            this.requestUpdate();
        }
    }

    handleAgentSelectionChanged(event) {
        console.log('[AgentSelectorView] Agent selection changed:', event.detail);
        this.selectedPersonality = event.detail.agent;
        this.requestUpdate();
    }

    handleMouseEnter() {
        // Keep the window open when mouse is over it
        if (window.api && window.api.mainHeader && window.api.mainHeader.cancelHideAgentSelectorWindow) {
            window.api.mainHeader.cancelHideAgentSelectorWindow();
        }
    }

    handleMouseLeave() {
        // Allow window to hide when mouse leaves
        if (window.api && window.api.mainHeader && window.api.mainHeader.hideAgentSelectorWindow) {
            window.api.mainHeader.hideAgentSelectorWindow();
        }
    }

    async selectAgent(personality) {
        try {
            console.log('[AgentSelectorView] Selecting agent:', personality.name, personality.id);
            
            if (window.api && window.api.askView && window.api.askView.setPersonality) {
                const result = await window.api.askView.setPersonality(personality.id);
                console.log('[AgentSelectorView] Set personality result:', result);
                
                if (result.success) {
                    this.selectedPersonality = personality;
                    this.requestUpdate();
                    
                    // Hide the agent selector window after selection
                    if (window.api && window.api.mainHeader && window.api.mainHeader.hideAgentSelectorWindow) {
                        window.api.mainHeader.hideAgentSelectorWindow();
                    }
                    
                    // Notify other components of the selection change
                    window.dispatchEvent(new CustomEvent('agent-selection-changed', {
                        detail: { agent: personality }
                    }));
                    
                    console.log('[AgentSelectorView] Successfully selected agent:', personality.name);
                } else {
                    console.error('[AgentSelectorView] Failed to set personality:', result.error);
                }
            } else {
                console.error('[AgentSelectorView] API not available for setting personality');
            }
        } catch (error) {
            console.error('[AgentSelectorView] Failed to select agent:', error);
        }
    }

    getAgentInitials(name) {
        return name.split(' ').map(word => word.charAt(0)).join('').substring(0, 2).toUpperCase();
    }

    /**
     * Get the appropriate avatar for an agent based on ID
     * Uses the same logic as the web dashboard for consistency
     */
    getAgentAvatar(agent) {
        const AGENT_AVATARS = ['alexander', 'alya', 'amy', 'fred', 'henry', 'raj'];
        
        // Use a hash of the agent ID to consistently assign the same avatar
        // Handle different ID types safely
        const agentId = String(agent.id || agent.name || 'default');
        const hash = agentId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const avatarIndex = hash % AGENT_AVATARS.length;
        
        return `../assets/avatars/${AGENT_AVATARS[avatarIndex]}.svg`;
    }

    render() {
        if (this.loading) {
            return html`
                <div class="agent-selector-container">
                    <div class="header">
                        <div class="title">Select AI Agent</div>
                    </div>
                    <div class="loading-state">
                        Loading agents...
                    </div>
                </div>
            `;
        }

        if (!this.personalities.length) {
            return html`
                <div class="agent-selector-container">
                    <div class="header">
                        <div class="title">Select AI Agent</div>
                    </div>
                    <div class="empty-state">
                        <div class="empty-state-text">No agents available</div>
                        <div class="empty-state-subtext">Check your backend connection</div>
                    </div>
                </div>
            `;
        }

        return html`
            <div class="agent-selector-container">
                <div class="header">
                    <div class="title">Select AI Agent</div>
                </div>
                
                <div class="agents-list">
                    ${this.personalities.map(personality => html`
                        <div 
                            class="agent-item ${this.selectedPersonality?.id === personality.id ? 'selected' : ''}"
                            @click=${() => this.selectAgent(personality)}
                        >
                            <div class="agent-icon">
                                <img 
                                    src="${this.getAgentAvatar(personality)}" 
                                    alt="${personality.name}"
                                    @error=${(e) => {
                                        // Fallback to initials if image fails to load
                                        e.target.style.display = 'none';
                                        e.target.nextElementSibling.style.display = 'block';
                                    }}
                                />
                                <div class="agent-icon-fallback" style="display: none;">
                                    ${this.getAgentInitials(personality.name)}
                                </div>
                            </div>
                            
                            <div class="agent-info">
                                <div class="agent-name">${personality.name}</div>
                                <div class="agent-description">
                                    ${personality.description || 'No description available'}
                                </div>
                            </div>
                            
                            <div class="selected-indicator">
                                <svg class="checkmark" viewBox="0 0 12 12">
                                    <path d="M2 6L5 9L10 3"/>
                                </svg>
                            </div>
                        </div>
                    `)}
                </div>
            </div>
        `;
    }
}

customElements.define('agent-selector-view', AgentSelectorView);
export { AgentSelectorView };