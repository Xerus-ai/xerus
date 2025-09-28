import { html, css, LitElement } from '../assets/lit-core-2.7.4.min.js';
import { ThemeMixin } from '../mixins/ThemeMixin.js';

export class WelcomeHeader extends ThemeMixin(LitElement) {
    static styles = css`
        :host {
            display: block;
            font-family:
                'Inter',
                -apple-system,
                BlinkMacSystemFont,
                'Segoe UI',
                Roboto,
                sans-serif;
        }
        .container {
            width: 100%;
            box-sizing: border-box;
            height: auto;
            padding: 32px 24px;
            background: #ffffff !important;
            border: 1px solid #e5e7eb !important;
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1) !important;
            border-radius: 16px;
            flex-direction: column;
            justify-content: flex-start;
            align-items: flex-start;
            gap: 32px;
            display: inline-flex;
            -webkit-app-region: drag;
            position: relative;
        }
        .close-button {
            -webkit-app-region: no-drag;
            position: absolute;
            top: 20px;
            right: 20px;
            width: 28px;
            height: 28px;
            background: #f8f9fa !important;
            border: 1px solid #e5e7eb !important;
            border-radius: 6px;
            color: #6b7280 !important;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.15s ease;
            z-index: 10;
            font-size: 16px;
            line-height: 1;
            padding: 0;
            box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05) !important;
        }
        .close-button:hover {
            background: #f1f3f4 !important;
            border-color: #d1d5db !important;
            color: #1f2937 !important;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1) !important;
        }
        .header-section {
            flex-direction: column;
            justify-content: flex-start;
            align-items: flex-start;
            gap: 4px;
            display: flex;
        }
        .title {
            color: #1f2937 !important;
            font-size: 20px;
            font-weight: 700;
        }
        .subtitle {
            color: #6b7280 !important;
            font-size: 15px;
            font-weight: 500;
        }
        .option-card {
            width: 100%;
            justify-content: flex-start;
            align-items: flex-start;
            gap: 12px;
            display: inline-flex;
            background: #f8f9fa !important;
            border: 1px solid #e5e7eb !important;
            border-radius: 12px;
            padding: 20px;
            transition: all 0.15s ease;
        }
        .divider {
            width: 3px;
            align-self: stretch;
            position: relative;
            background: #2563eb !important;
            border-radius: 2px;
            min-height: 60px;
        }
        .option-content {
            flex: 1 1 0;
            flex-direction: column;
            justify-content: flex-start;
            align-items: flex-start;
            gap: 8px;
            display: inline-flex;
            min-width: 0;
        }
        .option-title {
            color: #1f2937 !important;
            font-size: 15px;
            font-weight: 700;
        }
        .option-description {
            color: #6b7280 !important;
            font-size: 13px;
            font-weight: 400;
            line-height: 20px;
            letter-spacing: 0.1px;
            white-space: normal;
            overflow: visible;
        }
        .action-button {
            -webkit-app-region: no-drag;
            padding: 12px 16px;
            background: #2563eb !important;
            box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05) !important;
            border-radius: 8px;
            border: 1px solid #2563eb !important;
            justify-content: center;
            align-items: center;
            gap: 8px;
            display: flex;
            cursor: pointer;
            transition: all 0.15s ease;
            min-width: 160px;
        }
        .action-button:hover {
            background: #1d4ed8 !important;
            border-color: #1d4ed8 !important;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1) !important;
            transform: translateY(-1px);
        }
        .button-text {
            color: #ffffff !important;
            font-size: 13px;
            font-weight: 600;
        }
        .button-icon {
            width: 12px;
            height: 12px;
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .arrow-icon {
            border: solid #ffffff !important;
            border-width: 0 1.5px 1.5px 0;
            display: inline-block;
            padding: 3px;
            transform: rotate(-45deg);
            -webkit-transform: rotate(-45deg);
        }
        .footer {
            align-self: stretch;
            text-align: center;
            color: #9ca3af !important;
            font-size: 12px;
            font-weight: 500;
            line-height: 20px;
        }
        .footer-link {
            text-decoration: underline;
            cursor: pointer;
            -webkit-app-region: no-drag;
            color: #2563eb !important;
            transition: color 0.15s ease;
        }
        
        .footer-link:hover {
            color: #1d4ed8 !important;
        }
        
        .option-card:hover {
            background: #f1f3f4 !important;
            border-color: #d1d5db !important;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1) !important;
        }

    `;

