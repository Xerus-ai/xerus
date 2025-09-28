import { html, css, LitElement } from '../assets/lit-core-2.7.4.min.js';
import { ThemeMixin } from '../mixins/ThemeMixin.js';
import { SettingsView } from '../settings/SettingsView.js';
import { ListenView } from '../listen/ListenView.js';
import { AskView } from '../ask/AskView.js';
import { ShortcutSettingsView } from '../settings/ShortCutSettingsView.js';
import { AgentSelectorView } from '../views/AgentSelectorView.js';

import '../listen/audioCore/renderer.js';

export class XerusApp extends ThemeMixin(LitElement) {
    static styles = css`
        :host {
            display: block;
            width: 100%;
            height: 100%;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            font-size: 14px;
            line-height: 1.5;
            color: var(--text-primary, #1f2937);
            background: transparent;
            border-radius: 0;
        }

        .app-container {
            display: flex;
            width: 100%;
            height: 100%;
            position: relative;
            background: transparent;
        }

        .main-content {
            flex: 1;
            display: flex;
            flex-direction: column;
            min-width: 0;
            padding: 0;
            background: transparent;
        }

        .content-card {
            background: transparent;
            border-radius: 0;
            border: none;
            box-shadow: none;
            overflow: hidden;
            height: 100%;
            display: flex;
            flex-direction: column;
        }

        .settings-sidebar {
            width: 320px;
            position: relative;
            z-index: 1000;
            background: var(--surface-elevated, #ffffff);
            border-left: 1px solid var(--border-light, #e5e7eb);
            border-radius: 12px 0 0 12px;
            padding: 24px;
            box-shadow: var(--shadow-lg, 0 10px 15px -3px rgba(0, 0, 0, 0.1));
            margin: 16px 0 16px 16px;
        }

        .settings-sidebar.hidden {
            display: none;
        }

        listen-view, ask-view, history-view, help-view, setup-view, settings-view, agent-selector-view {
            display: block;
            width: 100%;
            height: 100%;
            font-family: inherit;
            font-size: inherit;
            line-height: inherit;
            color: inherit;
            background: transparent;
        }

        /* Modern content styling */
        .view-container {
            width: 100%;
            height: 100%;
            transition: opacity 0.2s ease, transform 0.2s ease;
        }

        .view-container.entering {
            opacity: 0;
            transform: translateY(8px);
        }

        /* Ensure all content inherits proper font styling */
        * {
            font-family: inherit;
            font-size: inherit;
            line-height: inherit;
        }

        /* Glass mode bypass - keep existing glass functionality */
        :host-context(body.has-glass) .app-container,
        :host-context(body.has-glass) .main-content,
        :host-context(body.has-glass) .content-card {
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
            backdrop-filter: none !important;
        }

        :host-context(body.has-glass) .settings-sidebar {
            background: rgba(0, 0, 0, 0.85) !important;
            backdrop-filter: blur(12px) !important;
            -webkit-backdrop-filter: blur(12px) !important;
            border-left: 1px solid rgba(255, 255, 255, 0.1) !important;
            box-shadow: 
                -4px 0 20px rgba(0, 0, 0, 0.3),
                inset 1px 0 0 rgba(255, 255, 255, 0.05) !important;
        }
    `;

    static properties = {
        currentView: { type: String },
        statusText: { type: String },
        startTime: { type: Number },
        currentResponseIndex: { type: Number },
        isMainViewVisible: { type: Boolean },
        selectedProfile: { type: String },
        selectedLanguage: { type: String },
        selectedScreenshotInterval: { type: String },
        selectedImageQuality: { type: String },
        isClickThrough: { type: Boolean, state: true },
        layoutMode: { type: String },
        _viewInstances: { type: Object, state: true },
        _isClickThrough: { state: true },
        structuredData: { type: Object },
        settingsVisible: { type: Boolean, state: true },
    };

