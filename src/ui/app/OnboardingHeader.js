import { html, css, LitElement } from '../assets/lit-core-2.7.4.min.js';
import { ThemeMixin } from '../mixins/ThemeMixin.js';

export class OnboardingHeader extends ThemeMixin(LitElement) {
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
            padding: 24px 16px;
            background: #ffffff;
            border: 1px solid #e5e7eb;
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
            border-radius: 16px;
            flex-direction: column;
            justify-content: flex-start;
            align-items: flex-start;
            gap: 24px;
            display: inline-flex;
            -webkit-app-region: drag;
        }
        .close-button {
            -webkit-app-region: no-drag;
            position: absolute;
            top: 16px;
            right: 16px;
            width: 20px;
            height: 20px;
            background: #f8f9fa;
            border: 1px solid #e5e7eb;
            border-radius: 5px;
            color: #6b7280;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.15s ease;
            z-index: 10;
            font-size: 16px;
            line-height: 1;
            padding: 0;
        }
        .close-button:hover {
            background: #f1f3f4;
            color: #1f2937;
        }
        .header-section {
            flex-direction: column;
            justify-content: flex-start;
            align-items: flex-start;
            gap: 4px;
            display: flex;
        }
        .title {
            color: #1f2937;
            font-size: 18px;
            font-weight: 700;
        }
        .subtitle {
            color: #6b7280;
            font-size: 14px;
            font-weight: 500;
        }
        .step-indicator {
            display: flex;
            gap: 8px;
            align-items: center;
            margin-bottom: 16px;
        }
        .step-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #d1d5db;
            transition: all 0.2s ease;
        }
        .step-dot.active {
            background: #2563eb;
            transform: scale(1.2);
        }
        .content-section {
            width: 100%;
            flex-direction: column;
            justify-content: flex-start;
            align-items: flex-start;
            gap: 16px;
            display: flex;
        }
        .content-text {
            color: #6b7280;
            font-size: 14px;
            font-weight: 400;
            line-height: 20px;
        }
        .context-textarea {
            width: 100%;
            height: 80px;
            padding: 12px;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            background: #f8f9fa;
            color: #1f2937;
            font-size: 13px;
            font-family: inherit;
            resize: vertical;
            transition: all 0.2s ease;
        }
        .context-textarea::placeholder {
            color: #9ca3af;
        }
        .context-textarea:focus {
            outline: none;
            border-color: #2563eb;
            background: #ffffff;
        }
        .feature-list {
            width: 100%;
        }
        .feature-item {
            display: flex;
            align-items: center;
            margin-bottom: 8px;
            font-size: 13px;
            color: #6b7280;
        }
        .feature-icon {
            margin-right: 10px;
            font-size: 14px;
        }
        .navigation {
            width: 100%;
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 16px;
        }
        .nav-button {
            -webkit-app-region: no-drag;
            padding: 8px 16px;
            background: #f8f9fa;
            box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
            border-radius: 12px;
            border: 1px solid #e5e7eb;
            justify-content: center;
            align-items: center;
            display: flex;
            cursor: pointer;
            transition: background-color 0.2s;
            color: #1f2937;
            font-size: 12px;
            font-weight: 600;
            min-height: 32px;
        }
        .nav-button:hover {
            background: #f1f3f4;
            border-color: #d1d5db;
        }
        .nav-button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            background: #f1f3f4;
            color: #9ca3af;
        }
        .nav-button.primary {
            background: #2563eb;
            border-color: #2563eb;
            color: #ffffff;
        }
        .nav-button.primary:hover {
            background: #1d4ed8;
            border-color: #1d4ed8;
        }
        .skip-button {
            font-size: 11px;
            color: #9ca3af;
            text-decoration: underline;
            cursor: pointer;
            -webkit-app-region: no-drag;
            background: none;
            border: none;
            padding: 4px 8px;
        }
        .skip-button:hover {
            color: #6b7280;
        }
    `;

    static properties = {
        currentStep: { type: Number },
        contextText: { type: String },
        skipCallback: { type: Function },
        completeCallback: { type: Function },
    };

    constructor() {
        super();
        this.currentStep = 0;
        this.contextText = '';
        this.skipCallback = () => {};
        this.completeCallback = () => {};
    }

    updated(changedProperties) {
        super.updated(changedProperties);
        this.dispatchEvent(new CustomEvent('content-changed', { bubbles: true, composed: true }));
    }

    getStepContent() {
        const steps = [
            {
                title: 'Welcome to Xerus',
                subtitle: 'Your intelligent AI companion',
                content: 'Xerus is your ultra-responsive AI assistant that listens to conversations and provides intelligent insights in real-time. Experience lightning-fast voice transcription with 150-250ms response times.',
            },
            {
                title: 'Privacy & Security',
                subtitle: 'Your data stays private',
                content: 'All processing happens locally on your device when possible. Your conversations stay private and secure. No personal data is shared without your explicit permission.',
            },
            {
                title: 'Personalize Your Assistant',
                subtitle: 'Help AI understand you better',
                content: 'Add context about yourself, your work, or specific topics to help the AI provide more relevant and personalized assistance.',
                showTextarea: true,
            },
            {
                title: 'Powerful Features',
                subtitle: 'What Xerus can do for you',
                content: '',
                showFeatures: true,
            },
            {
                title: 'Ready to Start',
                subtitle: 'You\'re all set!',
                content: 'Xerus is ready to assist you. You can add AI provider API keys in settings later to unlock additional features and access multiple AI models.',
            },
        ];

        return steps[this.currentStep] || steps[0];
    }

    nextStep() {
        if (this.currentStep < 4) {
            this.currentStep += 1;
        } else {
            this.complete();
        }
    }

    prevStep() {
        if (this.currentStep > 0) {
            this.currentStep -= 1;
        }
    }

    skip() {
        this.skipCallback();
    }

    complete() {
        if (this.contextText.trim()) {
            localStorage.setItem('customPrompt', this.contextText.trim());
        }
        localStorage.setItem('onboardingCompleted', 'true');
        localStorage.setItem('lastOnboardingDate', new Date().toISOString());
        this.completeCallback();
    }

    handleContextInput(e) {
        this.contextText = e.target.value;
    }

    render() {
        const step = this.getStepContent();

        return html`
            <div class="container">
                <button class="close-button" @click=${this.skip}>×</button>
                
                <div class="header-section">
                    <div class="title">${step.title}</div>
                    <div class="subtitle">${step.subtitle}</div>
                </div>

                <div class="step-indicator">
                    ${[0, 1, 2, 3, 4].map(index => html`
                        <div class="step-dot ${index === this.currentStep ? 'active' : ''}"></div>
                    `)}
                </div>

                <div class="content-section">
                    <div class="content-text">${step.content}</div>

                    ${step.showTextarea ? html`
                        <textarea
                            class="context-textarea"
                            placeholder="Tell us about yourself, your role, projects you're working on, or any context that would help personalize your AI assistant..."
                            .value=${this.contextText}
                            @input=${this.handleContextInput}
                        ></textarea>
                    ` : ''}

                    ${step.showFeatures ? html`
                        <div class="feature-list">
                            <div class="feature-item">
                                <span class="feature-icon">[FAST]</span>
                                Ultra-low latency voice transcription (150-250ms response)
                            </div>
                            <div class="feature-item">
                                <span class="feature-icon">[AI]</span>
                                8 specialized AI agents with unique personalities and capabilities
                            </div>
                            <div class="feature-item">
                                <span class="feature-icon">[TARGET]</span>
                                Multiple AI models: OpenAI, Claude, Gemini, DeepSeek, Perplexity
                            </div>
                            <div class="feature-item">
                                <span class="feature-icon">[TOOL]</span>
                                Cross-platform desktop app with web dashboard integration
                            </div>
                        </div>
                    ` : ''}
                </div>

                <div class="navigation">
                    <button 
                        class="nav-button" 
                        @click=${this.prevStep} 
                        ?disabled=${this.currentStep === 0}
                    >
                        Previous
                    </button>

                    <button class="skip-button" @click=${this.skip}>
                        Skip Tutorial
                    </button>

                    <button 
                        class="nav-button primary" 
                        @click=${this.nextStep}
                    >
                        ${this.currentStep === 4 ? 'Get Started' : 'Next'}
                    </button>
                </div>
            </div>
        `;
    }
}

customElements.define('onboarding-header', OnboardingHeader);