    static properties = {
        loginCallback: { type: Function },
        apiKeyCallback: { type: Function },
    };

    constructor() {
        super();
        this.loginCallback = () => {};
        this.apiKeyCallback = () => {};
        this.handleClose = this.handleClose.bind(this);
    }

    connectedCallback() {
        super.connectedCallback();
        // Debug: Check current body classes
        console.log('[SEARCH] WelcomeHeader connectedCallback - body classes:', document.body.className);
        console.log('[SEARCH] WelcomeHeader connectedCallback - has-glass present:', document.body.classList.contains('has-glass'));
        
        // Force light theme by removing glass mode class
        if (document.body.classList.contains('has-glass')) {
            document.body.classList.remove('has-glass');
            console.log('[STYLE] Forced light theme for WelcomeHeader - removed has-glass class');
        } else {
            console.log('[INFO] No has-glass class found, should be using light theme');
        }
        
        // Also log the computed styles to see what's actually being applied
        setTimeout(() => {
            const containerElement = this.shadowRoot?.querySelector('.container');
            if (containerElement) {
                const computedStyle = window.getComputedStyle(containerElement);
                console.log('[STYLE] Container computed background:', computedStyle.backgroundColor);
                console.log('[STYLE] Container computed border:', computedStyle.border);
            }
        }, 100);
    }

    updated(changedProperties) {
        super.updated(changedProperties);
        this.dispatchEvent(new CustomEvent('content-changed', { bubbles: true, composed: true }));
    }

    handleClose() {
        if (window.api?.common) {
            window.api.common.quitApplication();
        }
    }

    render() {
        return html`
            <div class="container">
                <button class="close-button" @click=${this.handleClose}>×</button>
                <div class="header-section">
                    <div class="title">Welcome to Xerus</div>
                    <div class="subtitle">Choose how to connect your AI model</div>
                </div>
                <div class="option-card">
                    <div class="divider"></div>
                    <div class="option-content">
                        <div class="option-title">Quick start with default API key</div>
                        <div class="option-description">
                            100% free with Xerus key<br/>No personal data collected<br/>Sign up with Google in seconds
                        </div>
                    </div>
                    <button class="action-button" @click=${this.loginCallback}>
                        <div class="button-text">Open Browser to Log in</div>
                        <div class="button-icon"><div class="arrow-icon"></div></div>
                    </button>
                </div>
                <div class="option-card">
                    <div class="divider"></div>
                    <div class="option-content">
                        <div class="option-title">Use Personal API keys</div>
                        <div class="option-description">
                            Costs may apply based on your API usage<br/>No personal data collected<br/>Use your own API keys (OpenAI, Gemini, etc.)
                        </div>
                    </div>
                    <button class="action-button" @click=${this.apiKeyCallback}>
                        <div class="button-text">Enter Your API Key</div>
                        <div class="button-icon"><div class="arrow-icon"></div></div>
                    </button>
                </div>
                <div class="footer">
                    Xerus does not collect your personal data —
                    <span class="footer-link" @click=${this.openPrivacyPolicy}>See details</span>
                </div>
            </div>
        `;
    }

    openPrivacyPolicy() {
        console.log('[AUDIO] openPrivacyPolicy WelcomeHeader');
        if (window.api?.common) {
            window.api.common.openExternal('https://xerus.ai/privacy-policy');
        }
    }
}

customElements.define('welcome-header', WelcomeHeader);