    constructor() {
        super();
        const urlParams = new URLSearchParams(window.location.search);
        
        this.currentView = urlParams.get('view') || 'listen';
        
        console.log('  XerusApp Debug:');
        console.log('  currentView set to:', this.currentView);
        
        this.currentResponseIndex = -1;
        this.selectedProfile = localStorage.getItem('selectedProfile') || 'interview';
        
        // Language format migration for legacy users
        let lang = localStorage.getItem('selectedLanguage') || 'en';
        if (lang.includes('-')) {
            const newLang = lang.split('-')[0];
            console.warn(`[Migration] Correcting language format from "${lang}" to "${newLang}".`);
            localStorage.setItem('selectedLanguage', newLang);
            lang = newLang;
        }
        this.selectedLanguage = lang;

        this.selectedScreenshotInterval = localStorage.getItem('selectedScreenshotInterval') || '5';
        this.selectedImageQuality = localStorage.getItem('selectedImageQuality') || 'medium';
        this._isClickThrough = false;
        this.settingsVisible = false;
        
        this.initializeView();
    }


    initializeView() {
        // Set initial state without glass mode complexity
        document.body.classList.add('xerus-app');
    }

    connectedCallback() {
        super.connectedCallback();
        
        // Add safe API access with null checks
        if (window.api && window.api.xerusApp && window.api.xerusApp.onClickThroughToggled) {
            window.api.xerusApp.onClickThroughToggled((_, isEnabled) => {
                this._isClickThrough = isEnabled;
            });
        } else {
            console.warn('[XerusApp] window.api.xerusApp not available - running in demo/test mode');
        }

    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (window.api && window.api.xerusApp && window.api.xerusApp.removeAllClickThroughListeners) {
            window.api.xerusApp.removeAllClickThroughListeners();
        }
    }

    updated(changedProperties) {
        if (changedProperties.has('currentView')) {
            const viewContainer = this.shadowRoot?.querySelector('.view-container');
            if (viewContainer) {
                viewContainer.classList.add('entering');
                requestAnimationFrame(() => {
                    viewContainer.classList.remove('entering');
                });
            }
        }

        // Only update localStorage when these specific properties change
        if (changedProperties.has('selectedProfile')) {
            localStorage.setItem('selectedProfile', this.selectedProfile);
        }
        if (changedProperties.has('selectedLanguage')) {
            localStorage.setItem('selectedLanguage', this.selectedLanguage);
        }
        if (changedProperties.has('selectedScreenshotInterval')) {
            localStorage.setItem('selectedScreenshotInterval', this.selectedScreenshotInterval);
        }
        if (changedProperties.has('selectedImageQuality')) {
            localStorage.setItem('selectedImageQuality', this.selectedImageQuality);
        }
    }


    handleClose() {
        this.currentView = 'listen';
    }


    render() {
        const renderMainContent = () => {
            switch (this.currentView) {
                case 'listen':
                    return html`<listen-view
                        .currentResponseIndex=${this.currentResponseIndex}
                        .selectedProfile=${this.selectedProfile}
                        .structuredData=${this.structuredData}
                        @response-index-changed=${e => (this.currentResponseIndex = e.detail.index)}
                    ></listen-view>`;
                case 'ask':
                    return html`<ask-view></ask-view>`;
                case 'settings':
                    return html`<settings-view
                        .selectedProfile=${this.selectedProfile}
                        .selectedLanguage=${this.selectedLanguage}
                        .onProfileChange=${profile => (this.selectedProfile = profile)}
                        .onLanguageChange=${lang => (this.selectedLanguage = lang)}
                    ></settings-view>`;
                case 'agent-selector':
                    return html`<agent-selector-view></agent-selector-view>`;
                case 'shortcut-settings':
                    return html`<shortcut-settings-view></shortcut-settings-view>`;
                case 'history':
                    return html`<history-view></history-view>`;
                case 'help':
                    return html`<help-view></help-view>`;
                case 'setup':
                    return html`<setup-view></setup-view>`;
                default:
                    return html`<div>Unknown view: ${this.currentView}</div>`;
            }
        };

        // Modern card-based layout with light theme
        return html`
            <div class="app-container">
                <div class="main-content">
                    <div class="content-card">
                        <div class="view-container">
                            ${renderMainContent()}
                        </div>
                    </div>
                </div>
                ${this.settingsVisible ? html`
                    <div class="settings-sidebar">
                        <settings-view
                            .selectedProfile=${this.selectedProfile}
                            .selectedLanguage=${this.selectedLanguage}
                            .onProfileChange=${profile => (this.selectedProfile = profile)}
                            .onLanguageChange=${lang => (this.selectedLanguage = lang)}
                        ></settings-view>
                    </div>
                ` : ''}
            </div>
        `;
    }
}

customElements.define('xerus-app', XerusApp);
